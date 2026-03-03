import { Observable } from '../Observable';
import {
    TerminalConfig,
    IndicatorConfig,
    TradeAxisConfig,
    StrategyConfig,
    SelectedItem,
    SelectedItemType,
} from '../store/types';
import { DEFAULT_TRENDLINE_CONFIG } from '../models/Trendline';
import type { TrendlineConfig } from '../models/Trendline';
import { DEFAULT_EARLY_PIVOT_CONFIG } from '../models/EarlyPivot';
import type { EarlyPivotConfig } from '../models/EarlyPivot';

/**
 * Manages all UI layout state, configuration, and persistence.
 * Single source of truth for sidebar visibility, playback state,
 * indicator toggles, and all config objects.
 */
export class LayoutManager extends Observable {
    // ─── Sidebar / bar visibility ───────────────────────────
    leftSidebarOpen = true;
    rightSidebarOpen = true;
    topBarOpen = false;
    bottomBarOpen = true;

    // ─── Sidebar / bar sizes (fraction 0–1) ─────────────────
    leftSidebarWidth = 0.2;
    rightSidebarWidth = 0.2;
    topBarHeight = 0.15;
    bottomBarHeight = 0.25;
    indicatorAreaRatio = 0.3;

    // ─── Viewport ───────────────────────────────────────────
    hoveredTime: number | null = null;
    visibleTimeRange: { from: number; to: number } | null = null;
    dataTimeRange: { from: number; to: number; boundaryTime?: number } | null = null;

    // ─── Timeline playback ──────────────────────────────────
    // Always enabled — timeline and 1m resolution are not user-configurable
    readonly timelineEnabled = true;
    readonly minuteResolutionEnabled = true;
    playbackTime: number | null = null;
    playbackSpeed = 1;
    isPlaying = false;

    // ─── Playback minute cursor ──────────────────────────────
    // playbackTime is always a 1m bar timestamp (or null = free-scroll)
    minuteIndex = 0;   // index within the active day's minutes array

    // ─── Indicator toggles ──────────────────────────────────
    enabledIndicators: Record<string, boolean> = {};

    // ─── Pivot state (persisted here so PivotManager can restore on load) ───
    pivotsEnabled:   boolean = false;
    pivotWindowSize: number  = 5;

    // ─── Trendline state (persisted here so TrendlineManager can restore) ───
    trendlinesEnabled: boolean        = false;
    trendlineConfig:   TrendlineConfig = { ...DEFAULT_TRENDLINE_CONFIG };

    // ─── Early pivot state (persisted here so EarlyPivotManager can restore) ─
    earlyPivotConfig: EarlyPivotConfig = { ...DEFAULT_EARLY_PIVOT_CONFIG };

    // ─── Configuration objects ───────────────────────────────
    config: TerminalConfig;
    indicatorConfig: IndicatorConfig;
    tradeAxisConfig: TradeAxisConfig;
    strategyConfig: StrategyConfig;

    // ─── Selection state ────────────────────────────────────
    selectedItem: SelectedItem = { type: null, key: null };
    activeAsset: unknown = null;
    previewConfig: TerminalConfig | null = null;
    // Stable default — overwritten from localStorage on client, or freshly randomised
    // if no saved seed exists. Never call Math.random() at class-field level: it runs
    // on the server during SSR and produces a different value than the client, causing
    // a React hydration mismatch.
    randomSeed: number = 0.5;

    constructor(
        config: TerminalConfig,
        indicatorConfig: IndicatorConfig,
        tradeAxisConfig: TradeAxisConfig,
        strategyConfig: StrategyConfig,
    ) {
        super();
        this.config = config;
        this.indicatorConfig = indicatorConfig;
        this.tradeAxisConfig = tradeAxisConfig;
        this.strategyConfig = strategyConfig;

        if (typeof window !== 'undefined') {
            this.loadState(true);
        }
    }

    // ─── Persistence ────────────────────────────────────────

    private get storageKey(): string {
        return `terminal_state_${this.config.symbol}`;
    }

