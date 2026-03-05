import { Observable } from '../Observable';
import type { LayoutManager } from './LayoutManager';
import type { MarketDataStore } from '../store/MarketDataStore';

/**
 * Manages minute-resolution playback navigation.
 *
 * playbackTime is ALWAYS a 1-minute bar open timestamp (or null = free-scroll).
 * There is no separate "daily mode" — the chart always shows daily bars but
 * synthesises the last bar live from minutes. The cursor simply lives at a
 * specific minute at all times.
 *
 * Key bindings (wired in MainChart):
 *   ↑ / ↓  — next / prev minute
 *   → / ←  — jump to first minute of next day / last minute of prev day
 */
export class PlaybackManager extends Observable {
    private layout: LayoutManager;
    private market: MarketDataStore;

    constructor(market: MarketDataStore, layout: LayoutManager) {
        super();
        this.market = market;
        this.layout = layout;
    }

    // ─── Minute navigation ────────────────────────────────────────────────────

    /** Advance one minute. If playbackTime is null, start at the first minute of the last day. */
    nextMinute(): void {
        const { dayIdx, minIdx } = this._cursor();
        const days = this.market.days;
        if (days.length === 0) return;

        if (dayIdx < 0) {
            // Not started — jump to first minute of last day
            this._setFirstMinuteOfDay(days.length - 1);
        } else if (minIdx < days[dayIdx].minutes.length - 1) {
            this._setMinute(dayIdx, minIdx + 1);
        } else if (dayIdx < days.length - 1) {
            // End of day — wrap to first minute of next day
            this._setFirstMinuteOfDay(dayIdx + 1);
        }
        // else: already at the very last minute — do nothing
        this._emit();
    }

    /** Go back one minute. If playbackTime is null, start at the last minute of the last day. */
    prevMinute(): void {
        const { dayIdx, minIdx } = this._cursor();
        const days = this.market.days;
        if (days.length === 0) return;

        if (dayIdx < 0) {
            this._setLastMinuteOfDay(days.length - 1);
        } else if (minIdx > 0) {
            this._setMinute(dayIdx, minIdx - 1);
        } else if (dayIdx > 0) {
            // Start of day — wrap to last minute of previous day
            this._setLastMinuteOfDay(dayIdx - 1);
        }
        // else: already at the very first minute — do nothing
        this._emit();
    }

    // ─── Day navigation ───────────────────────────────────────────────────────

    /** Jump to the first minute of the next day. */
    nextDay(): void {
        const { dayIdx } = this._cursor();
        const days = this.market.days;
        if (days.length === 0) return;

        const target = dayIdx < 0 ? days.length - 1 : Math.min(dayIdx + 1, days.length - 1);
        this._setLastMinuteOfDay(target);
        this._emit();
    }

    /** Jump to the last minute of the previous day. */
    prevDay(): void {
        const { dayIdx } = this._cursor();
        const days = this.market.days;
        if (days.length === 0) return;

        const target = dayIdx < 0 ? days.length - 1 : Math.max(dayIdx - 1, 0);
        this._setLastMinuteOfDay(target);
        this._emit();
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Resolve the current cursor position.
     * Returns the day index and minute index within that day, or -1 if no cursor.
     */
    private _cursor(): { dayIdx: number; minIdx: number } {
        const pt   = this.layout.playbackTime;
        const days = this.market.days;

        if (pt === null || days.length === 0) return { dayIdx: -1, minIdx: -1 };

        // Find the day that contains this minute timestamp
        for (let d = 0; d < days.length; d++) {
            const mins = days[d].minutes;
            if (mins.length === 0) continue;
            if (pt >= mins[0].time && pt <= mins[mins.length - 1].time) {
                // Binary-search for the exact minute index
                let lo = 0, hi = mins.length - 1, found = 0;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    if (mins[mid].time === pt) { found = mid; break; }
                    else if (mins[mid].time < pt) { found = mid; lo = mid + 1; }
                    else hi = mid - 1;
                }
                return { dayIdx: d, minIdx: found };
            }
        }

        // playbackTime doesn't match any minute — find the enclosing day by date
        for (let d = 0; d < days.length; d++) {
            if (days[d].time > pt) return { dayIdx: Math.max(d - 1, 0), minIdx: 0 };
        }
        return { dayIdx: days.length - 1, minIdx: 0 };
    }

    private _setMinute(dayIdx: number, minIdx: number): void {
        this.layout.minuteIndex  = minIdx;
        this.layout.playbackTime = this.market.days[dayIdx].minutes[minIdx].time;
    }

    private _setFirstMinuteOfDay(dayIdx: number): void {
        const day  = this.market.days[dayIdx];
        const mins = day.minutes;
        if (mins.length > 0) {
            this.layout.minuteIndex  = 0;
            this.layout.playbackTime = mins[0].time;
        } else {
            // Pre-history day: no minutes — park at the day's UTC midnight.
            this.layout.minuteIndex  = 0;
            this.layout.playbackTime = day.time;
        }
    }

    private _setLastMinuteOfDay(dayIdx: number): void {
        const day  = this.market.days[dayIdx];
        const mins = day.minutes;
        if (mins.length > 0) {
            this.layout.minuteIndex  = mins.length - 1;
            this.layout.playbackTime = mins[mins.length - 1].time;
        } else {
            // Pre-history day: no minutes — park at the day's UTC midnight.
            this.layout.minuteIndex  = 0;
            this.layout.playbackTime = day.time;
        }
    }

    private _emit(): void {
        this.layout.notify();
        this.notify();
    }
}
