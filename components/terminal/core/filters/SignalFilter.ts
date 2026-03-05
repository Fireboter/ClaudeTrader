import type { DayCandle } from '../models/Candle';
import type { EarlyPivot } from '../models/EarlyPivot';
import type { Trendline } from '../models/Trendline';
import type { Signal, SignalKind, ActiveTrade } from '../models/Signal';
import type { SignalConfig } from '../store/types';

// ─── SignalFilter ──────────────────────────────────────────────────────────────

/**
 * Pure, stateless signal generator.
 *
 * Produces four kinds of signals:
 *   long  / short  — entry signals from pivot confirmations or trendline breakouts.
 *   win   / loss   — exit signals from zone touches, stop-loss, or take-profit.
 *
 * The caller (SignalManager) provides:
 *   - confirmedEarlyPivots  from EarlyPivotManager
 *   - trendlines            currently active lines (from TrendlineManager)
 *   - days                  visibleDays (minute-accurate, same slice used by MainChart)
 *   - brokenTrendlineIds    IDs of trendlines removed in the most-recent recompute
 *                           (detected by TrendlineManager comparing previous vs new)
 */
export class SignalFilter {

    compute(
        confirmedEarlyPivots: EarlyPivot[],
        trendlines:           Trendline[],
        brokenTrendlineIds:   Map<string, { type: 'resistance' | 'support'; slope: number; intercept: number }>,
        days:                 DayCandle[],
        config:               SignalConfig,
        exitConfig: {
            useZoneExit:   boolean;
            useStopLoss:   boolean;
            useTakeProfit: boolean;
            stopLossPct:   number;
            takeProfitPct: number;
            touchZonePct:  number;
        },
        playbackTime: number | null,
    ): { signals: Signal[]; activeTrade: ActiveTrade | null } {

        if (!config.enabled || days.length === 0) {
            return { signals: [], activeTrade: null };
        }

        const signals: Signal[] = [];
        const axisX = days.length - 1;

        // ── 1. Entry signals: Pivot Confirmation ──────────────────────────────
        if (config.usePivotConfirmation) {
            for (const ep of confirmedEarlyPivots) {
                if (ep.status !== 'confirmed' || ep.confirmedAt === undefined) continue;

                // confirmMinuteTime may span to the next day (cross-day)
                // dayIndex tells us which day the signal belongs to
                const time  = ep.confirmMinuteTime ?? ep.time;
                const price = ep.confirmedAt;
                const kind: SignalKind = ep.type === 'high' ? 'short' : 'long';

                signals.push({
                    id:       `pc|${ep.trendlineId}|${ep.dayIndex}|${ep.type}`,
                    kind,
                    source:   'pivot_confirmation',
                    price,
                    time,
                    dayIndex: ep.dayIndex,
                });
            }
        }

        // ── 2. Entry signals: Trendline Breakout (current bar only) ───────────
        if (config.useBreakoutDetection && days.length > 0) {
            const curBar     = days[axisX];
            const zoneFrac   = exitConfig.touchZonePct / 100;

            // Scan already-broken trendlines for this recompute cycle
            for (const [tlId, tl] of brokenTrendlineIds.entries()) {
                const lineY   = tl.slope * axisX + tl.intercept;
                if (lineY <= 0) continue;

                const mins = playbackTime !== null
                    ? curBar.minutes.filter(m => m.time <= playbackTime)
                    : curBar.minutes;

                if (tl.type === 'resistance') {
                    // Resistance breakout → Long
                    const threshold = lineY * (1 + zoneFrac);
                    const breakMin  = mins.find(m => m.close > threshold);
                    if (breakMin) {
                        signals.push({
                            id:       `bo|${tlId}|${axisX}`,
                            kind:     'long',
                            source:   'breakout',
                            price:    breakMin.close,
                            time:     breakMin.time,
                            dayIndex: axisX,
                        });
                    }
                } else {
                    // Support breakdown → Short
                    const threshold = lineY * (1 - zoneFrac);
                    const breakMin  = mins.find(m => m.close < threshold);
                    if (breakMin) {
                        signals.push({
                            id:       `bo|${tlId}|${axisX}`,
                            kind:     'short',
                            source:   'breakout',
                            price:    breakMin.close,
                            time:     breakMin.time,
                            dayIndex: axisX,
                        });
                    }
                }
            }
        }

        // ── 3. Exit signals ───────────────────────────────────────────────────
        // Sort entry signals chronologically, then walk all minutes in order,
        // opening/closing one trade at a time.

        const entrySignals = signals
            .filter(s => s.kind === 'long' || s.kind === 'short')
            .sort((a, b) => a.time - b.time);

        if (entrySignals.length === 0) {
            return { signals, activeTrade: null };
        }

        const exitSignals: Signal[] = [];
        let activeTrade: ActiveTrade | null = null;
        let entryIdx = 0;

        const zoneFrac = exitConfig.touchZonePct / 100;

        // Walk through all visible days and their minutes chronologically
        for (let di = 0; di < days.length; di++) {
            const day     = days[di];
            const allMins = di === axisX && playbackTime !== null
                ? day.minutes.filter(m => m.time <= playbackTime)
                : day.minutes;

            for (const min of allMins) {
                // Open a new trade on the first entry signal at or before this minute
                while (
                    entryIdx < entrySignals.length &&
                    entrySignals[entryIdx].time <= min.time &&
                    activeTrade === null
                ) {
                    const entry    = entrySignals[entryIdx];
                    const slPct    = exitConfig.stopLossPct;
                    const tpPct    = exitConfig.takeProfitPct;
                    const isLong   = entry.kind === 'long';

                    activeTrade = {
                        kind:        entry.kind as 'long' | 'short',
                        entryPrice:  entry.price,
                        slPrice:     exitConfig.useStopLoss
                            ? (isLong
                                ? entry.price * (1 - slPct / 100)
                                : entry.price * (1 + slPct / 100))
                            : null,
                        tpPrice:     exitConfig.useTakeProfit
                            ? (isLong
                                ? entry.price * (1 + tpPct / 100)
                                : entry.price * (1 - tpPct / 100))
                            : null,
                        entryTime:   entry.time,
                        entryDayIdx: entry.dayIndex,
                    };
                    entryIdx++;
                }

                if (!activeTrade) continue;

                const { kind, entryPrice, slPrice, tpPrice } = activeTrade;
                const isLong = kind === 'long';
                let exitKind: SignalKind | null   = null;
                let exitSource: Signal['source'] | null = null;
                let exitPrice = 0;

                // Stop Loss
                if (slPrice !== null) {
                    const hit = isLong ? min.low <= slPrice : min.high >= slPrice;
                    if (hit) {
                        exitKind   = 'loss';
                        exitSource = 'stop_loss';
                        exitPrice  = slPrice;
                    }
                }

                // Take Profit (only check if SL not already triggered)
                if (exitKind === null && tpPrice !== null) {
                    const hit = isLong ? min.high >= tpPrice : min.low <= tpPrice;
                    if (hit) {
                        exitKind   = 'win';
                        exitSource = 'take_profit';
                        exitPrice  = tpPrice;
                    }
                }

                // Zone Exit (only check if SL/TP not already triggered)
                if (exitKind === null && exitConfig.useZoneExit && zoneFrac > 0) {
                    for (const tl of trendlines) {
                        if (di < tl.start_index || di > tl.end_index) continue;
                        const lineY = tl.slope * di + tl.intercept;
                        if (lineY <= 0) continue;

                        const zoneBot = lineY * (1 - zoneFrac);
                        const zoneTop = lineY * (1 + zoneFrac);

                        // Long exits when price touches a resistance zone
                        if (isLong && tl.type === 'resistance' && min.high >= zoneBot) {
                            exitKind   = min.close >= entryPrice ? 'win' : 'loss';
                            exitSource = 'zone_exit';
                            exitPrice  = lineY;
                            break;
                        }
                        // Short exits when price touches a support zone
                        if (!isLong && tl.type === 'support' && min.low <= zoneTop) {
                            exitKind   = min.close <= entryPrice ? 'win' : 'loss';
                            exitSource = 'zone_exit';
                            exitPrice  = lineY;
                            break;
                        }
                    }
                }

                if (exitKind !== null && exitSource !== null) {
                    exitSignals.push({
                        id:       `exit|${activeTrade.entryTime}|${min.time}`,
                        kind:     exitKind,
                        source:   exitSource,
                        price:    exitPrice,
                        time:     min.time,
                        dayIndex: di,
                    });
                    activeTrade = null;

                    // Advance to next entry signal now that trade is closed
                    while (entryIdx < entrySignals.length && entrySignals[entryIdx].time <= min.time) {
                        entryIdx++;
                    }
                }
            }
        }

        return {
            signals: [...signals, ...exitSignals],
            activeTrade,
        };
    }
}
