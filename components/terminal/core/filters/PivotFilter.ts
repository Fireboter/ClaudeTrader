import type { DayCandle } from '../models/Candle';

// ─── Public types ─────────────────────────────────────────────────────────────

export type PivotType = 'high' | 'low';

export interface Pivot {
    /** UTC-midnight Unix timestamp of the *daily* bar this pivot belongs to */
    time:     number;
    /** Pivot price (high of the bar for 'high' pivots, low for 'low' pivots) */
    price:    number;
    type:     PivotType;
    /**
     * The day index within the loaded DayCandle[] array.
     * Useful for chart rendering — we always display on daily bars.
     */
    dayIndex: number;
}

// ─── PivotFilter ──────────────────────────────────────────────────────────────

/**
 * Detects swing highs and lows on a daily OHLCV series using a symmetric
 * look-left / look-right window (Williams-style pivot).
 *
 * A bar at index `i` is a **pivot high** when:
 *   high[i] > high[j] for all j in [i-windowSize, i+windowSize], j ≠ i
 *
 * A bar at index `i` is a **pivot low** when:
 *   low[i] < low[j]  for all j in [i-windowSize, i+windowSize], j ≠ i
 *
 * The outer `windowSize` bars cannot be confirmed (missing full look-right window)
 * and are therefore excluded.
 */
export class PivotFilter {
    readonly windowSize: number;

    constructor(windowSize = 5) {
        this.windowSize = Math.max(1, windowSize);
    }

    /**
     * Compute pivots from an array of daily candles.
     * @param days  Full or sliced DayCandle[] — caller controls playback slicing.
     * @returns     Sorted-ascending (by time) array of confirmed Pivot objects.
     */
    compute(days: DayCandle[]): Pivot[] {
        const n = days.length;
        if (n < 2 * this.windowSize + 1) return [];

        const pivots: Pivot[] = [];
        const w = this.windowSize;

        for (let i = w; i < n - w; i++) {
            const bar = days[i];

            if (this._isPivotHigh(days, i, w)) {
                pivots.push({
                    time:     bar.time,
                    price:    bar.high,
                    type:     'high',
                    dayIndex: i,
                });
            }
            if (this._isPivotLow(days, i, w)) {
                pivots.push({
                    time:     bar.time,
                    price:    bar.low,
                    type:     'low',
                    dayIndex: i,
                });
            }
        }

        return pivots;
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    private _isPivotHigh(days: DayCandle[], i: number, w: number): boolean {
        const peak = days[i].high;
        for (let j = i - w; j <= i + w; j++) {
            if (j === i) continue;
            if (days[j].high >= peak) return false;
        }
        return true;
    }

    private _isPivotLow(days: DayCandle[], i: number, w: number): boolean {
        const trough = days[i].low;
        for (let j = i - w; j <= i + w; j++) {
            if (j === i) continue;
            if (days[j].low <= trough) return false;
        }
        return true;
    }
}
