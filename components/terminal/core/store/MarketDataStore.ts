import { Observable } from '../Observable';
import type { DayCandle } from '../models/Candle';

/**
 * Central store for fully-preloaded price data.
 * `days` holds every daily bar for the current window, each with its
 * 1-minute bars already embedded under `minutes`.
 *
 * The first `preHistoryCount` days are pre-history bars (minutes: []).
 * Actual-range data starts at index `preHistoryCount`.
 */
export class MarketDataStore extends Observable {
    days:            DayCandle[] = [];
    preHistoryCount: number      = 0;

    setDays(data: DayCandle[], preHistoryCount = 0): void {
        this.days            = data;
        this.preHistoryCount = preHistoryCount;
        this.notify();
    }

    clear(): void {
        this.days            = [];
        this.preHistoryCount = 0;
        this.notify();
    }

    get isEmpty(): boolean { return this.days.length === 0; }

    /** Unix-seconds timestamp of the first actual-range day. Null when no pre-history. */
    get boundaryTime(): number | null {
        if (this.preHistoryCount <= 0 || this.days.length <= this.preHistoryCount) return null;
        return this.days[this.preHistoryCount].time;
    }

    /** Return the index of the day whose UTC-midnight timestamp equals `dayTime`. */
    dayIndexByTime(dayTime: number): number {
        return this.days.findIndex(d => d.time === dayTime);
    }
}
