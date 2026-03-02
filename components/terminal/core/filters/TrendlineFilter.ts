import type { DayCandle } from '../models/Candle';
import type { Pivot } from './PivotFilter';
import type { Trendline, TrendlineType, TrendlineConfig } from '../models/Trendline';

// ─── Constants ────────────────────────────────────────────────────────────────

const EPSILON      = 1e-5;
const MAX_LOOKBACK = 50;   // only connect the last N pivots (O(n²) guard)

// ─── TrendlineFilter ──────────────────────────────────────────────────────────

/**
 * Pure, stateless trendline detector.
 *
 * Algorithm (per side — highs / lows):
 *  1. Take up to MAX_LOOKBACK most-recent confirmed pivots.
 *  2. For every pair (p1, p2) compute line y = mx + c.
 *  3. Raycast backwards from axisX: find the closest (rightmost) bar where
 *     price VIOLATES the line beyond errorRate. That is the line's start_index.
 *  4. Count all pivots after start_index that fit within tolerance.
 *  5. Accept lines with >= minPivots touches.
 *  6. Deduplicate by (slope×6dp, intercept×2dp).
 *  7. Score = (touches × 100) + longevity.
 *  8. Apply NMS to remove near-duplicate lines.
 *  9. Apply proximity / closest / mostValuable display filters.
 */
export class TrendlineFilter {

    /**
     * @param days     Full DayCandle[] sliced to playback time by caller
     * @param pivots   Confirmed Pivot[] (already sliced to visible window)
     * @param axisX    Current day index (= days.length - 1)
     * @param cfg      TrendlineConfig
     */
    compute(
        days:   DayCandle[],
        pivots: Pivot[],
        axisX:  number,
        cfg:    TrendlineConfig,
    ): Trendline[] {

        if (days.length === 0 || pivots.length < 2) return [];

        const highPivots = pivots.filter(p => p.type === 'high');
        const lowPivots  = pivots.filter(p => p.type === 'low');

        let lines: Trendline[] = [
            ...this._processOneSide(days, highPivots, 'resistance', axisX, cfg),
            ...this._processOneSide(days, lowPivots,  'support',    axisX, cfg),
        ];

        // ── NMS ───────────────────────────────────────────────────────────────
        if (cfg.useNMS) {
            lines = this._applyNMS(lines, days, axisX, cfg);
        }

        // ── Proximity filter ──────────────────────────────────────────────────
        if (cfg.proximity > 0 && days.length > 0) {
            const curPrice = days[axisX]?.close ?? 0;
            if (curPrice > 0) {
                lines = lines.filter(l => {
                    const proj = l.slope * axisX + l.intercept;
                    return Math.abs(proj - curPrice) / curPrice <= cfg.proximity;
                });
            }
        }

        // ── Breakout filter (minute-resolution) ───────────────────────────────
        // A line is considered broken when the current bar's close has crossed
        // entirely through the touch zone on the "wrong" side.
        //   Resistance breakout: close > lineY * (1 + zonePct)
        //   Support breakdown:   close < lineY * (1 - zonePct)
        if (cfg.touchZonePct > 0) {
            const zoneFrac = cfg.touchZonePct / 100;
            const curBar   = days[axisX];
            if (curBar) {
                lines = lines.filter(l => {
                    const lineY = l.slope * axisX + l.intercept;
                    if (l.type === 'resistance') {
                        // Broken out above: close fully above the zone top
                        return curBar.close <= lineY * (1 + zoneFrac);
                    } else {
                        // Broken down below: close fully below the zone bottom
                        return curBar.close >= lineY * (1 - zoneFrac);
                    }
                });
            }
        }

        // ── Closest + MostValuable display filters ────────────────────────────
        lines = this._applyDisplayFilters(lines, days, axisX, cfg);

        return lines;
    }

    // ─── Private: one side ────────────────────────────────────────────────────

    private _processOneSide(
        days:   DayCandle[],
        pivots: Pivot[],
        type:   TrendlineType,
        axisX:  number,
        cfg:    TrendlineConfig,
    ): Trendline[] {

        const n = pivots.length;
        if (n < 2) return [];

        const startI = Math.max(0, n - MAX_LOOKBACK);

        // Merged map: dedup key → { slope, intercept, touchIdx, pivotIndicesSet }
        interface Merged {
            slope:        number;
            intercept:    number;
            touchIdx:     number;
            pivotSet:     Set<number>;
        }
        const merged = new Map<string, Merged>();

        for (let i = startI; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const p1 = pivots[i];
                const p2 = pivots[j];

                const dx = p2.dayIndex - p1.dayIndex;
                if (dx === 0) continue;

                const slope     = (p2.price - p1.price) / dx;
                const intercept = p1.price - slope * p1.dayIndex;

                const key = `${slope.toFixed(6)}_${intercept.toFixed(2)}`;

                if (merged.has(key)) {
                    const m = merged.get(key)!;
                    m.pivotSet.add(p1.dayIndex);
                    m.pivotSet.add(p2.dayIndex);
                    continue;
                }

                // Raycast: find rightmost violation before axisX
                const touchIdx = this._raycast(days, slope, intercept, type, axisX, cfg.errorRate);

                // Collect pivots on the line after touchIdx
                const onLine = this._collectPivots(pivots, touchIdx, slope, intercept, cfg.tolerance);
                if (onLine.length < cfg.minPivots) continue;

                merged.set(key, {
                    slope,
                    intercept,
                    touchIdx,
                    pivotSet: new Set(onLine),
                });
            }
        }

