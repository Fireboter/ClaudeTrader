import { Observable } from '../Observable';
import { Pivot } from '../models/Pivot';
import { Trendline } from '../models/Trendline';
import type { MarketDataStore } from '../store/MarketDataStore';
import type { LayoutManager } from './LayoutManager';

/**
 * Manages pivot and trendline data.
 * Placeholder for filter logic — actual trendline/pivot detection
 * algorithms will be added as separate filter modules later.
 */
export class FilterManager extends Observable {
    private marketData: MarketDataStore;
    private layout: LayoutManager;

    pivots: Pivot[] = [];
    trendlines: Trendline[] = [];
    tradeAxisData: unknown[] = [];
    tradeAxisPivots: unknown[] = [];

    constructor(marketData: MarketDataStore, layout: LayoutManager) {
        super();
        this.marketData = marketData;
        this.layout = layout;
    }

    setTradeAxisData(data: unknown[]): void {
        this.tradeAxisData = data;
        this.notify();
    }

    setTradeAxisPivots(pivots: unknown[]): void {
        this.tradeAxisPivots = pivots;
        this.notify();
    }

    calculatePivots(): void {
        // Will be implemented when pivot filter module is added
        this.notify();
    }

    calculateTrendlines(): void {
        // Will be implemented when trendline filter module is added
        this.notify();
    }

    getFilteredTrendlines(): Trendline[] {
        return this.trendlines;
    }
}
