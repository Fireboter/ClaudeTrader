// ─── Indicator Definitions ──────────────────────────────────────

export interface IndicatorDefinition {
    key: string;
    name: string;
    color: string;
    category: string;
    description: string;
}

export const QUANT_INDICATORS: IndicatorDefinition[] = [
    { key: 'rsi', name: 'RSI', color: '#a855f7', category: 'Momentum', description: 'Relative Strength Index. Momentum oscillator measuring speed and change of price movements (0-100).' },
    { key: 'macd', name: 'MACD', color: '#3b82f6', category: 'Momentum', description: 'Moving Average Convergence Divergence. Shows relationship between two moving averages.' },
    { key: 'adx', name: 'ADX', color: '#8b5cf6', category: 'Trend', description: 'Average Directional Index. Determines trend strength.' },
    { key: 'sma', name: 'SMA', color: '#10b981', category: 'Trend', description: 'Simple Moving Average. Average price over a specific number of periods.' },
    { key: 'pattern_trend', name: 'Trend (Supp/Res)', color: '#c084fc', category: 'Trend', description: 'Trend direction (-1 to 1) from closest Support and Resistance lines.' },
    { key: 'atr', name: 'ATR', color: '#ef4444', category: 'Volatility', description: 'Average True Range. Market volatility indicator.' },
    { key: 'bollinger', name: 'Bollinger', color: '#ef4444', category: 'Volatility', description: 'Bollinger Bands. Volatility bands around an SMA.' },
    { key: 'obv', name: 'OBV', color: '#f59e0b', category: 'Volume', description: 'On-Balance Volume. Uses volume flow to predict price changes.' },
    { key: 'vwap', name: 'VWAP', color: '#d946ef', category: 'Volume', description: 'Volume Weighted Average Price.' },
    { key: 'ad', name: 'A/D Line', color: '#0ea5e9', category: 'Volume', description: 'Accumulation/Distribution Line.' },
    { key: 'volume', name: 'Volume', color: '#22c55e', category: 'Volume', description: 'Trading Volume.' },
    { key: 'zscore', name: 'Z-Score', color: '#8b5cf6', category: 'Statistical', description: 'Standard Score. How many std devs from the mean.' },
    { key: 'fisher', name: 'Fisher', color: '#ec4899', category: 'Statistical', description: 'Fisher Transform. Converts prices to Gaussian distribution.' },
    { key: 'hist_vol', name: 'Hist. Vol', color: '#f43f5e', category: 'Statistical', description: 'Historical Volatility.' },
    { key: 'choppiness', name: 'Choppiness', color: '#6366f1', category: 'Cyclical', description: 'Choppiness Index. Choppy vs trending market.' },
    { key: 'linreg', name: 'LinReg Slope', color: '#a855f7', category: 'Cyclical', description: 'Linear Regression Slope.' },
    { key: 'hurst', name: 'Hurst', color: '#14b8a6', category: 'Cyclical', description: 'Hurst Exponent. Long-term memory measure.' },
    { key: 'delta', name: 'Delta', color: '#22c55e', category: 'Order Flow', description: 'Buying vs Selling Pressure.' },
];

export const INDICATOR_CATEGORIES = [
    { name: 'Momentum', color: '#a855f7' },
    { name: 'Trend', color: '#10b981' },
    { name: 'Volatility', color: '#ef4444' },
    { name: 'Volume', color: '#f59e0b' },
    { name: 'Statistical', color: '#8b5cf6' },
    { name: 'Cyclical', color: '#ec4899' },
    { name: 'Order Flow', color: '#22c55e' },
];

export const PATTERNS_FEATURES = [
    { key: 'pivots', name: 'Pivots', desc: 'High/Low Points' },
    { key: 'zones', name: 'Touch Zones', desc: 'Price Action Areas' },
    { key: 'trendlines', name: 'Trendlines', desc: 'Support/Resistance' },
    { key: 'patterns', name: 'Patterns', desc: 'Detection (ML)' },
];

export const STRATEGY_FEATURES = [
    { key: 'signals', name: 'Signals', desc: 'Entry/Exit Markers' },
    { key: 'prehistory', name: 'Pre-history', desc: 'Pre-range context window' },
    { key: 'trend_scoring', name: 'Trend Scoring', desc: 'Score trendlines by context' },
];

export const MACRO_INDICATORS = [
    { key: 'macro_rates',        name: 'Fed Funds Rate', desc: 'Effective Federal Funds Rate', symbol: 'DFF' },
    { key: 'macro_unemployment', name: 'Unemployment',   desc: 'Civilian Unemployment Rate',  symbol: 'UNRATE' },
    { key: 'macro_gdp',          name: 'Real GDP',       desc: 'Gross Domestic Product',       symbol: 'GDP' },
    { key: 'macro_treasury',     name: '10Y Treasury',   desc: 'Market Yield 10Y Constant Maturity', symbol: 'DGS10' },
    { key: 'macro_breakeven',    name: 'Breakeven 10Y',  desc: '10Y Breakeven Inflation Rate', symbol: 'T10YIE' },
];
