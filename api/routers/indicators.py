"""
Indicators router — computes quant indicators from Databento 1m data,
and serves FRED macro series.

Endpoints:
    GET /api/indicators/compute
        Returns computed indicator time-series for the current chart window.
        All timestamps match the daily bars served by /api/candles/full so
        the frontend can align them directly.

    GET /api/indicators/macro
        Returns a FRED macro series sliced to the requested date range.

Query params for /compute:
    symbol        : str   — must exist in databento/1m/
    mode          : str   — 'fixed' | 'random'
    start_date    : str?  — YYYY-MM-DD (fixed mode)
    end_date      : str?  — YYYY-MM-DD (fixed mode)
    duration_days : int?  — calendar-day window (random mode, default 365)
    seed          : float?— random seed (random mode, default 0.5)
    indicators    : str   — comma-separated list of indicator keys

Query params for /macro:
    fred_symbol   : str   — e.g. DGS10, UNRATE, DFF, GDP, T10YIE
    start_date    : str   — YYYY-MM-DD
    end_date      : str   — YYYY-MM-DD

All `time` fields are Unix seconds (UTC midnight for daily bars).
"""

from __future__ import annotations

import math
import logging
import random as _random
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter()

DATA_DIR = Path("data_storage")


# ─── Helpers shared with candles.py ──────────────────────────────────────────

def _load_1m(symbol: str) -> pd.DataFrame:
    path = DATA_DIR / "databento" / "1m" / f"{symbol}.parquet"
    if not path.exists():
        raise HTTPException(404, detail=f"No 1m data found for symbol: {symbol}")
    df = pd.read_parquet(path)
    if not isinstance(df.index, pd.DatetimeIndex):
        df.index = pd.to_datetime(df.index)
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)
    rename = {c: c.capitalize() for c in df.columns if c.lower() in ("open","high","low","close","volume")}
    df.rename(columns=rename, inplace=True)
    return df[[c for c in ("Open","High","Low","Close","Volume") if c in df.columns]]


def _resample_daily(df_1m: pd.DataFrame) -> pd.DataFrame:
    agg = {k: v for k, v in
           {"Open":"first","High":"max","Low":"min","Close":"last","Volume":"sum"}.items()
           if k in df_1m.columns}
    return df_1m.resample("1D").agg(agg).dropna()


def _slice_window(df: pd.DataFrame, mode: str, start_date: str | None, end_date: str | None,
                  duration_days: int, seed: float) -> pd.DataFrame:
    if mode == "fixed":
        if not start_date or not end_date:
            raise HTTPException(400, "start_date and end_date required for fixed mode")
        s, e = pd.Timestamp(start_date), pd.Timestamp(end_date)
        return df[(df.index >= s) & (df.index <= e)]
    else:
        if len(df) == 0:
            return df
        max_start = len(df) - duration_days
        if max_start <= 0:
            return df
        _random.seed(seed)
        idx = _random.randint(0, max_start)
        return df.iloc[idx: idx + duration_days]


def _to_series(df: pd.DataFrame, col: str = "Close") -> pd.Series:
    return df[col].dropna()


# ─── Indicator computation functions ─────────────────────────────────────────

def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.Series:
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line - signal_line   # histogram


def _adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> dict[str, pd.Series]:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)

    up_move = high - high.shift(1)
    down_move = low.shift(1) - low
    plus_dm  = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
    minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)

    atr14    = tr.ewm(alpha=1/period, adjust=False).mean()
    plus_di  = 100 * plus_dm.ewm(alpha=1/period, adjust=False).mean() / atr14.replace(0, np.nan)
    minus_di = 100 * minus_dm.ewm(alpha=1/period, adjust=False).mean() / atr14.replace(0, np.nan)
    dx       = (100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan))
    adx_val  = dx.ewm(alpha=1/period, adjust=False).mean()
    return {"adx": adx_val, "adx_di_plus": plus_di, "adx_di_minus": minus_di}


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    return tr.rolling(period).mean()


def _sma(close: pd.Series, period: int = 20) -> pd.Series:
    return close.rolling(period).mean()


def _obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    direction = np.sign(close.diff()).fillna(0)
    return (direction * volume).cumsum()


def _vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    typical = (high + low + close) / 3
    return (typical * volume).cumsum() / volume.cumsum()


