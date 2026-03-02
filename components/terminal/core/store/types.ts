// ─── Terminal Configuration ─────────────────────────────────────
export interface TerminalConfig {
    symbol: string;
    // resolution is always '1m' — Databento 1-minute data only, not stored here
    mode: 'fixed' | 'random';
    startDate: string;
    endDate: string;
    years: number;
    months: number;
    days: number;
}

// ─── Indicator Parameters ───────────────────────────────────────
export interface IndicatorConfig {
    rsi_period: number;
    macd_fast: number;
    macd_slow: number;
    macd_signal: number;
    bb_period: number;
    bb_std: number;
    adx_period: number;
    atr_period: number;
    sma_period: number;
}

// ─── TradeAxis (Pivots & Trendlines) Parameters ─────────────────
export interface TradeAxisConfig {
    // Pivot detection
    touchZone: number;
    profitProtection: number;
    windowSize: number;
    tolerance: number;
    minPivots: number;
    proximity: number;

    // Error filter
    useErrorFilter: boolean;
    errorRate: number;

    // Best-fit / NMS
    filterBestFit: boolean;
    bestFitUseAnchorGrouping: boolean;
    bestFitUseNMS: boolean;
    bestFitAnchorSlopeTolerance: number;
    bestFitNmsPriceTolerance: number;
    bestFitNmsSlopeTolerance: number;
    bestFitNmsLevelSlopeCutoff: number;
    bestFitNmsLevelTolerance: number;

    // Angle filter
    useAngleFilter: boolean;
    maxAngle: number;
    minAngle: number;

    // Toggles
    useProfitProtection: boolean;
    useTouchDetection: boolean;
    useBreakoutDetection: boolean;
    useZoneExit: boolean;
    useStopLoss: boolean;
    useTakeProfit: boolean;

    // Pivot confirmation methods
    useWindowSizeRule: boolean;
    windowSizeUseFirstMinute: boolean;
    usePriceChangeRule: boolean;
    priceChangeThreshold: number;
    useZoneBounce: boolean;
}

// ─── Strategy / Backtest Parameters ─────────────────────────────
export interface StrategyConfig {
    longThreshold: number;
    shortThreshold: number;
    stopLoss: number;
    takeProfit: number;
    initialEquity: number;
    riskPerTrade: number;
    leverage: number;
    exitThreshold: number;
    preHistoryBars: number;

    // Trend scoring weights
    trendScoreTimeWeight: number;
    trendScorePivotWeight: number;
    trendScoreClosenessWeight: number;
    trendScoreSlopeWeight: number;
    trendScoreClosenessPct: number;
    trendScoreSlopeRef: number;

    // Display filters
    useClosestFilter: boolean;
    closestFilterCount: number;
    useMostValuableFilter: boolean;
    mostValuableFilterCount: number;
}

// ─── Sidebar selection state ────────────────────────────────────
export type SelectedItemType =
    | 'indicator'
    | 'tradeaxis'
    | 'pivots'
    | 'trendlines'
    | 'pattern'
    | 'confidence'
    | 'data_management'
    | 'signals'
    | 'prehistory'
    | 'trend_scoring'
    | null;

export interface SelectedItem {
    type: SelectedItemType;
    key: string | null;
}
