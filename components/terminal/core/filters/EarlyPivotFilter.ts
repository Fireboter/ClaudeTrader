import type { DayCandle, RawCandle } from '../models/Candle';
import type { Trendline } from '../models/Trendline';
import type { EarlyPivot, EarlyPivotConfig } from '../models/EarlyPivot';

// ─── EarlyPivotFilter ─────────────────────────────────────────────────────────

/**
 * Pure, stateless filter. Scans the last two candles for early pivot signals
 * using minute-resolution data to determine the order of events within a day.
 *
 * Detection rules:
 *   Provisional — candle's high/low enters a trendline touch zone.
 *   Confirmed   — after the touch, price recoils `recoilPct`% back through the
 *                 trendline price in the opposite direction.
 *                 Confirmation may happen on the SAME day or the NEXT day
 *                 (cross-day confirmation).
 *   Superseded  — confirmed pivot where the candle later made a new extreme
 *                 beyond `touchPrice` (e.g. new high after a resistance touch).
 *
 * A single candle can simultaneously trigger a HIGH (from resistance) and a LOW
 * (from support) pivot if it enters both zones.
 */
export class EarlyPivotFilter {

    /**
     * @param days         Full or playback-sliced DayCandle[].
     * @param trendlines   Active trendlines (must have touchZonePct > 0 to detect).
     * @param config       EarlyPivotConfig (recoilPct etc.).
     * @param zonePct      trendlineConfig.touchZonePct / 100 (e.g. 0.005 for 0.5%).
     * @param axisX        Index of the current (last) candle in `days`.
     * @param playbackTime Current playback timestamp (null = no playback; uses all minutes).
     */
    compute(
        days:         DayCandle[],
        trendlines:   Trendline[],
        config:       EarlyPivotConfig,
        zonePct:      number,
        axisX:        number,
        playbackTime: number | null,
    ): EarlyPivot[] {

        if (!config.enabled || days.length === 0 || trendlines.length === 0 || zonePct <= 0) {
            return [];
        }

        const results: EarlyPivot[] = [];

        // Scan the last 2 candles only
        const startIdx = Math.max(0, axisX - 1);
        for (let dayIdx = startIdx; dayIdx <= axisX; dayIdx++) {
            const day = days[dayIdx];
            if (!day) continue;

            // For the active (last) candle, filter minutes by playbackTime
            const isActiveDay = dayIdx === axisX;
            const mins = isActiveDay && playbackTime !== null
                ? day.minutes.filter(m => m.time <= playbackTime)
                : day.minutes;

            // Next-day minutes for cross-day confirmation.
            // Only available when the next day is still within the scan window
            // (i.e. dayIdx = axisX-1 and axisX is the active day).
            // If the next day is the active day, honour playbackTime.
            const nextDayIdx = dayIdx + 1;
            let nextDayMins: RawCandle[] = [];
            if (nextDayIdx <= axisX) {
                const nextDay = days[nextDayIdx];
                if (nextDay) {
                    const isNextActive = nextDayIdx === axisX;
                    nextDayMins = isNextActive && playbackTime !== null
                        ? nextDay.minutes.filter(m => m.time <= playbackTime)
                        : nextDay.minutes;
                }
            }

            for (const tl of trendlines) {
                // Only consider lines active at this day index
                if (dayIdx < tl.start_index || dayIdx > tl.end_index) continue;

                const linePrice = tl.slope * dayIdx + tl.intercept;
                if (linePrice <= 0) continue;

                const zoneBot = linePrice * (1 - zonePct);
                const zoneTop = linePrice * (1 + zonePct);

                if (tl.type === 'resistance') {
                    // HIGH: candle entered the resistance zone from below
                    if (day.high >= zoneBot) {
                        const ep = this._evalHigh(
                            day, mins, nextDayMins, dayIdx, tl.id, linePrice,
                            zoneBot, config.recoilPct,
                        );
                        results.push(ep);
                    }
                } else {
                    // LOW: candle entered the support zone from above
                    if (day.low <= zoneTop) {
                        const ep = this._evalLow(
                            day, mins, nextDayMins, dayIdx, tl.id, linePrice,
                            zoneTop, config.recoilPct,
                        );
                        results.push(ep);
                    }
                }
            }
        }

        return results;
    }

    // ─── HIGH (resistance touch) ──────────────────────────────────────────────

