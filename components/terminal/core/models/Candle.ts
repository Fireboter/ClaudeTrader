import type { Time } from 'lightweight-charts';

// ─── Wire types (API shapes) ──────────────────────────────────────────────────

/** A single OHLCV bar as returned by the API (time = Unix seconds). */
export interface RawCandle {
    time:   number;
    open:   number;
    high:   number;
    low:    number;
    close:  number;
    volume: number;
}

/**
 * A daily bar with all its 1-minute bars preloaded.
 * Returned by GET /api/candles/full.
 */
export interface DayCandle extends RawCandle {
    minutes: RawCandle[];   // sorted ascending by time, covers the full trading day
}

// ─── TradingView-ready shapes ─────────────────────────────────────────────────

export interface TVCandle {
    time:  Time;
    open:  number;
    high:  number;
    low:   number;
    close: number;
}

export interface TVBar extends TVCandle {
    volume: number;
}

export interface TVHistogram {
    time:  Time;
    value: number;
    color: string;
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

export function toTVCandle(c: RawCandle): TVCandle {
    return { time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close };
}

export function toTVBar(c: RawCandle): TVBar {
    return { ...toTVCandle(c), volume: c.volume };
}

export function toTVVolume(c: RawCandle): TVHistogram {
    return {
        time:  c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? '#22c55e40' : '#ef444440',
    };
}

// ─── Legacy stub interfaces ───────────────────────────────────────────────────
// Satisfy old GeminiTrader files (BacktestManager, FilterManager, old PlaybackManager)
// until they are rebuilt step by step.

export interface MinuteCandle {
    time:   number | string;
    open:   number;
    high:   number;
    low:    number;
    close:  number;
    volume: number;
}

export interface DailyCandle {
    time:   number | string;
    open:   number;
    high:   number;
    low:    number;
    close:  number;
    volume: number;
    hasMinuteData:  boolean;
    minuteCandles:  MinuteCandle[];
    setMinuteCandles(data: MinuteCandle[]): void;
}
