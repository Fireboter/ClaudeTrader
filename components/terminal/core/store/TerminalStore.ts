import { LayoutManager } from '../managers/LayoutManager';
import { FilterManager } from '../managers/FilterManager';
import { BacktestManager } from '../managers/BacktestManager';
import { PlaybackManager } from '../managers/PlaybackManager';
import { PivotManager } from '../managers/PivotManager';
import { TrendlineManager } from '../managers/TrendlineManager';
import { EarlyPivotManager } from '../managers/EarlyPivotManager';
import { MarketDataStore } from './MarketDataStore';
import {
    DEFAULT_CONFIG,
    DEFAULT_INDICATOR_CONFIG,
    DEFAULT_TRADEAXIS_CONFIG,
    DEFAULT_STRATEGY_CONFIG,
} from './defaults';

/**
 * Root store that composes all managers.
 * Instantiated once as a singleton for the terminal page.
 */
export class TerminalStore {
    marketData:        MarketDataStore;
    layout:            LayoutManager;
    filterManager:     FilterManager;
    backtestManager:   BacktestManager;
    playbackManager:   PlaybackManager;
    pivotManager:      PivotManager;
    trendlineManager:  TrendlineManager;
    earlyPivotManager: EarlyPivotManager;

    constructor() {
        this.marketData = new MarketDataStore();
        this.layout = new LayoutManager(
            DEFAULT_CONFIG,
            DEFAULT_INDICATOR_CONFIG,
            DEFAULT_TRADEAXIS_CONFIG,
            DEFAULT_STRATEGY_CONFIG,
        );
        this.filterManager    = new FilterManager(this.marketData, this.layout);
        this.backtestManager  = new BacktestManager();
        this.playbackManager  = new PlaybackManager(this.marketData, this.layout);
        this.pivotManager     = new PivotManager(this.marketData, this.layout);
        this.trendlineManager = new TrendlineManager(this.marketData, this.layout, this.pivotManager);

        // EarlyPivotManager reads trendlineManager synchronously (no subscription)
        this.earlyPivotManager = new EarlyPivotManager(
            this.marketData, this.layout, this.trendlineManager,
        );

        // Inject back-references (no circular subscriptions at construction time)
        this.pivotManager.setEarlyPivotManager(this.earlyPivotManager);
        this.trendlineManager.setEarlyPivotManager(this.earlyPivotManager);

        // Store-level bridge: when trendlines update, trigger early pivot recompute.
        // This is a plain callback, NOT an Observable subscription on earlyPivotManager,
        // so it does not cause a circular notify chain.
        this.trendlineManager.subscribe(() => {
            this.earlyPivotManager._recompute();
        });
    }
}

// Singleton
export const terminalStore = new TerminalStore();
