"""
Candles router — serves OHLCV data for the MainChart.

Endpoints:
    GET /api/candles/daily
        Returns daily bars resampled from Databento 1m parquet.

    GET /api/candles/full
        Returns daily bars, each with the full list of 1-minute bars for that day
        embedded under the `minutes` key. Both levels are preloaded in one request.

    GET /api/candles/available
        Returns list of symbols that have a Databento 1m parquet.

Common query params (daily + full):
    symbol        : str    — asset symbol (must exist in databento/1m/)
    mode          : str    — 'fixed' | 'random'
    start_date    : str?   — YYYY-MM-DD (fixed mode)
    end_date      : str?   — YYYY-MM-DD (fixed mode)
    duration_days : int?   — calendar-day window size (random mode, default 365)
    seed          : float? — random seed for reproducible window (random mode)

All `time` fields are Unix timestamps (seconds, UTC).
Daily bars use UTC midnight; minute bars use the bar-open timestamp.
"""

from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
import pandas as pd
import random as _random
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

DATA_DIR = Path("data_storage")


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _load_1m(symbol: str) -> pd.DataFrame:
    """
    Load the Databento 1m parquet for `symbol`.
    Returns a tz-naive DatetimeIndex DataFrame with OHLCV columns (capitalised).
    Raises HTTPException(404) if the file does not exist.
    """
    path = DATA_DIR / "databento" / "1m" / f"{symbol}.parquet"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No 1m data found for symbol: {symbol}")

    df = pd.read_parquet(path)

    if not isinstance(df.index, pd.DatetimeIndex):
        df.index = pd.to_datetime(df.index)
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)

    # Normalise column names to Title-case
    rename = {c: c.capitalize() for c in df.columns if c.lower() in ("open","high","low","close","volume")}
    df.rename(columns=rename, inplace=True)
    cols = [c for c in ("Open","High","Low","Close","Volume") if c in df.columns]
    return df[cols]


def _resample_daily(df_1m: pd.DataFrame) -> pd.DataFrame:
    """Resample 1-minute bars to daily OHLCV."""
    agg = {k: v for k, v in
           {"Open":"first","High":"max","Low":"min","Close":"last","Volume":"sum"}.items()
           if k in df_1m.columns}
    return df_1m.resample("1D").agg(agg).dropna()


def _slice_fixed(df: pd.DataFrame, start_date: str, end_date: str) -> pd.DataFrame:
    start = pd.Timestamp(start_date)
    end   = pd.Timestamp(end_date)
    return df[(df.index >= start) & (df.index <= end)]


def _slice_random(df: pd.DataFrame, duration_days: int, seed: float) -> pd.DataFrame:
    if len(df) == 0:
        return df
    max_start = len(df) - duration_days
    if max_start <= 0:
        return df
    _random.seed(seed)
    start_idx = _random.randint(0, max_start)
    return df.iloc[start_idx : start_idx + duration_days]


def _candle_dict(ts: pd.Timestamp, row: pd.Series) -> dict:
    return {
        "time":   int(ts.timestamp()),
        "open":   float(row.get("Open",  0)),
        "high":   float(row.get("High",  0)),
        "low":    float(row.get("Low",   0)),
        "close":  float(row.get("Close", 0)),
        "volume": float(row.get("Volume", 0)),
    }


def _minute_dict(ts: pd.Timestamp, row: pd.Series) -> dict:
    return {
        "time":   int(ts.timestamp()),
        "open":   float(row.get("Open",  0)),
        "high":   float(row.get("High",  0)),
        "low":    float(row.get("Low",   0)),
        "close":  float(row.get("Close", 0)),
        "volume": float(row.get("Volume", 0)),
    }


