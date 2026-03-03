import { Observable } from '../Observable';
import { SignalFilter } from '../filters/SignalFilter';
import type { Signal, ActiveTrade } from '../models/Signal';
import type { DayCandle } from '../models/Candle';
import type { MarketDataStore } from '../store/MarketDataStore';
import type { LayoutManager } from './LayoutManager';
import type { EarlyPivotManager } from './EarlyPivotManager';
import type { TrendlineManager } from './TrendlineManager';
import type { SignalConfig } from '../store/types';

const DEFAULT_SIGNAL_CONFIG: SignalConfig = {
    enabled:              true,
    usePivotConfirmation: true,
    useBreakoutDetection: true,
};

/**
 * Manages signal detection and state.
 *
 * Entry signals are always recomputed from scratch (they are deterministic:
 * pivot-confirmation signals come from stable confirmedEarlyPivots, and
 * breakout signals come from TrendlineManager.brokenTrendlines).
 *
 * Exit signals (zone-exit, SL, TP) are ACCUMULATED: once detected they are
 * persisted in `_persistedExits` and never removed simply because the source
 * trendline later disappeared.  They are only pruned when playback rewinds
 * past their timestamp or when a configuration change forces a full reset.
 *
 * `activeTrade` is derived from the combined signal stream (fresh entries +
 * persisted exits) via a simple open/close state machine, so it always
 * reflects the correct open position independent of trendline changes.
 */
export class SignalManager extends Observable {

    // ─── Public state ─────────────────────────────────────────────────────────
    signals:     Signal[]          = [];
    activeTrade: ActiveTrade | null = null;
    config:      SignalConfig      = { ...DEFAULT_SIGNAL_CONFIG };

    // ─── Private ──────────────────────────────────────────────────────────────
    private market:        MarketDataStore;
    private layout:        LayoutManager;
    private earlyPivotMgr: EarlyPivotManager;
    private trendlineMgr:  TrendlineManager;
    private filter:        SignalFilter = new SignalFilter();

    /** Exit signals that have been confirmed and must survive trendline changes. */
    private _persistedExits:   Signal[]    = [];
    private _persistedExitIds: Set<string> = new Set();

    /**
     * The largest "effective now" timestamp seen in a previous recompute.
     * Used to detect playback rewinds so stale exits can be pruned.
     */
    private _lastScanTime: number = -Infinity;

    /**
     * Hash of exit-relevant config options + dataset identity.
     * When it changes, persisted exits are cleared and the scan restarts.
     */
    private _configHash: string = '';

    private _unsubMarket: (() => void) | null = null;
    private _unsubLayout: (() => void) | null = null;

    constructor(
        market:        MarketDataStore,
        layout:        LayoutManager,
        earlyPivotMgr: EarlyPivotManager,
        trendlineMgr:  TrendlineManager,
    ) {
        super();
        this.market        = market;
        this.layout        = layout;
        this.earlyPivotMgr = earlyPivotMgr;
        this.trendlineMgr  = trendlineMgr;

        this._unsubMarket = market.subscribe(() => this._recompute());
        this._unsubLayout = layout.subscribe(() => this._recompute());
    }

    // ─── Public mutators ──────────────────────────────────────────────────────

    setConfig(patch: Partial<SignalConfig>): void {
        this.config = { ...this.config, ...patch };
        this._recompute();
    }

    dispose(): void {
        this._unsubMarket?.();
        this._unsubLayout?.();
    }

    // ─── Recompute ────────────────────────────────────────────────────────────

