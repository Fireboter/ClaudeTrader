/**
 * backtestEngine.ts
 *
 * Pure, framework-free batch backtest simulation.
 *
 * Pipeline:
 *  1. Group flat 1-minute bars  → DayCandle[]
 *  2. PivotFilter on full set   → all confirmed swing pivots
 *  3. Day-by-day loop:
 *       a. TrendlineFilter at each step   → current trendlines
 *       b. EarlyPivotFilter at each step  → accumulate confirmed early pivots
 *  4. SignalFilter once on full dataset   → entry + exit signals
 *  5. Signals → BacktestTrade[]
 *  6. Equity curve + stats
 *
 * Causal correctness:
 *  - Pivots are only used once their right-side confirmation window has been seen.
 *    At step i, only pivots with dayIndex <= i - windowSize are eligible.
 *    This matches the live chart's behaviour and avoids look-ahead bias.
 *
 * Limitations (acceptable for v1):
 *  - Breakout entries are not included (SignalFilter breakout mode is incremental;
 *    a day-by-day breakout pass can be added later).
 *  - Zone exits use the *final* trendline set, not the trendlines that were active
 *    at entry time. Lines with high score tend to be visible throughout, so this
 *    is a minor approximation.
 */

import type { DayCandle } from '../models/Candle';
import type { EarlyPivot, EarlyPivotConfig } from '../models/EarlyPivot';
import type { Trendline, TrendlineConfig } from '../models/Trendline';
import type { Signal } from '../models/Signal';
import type { TradeAxisConfig, StrategyConfig, SignalConfig } from '../store/types';
import { PivotFilter } from '../filters/PivotFilter';
import { TrendlineFilter } from '../filters/TrendlineFilter';
import { EarlyPivotFilter } from '../filters/EarlyPivotFilter';
import { SignalFilter } from '../filters/SignalFilter';
import type { Time } from 'lightweight-charts';

// ─── Public output types ──────────────────────────────────────────────────────

export interface BacktestTrade {
    id:          string;
    type:        'long' | 'short';
    entryPrice:  number;
    exitPrice?:  number;
    entryTime:   number;
    exitTime?:   number;
    /** Fraction: positive = gain. e.g. 0.05 = +5% move on the instrument. */
    pnl?:        number;
    status:      'active' | 'closed';
}

export interface BacktestStats {
    total_return:  number;   // percent
    win_rate:      number;   // 0–1
    total_trades:  number;
    max_drawdown:  number;   // percent (positive = drawdown)
    sharpe_ratio:  number;
    profit_factor: number;
}

export interface BacktestResult {
    trades:       BacktestTrade[];
    equityCurve:  { time: Time; value: number }[];
    stats:        BacktestStats;
}

// ─── 1–4. Main simulation ─────────────────────────────────────────────────────

export function runBacktestSimulation(
    days:             DayCandle[],
    preHistoryCount:  number,
    tradeAxisConfig:  TradeAxisConfig,
    strategyConfig:   StrategyConfig,
    trendlineConfig:  TrendlineConfig,
    signalConfig:     SignalConfig,
    earlyPivotConfig: EarlyPivotConfig,
): BacktestResult {

    // ── Step 1: validate data ──────────────────────────────────────────────────
    if (days.length < preHistoryCount + 10) return _empty();

    // ── Step 2: pivot detection on full dataset ────────────────────────────────
    const pivotFilter = new PivotFilter(tradeAxisConfig.windowSize);
    const allPivots   = pivotFilter.compute(days);

    // ── Step 3: day-by-day walk ───────────────────────────────────────────────
    const trendlineFilter  = new TrendlineFilter();
    const earlyPivotFilter = new EarlyPivotFilter();

    // Force early pivot detection enabled for backtest regardless of UI toggle.
    const epConfig: EarlyPivotConfig = { ...earlyPivotConfig, enabled: true };

    const confirmedEarlyPivots:   EarlyPivot[] = [];
    const confirmedEarlyPivotIds: Set<string>  = new Set();

    const zonePct = (trendlineConfig.touchZonePct ?? 0) / 100;

    // We need at least 2×windowSize + 1 bars before pivots can be confirmed.
    const minDays = tradeAxisConfig.windowSize * 2 + 3;

    let finalTrendlines: Trendline[] = [];

    for (let i = minDays; i < days.length; i++) {
        // Sliced prefix of days visible at step i
        const slicedDays = days.slice(0, i + 1);

        // Causal pivot filter: a swing pivot at day N requires windowSize bars
        // to the right to be confirmed. At step i, only pivots from day
        // (i - windowSize) or earlier are actually confirmed on the live chart.
        // Using i without this offset would introduce look-ahead bias.
        const slicedPivots = allPivots.filter(p => p.dayIndex <= i - tradeAxisConfig.windowSize);

        const trendlines = trendlineFilter.compute(slicedDays, slicedPivots, i, trendlineConfig);

        // Accumulate confirmed early pivots (only when touch zones are configured)
        if (zonePct > 0 && trendlines.length > 0) {
            const earlyPivots = earlyPivotFilter.compute(
                slicedDays, trendlines, epConfig, zonePct, i, null,
            );
            for (const ep of earlyPivots) {
                if (ep.status !== 'confirmed') continue;
                const epId = `${ep.trendlineId}|${ep.dayIndex}|${ep.type}`;
                if (!confirmedEarlyPivotIds.has(epId)) {
                    confirmedEarlyPivotIds.add(epId);
                    confirmedEarlyPivots.push(ep);
                }
            }
        }

        if (i === days.length - 1) finalTrendlines = trendlines;
    }

    // ── Step 4: run SignalFilter once on the full dataset ─────────────────────
    // Breakout detection requires per-cycle incremental data, so we disable it
    // here and rely solely on pivot-confirmation entries.
    // Filter out pre-history early pivots to match live chart behaviour —
    // signals are only generated for the actual-range days (>= preHistoryCount).
    const visibleEarlyPivots = confirmedEarlyPivots.filter(ep => ep.dayIndex >= preHistoryCount);
    const signalFilter = new SignalFilter();
    const { signals } = signalFilter.compute(
        visibleEarlyPivots,
        finalTrendlines,
        new Map(),  // no breakout entries in batch mode
        days,
        { ...signalConfig, useBreakoutDetection: false },
        {
            useZoneExit:   tradeAxisConfig.useZoneExit,
            useStopLoss:   tradeAxisConfig.useStopLoss,
            useTakeProfit: tradeAxisConfig.useTakeProfit,
            stopLossPct:   strategyConfig.stopLoss,
            takeProfitPct: strategyConfig.takeProfit,
            touchZonePct:  trendlineConfig.touchZonePct ?? 0,
        },
        null, // no playback cursor — full dataset
    );

    // ── Steps 5–6: signals → trades → equity + stats ─────────────────────────
    const trades = _signalsToTrades(signals);
    return _buildResult(trades, strategyConfig, days);
}

