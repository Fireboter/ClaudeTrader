import logging
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

from .downloader import DataDownloader
from .metadata import MetadataManager

logger = logging.getLogger(__name__)

# ─── Provider registry ───────────────────────────────────────────────────────
#
#  Yahoo   → daily OHLCV price data       (asset)
#  Databento → 1-minute OHLCV price data  (asset)
#  FRED    → daily macro/economic series  (indicator only, not an asset)
#
PROVIDER_RESOLUTIONS: dict[str, list[str]] = {
    'yahoo':     ['1d'],
    'databento': ['1m'],
    'fred':      ['1d'],
}

PROVIDER_LIMITS: dict[str, timedelta] = {
    'yahoo':     timedelta(days=365 * 5),   # 5 years
    'databento': timedelta(days=365),       # 1 year
    'fred':      timedelta(days=365 * 50),  # 50 years
}

# Providers that hold tradeable OHLCV assets (not macro indicators)
ASSET_PROVIDERS = ['yahoo', 'databento']


class DataManager:
    """
    Central data layer for ClaudeTrader.

    Storage layout:
        data_storage/
            yahoo/1d/<SYMBOL>.parquet
            databento/1m/<SYMBOL>.parquet
            fred/1d/<SERIES_ID>.parquet
            metadata_cache.json
            inventory.json          ← optional, pre-computed inventory
    """

    def __init__(self, config: dict):
        self.config     = config
        self.downloader = DataDownloader(config)
        self.data_dir   = Path('data_storage')
        self.data_dir.mkdir(exist_ok=True)
        self.metadata   = MetadataManager(self.data_dir)

        # Ensure provider sub-directories exist
        for provider, resolutions in PROVIDER_RESOLUTIONS.items():
            for res in resolutions:
                (self.data_dir / provider / res).mkdir(parents=True, exist_ok=True)

    # ─── Market-hours filter ─────────────────────────────────────────

    def _filter_market_hours(self, df: pd.DataFrame, resolution: str) -> pd.DataFrame:
        """
        Strips pre/post-market rows from intraday (1m) data.
        Keeps only 09:30–16:00 US/Eastern. Safe no-op for daily data.
        """
        if df is None or df.empty or resolution != '1m':
            return df

        try:
            if not isinstance(df.index, pd.DatetimeIndex):
                df.index = pd.to_datetime(df.index)
            if df.index.tz is None:
                df = df.tz_localize('UTC')
            df_et = df.tz_convert('US/Eastern')
            df_et = df_et.between_time('09:30', '16:00')
            return df_et.tz_convert('UTC').tz_localize(None)
        except Exception as e:
            logger.warning(f"Market-hours filter failed ({resolution}): {e}")
            return df

    # ─── Load / download ─────────────────────────────────────────────

    def get_price_data(
        self,
        symbol: str,
        start_date=None,
        end_date=None,
        resolution: str = '1d',
        provider: str = 'yahoo',
        allow_download: bool = True,
    ) -> pd.DataFrame | None:
        """
        Return OHLCV data for a symbol.

        1. Try exact provider/resolution file on disk.
        2. If 1d requested and only 1m exists for that provider → resample.
        3. Fallback search across other asset providers.
        4. Download if not found and allow_download=True.
        """
        # ── 1. Exact match ───────────────────────────────────────────
        file_path = self.data_dir / provider / resolution / f"{symbol}.parquet"
        if file_path.exists():
            return self._load(file_path, resolution, start_date, end_date)

        # ── 2. Resample 1m → 1d (same provider) ─────────────────────
        if resolution == '1d':
            resampled = self._try_resample(provider, symbol, start_date, end_date)
            if resampled is not None:
                return resampled

        # ── 3. Fallback: other asset providers ───────────────────────
        for p in ASSET_PROVIDERS:
            if p == provider:
                continue
            fp = self.data_dir / p / resolution / f"{symbol}.parquet"
            if fp.exists():
                return self._load(fp, resolution, start_date, end_date)

        # Fallback resample from other providers
        if resolution == '1d':
            for p in ASSET_PROVIDERS:
                if p == provider:
                    continue
                resampled = self._try_resample(p, symbol, start_date, end_date)
                if resampled is not None:
                    return resampled

        # ── 4. Download ───────────────────────────────────────────────
        if not allow_download:
            return None

        logger.info(f"Downloading {symbol} ({resolution}) from {provider}…")
        limit    = PROVIDER_LIMITS.get(provider, timedelta(days=365 * 5))
        sd       = start_date or (datetime.now() - limit)
        ed       = end_date   or datetime.now()
        df       = self.downloader.fetch_price_data(symbol, sd, ed, interval=resolution, provider=provider)

        if df is not None and not df.empty:
            self.save_data(symbol, df, provider=provider, resolution=resolution)
            if isinstance(df.index, pd.DatetimeIndex) and df.index.tz is not None:
                df.index = df.index.tz_localize(None)
            df = self._filter_market_hours(df, resolution)
            if start_date:
                df = df[df.index >= start_date]
            if end_date:
                df = df[df.index <= end_date]
            return df

        return None

    def get_fred_data(
        self,
        series_id: str,
        start_date=None,
        end_date=None,
        allow_download: bool = True,
    ) -> pd.DataFrame | None:
        """
        Return FRED economic series data (used as macro indicators in the chart).
        Stored under data_storage/fred/1d/<SERIES_ID>.parquet
        """
        file_path = self.data_dir / 'fred' / '1d' / f"{series_id}.parquet"

        if file_path.exists():
            return self._load(file_path, '1d', start_date, end_date)

        if not allow_download:
            return None

        logger.info(f"Downloading FRED series: {series_id}…")
        limit = PROVIDER_LIMITS['fred']
        sd    = start_date or (datetime.now() - limit)
        ed    = end_date   or datetime.now()
        df    = self.downloader.fetch_fred_data(series_id, sd, ed)

        if df is not None and not df.empty:
            self.save_data(series_id, df, provider='fred', resolution='1d')
            if start_date:
                df = df[df.index >= start_date]
            if end_date:
                df = df[df.index <= end_date]
            return df

        return None

    # ─── Save ────────────────────────────────────────────────────────

    def save_data(
        self,
        symbol: str,
        df: pd.DataFrame,
        provider: str = 'yahoo',
        resolution: str = '1d',
    ) -> None:
        """Persist a DataFrame to parquet and update the metadata cache."""
        path = self.data_dir / provider / resolution / f"{symbol}.parquet"
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            df.to_parquet(path)
            self.metadata.update_metadata(path, df)
            logger.info(f"Saved → {path}")
        except Exception as e:
            logger.error(f"Save failed for {symbol}: {e}")

    # ─── Delete ──────────────────────────────────────────────────────

    def delete_asset(self, symbol: str, provider: str) -> bool:
        """Delete all resolution files for a symbol under a provider."""
        deleted = False
        for res in PROVIDER_RESOLUTIONS.get(provider, ['1d']):
            path = self.data_dir / provider / res / f"{symbol}.parquet"
            if path.exists():
                try:
                    path.unlink()
                    self.metadata.invalidate(path)
                    deleted = True
                except Exception as e:
                    logger.error(f"Could not delete {path}: {e}")
            # Also remove backup if present
            bak = path.with_suffix('.parquet.bak_original')
            if bak.exists():
                try:
                    bak.unlink()
                except Exception:
                    pass
        return deleted

    # ─── Download all resolutions for a provider ─────────────────────

    def download_all_resolutions(self, symbol: str, provider: str) -> dict[str, str]:
        """Download every supported resolution for a provider/symbol pair."""
        results: dict[str, str] = {}
        limit = PROVIDER_LIMITS.get(provider, timedelta(days=365))
        sd    = datetime.now() - limit
        ed    = datetime.now()

        for res in PROVIDER_RESOLUTIONS.get(provider, ['1d']):
            try:
                df = self.downloader.fetch_price_data(symbol, sd, ed, interval=res, provider=provider)
                if df is not None and not df.empty:
                    self.save_data(symbol, df, provider=provider, resolution=res)
                    results[res] = 'success'
                else:
                    results[res] = 'no_data'
            except Exception as e:
                logger.error(f"Failed {symbol} {res} from {provider}: {e}")
                results[res] = f"error: {e}"

        return results

    # ─── Inventory (asset discovery) ─────────────────────────────────

    def get_available_datasets(self, lightweight: bool = False) -> list[dict]:
        """
        Scan data_storage for all parquet files across asset providers
        (yahoo + databento).  Returns a list of asset info dicts.

        FRED series are not included here — they are indicator data, not assets.
        """
        ASSET_NAMES: dict[str, str] = {
            'AAPL': 'Apple Inc.', 'MSFT': 'Microsoft Corp.',
            'GOOGL': 'Alphabet Inc.', 'AMZN': 'Amazon.com',
            'TSLA': 'Tesla Inc.', 'NVDA': 'NVIDIA Corp.',
            'GC': 'Gold Futures', 'SI': 'Silver Futures',
            'CL': 'Crude Oil', 'BTC': 'Bitcoin', 'ETH': 'Ethereum',
        }

        # ── Disk scan ────────────────────────────────────────────────
        # { "yahoo|1d|AAPL", … }
        existing: set[str] = set()
        # symbol → base info
        assets_map: dict[str, dict] = {}

        for provider in ASSET_PROVIDERS:
            p_dir = self.data_dir / provider
            if not p_dir.exists():
                continue
            for res_dir in p_dir.iterdir():
                if not res_dir.is_dir():
                    continue
                for f in res_dir.glob('*.parquet'):
                    sym = f.stem
                    key = f"{provider}|{res_dir.name}|{sym}"
                    existing.add(key)
                    if sym not in assets_map:
                        assets_map[sym] = {
                            'symbol':   sym,
                            'name':     ASSET_NAMES.get(sym, sym),
                            'provider': provider,
                        }

        # ── Load cached inventory for fast date ranges ────────────────
        cached_inventory: dict = {}
        inv_path = self.data_dir / 'inventory.json'
        if inv_path.exists():
            try:
                import json
                with open(inv_path, 'r') as f:
                    cached_inventory = json.load(f)
            except Exception as e:
                logger.warning(f"Could not load inventory.json: {e}")

        # ── Build result list ─────────────────────────────────────────
        inventory: list[dict] = []
        for sym, base in assets_map.items():
            asset_info: dict = {
                'symbol':    sym,
                'name':      base['name'],
                'providers': {},
            }

            for provider in ASSET_PROVIDERS:
                provider_info: dict = {'configured': False}

                for res in PROVIDER_RESOLUTIONS[provider]:
                    key = f"{provider}|{res}|{sym}"
                    if key not in existing:
                        provider_info[res] = {'status': 'missing'}
                        continue

                    provider_info['configured'] = True
                    details: dict = {}

                    # Use cached inventory first (fastest)
                    inv_entry = cached_inventory.get(sym, {}).get(provider, {}).get(res)
                    if inv_entry:
                        details = {
                            'count':      inv_entry.get('count', 0),
                            'start_date': inv_entry.get('start', 'N/A'),
                            'end_date':   inv_entry.get('end', 'N/A'),
                            'limit_info': f"{inv_entry.get('start','?')} → {inv_entry.get('end','?')}",
                        }
                    elif not lightweight:
                        fp   = self.data_dir / provider / res / f"{sym}.parquet"
                        meta = self.metadata.get_metadata(fp)
                        if meta:
                            s = meta.get('start_date', 'N/A').split(' ')[0]
                            e = meta.get('end_date',   'N/A').split(' ')[0]
                            details = {
                                'count':      meta.get('count', 0),
                                'start_date': meta.get('start_date'),
                                'end_date':   meta.get('end_date'),
                                'file_size':  meta.get('file_size'),
                                'quality':    meta.get('quality', '?'),
                                'limit_info': f"{s} → {e}",
                            }
                    else:
                        details = {'limit_info': 'Available'}

                    provider_info[res] = {'status': 'downloaded', 'details': details}

                asset_info['providers'][provider] = provider_info

            inventory.append(asset_info)

        return inventory

    def get_data_preview(
        self,
        symbol: str,
        provider: str = 'yahoo',
        resolution: str = '1d',
        full: bool = False,
    ) -> dict | None:
        """Return last 100 rows (or all if full=True) plus file metadata."""
        df = self.get_price_data(symbol, resolution=resolution, provider=provider, allow_download=False)
        if df is None or df.empty:
            return None

        file_path = self.data_dir / provider / resolution / f"{symbol}.parquet"
        meta: dict = self.metadata.get_metadata(file_path) or {} if file_path.exists() else {}

        df_preview = df.copy() if full else df.tail(100).copy()
        df_preview.reset_index(inplace=True)

        # Normalise date column name
        if 'timestamp' in df_preview.columns and 'Date' not in df_preview.columns:
            df_preview.rename(columns={'timestamp': 'Date'}, inplace=True)
        if 'Date' in df_preview.columns:
            df_preview['Date'] = df_preview['Date'].astype(str)

        df_preview = df_preview.where(pd.notnull(df_preview), None)
        return {'data': df_preview.to_dict(orient='records'), 'metadata': meta}

    # ─── Optimize / Restore ──────────────────────────────────────────

    def optimize_dataset(self, symbol: str, provider: str, resolution: str) -> dict:
        """Compute a quality score and store it in the metadata cache."""
        df = self.get_price_data(symbol, resolution=resolution, provider=provider, allow_download=False)
        if df is None or df.empty:
            return {'status': 'error', 'message': 'Data not found'}

        file_path = self.data_dir / provider / resolution / f"{symbol}.parquet"
        if not file_path.exists():
            return {'status': 'error', 'message': 'File not found on disk'}

        if not isinstance(df.index, pd.DatetimeIndex):
            df.index = pd.to_datetime(df.index)

        actual   = len(df)
        start_dt = df.index.min()
        end_dt   = df.index.max()

        if resolution == '1d':
            expected = len(pd.bdate_range(start=start_dt, end=end_dt))
        elif resolution == '1m':
            days     = (end_dt - start_dt).days + 1
            avg_day  = actual / max(days, 1)
            per_day  = 1440 if avg_day > 800 else 390
            expected = days * per_day
        else:
            expected = actual

        quality = round(min((actual / expected) * 100 if expected > 0 else 0, 100), 1)

        # Create backup to flag as "optimised" (checked by UI via .bak_original existence)
        bak = file_path.with_suffix('.parquet.bak_original')
        if not bak.exists():
            import shutil
            shutil.copy2(file_path, bak)

        self.metadata.update_metadata(file_path, df, extra={'quality': f"{quality}%"})
        return {
            'status':  'success',
            'quality': quality,
            'message': f"Quality: {quality}% ({actual}/{expected} expected rows)",
        }

    def restore_dataset(self, symbol: str, provider: str, resolution: str) -> dict:
        """Restore from .bak_original backup if present."""
        file_path = self.data_dir / provider / resolution / f"{symbol}.parquet"
        bak       = file_path.with_suffix('.parquet.bak_original')

        if not bak.exists():
            return {'status': 'error', 'message': 'No backup found'}

        import shutil
        shutil.move(str(bak), str(file_path))
        self.metadata.invalidate(file_path)
        return {'status': 'success', 'message': 'Restored original dataset'}

    # ─── Internals ───────────────────────────────────────────────────

    def _load(
        self,
        file_path: Path,
        resolution: str,
        start_date,
        end_date,
    ) -> pd.DataFrame | None:
        """Read a parquet file, strip tz, apply market-hours filter, slice dates."""
        try:
            df = pd.read_parquet(file_path)
            if isinstance(df.index, pd.DatetimeIndex) and df.index.tz is not None:
                df.index = df.index.tz_localize(None)
            df = self._filter_market_hours(df, resolution)
            if start_date:
                df = df[df.index >= start_date]
            if end_date:
                df = df[df.index <= end_date]
            return df
        except Exception as e:
            logger.error(f"Failed to load {file_path}: {e}")
            return None

    def _try_resample(
        self, provider: str, symbol: str, start_date, end_date
    ) -> pd.DataFrame | None:
        """Resample 1m data to 1d for a given provider/symbol if the 1m file exists."""
        path_1m = self.data_dir / provider / '1m' / f"{symbol}.parquet"
        if not path_1m.exists():
            return None
        try:
            df = pd.read_parquet(path_1m)
            if not isinstance(df.index, pd.DatetimeIndex):
                df.index = pd.to_datetime(df.index)
            if df.index.tz is not None:
                df.index = df.index.tz_localize(None)

            agg = {k: v for k, v in {
                'Open': 'first', 'High': 'max',
                'Low': 'min', 'Close': 'last', 'Volume': 'sum',
            }.items() if k in df.columns}

            df = df.resample('1D').agg(agg).dropna()
            if start_date:
                df = df[df.index >= start_date]
            if end_date:
                df = df[df.index <= end_date]

            logger.info(f"Resampled {provider}/1m/{symbol} → 1d")
            return df
        except Exception as e:
            logger.error(f"Resample failed for {provider}/{symbol}: {e}")
            return None