    _recompute(): void {
        const tac          = this.layout.tradeAxisConfig;
        const strat        = this.layout.strategyConfig;
        const days         = this._buildVisibleDays();
        const playbackTime = this.layout.playbackTime;

        // "effective now" = playback cursor, or the last minute in the dataset
        const effectiveNow = playbackTime !== null
            ? playbackTime
            : this._lastMinuteTime(days);

        if (!this.config.enabled || days.length === 0) {
            if (this.signals.length > 0 || this.activeTrade !== null) {
                this.signals          = [];
                this.activeTrade      = null;
                this._persistedExits  = [];
                this._persistedExitIds = new Set();
                this._lastScanTime    = -Infinity;
                this.notify();
            }
            return;
        }

        // ── Config / dataset change → full reset ──────────────────────────────
        const newHash = this._makeConfigHash(tac, strat);
        if (newHash !== this._configHash) {
            this._configHash      = newHash;
            this._persistedExits  = [];
            this._persistedExitIds = new Set();
            this._lastScanTime    = -Infinity;
        }

        // ── Playback rewind → prune exits that are now in the future ──────────
        if (effectiveNow < this._lastScanTime) {
            this._persistedExits   = this._persistedExits.filter(s => s.time <= effectiveNow);
            this._persistedExitIds = new Set(this._persistedExits.map(s => s.id));
        }
        this._lastScanTime = effectiveNow;

        // ── Build brokenTrendlines map for the filter ─────────────────────────
        const brokenMap = new Map<string, {
            type: 'resistance' | 'support';
            slope: number;
            intercept: number;
        }>();
        for (const [id, tl] of this.trendlineMgr.brokenTrendlines.entries()) {
            brokenMap.set(id, { type: tl.type, slope: tl.slope, intercept: tl.intercept });
        }

        // ── Filter early pivots to actual range (exclude pre-history) ─────────
        const preHistoryCount   = this.market.preHistoryCount ?? 0;
        const actualRangePivots = this.earlyPivotMgr.confirmedEarlyPivots
            .filter(p => p.dayIndex >= preHistoryCount);

        // ── Run SignalFilter (stateless) ──────────────────────────────────────
        const { signals: freshSignals } = this.filter.compute(
            actualRangePivots,
            this.trendlineMgr.trendlines,
            brokenMap,
            days,
            this.config,
            {
                useZoneExit:   tac.useZoneExit,
                useStopLoss:   tac.useStopLoss,
                useTakeProfit: tac.useTakeProfit,
                stopLossPct:   strat.stopLoss,
                takeProfitPct: strat.takeProfit,
                touchZonePct:  this.trendlineMgr.config.touchZonePct,
            },
            playbackTime,
        );

        // ── Separate fresh entries from fresh exits ────────────────────────────
        const freshEntries = freshSignals.filter(s => s.kind === 'long' || s.kind === 'short');
        const freshExits   = freshSignals.filter(s => s.kind === 'win'  || s.kind === 'loss');

        // ── Accumulate exits: add newly detected ones, keep all previous ones ──
        // Exit signals are NEVER removed due to trendline changes.  They are
        // only pruned by the rewind guard above.
        for (const exit of freshExits) {
            if (!this._persistedExitIds.has(exit.id)) {
                this._persistedExits.push(exit);
                this._persistedExitIds.add(exit.id);
            }
        }

        // ── Build the final combined signal list ──────────────────────────────
        const allSignals = [...freshEntries, ...this._persistedExits]
            .sort((a, b) => a.time - b.time);

        // ── Derive activeTrade from the full signal stream (state machine) ────
        // Walk every signal chronologically.  Entry with no open trade → open.
        // Exit with open trade → close.  The final open trade (if any) is the
        // currently active position whose SL/TP lines we should display.
        const activeTrade = this._deriveActiveTrade(allSignals, tac, strat);

        const changed =
            allSignals.length !== this.signals.length     ||
            activeTrade?.kind       !== this.activeTrade?.kind       ||
            activeTrade?.entryPrice !== this.activeTrade?.entryPrice ||
            activeTrade?.slPrice    !== this.activeTrade?.slPrice    ||
            activeTrade?.tpPrice    !== this.activeTrade?.tpPrice;

        this.signals     = allSignals;
        this.activeTrade = activeTrade;
        if (changed) this.notify();
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    /**
     * Walk signals in chronological order and track the open/close state of
     * one trade at a time.  Returns the last trade that was opened but never
     * closed, or null if all trades have been exited.
     */
    private _deriveActiveTrade(
        signals: Signal[],
        tac:     typeof this.layout.tradeAxisConfig,
        strat:   typeof this.layout.strategyConfig,
    ): ActiveTrade | null {
        let trade: ActiveTrade | null = null;

        for (const sig of signals) {
            if ((sig.kind === 'long' || sig.kind === 'short') && trade === null) {
                const isLong = sig.kind === 'long';
                trade = {
                    kind:       sig.kind,
                    entryPrice: sig.price,
                    slPrice: tac.useStopLoss
                        ? (isLong
                            ? sig.price * (1 - strat.stopLoss / 100)
                            : sig.price * (1 + strat.stopLoss / 100))
                        : null,
                    tpPrice: tac.useTakeProfit
                        ? (isLong
                            ? sig.price * (1 + strat.takeProfit / 100)
                            : sig.price * (1 - strat.takeProfit / 100))
                        : null,
                    entryTime:   sig.time,
                    entryDayIdx: sig.dayIndex,
                };
            } else if ((sig.kind === 'win' || sig.kind === 'loss') && trade !== null) {
                trade = null;
            }
        }

        return trade;
    }

    /**
     * A hash of all config values that affect exit-signal generation plus a
     * dataset identity fingerprint.  When it changes, persisted exits must
     * be cleared and the scan restarted from scratch.
     *
     * IMPORTANT: dataset identity uses this.market.days (the FULL raw array),
     * NOT the visibleDays slice — visibleDays grows on every playback step and
     * must never be used here or exits would reset on every minute advance.
     */
    private _makeConfigHash(
        tac:  typeof this.layout.tradeAxisConfig,
        strat: typeof this.layout.strategyConfig,
    ): string {
        const raw = this.market.days;
        return [
            this.config.enabled,
            this.config.usePivotConfirmation,
            this.config.useBreakoutDetection,
            tac.useZoneExit,
            tac.useStopLoss,
            tac.useTakeProfit,
            strat.stopLoss,
            strat.takeProfit,
            this.trendlineMgr.config.touchZonePct,
            // Dataset identity: anchored to full raw dataset (stable across playback)
            raw.length > 0 ? raw[0].time : 0,
            raw.length > 0 ? raw[raw.length - 1].time : 0,
            raw.length,
        ].join('|');
    }

    /** Latest minute timestamp visible in the dataset (used when not in playback). */
    private _lastMinuteTime(days: DayCandle[]): number {
        if (days.length === 0) return 0;
        const last = days[days.length - 1];
        if (last.minutes.length > 0) return last.minutes[last.minutes.length - 1].time;
        return last.time;
    }

    // ─── visibleDays builder (mirrors TrendlineManager._buildVisibleDays) ─────

    private _buildVisibleDays(): DayCandle[] {
        const allDays = this.market.days;
        if (allDays.length === 0) return [];

        const pt = this.layout.playbackTime;
        if (pt === null) return allDays;

        let activeDayIdx = -1;
        for (let i = 0; i < allDays.length; i++) {
            if (allDays[i].time <= pt) activeDayIdx = i;
            else break;
        }
        if (activeDayIdx < 0) return [];

        const activeDay = allDays[activeDayIdx];
        const seenMins  = activeDay.minutes.filter(m => m.time <= pt);
        let liveDay     = activeDay;
        if (seenMins.length > 0) {
            liveDay = {
                ...activeDay,
                open:   seenMins[0].open,
                high:   Math.max(...seenMins.map(m => m.high)),
                low:    Math.min(...seenMins.map(m => m.low)),
                close:  seenMins[seenMins.length - 1].close,
                volume: seenMins.reduce((s, m) => s + m.volume, 0),
            };
        }

        return [...allDays.slice(0, activeDayIdx), liveDay];
    }
}
