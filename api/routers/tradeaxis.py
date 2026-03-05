"""
TradeAxis router — serves 1-minute OHLCV data for backtest analysis.

Endpoints:
    POST /api/tradeaxis/analyze
        Returns 1-minute bars for the requested symbol/window.
        The window/tolerance params are forwarded for future server-side
        pivot computation; currently the endpoint just returns raw data.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
import pandas as pd
import random as _random
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

DATA_DIR = Path("data_storage")


# ─── Request body ─────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    symbol: str
    resolution: str = "1m"
    window: int = 5
    tolerance: float = 0.005
    mode: str = "random"
    start_date: str | None = None
    end_date: str | None = None
    duration_days: int = 365
    seed: float = 0.5


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _load_1m(symbol: str) -> pd.DataFrame:
    path = DATA_DIR / "databento" / "1m" / f"{symbol}.parquet"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No 1m data found for symbol: {symbol}")

    df = pd.read_parquet(path)

    if not isinstance(df.index, pd.DatetimeIndex):
        df.index = pd.to_datetime(df.index)
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)

    rename = {c: c.capitalize() for c in df.columns if c.lower() in ("open", "high", "low", "close", "volume")}
    df.rename(columns=rename, inplace=True)
    cols = [c for c in ("Open", "High", "Low", "Close", "Volume") if c in df.columns]
    return df[cols]


def _slice_fixed(df: pd.DataFrame, start_date: str, end_date: str) -> pd.DataFrame:
    start = pd.Timestamp(start_date)
    end   = pd.Timestamp(end_date) + pd.Timedelta(days=1)
    return df[(df.index >= start) & (df.index < end)]


def _slice_random(df: pd.DataFrame, duration_days: int, seed: float) -> pd.DataFrame:
    daily_dates = pd.Series(df.index.normalize().unique()).sort_values()
    if len(daily_dates) == 0:
        return df
    max_start = len(daily_dates) - duration_days
    if max_start <= 0:
        return df
    _random.seed(seed)
    start_idx = _random.randint(0, max_start)
    start_date = daily_dates.iloc[start_idx]
    end_date   = daily_dates.iloc[min(start_idx + duration_days - 1, len(daily_dates) - 1)]
    return df[(df.index >= start_date) & (df.index < end_date + pd.Timedelta(days=1))]


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/analyze")
def analyze(req: AnalyzeRequest):
    """
    Return 1-minute OHLCV bars for the requested symbol and date window.

    Response shape:
    {
      "data": [
        { "time": <unix seconds>, "open": ..., "high": ..., "low": ..., "close": ..., "volume": ... },
        ...
      ]
    }
    """
    try:
        df = _load_1m(req.symbol)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to load 1m data for {req.symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if req.mode == "fixed":
        if not req.start_date or not req.end_date:
            raise HTTPException(status_code=400, detail="start_date and end_date required for fixed mode")
        sliced = _slice_fixed(df, req.start_date, req.end_date)
    else:
        sliced = _slice_random(df, req.duration_days, req.seed)

    if sliced.empty:
        raise HTTPException(status_code=404, detail="No 1m data in the requested date range")

    data = [
        {
            "time":   int(ts.timestamp()),
            "open":   float(row.get("Open",   0)),
            "high":   float(row.get("High",   0)),
            "low":    float(row.get("Low",    0)),
            "close":  float(row.get("Close",  0)),
            "volume": float(row.get("Volume", 0)),
        }
        for ts, row in sliced.iterrows()
    ]

    return {"data": data}