// ─── 5. Signals → trades ─────────────────────────────────────────────────────

function _signalsToTrades(signals: Signal[]): BacktestTrade[] {
    const sorted = [...signals].sort((a, b) => a.time - b.time);
    const trades: BacktestTrade[] = [];
    let openEntry: Signal | null = null;
    let idx = 0;

    for (const sig of sorted) {
        if ((sig.kind === 'long' || sig.kind === 'short') && openEntry === null) {
            openEntry = sig;
        } else if ((sig.kind === 'win' || sig.kind === 'loss') && openEntry !== null) {
            const isLong  = openEntry.kind === 'long';
            const rawPnl  = isLong
                ? (sig.price - openEntry.price) / openEntry.price
                : (openEntry.price - sig.price) / openEntry.price;

            trades.push({
                id:         `trade_${idx++}`,
                type:       openEntry.kind as 'long' | 'short',
                entryPrice: openEntry.price,
                exitPrice:  sig.price,
                entryTime:  openEntry.time,
                exitTime:   sig.time,
                pnl:        rawPnl,
                status:     'closed',
            });
            openEntry = null;
        }
    }

    // Open trade still running at end of dataset
    if (openEntry !== null) {
        trades.push({
            id:         `trade_${idx}`,
            type:       openEntry.kind as 'long' | 'short',
            entryPrice: openEntry.price,
            entryTime:  openEntry.time,
            status:     'active',
        });
    }

    return trades;
}

// ─── 6. Equity curve + stats ─────────────────────────────────────────────────

function _buildResult(
    trades:         BacktestTrade[],
    strategyConfig: StrategyConfig,
    days:           DayCandle[],
): BacktestResult {
    const { initialEquity, riskPerTrade, leverage } = strategyConfig;
    const closed = trades.filter(t => t.status === 'closed' && t.pnl !== undefined);

    const startTime = (days[0]?.time ?? 0) as Time;

    if (closed.length === 0) {
        return {
            trades,
            equityCurve: [{ time: startTime, value: initialEquity }],
            stats: _emptyStats(),
        };
    }

    let equity      = initialEquity;
    let peakEquity  = equity;
    let maxDdPct    = 0;
    const wins:   number[] = [];
    const losses: number[] = [];
    const tradeReturns: number[] = [];

    const equityCurve: { time: Time; value: number }[] = [
        { time: startTime, value: equity },
    ];

    for (const t of closed) {
        const betSize  = equity * (riskPerTrade / 100) * leverage;
        const pnlAmt   = betSize * t.pnl!;
        equity        += pnlAmt;
        equity         = Math.max(equity, 0.01);

        equityCurve.push({ time: t.exitTime! as Time, value: Math.round(equity * 100) / 100 });

        if (equity > peakEquity) peakEquity = equity;
        const dd = (peakEquity - equity) / peakEquity * 100;
        if (dd > maxDdPct) maxDdPct = dd;

        if (pnlAmt >= 0) wins.push(pnlAmt);
        else             losses.push(Math.abs(pnlAmt));

        tradeReturns.push(t.pnl! * (riskPerTrade / 100) * leverage);
    }

    const grossProfit  = wins.reduce((s, v) => s + v, 0);
    const grossLoss    = losses.reduce((s, v) => s + v, 0);
    const totalReturn  = (equity - initialEquity) / initialEquity * 100;
    const winRate      = closed.filter(t => (t.pnl ?? 0) > 0).length / closed.length;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    // Approximate Sharpe from trade returns, annualised assuming ~252 trades/year
    const meanR  = tradeReturns.reduce((s, v) => s + v, 0) / tradeReturns.length;
    const stdR   = Math.sqrt(
        tradeReturns.map(r => (r - meanR) ** 2).reduce((s, v) => s + v, 0) / tradeReturns.length,
    );
    const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;

    return {
        trades,
        equityCurve,
        stats: {
            total_return:  +totalReturn.toFixed(2),
            win_rate:      +winRate.toFixed(3),
            total_trades:  closed.length,
            max_drawdown:  +maxDdPct.toFixed(2),
            sharpe_ratio:  +sharpe.toFixed(2),
            profit_factor: +profitFactor.toFixed(2),
        },
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _emptyStats(): BacktestStats {
    return { total_return: 0, win_rate: 0, total_trades: 0, max_drawdown: 0, sharpe_ratio: 0, profit_factor: 0 };
}

function _empty(): BacktestResult {
    return { trades: [], equityCurve: [], stats: _emptyStats() };
}