    private loadState(initialLoad = false): void {
        try {
            if (initialLoad) {
                const globalState = localStorage.getItem('terminal_last_active');
                if (globalState) {
                    const parsed = JSON.parse(globalState);
                    if (parsed.symbol) this.config.symbol = parsed.symbol;
                }

                const uiState = localStorage.getItem('terminal_ui_layout');
                if (uiState) {
                    const p = JSON.parse(uiState);
                    if (p.leftSidebarOpen !== undefined) this.leftSidebarOpen = p.leftSidebarOpen;
                    if (p.rightSidebarOpen !== undefined) this.rightSidebarOpen = p.rightSidebarOpen;
                    if (p.topBarOpen !== undefined) this.topBarOpen = p.topBarOpen;
                    if (p.bottomBarOpen !== undefined) this.bottomBarOpen = p.bottomBarOpen;
                    if (p.leftSidebarWidth !== undefined) this.leftSidebarWidth = p.leftSidebarWidth;
                    if (p.rightSidebarWidth !== undefined) this.rightSidebarWidth = p.rightSidebarWidth;
                    if (p.topBarHeight !== undefined) this.topBarHeight = p.topBarHeight;
                    if (p.bottomBarHeight !== undefined) this.bottomBarHeight = p.bottomBarHeight;
                    if (p.indicatorAreaRatio !== undefined) this.indicatorAreaRatio = p.indicatorAreaRatio;
                }
            }

            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const p = JSON.parse(saved);
                if (p.config) this.config = { ...this.config, ...p.config };
                if (p.indicatorConfig) this.indicatorConfig = { ...this.indicatorConfig, ...p.indicatorConfig };
                if (p.tradeAxisConfig) this.tradeAxisConfig = { ...this.tradeAxisConfig, ...p.tradeAxisConfig };
                if (p.strategyConfig) this.strategyConfig = { ...this.strategyConfig, ...p.strategyConfig };
                if (p.enabledIndicators) this.enabledIndicators = p.enabledIndicators;
                if (p.playbackTime !== undefined) this.playbackTime = p.playbackTime;
                if (p.randomSeed !== undefined) this.randomSeed = p.randomSeed;
                else this.randomSeed = Math.random();   // first visit for this symbol
                // Pivot persistence
                if (p.pivotsEnabled   !== undefined) this.pivotsEnabled   = p.pivotsEnabled;
                if (p.pivotWindowSize !== undefined) this.pivotWindowSize = p.pivotWindowSize;
                // Trendline persistence
                if (p.trendlinesEnabled !== undefined) this.trendlinesEnabled = p.trendlinesEnabled;
                if (p.trendlineConfig)                 this.trendlineConfig   = { ...DEFAULT_TRENDLINE_CONFIG, ...p.trendlineConfig };
                // Early pivot persistence
                if (p.earlyPivotConfig) this.earlyPivotConfig = { ...DEFAULT_EARLY_PIVOT_CONFIG, ...p.earlyPivotConfig };
            } else {
                this.randomSeed = Math.random();   // no saved state at all
            }
        } catch (e) {
            console.error('Failed to load state', e);
            this.randomSeed = Math.random();
        }
    }

    private saveState(): void {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify({
                config: this.config,
                indicatorConfig: this.indicatorConfig,
                tradeAxisConfig: this.tradeAxisConfig,
                strategyConfig: this.strategyConfig,
                enabledIndicators: this.enabledIndicators,
                playbackTime: this.playbackTime,
                randomSeed: this.randomSeed,
                // Pivot + trendline + early pivot persistence
                pivotsEnabled:    this.pivotsEnabled,
                pivotWindowSize:  this.pivotWindowSize,
                trendlinesEnabled: this.trendlinesEnabled,
                trendlineConfig:   this.trendlineConfig,
                earlyPivotConfig:  this.earlyPivotConfig,
            }));

            localStorage.setItem('terminal_ui_layout', JSON.stringify({
                leftSidebarOpen: this.leftSidebarOpen,
                rightSidebarOpen: this.rightSidebarOpen,
                topBarOpen: this.topBarOpen,
                bottomBarOpen: this.bottomBarOpen,
                leftSidebarWidth: this.leftSidebarWidth,
                rightSidebarWidth: this.rightSidebarWidth,
                topBarHeight: this.topBarHeight,
                bottomBarHeight: this.bottomBarHeight,
                indicatorAreaRatio: this.indicatorAreaRatio,
            }));

            localStorage.setItem('terminal_last_active', JSON.stringify({
                symbol: this.config.symbol,
            }));
        } catch (e) {
            console.error('Failed to save state', e);
        }
    }

    // ─── Public mutators (each calls notify → saveState) ────

    private emit(): void {
        if (typeof window !== 'undefined') this.saveState();
        this.notify();
    }

    regenerateRandomSeed(): void { this.randomSeed = Math.random(); this.emit(); }

    toggleIndicator(key: string): void { this.enabledIndicators[key] = !this.enabledIndicators[key]; this.emit(); }

    // Sidebar / bar toggles
    toggleLeftSidebar(): void { this.leftSidebarOpen = !this.leftSidebarOpen; this.emit(); }
    toggleRightSidebar(): void { this.rightSidebarOpen = !this.rightSidebarOpen; this.emit(); }
    toggleTopBar(): void { this.topBarOpen = !this.topBarOpen; this.emit(); }
    toggleBottomBar(): void { this.bottomBarOpen = !this.bottomBarOpen; this.emit(); }

    // Sizes (clamped)
    setLeftSidebarWidth(w: number): void { this.leftSidebarWidth = clamp(w, 0.1, 0.5); this.emit(); }
    setRightSidebarWidth(w: number): void { this.rightSidebarWidth = clamp(w, 0.1, 0.5); this.emit(); }
    setTopBarHeight(h: number): void { this.topBarHeight = clamp(h, 0.05, 0.4); this.emit(); }
    setBottomBarHeight(h: number): void { this.bottomBarHeight = clamp(h, 0.05, 0.4); this.emit(); }
    setIndicatorAreaRatio(r: number): void { this.indicatorAreaRatio = clamp(r, 0.1, 0.8); this.emit(); }

    // Viewport
    setVisibleTimeRange(range: { from: number; to: number } | null): void { this.visibleTimeRange = range; this.emit(); }
    setHoveredTime(t: number | null): void { this.hoveredTime = t; this.notify(); /* no save for hover */ }

    // Config setters
    setConfig(c: Partial<TerminalConfig>): void {
        const symbolChanged = c.symbol !== undefined && c.symbol !== this.config.symbol;
        this.config = { ...this.config, ...c };
        if (typeof window !== 'undefined' && symbolChanged) this.loadState();
        this.emit();
    }
    setPreviewConfig(c: Partial<TerminalConfig> | null): void { this.previewConfig = c ? { ...this.config, ...c } : null; this.emit(); }
    setIndicatorConfig(c: Partial<IndicatorConfig>): void { this.indicatorConfig = { ...this.indicatorConfig, ...c }; this.emit(); }
    setTradeAxisConfig(c: Partial<TradeAxisConfig>): void { this.tradeAxisConfig = { ...this.tradeAxisConfig, ...c }; this.emit(); }
    setStrategyConfig(c: Partial<StrategyConfig>): void { this.strategyConfig = { ...this.strategyConfig, ...c }; this.emit(); }

    // Selection
    setSelectedItem(type: SelectedItemType, key: string | null): void { this.selectedItem = { type, key }; this.emit(); }
    setActiveAsset(a: unknown): void { this.activeAsset = a; this.emit(); }

    // ─── Pivot / Trendline persistence helpers ────────────────────────────────
    // Called by PivotManager / TrendlineManager so changes are saved to localStorage.
    // These do NOT trigger a full notify (managers handle their own notify cycle).
    savePivotsState(enabled: boolean, windowSize: number): void {
        this.pivotsEnabled   = enabled;
        this.pivotWindowSize = windowSize;
        if (typeof window !== 'undefined') this.saveState();
    }

    saveTrendlinesState(enabled: boolean, config: TrendlineConfig): void {
        this.trendlinesEnabled = enabled;
        this.trendlineConfig   = config;
        if (typeof window !== 'undefined') this.saveState();
    }

    saveEarlyPivotState(config: EarlyPivotConfig): void {
        this.earlyPivotConfig = config;
        if (typeof window !== 'undefined') this.saveState();
    }

    // Timeline (always enabled — no toggle)
    playTimeline(): void { this.isPlaying = true; this.emit(); }
    pauseTimeline(): void { this.isPlaying = false; this.emit(); }
    stopTimeline(): void {
        this.isPlaying   = false;
        // Reset to boundary (start of actual range) if pre-history is active,
        // otherwise fall back to null (free-scroll).
        this.playbackTime = this.dataTimeRange?.boundaryTime ?? null;
        this.emit();
    }
    setPlaybackTime(t: number | null): void { this.playbackTime = t; this.emit(); }
    setPlaybackSpeed(s: number): void { this.playbackSpeed = s; this.emit(); }
}

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}
