import json
import logging
import pandas as pd
from pathlib import Path

logger = logging.getLogger(__name__)


class MetadataManager:
    """
    Caches per-file metadata (row count, date range, quality score) in a single
    JSON file so repeated disk reads are avoided.

    Cache key: absolute path string of the parquet file.
    Cache entry:
        {
            "mtime": float,
            "file_size": int,
            "data": {
                "count": int,
                "start_date": str,
                "end_date": str,
                "file_size": int,
                "quality": str,   # e.g. "97%"
                ...extra fields passed via update_metadata()
            }
        }
    """

    def __init__(self, data_dir: Path):
        self.data_dir   = Path(data_dir)
        self.cache_file = self.data_dir / 'metadata_cache.json'
        self.cache: dict = {}
        self._load_cache()

    # ─── Cache I/O ───────────────────────────────────────────────────

    def _load_cache(self) -> None:
        if self.cache_file.exists():
            try:
                with open(self.cache_file, 'r') as f:
                    self.cache = json.load(f)
            except Exception as e:
                logger.error(f"Could not load metadata cache: {e}")
                self.cache = {}

    def _save_cache(self) -> None:
        try:
            with open(self.cache_file, 'w') as f:
                json.dump(self.cache, f, indent=2)
        except Exception as e:
            logger.error(f"Could not save metadata cache: {e}")

    # ─── Public API ──────────────────────────────────────────────────

    def get_metadata(self, file_path: Path) -> dict | None:
        """
        Return metadata for a parquet file.
        Uses the in-memory/disk cache when the file hasn't changed (mtime + size).
        Recomputes (reads parquet index) when the file is new or modified.
        """
        path_str = str(file_path.absolute())

        if not file_path.exists():
            self.cache.pop(path_str, None)
            self._save_cache()
            return None

        stat      = file_path.stat()
        mtime     = stat.st_mtime
        file_size = stat.st_size

        cached = self.cache.get(path_str)
        if (
            cached
            and cached.get('mtime') == mtime
            and cached.get('file_size') == file_size
            and cached['data'].get('start_date') != 'N/A'
        ):
            return cached['data']

        return self._compute_and_cache(file_path, path_str, mtime, file_size)

    def update_metadata(
        self, file_path: Path, df: pd.DataFrame, extra: dict | None = None
    ) -> None:
        """
        Update the cache entry after writing a DataFrame to disk.
        Pass `extra` to merge additional fields (e.g. quality override).
        """
        if not file_path.exists():
            return

        path_str  = str(file_path.absolute())
        stat      = file_path.stat()
        mtime     = stat.st_mtime
        file_size = stat.st_size

        count, start_date, end_date = _extract_date_range(df)
        quality = self._calculate_quality(count, start_date, end_date, path_str)

        meta_data: dict = {
            'count':      count,
            'start_date': start_date,
            'end_date':   end_date,
            'file_size':  file_size,
            'quality':    quality,
        }
        if extra:
            meta_data.update(extra)

        self.cache[path_str] = {
            'mtime':     mtime,
            'file_size': file_size,
            'data':      meta_data,
        }
        self._save_cache()

    def invalidate(self, file_path: Path) -> None:
        """Remove a file's entry from the cache (e.g. after deletion)."""
        path_str = str(file_path.absolute())
        if path_str in self.cache:
            del self.cache[path_str]
            self._save_cache()

    # ─── Internal ────────────────────────────────────────────────────

    def _compute_and_cache(
        self, file_path: Path, path_str: str, mtime: float, file_size: int
    ) -> dict | None:
        try:
            # Read only the index (cheapest parquet operation)
            try:
                df = pd.read_parquet(file_path, columns=[])
            except Exception:
                df = pd.DataFrame()

            count, start_date, end_date = _extract_date_range(df)

            # Fallback: full read if index didn't yield dates
            if count > 0 and start_date == 'N/A':
                try:
                    df_full = pd.read_parquet(file_path)
                    _, start_date, end_date = _extract_date_range(df_full)
                except Exception:
                    pass

            quality   = self._calculate_quality(count, start_date, end_date, path_str)
            meta_data = {
                'count':      count,
                'start_date': start_date,
                'end_date':   end_date,
                'file_size':  file_size,
                'quality':    quality,
            }

            self.cache[path_str] = {
                'mtime':     mtime,
                'file_size': file_size,
                'data':      meta_data,
            }
            self._save_cache()
            return meta_data

        except Exception as e:
            logger.error(f"Failed to compute metadata for {file_path}: {e}")
            return None

    def _calculate_quality(
        self, count: int, start_date: str, end_date: str, path_str: str
    ) -> str:
        """
        Estimate data completeness as a percentage.
        - 1d  → compares against business-day count
        - 1m  → compares against 390 min/day (RTH) for stocks, 1 440/day for crypto
        """
        if count == 0 or start_date == 'N/A' or end_date == 'N/A':
            return '?'

        try:
            norm = path_str.replace('\\', '/')
            if '/1m/' in norm:
                resolution = '1m'
            elif '/1d/' in norm:
                resolution = '1d'
            else:
                return '?'

            s = pd.to_datetime(start_date)
            e = pd.to_datetime(end_date)

            if resolution == '1d':
                expected = len(pd.bdate_range(start=s, end=e))
                if expected == 0:
                    return '0%'
                quality = (count / expected) * 100

            elif resolution == '1m':
                days = (e - s).days + 1
                if days == 0:
                    return '0%'
                avg_daily = count / days
                # >800 avg rows/day → crypto/futures (24 h), otherwise RTH (6.5 h)
                expected_daily = 1440 if avg_daily > 800 else 390
                quality = (avg_daily / expected_daily) * 100

            else:
                return '?'

            quality = min(100.0, quality)
            return f"{int(quality)}%"

        except Exception:
            return '?'


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _extract_date_range(df: pd.DataFrame) -> tuple[int, str, str]:
    """Return (count, start_date_str, end_date_str) from a DataFrame or its index."""
    count = len(df)
    start_date = 'N/A'
    end_date   = 'N/A'

    if count == 0:
        return count, start_date, end_date

    if isinstance(df.index, pd.DatetimeIndex):
        start_date = str(df.index[0])
        end_date   = str(df.index[-1])
    elif 'Date' in df.columns:
        start_date = str(df['Date'].iloc[0])
        end_date   = str(df['Date'].iloc[-1])
    elif 'timestamp' in df.columns:
        start_date = str(df['timestamp'].iloc[0])
        end_date   = str(df['timestamp'].iloc[-1])

    return count, start_date, end_date
