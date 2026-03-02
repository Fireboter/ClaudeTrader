import { Observable } from '../Observable';
import { PivotFilter } from '../filters/PivotFilter';
import type { Pivot } from '../filters/PivotFilter';
import type { MarketDataStore } from '../store/MarketDataStore';
import type { LayoutManager } from './LayoutManager';
import type { EarlyPivotManager } from './EarlyPivotManager';

export class PivotManager extends Observable {

    // ─── Public state ─────────────────────────────────────────────────────────
    pivots:  Pivot[] = [];

    // Window system config
    enabled:    boolean = false;
    windowSize: number  = 5;

    // ─── Private ──────────────────────────────────────────────────────────────
    private market:             MarketDataStore;
    private layout:             LayoutManager;
    private winFilter:          PivotFilter;
    private earlyPivotManager:  EarlyPivotManager | null = null;

    private _unsubMarket: (() => void) | null = null;
    private _unsubLayout: (() => void) | null = null;
    private _unsubEarly:  (() => void) | null = null;

    constructor(market: MarketDataStore, layout: LayoutManager) {
        super();
        this.market    = market;
        this.layout    = layout;

        // Restore persisted state from LayoutManager
        this.enabled    = layout.pivotsEnabled;
        this.windowSize = layout.pivotWindowSize;
        this.winFilter  = new PivotFilter(this.windowSize);

        this._unsubMarket = market.subscribe(() => this._recompute());
        this._unsubLayout = layout.subscribe(() => this._recompute());
    }

    // ─── Public mutators ──────────────────────────────────────────────────────

    setEnabled(on: boolean): void {
        this.enabled = on;
        this.layout.savePivotsState(this.enabled, this.windowSize);
        this._recompute();
    }

    setWindowSize(w: number): void {
        this.windowSize = Math.max(1, w);
        this.winFilter  = new PivotFilter(this.windowSize);
        this.layout.savePivotsState(this.enabled, this.windowSize);
        this._recompute();
    }

    /**
     * Inject the EarlyPivotManager after construction (avoids circular deps at
     * construction time). PivotManager subscribes to EarlyPivotManager so that
     * confirmed early pivots are included in `this.pivots` for chart display.
     */
    setEarlyPivotManager(epm: EarlyPivotManager): void {
        this.earlyPivotManager = epm;
        this._unsubEarly = epm.subscribe(() => this._recompute());
    }

    dispose(): void {
        this._unsubMarket?.();
        this._unsubLayout?.();
        this._unsubEarly?.();
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private _recompute(): void {
        const pt   = this.layout.playbackTime;
        const days = pt === null
            ? this.market.days
            : this.market.days.filter(d => d.time <= pt);

        // Window-size pivots (only when enabled)
        const windowPivots: Pivot[] = this.enabled && days.length > 0
            ? this.winFilter.compute(days)
            : [];

        // Confirmed early pivots are now fully rendered by EarlyPivotOverlay
        // (sections C and D), so they are NOT added here to avoid double-rendering.
        const next = [...windowPivots];

        // Only notify if the pivot list actually changed (count or content)
        if (
            next.length !== this.pivots.length ||
            next.some((p, i) => p.time !== this.pivots[i]?.time || p.type !== this.pivots[i]?.type)
        ) {
            this.pivots = next;
            this.notify();
        }
    }
}
