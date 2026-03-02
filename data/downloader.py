import yfinance as yf
import pandas as pd
import logging
import requests
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class DataDownloader:
    """
    Fetches price/economic data from supported sources:
      - Yahoo Finance  → 1d OHLCV
      - Databento      → 1m OHLCV (futures & equities)
      - FRED           → 1d macro/economic series (used as indicators, not assets)
    """

    # Map generic futures symbols to Yahoo Finance tickers
    YAHOO_SYMBOL_MAP = {
        'GC': 'GC=F',
        'SI': 'SI=F',
        'CL': 'CL=F',
        'BTC': 'BTC-USD',
        'ETH': 'ETH-USD',
    }

    # Databento dataset routing
    DATABENTO_FUTURES = {'GC', 'SI', 'CL', 'HG', 'NG', 'ES', 'NQ', 'ZB', 'ZN'}

    def __init__(self, config: dict):
        self.config = config
        self._creds = config.get('credentials', {})

    # ─── Public Entry Point ──────────────────────────────────────────

    def fetch_price_data(
        self,
        symbol: str,
        start_date,
        end_date,
        interval: str = '1d',
        provider: str = 'yahoo',
    ) -> pd.DataFrame | None:
        """
        Route to the correct provider and return a standardised OHLCV DataFrame.

        Supported providers: 'yahoo', 'databento'
        FRED data is fetched via fetch_fred_data() directly — it is not OHLCV.
        """
        provider = provider.lower()
        logger.info(
            f"Fetching {symbol} ({interval}) from {provider} "
            f"[{start_date} → {end_date}]"
        )

        if provider == 'yahoo':
            return self.fetch_yahoo_data(symbol, start_date, end_date, interval)
        elif provider == 'databento':
            return self.fetch_databento_data(symbol, start_date, end_date, interval)
        else:
            logger.error(f"Unknown provider: {provider}")
            return None

    # ─── Yahoo Finance (1d) ──────────────────────────────────────────

    def fetch_yahoo_data(
        self,
        symbol: str,
        start_date,
        end_date,
        interval: str = '1d',
    ) -> pd.DataFrame | None:
        """Download daily OHLCV from Yahoo Finance."""
        try:
            yf_symbol = self.YAHOO_SYMBOL_MAP.get(symbol, symbol)
            data = yf.download(
                yf_symbol,
                start=start_date,
                end=end_date,
                interval=interval,
                progress=False,
                timeout=20,
            )
            if data.empty:
                logger.warning(f"No Yahoo data for {symbol}")
                return None

            # Flatten MultiIndex columns produced by newer yfinance versions
            if isinstance(data.columns, pd.MultiIndex):
                data.columns = data.columns.droplevel(1)

            return data

        except Exception as e:
            logger.error(f"Yahoo fetch failed for {symbol}: {e}")
            return None

    # ─── Databento (1m) ─────────────────────────────────────────────

    def fetch_databento_data(
        self,
        symbol: str,
        start_date,
        end_date,
        interval: str = '1m',
    ) -> pd.DataFrame | None:
        """
        Download 1-minute OHLCV from Databento.
        Automatically selects dataset:
          - GLBX.MDP3  for CME futures (GC, SI, CL, …)
          - XNAS.ITCH  for equities
        Requests are chunked into 7-day windows to stay within API limits.
        """
        api_key = self._creds.get('databento_api_key', '')
        if not api_key or 'CHANGE_ME' in api_key:
            logger.error("Databento API key missing or not configured.")
            return None

        try:
            import databento as db
        except ImportError:
            logger.error("databento library not installed. Run: pip install databento")
            return None

        dataset = 'GLBX.MDP3' if symbol in self.DATABENTO_FUTURES else 'XNAS.ITCH'
        logger.info(f"Databento dataset: {dataset} for {symbol}")

        try:
            client = db.Historical(api_key)

            curr_start = _to_datetime(start_date)
            curr_end   = _to_datetime(end_date)
            chunk_size = timedelta(days=7)
            all_dfs: list[pd.DataFrame] = []

            while curr_start < curr_end:
                chunk_end = min(curr_start + chunk_size, curr_end)
                s_iso = curr_start.strftime('%Y-%m-%d')
                e_iso = chunk_end.strftime('%Y-%m-%d')

                if s_iso == e_iso:
                    curr_start = chunk_end
                    continue

                logger.info(f"  chunk {s_iso} → {e_iso}")
                try:
                    data = client.timeseries.get_range(
                        dataset=dataset,
                        symbols=symbol,
                        schema='ohlcv-1m',
                        start=s_iso,
                        end=e_iso,
                        stype_in='raw_symbol',
                        stype_out='instrument_id',
                    )
                    chunk_df = data.to_df()
                    if not chunk_df.empty:
                        all_dfs.append(chunk_df)
                except Exception as chunk_err:
                    logger.warning(f"  chunk failed ({s_iso}–{e_iso}): {chunk_err}")

                curr_start = chunk_end

            if not all_dfs:
                logger.warning(f"No Databento data for {symbol} in {dataset}")
                return None

            df = pd.concat(all_dfs)

            # Normalise index
            if 'ts_event' in df.columns:
                df.set_index('ts_event', inplace=True)
            df.index.name = 'timestamp'
            df.sort_index(inplace=True)
            df = df[~df.index.duplicated(keep='first')]

            # Standardise column names
            df.rename(columns={
                'open': 'Open', 'high': 'High',
                'low': 'Low', 'close': 'Close', 'volume': 'Volume',
            }, inplace=True)

            return df

        except Exception as e:
            logger.error(f"Databento fetch failed for {symbol}: {e}")
            return None

    # ─── FRED (macro indicators, 1d) ────────────────────────────────

    def fetch_fred_data(
        self,
        series_id: str,
        start_date,
        end_date,
    ) -> pd.DataFrame | None:
        """
        Download an economic time series from FRED.
        Returns a single-column DataFrame indexed by date.
        The column is named after the series title from FRED.
        """
        api_key = self._creds.get('fred_api_key', '')
        if not api_key:
            logger.error("FRED API key missing.")
            return None

        base_url = 'https://api.stlouisfed.org/fred/series'
        start = _fmt_date(start_date)
        end   = _fmt_date(end_date)

        try:
            # 1. Series title
            info = requests.get(
                base_url,
                params={'series_id': series_id, 'api_key': api_key, 'file_type': 'json'},
                timeout=15,
            )
            series_title = series_id
            if info.status_code == 200:
                seriess = info.json().get('seriess', [{}])
                if seriess:
                    series_title = seriess[0].get('title', series_id)

            # 2. Observations
            resp = requests.get(
                f"{base_url}/observations",
                params={
                    'series_id': series_id,
                    'api_key': api_key,
                    'file_type': 'json',
                    'observation_start': start,
                    'observation_end': end,
                },
                timeout=15,
            )
            data = resp.json()

            if 'observations' not in data:
                logger.error(f"FRED error for {series_id}: {data.get('error_message')}")
                return None

            df = pd.DataFrame(data['observations'])
            if df.empty:
                return None

            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            df.index.name = 'Date'
            df['value'] = pd.to_numeric(df['value'], errors='coerce')
            df.dropna(inplace=True)
            df.rename(columns={'value': series_title}, inplace=True)

            return df

        except Exception as e:
            logger.error(f"FRED fetch failed for {series_id}: {e}")
            return None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _to_datetime(value) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.strptime(str(value)[:10], '%Y-%m-%d')


def _fmt_date(value) -> str:
    if hasattr(value, 'strftime'):
        return value.strftime('%Y-%m-%d')
    return str(value)[:10]
