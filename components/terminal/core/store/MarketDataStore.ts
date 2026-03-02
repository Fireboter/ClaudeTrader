import { Observable } from '../Observable';
import type { DayCandle } from '../models/Candle';

/**
 * Central store for fully-preloaded price data.
 * `days` holds every daily bar for the current window, each with its
 * 1-minute bars already embedded under `minutes`.
 */
export class MarketDataStore extends Observable {
    days: DayCandle[] = [];

    setDays(data: DayCandle[]): void {
        this.days = data;
        this.notify();
    }

    clear(): void {
        this.days = [];
        this.notify();
    }

    get isEmpty(): boolean { return this.days.length === 0; }

    /** Return the index of the day whose UTC-midnight timestamp equals `dayTime`. */
    dayIndexByTime(dayTime: number): number {
        return this.days.findIndex(d => d.time === dayTime);
    }
}
