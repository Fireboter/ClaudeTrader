import { LayoutManager } from '../managers/LayoutManager';
import { FilterManager } from '../managers/FilterManager';
import { BacktestManager } from '../managers/BacktestManager';
import { PlaybackManager } from '../managers/PlaybackManager';
import { PivotManager } from '../managers/PivotManager';
import { TrendlineManager } from '../managers/TrendlineManager';
import { EarlyPivotManager } from '../managers/EarlyPivotManager';
import { SignalManager } from '../managers/SignalManager';
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
    signalManager:     SignalManager;

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

        this.signalManager = new SignalManager(
            this.marketData, this.layout, this.earlyPivotManager, this.trendlineManager,
        );

        // Store-level bridges: plain callbacks, NOT Observable subscriptions on
        // earlyPivotManager/signalManager, so there is no circular notify chain.

        // When trendlines update: (1) trigger early pivot recompute, (2) trigger signal recompute.
        // SignalManager reads brokenTrendlines from TrendlineManager which are set before notify().
        this.trendlineManager.subscribe(() => {
            this.earlyPivotManager._recompute();
            this.signalManager._recompute();
        });

        // When early pivots update (new confirmed pivots): trigger signal recompute.
        this.earlyPivotManager.subscribe(() => {
            this.signalManager._recompute();
        });
    }
}

// Singleton
export const terminalStore = new TerminalStore();
