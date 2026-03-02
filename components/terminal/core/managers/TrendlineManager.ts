import { Observable } from '../Observable';
import { TrendlineFilter } from '../filters/TrendlineFilter';
import { DEFAULT_TRENDLINE_CONFIG } from '../models/Trendline';
import type { Trendline, TrendlineConfig } from '../models/Trendline';
import type { Pivot } from '../filters/PivotFilter';
import type { DayCandle } from '../models/Candle';
import type { MarketDataStore } from '../store/MarketDataStore';
import type { LayoutManager } from './LayoutManager';
import type { PivotManager } from './PivotManager';
import type { EarlyPivotManager } from './EarlyPivotManager';

/**
 * Subscribes to market data, layout (playback), and pivot changes.
 * Re-runs TrendlineFilter whenever any dependency changes.
 * Emits via Observable so React can subscribe once.
 */
export class TrendlineManager extends Observable {

    // ─── Public state ─────────────────────────────────────────────────────────
    trendlines: Trendline[] = [];
    enabled:    boolean     = false;
    config:     TrendlineConfig = { ...DEFAULT_TRENDLINE_CONFIG };

    // ─── Private ──────────────────────────────────────────────────────────────
    private market:            MarketDataStore;
    private layout:            LayoutManager;
    private pivotManager:      PivotManager;
    private earlyPivotManager: EarlyPivotManager | null = null;
    private filter:            TrendlineFilter = new TrendlineFilter();

    private _unsubMarket: (() => void) | null = null;
    private _unsubLayout: (() => void) | null = null;
    private _unsubPivots: (() => void) | null = null;

    constructor(market: MarketDataStore, layout: LayoutManager, pivotManager: PivotManager) {
        super();
        this.market       = market;
        this.layout       = layout;
        this.pivotManager = pivotManager;

        // Restore persisted state from LayoutManager
        this.enabled = layout.trendlinesEnabled;
        this.config  = { ...layout.trendlineConfig };

        this._unsubMarket = market.subscribe(() => this._recompute());
        this._unsubLayout = layout.subscribe(() => this._recompute());
        this._unsubPivots = pivotManager.subscribe(() => this._recompute());
    }

    // ─── Public mutators ──────────────────────────────────────────────────────

    /**
     * Inject the EarlyPivotManager reference after construction (no subscription
     * added here — the store bridge calls earlyPivotManager._recompute() after
     * TrendlineManager fires to avoid circular subscriptions).
     */
    setEarlyPivotManager(epm: EarlyPivotManager): void {
        this.earlyPivotManager = epm;
    }

    setEnabled(on: boolean): void {
        this.enabled = on;
        this.layout.saveTrendlinesState(this.enabled, this.config);
        this._recompute();
    }

    setConfig(patch: Partial<TrendlineConfig>): void {
        this.config = { ...this.config, ...patch };
        this.layout.saveTrendlinesState(this.enabled, this.config);
        this._recompute();
    }

    dispose(): void {
        this._unsubMarket?.();
        this._unsubLayout?.();
        this._unsubPivots?.();
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private _recompute(): void {
        if (!this.enabled) {
            if (this.trendlines.length > 0) {
                this.trendlines = [];
                this.notify();
            }
            return;
        }

        // Build the pivot pool according to user-selected source:
        //   'window' — only window-size swing pivots from PivotManager
        //   'early'  — only price-change recoil confirmed pivots from EarlyPivotManager
        //   'both'   — union of both (window pivots take precedence on same day+type)
        const src = this.config.pivotSource ?? 'both';

        const windowPivots:      Pivot[] = (src === 'window' || src === 'both')
            ? this.pivotManager.pivots
            : [];
        const allEarlyConfirmed: Pivot[] = (src === 'early' || src === 'both')
            ? (this.earlyPivotManager?.confirmedAsPivots ?? [])
            : [];

        // Deduplicate by dayIndex + type (window pivots take precedence)
        const seen = new Set(windowPivots.map(p => `${p.dayIndex}|${p.type}`));
        const extraPivots = allEarlyConfirmed.filter(p => !seen.has(`${p.dayIndex}|${p.type}`));
        const combinedPivots = [...windowPivots, ...extraPivots];

        if (combinedPivots.length < 2 || this.market.days.length === 0) {
            if (this.trendlines.length > 0) {
                this.trendlines = [];
                this.notify();
            }
            return;
        }

        // Build the same minute-accurate "visibleDays" array that MainChart uses
        // so that the raycast and breakout detection run on minute-resolution data.
        const days = this._buildVisibleDays();

        if (days.length === 0) {
            this.trendlines = [];
            this.notify();
            return;
        }

        const axisX = days.length - 1;

        this.trendlines = this.filter.compute(days, combinedPivots, axisX, this.config);
        this.notify();
    }

    /**
     * Mirrors the visibleDays logic from MainChart:
     *  - Returns all complete past days up to playbackTime
     *  - Synthesises the active day's candle from the minutes seen so far
     *
     * When playbackTime is null (no playback active) returns the full raw days.
     */
    private _buildVisibleDays(): DayCandle[] {
        const allDays = this.market.days;
        if (allDays.length === 0) return [];

        const pt = this.layout.playbackTime;
        if (pt === null) return allDays;

        // Find the active day: last day whose UTC-midnight ≤ playbackTime
        let activeDayIdx = -1;
        for (let i = 0; i < allDays.length; i++) {
            if (allDays[i].time <= pt) activeDayIdx = i;
            else break;
        }
        if (activeDayIdx < 0) return [];

        const activeDay = allDays[activeDayIdx];

        // Synthesise live daily candle from minutes seen so far
        let liveDay: DayCandle = activeDay;
        const seenMins = activeDay.minutes.filter(m => m.time <= pt);
        if (seenMins.length > 0) {
            liveDay = {
                ...activeDay,
                open:    seenMins[0].open,
                high:    Math.max(...seenMins.map(m => m.high)),
                low:     Math.min(...seenMins.map(m => m.low)),
                close:   seenMins[seenMins.length - 1].close,
                volume:  seenMins.reduce((s, m) => s + m.volume, 0),
            };
        }

        return [...allDays.slice(0, activeDayIdx), liveDay];
    }
}