        // Emit Trendline objects
        const result: Trendline[] = [];
        merged.forEach((m) => {
            const pivotIndices = Array.from(m.pivotSet).sort((a, b) => a - b);
            const actualStart  = Math.max(0, m.touchIdx);
            const startPrice   = m.slope * actualStart + m.intercept;
            const endPrice     = m.slope * axisX + m.intercept;
            const longevity    = axisX - actualStart;
            const touches      = pivotIndices.length;
            const score        = touches * 100 + longevity;

            result.push({
                id:           `${m.slope.toFixed(6)}_${m.intercept.toFixed(2)}`,
                start_index:  actualStart,
                end_index:    axisX,
                start_price:  startPrice,
                end_price:    endPrice,
                slope:        m.slope,
                intercept:    m.intercept,
                type,
                touches,
                pivotIndices,
                score,
            });
        });

        return result;
    }

    // ─── Private: raycast ─────────────────────────────────────────────────────

    /**
     * Walk backwards from axisX.
     * Return the index of the rightmost bar that VIOLATES the line
     * (i.e. price broke through it beyond the error allowance).
     * Returns -1 if no violation found (line is clean all the way back).
     */
    private _raycast(
        days:       DayCandle[],
        slope:      number,
        intercept:  number,
        type:       TrendlineType,
        axisX:      number,
        errorRate:  number,
    ): number {
        for (let i = axisX; i >= 0; i--) {
            const d = days[i];
            if (!d) continue;
            const lineY = slope * i + intercept;

            if (type === 'resistance') {
                const threshold = lineY * (1 + errorRate);
                if (d.high > threshold + EPSILON) return i;
            } else {
                const threshold = lineY * (1 - errorRate);
                if (d.low < threshold - EPSILON) return i;
            }
        }
        return -1;
    }

    // ─── Private: collect pivots on line ─────────────────────────────────────

    private _collectPivots(
        pivots:    Pivot[],
        touchIdx:  number,
        slope:     number,
        intercept: number,
        tolerance: number,
    ): number[] {
        const result: number[] = [];
        for (const p of pivots) {
            if (p.dayIndex <= touchIdx) continue;
            const expected = slope * p.dayIndex + intercept;
            const tol      = tolerance > 0 ? p.price * tolerance : 1e-4;
            if (Math.abs(p.price - expected) <= tol) {
                result.push(p.dayIndex);
            }
        }
        return result;
    }

    // ─── Private: NMS ─────────────────────────────────────────────────────────

    private _applyNMS(
        lines: Trendline[],
        days:  DayCandle[],
        axisX: number,
        cfg:   TrendlineConfig,
    ): Trendline[] {
        const curPrice = days[axisX]?.close ?? 0;

        // Sort: most touches first, then earliest start (longest), then closest price
        const sorted = [...lines].sort((a, b) => {
            if (b.touches !== a.touches) return b.touches - a.touches;
            if (a.start_index !== b.start_index) return a.start_index - b.start_index;
            return Math.abs(a.end_price - curPrice) - Math.abs(b.end_price - curPrice);
        });

        const accepted: Trendline[] = [];

        while (sorted.length > 0) {
            const best = sorted.shift()!;
            accepted.push(best);

            // Blended tolerance: near-horizontal lines use tighter nmsLevelTolerance
            const slopeRatio      = cfg.nmsLevelSlopeCutoff > 0
                ? Math.min(1, Math.abs(best.slope) / cfg.nmsLevelSlopeCutoff)
                : 1;
            const effectivePriceTol = cfg.nmsLevelTolerance +
                (cfg.nmsPriceTolerance - cfg.nmsLevelTolerance) * slopeRatio;

            for (let i = sorted.length - 1; i >= 0; i--) {
                const cand = sorted[i];
                const priceDiff = Math.abs(cand.end_price - best.end_price);
                const priceRef  = Math.max(Math.abs(best.end_price), 1);
                if (priceDiff / priceRef >= effectivePriceTol) continue;

                const s1 = Math.abs(cand.slope) + 0.0001;
                const s2 = Math.abs(best.slope) + 0.0001;
                if (Math.abs(cand.slope - best.slope) / Math.max(s1, s2) < cfg.nmsSlopeTolerance) {
                    sorted.splice(i, 1);
                }
            }
        }

        return accepted;
    }

    // ─── Private: display filters ─────────────────────────────────────────────

    private _applyDisplayFilters(
        lines: Trendline[],
        days:  DayCandle[],
        axisX: number,
        cfg:   TrendlineConfig,
    ): Trendline[] {
        if (!cfg.useClosestFilter && !cfg.useMostValuableFilter) return lines;

        const curPrice = days[axisX]?.close ?? 0;

        const withDist = lines.map(l => ({
            line:    l,
            distPct: curPrice > 0 ? Math.abs(l.end_price - curPrice) / curPrice : 0,
        }));

        const supports    = withDist.filter(x => x.line.type === 'support');
        const resistances = withDist.filter(x => x.line.type === 'resistance');

        const picked    = new Set<string>();
        const result:   Trendline[] = [];

        const add = (l: Trendline) => {
            if (!picked.has(l.id)) { picked.add(l.id); result.push(l); }
        };

        if (cfg.useClosestFilter) {
            const n = Math.max(1, cfg.closestFilterCount);
            supports.slice().sort((a, b) => a.distPct - b.distPct).slice(0, n).forEach(x => add(x.line));
            resistances.slice().sort((a, b) => a.distPct - b.distPct).slice(0, n).forEach(x => add(x.line));
        }

        if (cfg.useMostValuableFilter) {
            const n = Math.max(1, cfg.mostValuableCount);
            supports.slice().sort((a, b) => b.line.score - a.line.score).slice(0, n).forEach(x => add(x.line));
            resistances.slice().sort((a, b) => b.line.score - a.line.score).slice(0, n).forEach(x => add(x.line));
        }

        return result;
    }
}