    private _evalHigh(
        day:         DayCandle,
        mins:        RawCandle[],
        nextDayMins: RawCandle[],
        dayIdx:      number,
        tlId:        string,
        linePrice:   number,
        zoneBot:     number,
        recoilPct:   number,
    ): EarlyPivot {

        const recoilThreshold = linePrice * (1 - recoilPct / 100);

        const base: Omit<EarlyPivot, 'status' | 'confirmedAt' | 'superseded' | 'touchMinuteTime' | 'confirmMinuteTime' | 'supersededMinuteTime'> = {
            time:            day.time,
            dayIndex:        dayIdx,
            type:            'high',
            touchPrice:      linePrice,
            trendlineId:     tlId,
            recoilThreshold,
        };

        if (mins.length === 0) {
            // No minute data — use daily OHLC only (cannot determine order)
            if (day.low <= recoilThreshold) {
                // Both happened; assume touch then recoil then possible re-break
                const superseded = day.high > linePrice;
                return { ...base, touchMinuteTime: day.time, status: 'confirmed', confirmedAt: Math.min(day.low, recoilThreshold), superseded };
            }
            return { ...base, touchMinuteTime: day.time, status: 'provisional', superseded: false };
        }

        // Find first minute where high entered the zone
        const touchMinIdx = mins.findIndex(m => m.high >= zoneBot);
        if (touchMinIdx < 0) {
            return { ...base, touchMinuteTime: day.time, status: 'provisional', superseded: false };
        }
        const touchMinuteTime = mins[touchMinIdx].time;

        // Find first minute AFTER touch where low hit recoil threshold (same day)
        const confirmMinIdx = mins.slice(touchMinIdx + 1).findIndex(m => m.low <= recoilThreshold);
        if (confirmMinIdx < 0) {
            // No same-day confirmation — try cross-day: search next day's minutes
            if (nextDayMins.length > 0) {
                const nextConfirmIdx = nextDayMins.findIndex(m => m.low <= recoilThreshold);
                if (nextConfirmIdx >= 0) {
                    const confirmMin        = nextDayMins[nextConfirmIdx];
                    const confirmMinuteTime = confirmMin.time;
                    const confirmedAt       = Math.min(confirmMin.low, recoilThreshold);

                    // Superseded: new high past touchPrice AFTER cross-day confirmation
                    const afterConfirm         = nextDayMins.slice(nextConfirmIdx + 1);
                    const supersededMin        = afterConfirm.find(m => m.high > linePrice);
                    const superseded           = supersededMin !== undefined;
                    const supersededMinuteTime = supersededMin?.time;

                    return { ...base, touchMinuteTime, confirmMinuteTime, supersededMinuteTime, status: 'confirmed', confirmedAt, superseded };
                }
            }
            return { ...base, touchMinuteTime, status: 'provisional', superseded: false };
        }

        const absoluteConfirmIdx = touchMinIdx + 1 + confirmMinIdx;
        const confirmMin         = mins[absoluteConfirmIdx];
        const confirmMinuteTime  = confirmMin.time;
        const confirmedAt        = Math.min(confirmMin.low, recoilThreshold);

        // Superseded: new high past touchPrice AFTER confirmation
        const afterConfirm         = mins.slice(absoluteConfirmIdx + 1);
        const supersededMin        = afterConfirm.find(m => m.high > linePrice);
        const superseded           = supersededMin !== undefined;
        const supersededMinuteTime = supersededMin?.time;

        return { ...base, touchMinuteTime, confirmMinuteTime, supersededMinuteTime, status: 'confirmed', confirmedAt, superseded };
    }

    // ─── LOW (support touch) ──────────────────────────────────────────────────

    private _evalLow(
        day:         DayCandle,
        mins:        RawCandle[],
        nextDayMins: RawCandle[],
        dayIdx:      number,
        tlId:        string,
        linePrice:   number,
        zoneTop:     number,
        recoilPct:   number,
    ): EarlyPivot {

        const recoilThreshold = linePrice * (1 + recoilPct / 100);

        const base: Omit<EarlyPivot, 'status' | 'confirmedAt' | 'superseded' | 'touchMinuteTime' | 'confirmMinuteTime' | 'supersededMinuteTime'> = {
            time:            day.time,
            dayIndex:        dayIdx,
            type:            'low',
            touchPrice:      linePrice,
            trendlineId:     tlId,
            recoilThreshold,
        };

        if (mins.length === 0) {
            if (day.high >= recoilThreshold) {
                const superseded = day.low < linePrice;
                return { ...base, touchMinuteTime: day.time, status: 'confirmed', confirmedAt: Math.max(day.high, recoilThreshold), superseded };
            }
            return { ...base, touchMinuteTime: day.time, status: 'provisional', superseded: false };
        }

        const touchMinIdx = mins.findIndex(m => m.low <= zoneTop);
        if (touchMinIdx < 0) {
            return { ...base, touchMinuteTime: day.time, status: 'provisional', superseded: false };
        }
        const touchMinuteTime = mins[touchMinIdx].time;

        const confirmMinIdx = mins.slice(touchMinIdx + 1).findIndex(m => m.high >= recoilThreshold);
        if (confirmMinIdx < 0) {
            // No same-day confirmation — try cross-day: search next day's minutes
            if (nextDayMins.length > 0) {
                const nextConfirmIdx = nextDayMins.findIndex(m => m.high >= recoilThreshold);
                if (nextConfirmIdx >= 0) {
                    const confirmMin        = nextDayMins[nextConfirmIdx];
                    const confirmMinuteTime = confirmMin.time;
                    const confirmedAt       = Math.max(confirmMin.high, recoilThreshold);

                    // Superseded: new low past touchPrice AFTER cross-day confirmation
                    const afterConfirm         = nextDayMins.slice(nextConfirmIdx + 1);
                    const supersededMin        = afterConfirm.find(m => m.low < linePrice);
                    const superseded           = supersededMin !== undefined;
                    const supersededMinuteTime = supersededMin?.time;

                    return { ...base, touchMinuteTime, confirmMinuteTime, supersededMinuteTime, status: 'confirmed', confirmedAt, superseded };
                }
            }
            return { ...base, touchMinuteTime, status: 'provisional', superseded: false };
        }

        const absoluteConfirmIdx = touchMinIdx + 1 + confirmMinIdx;
        const confirmMin         = mins[absoluteConfirmIdx];
        const confirmMinuteTime  = confirmMin.time;
        const confirmedAt        = Math.max(confirmMin.high, recoilThreshold);

        // Superseded: new low past touchPrice AFTER confirmation
        const afterConfirm         = mins.slice(absoluteConfirmIdx + 1);
        const supersededMin        = afterConfirm.find(m => m.low < linePrice);
        const superseded           = supersededMin !== undefined;
        const supersededMinuteTime = supersededMin?.time;

        return { ...base, touchMinuteTime, confirmMinuteTime, supersededMinuteTime, status: 'confirmed', confirmedAt, superseded };
    }
}