def _load_and_slice(symbol: str, mode: str,
                    start_date: str | None, end_date: str | None,
                    duration_days: int, seed: float) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Returns (daily_sliced, df_1m_sliced, daily_full).

    daily_full is the full unsliced daily DataFrame for the symbol; callers
    that need to look back before the sliced window (e.g. prehistory) can
    reuse it without re-reading the parquet.
    """
    df_1m  = _load_1m(symbol)
    daily  = _resample_daily(df_1m)

    if daily.empty:
        raise HTTPException(status_code=404, detail=f"No daily data after resampling for {symbol}")

    if mode == "fixed":
        if not start_date or not end_date:
            raise HTTPException(status_code=400, detail="start_date and end_date required for fixed mode")
        daily_sliced = _slice_fixed(daily, start_date, end_date)
    else:
        daily_sliced = _slice_random(daily, duration_days, seed)

    if daily_sliced.empty:
        raise HTTPException(status_code=404, detail="No candles in the requested date range")

    # Slice 1m data to same date window
    min_date = daily_sliced.index.min()
    max_date = daily_sliced.index.max() + pd.Timedelta(days=1)
    df_1m_sliced = df_1m[(df_1m.index >= min_date) & (df_1m.index < max_date)]

    return daily_sliced, df_1m_sliced, daily


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/daily")
def get_daily_candles(
    symbol:        str        = Query(..., description="Asset symbol"),
    mode:          str        = Query("random", enum=["fixed", "random"]),
    start_date:    str | None = Query(None,  description="YYYY-MM-DD (fixed mode)"),
    end_date:      str | None = Query(None,  description="YYYY-MM-DD (fixed mode)"),
    duration_days: int        = Query(365,   description="Window in calendar days (random mode)"),
    seed:          float      = Query(0.5,   description="Random seed (random mode)"),
):
    """Return daily OHLCV candles resampled from Databento 1m data."""
    try:
        daily, _, _daily_full = _load_and_slice(symbol, mode, start_date, end_date, duration_days, seed)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to load candles for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    candles = [_candle_dict(ts, row) for ts, row in daily.iterrows()]
    return {"candles": candles}


@router.get("/full")
def get_full_candles(
    symbol:          str        = Query(..., description="Asset symbol"),
    mode:            str        = Query("random", enum=["fixed", "random"]),
    start_date:      str | None = Query(None,  description="YYYY-MM-DD (fixed mode)"),
    end_date:        str | None = Query(None,  description="YYYY-MM-DD (fixed mode)"),
    duration_days:   int        = Query(365,   description="Window in calendar days (random mode)"),
    seed:            float      = Query(0.5,   description="Random seed (random mode)"),
    prehistory_bars: int        = Query(0, ge=0, description="Daily bars to prepend before the range (no minutes)"),
):
    """
    Return daily candles with all 1-minute bars embedded under `minutes`.
    Both levels are fully preloaded in a single response.

    When prehistory_bars > 0, daily bars from immediately before the range
    are prepended with minutes=[] and boundary_time marks where actual data starts.

    Response shape:
    {
      "days": [
        { "time": ..., "open": ..., ..., "minutes": [] },   <- pre-history (if any)
        ...
        { "time": <boundary>, ..., "minutes": [ ... ] },    <- actual range starts here
        ...
      ],
      "boundary_time": <unix seconds of first actual day> | null
    }
    """
    try:
        daily, df_1m, full_daily = _load_and_slice(symbol, mode, start_date, end_date, duration_days, seed)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to load full candles for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # ── Pre-history: daily bars immediately before the main range ──────────────
    boundary_time: int | None = None
    prehistory_result: list[dict] = []

    if prehistory_bars > 0 and not daily.empty:
        range_start = daily.index.min()
        pre = full_daily[full_daily.index < range_start]
        # Take the last N trading days
        pre = pre.iloc[max(0, len(pre) - prehistory_bars):]
        prehistory_result = [
            {**_candle_dict(ts, row), "minutes": []}
            for ts, row in pre.iterrows()
        ]
        boundary_time = int(range_start.timestamp())

    # ── Main range: group 1m bars by date ─────────────────────────────────
    df_1m_copy = df_1m.copy()
    df_1m_copy["_date"] = df_1m_copy.index.normalize()
    groups = {str(date.date()): grp.drop(columns=["_date"])
              for date, grp in df_1m_copy.groupby("_date")}

    result = []
    for ts, row in daily.iterrows():
        day_key = str(ts.date())
        grp     = groups.get(day_key, pd.DataFrame())
        minutes = [_minute_dict(mts, mrow) for mts, mrow in grp.iterrows()] if not grp.empty else []
        entry   = _candle_dict(ts, row)
        entry["minutes"] = minutes
        result.append(entry)

    return {"days": prehistory_result + result, "boundary_time": boundary_time}


@router.get("/available")
def get_available_symbols():
    """Return a list of symbols that have Databento 1m parquet files."""
    path = DATA_DIR / "databento" / "1m"
    if not path.exists():
        return {"symbols": []}
    return {"symbols": sorted(f.stem for f in path.glob("*.parquet"))}


@router.get("/asset-info")
def get_asset_info(symbol: str = Query(..., description="Asset symbol")):
    """
    Return the actual date bounds of the downloaded 1m parquet for a symbol.

    Response:
    {
      "symbol":        "ES",
      "start_date":    "2022-01-03",   -- first trading day in the parquet
      "end_date":      "2024-12-31",   -- last trading day in the parquet
      "trading_days":  756             -- number of distinct trading days
    }
    """
    try:
        df_1m = _load_1m(symbol)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    daily = _resample_daily(df_1m)
    if daily.empty:
        raise HTTPException(status_code=404, detail=f"No trading days found for {symbol}")

    return {
        "symbol":       symbol,
        "start_date":   str(daily.index[0].date()),
        "end_date":     str(daily.index[-1].date()),
        "trading_days": len(daily),
    }