def _ad_line(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    hl_range = (high - low).replace(0, np.nan)
    clv = ((close - low) - (high - close)) / hl_range
    return (clv * volume).cumsum()


def _zscore(close: pd.Series, period: int = 20) -> pd.Series:
    mean = close.rolling(period).mean()
    std  = close.rolling(period).std()
    return (close - mean) / std.replace(0, np.nan)


def _fisher(high: pd.Series, low: pd.Series, period: int = 9) -> pd.Series:
    mid = (high + low) / 2
    hi  = mid.rolling(period).max()
    lo  = mid.rolling(period).min()
    rng = (hi - lo).replace(0, np.nan)
    val = (2 * ((mid - lo) / rng) - 1).clip(-0.999, 0.999)
    return 0.5 * np.log((1 + val) / (1 - val))


def _hist_vol(close: pd.Series, period: int = 20) -> pd.Series:
    log_ret = np.log(close / close.shift(1))
    return log_ret.rolling(period).std() * math.sqrt(252)


def _choppiness(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    atr_sum  = tr.rolling(period).sum()
    hl_range = high.rolling(period).max() - low.rolling(period).min()
    return 100 * np.log10(atr_sum / hl_range.replace(0, np.nan)) / math.log10(period)


def _linreg_slope(close: pd.Series, period: int = 20) -> pd.Series:
    x = np.arange(period)
    result = close.copy() * np.nan
    for i in range(period - 1, len(close)):
        y = close.iloc[i - period + 1 : i + 1].values
        if len(y) == period and not np.isnan(y).any():
            slope = np.polyfit(x, y, 1)[0]
            result.iloc[i] = slope
    return result


def _hurst(close: pd.Series, period: int = 100) -> pd.Series:
    """Simplified Hurst exponent via R/S analysis."""
    result = close.copy() * np.nan
    if len(close) < period:
        return result
    lags = [2, 4, 8, 16, 32, period // 2]
    lags = [l for l in lags if l < period]
    if len(lags) < 3:
        return result

    for i in range(period, len(close) + 1):
        window = close.iloc[i - period: i].values.astype(float)
        if np.isnan(window).any():
            continue
        rs_vals = []
        for lag in lags:
            sub = window[:lag]
            mean_ = sub.mean()
            dev   = np.cumsum(sub - mean_)
            R     = dev.max() - dev.min()
            S     = sub.std()
            if S > 0:
                rs_vals.append(math.log(R / S))
        if len(rs_vals) == len(lags):
            log_lags = [math.log(l) for l in lags]
            try:
                hurst_val = np.polyfit(log_lags, rs_vals, 1)[0]
                result.iloc[i - 1] = hurst_val
            except Exception:
                pass
    return result


def _delta(close: pd.Series, volume: pd.Series) -> pd.Series:
    """Approximated buy/sell delta as signed volume."""
    return np.sign(close.diff().fillna(0)) * volume


# ─── Compute all requested indicators ────────────────────────────────────────

def _compute_indicators(df: pd.DataFrame, keys: list[str]) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {}

    close  = df["Close"]
    high   = df.get("High",  close)
    low    = df.get("Low",   close)
    volume = df.get("Volume", pd.Series(0, index=df.index))

    def _to_records(s: pd.Series) -> list[dict]:
        s = s.dropna()
        return [{"time": int(ts.timestamp()), "value": float(v)}
                for ts, v in s.items() if not math.isnan(v) and not math.isinf(v)]

    for key in keys:
        try:
            if key == "rsi":
                result["rsi"] = _to_records(_rsi(close))
            elif key == "macd":
                result["macd"] = _to_records(_macd(close))
            elif key == "adx":
                adx_data = _adx(high, low, close)
                for k, s in adx_data.items():
                    result[k] = _to_records(s)
            elif key == "adx_di_plus":
                adx_data = _adx(high, low, close)
                result["adx_di_plus"] = _to_records(adx_data["adx_di_plus"])
            elif key == "adx_di_minus":
                adx_data = _adx(high, low, close)
                result["adx_di_minus"] = _to_records(adx_data["adx_di_minus"])
            elif key == "atr":
                result["atr"] = _to_records(_atr(high, low, close))
            elif key == "sma":
                result["sma"] = _to_records(_sma(close))
            elif key == "obv":
                result["obv"] = _to_records(_obv(close, volume))
            elif key == "vwap":
                result["vwap"] = _to_records(_vwap(high, low, close, volume))
            elif key == "ad":
                result["ad"] = _to_records(_ad_line(high, low, close, volume))
            elif key == "volume":
                result["volume"] = _to_records(volume)
            elif key == "zscore":
                result["zscore"] = _to_records(_zscore(close))
            elif key == "fisher":
                result["fisher"] = _to_records(_fisher(high, low))
            elif key == "hist_vol":
                result["hist_vol"] = _to_records(_hist_vol(close))
            elif key == "choppiness":
                result["choppiness"] = _to_records(_choppiness(high, low, close))
            elif key == "linreg":
                result["linreg"] = _to_records(_linreg_slope(close))
            elif key == "hurst":
                result["hurst"] = _to_records(_hurst(close))
            elif key == "delta":
                result["delta"] = _to_records(_delta(close, volume))
            elif key == "bollinger":
                sma_ = _sma(close, 20)
                std_ = close.rolling(20).std()
                result["bollinger_mid"]   = _to_records(sma_)
                result["bollinger_upper"] = _to_records(sma_ + 2 * std_)
                result["bollinger_lower"] = _to_records(sma_ - 2 * std_)
            # pattern_trend is chart-drawn — skip silently
        except Exception as e:
            logger.warning(f"Indicator {key} failed: {e}")

    return result


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/compute")
def compute_indicators(
    symbol:        str        = Query(...),
    mode:          str        = Query("random", enum=["fixed", "random"]),
    start_date:    str | None = Query(None),
    end_date:      str | None = Query(None),
    duration_days: int        = Query(365),
    seed:          float      = Query(0.5),
    indicators:    str        = Query(""),   # comma-separated keys
):
    """
    Compute indicator time-series for the given symbol/window.

    Response shape:
    {
      "<indicator_key>": [{ "time": <unix_seconds>, "value": <float> }, ...]
    }

    Multiple series may be returned per key (e.g. bollinger returns
    bollinger_mid, bollinger_upper, bollinger_lower).
    """
    keys = [k.strip() for k in indicators.split(",") if k.strip()]
    if not keys:
        return {}

    try:
        df_1m  = _load_1m(symbol)
        daily  = _resample_daily(df_1m)
        if daily.empty:
            raise HTTPException(404, f"No data for {symbol}")
        sliced = _slice_window(daily, mode, start_date, end_date, duration_days, seed)
        if sliced.empty:
            return {}
        result = _compute_indicators(sliced, keys)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"compute_indicators failed for {symbol}: {e}")
        raise HTTPException(500, str(e))

    return result


@router.get("/macro")
def get_macro(
    fred_symbol: str = Query(..., description="FRED series code, e.g. DGS10"),
    start_date:  str = Query(..., description="YYYY-MM-DD"),
    end_date:    str = Query(..., description="YYYY-MM-DD"),
):
    """
    Return a FRED macro series sliced to the requested date range.

    Available local series: DGS10, T10YIE, GDP, UNRATE, DFF

    Response: [{ "time": <unix_seconds>, "value": <float> }, ...]
    """
    path = DATA_DIR / "fred" / "1d" / f"{fred_symbol}.parquet"
    if not path.exists():
        raise HTTPException(404, f"No local FRED data for {fred_symbol}. Available: DGS10, T10YIE, GDP, UNRATE, DFF")

    try:
        df = pd.read_parquet(path)
        if not isinstance(df.index, pd.DatetimeIndex):
            df.index = pd.to_datetime(df.index)
        if df.index.tz is not None:
            df.index = df.index.tz_localize(None)

        s, e = pd.Timestamp(start_date), pd.Timestamp(end_date)
        df = df[(df.index >= s) & (df.index <= e)]

        # Find the value column (first numeric column)
        value_col = next((c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])), None)
        if value_col is None:
            raise HTTPException(500, f"No numeric column found in {fred_symbol}")

        records = []
        for ts, row in df.iterrows():
            val = float(row[value_col])
            if not (math.isnan(val) or math.isinf(val)):
                records.append({"time": int(ts.timestamp()), "value": val})

        return records
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_macro failed for {fred_symbol}: {e}")
        raise HTTPException(500, str(e))
