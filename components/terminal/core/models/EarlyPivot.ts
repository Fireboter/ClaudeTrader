// ─── Early Pivot Model ────────────────────────────────────────────────────────

export type EarlyPivotStatus = 'provisional' | 'confirmed';

/**
 * A pivot detected early by watching for price entering a trendline touch zone
 * and confirming via a configurable price-recoil threshold.
 *
 * Lifecycle:
 *   1. provisional — candle entered a trendline touch zone; shown transparent.
 *   2. confirmed   — price moved `recoilPct`% in the opposite direction;
 *                    becomes permanent, fed into trendline system.
 *
 * Superseded: A confirmed pivot where the candle later made a new extreme
 * past `touchPrice` (e.g. confirmed a resistance touch but candle later went
 * higher). Shown smaller, positioned at `confirmedAt` inside the candle body.
 */
export interface EarlyPivot {
    /** UTC-midnight Unix timestamp of the daily bar */
    time:       number;
    /** Day index within the DayCandle[] array */
    dayIndex:   number;
    /** Swing high or swing low */
    type:       'high' | 'low';

    /** Trendline price at this dayIndex (line equation value) */
    touchPrice: number;
    /** Stable ID of the trendline that triggered this pivot */
    trendlineId: string;

    status:           EarlyPivotStatus;
    /** Price level that must be crossed (in opposite direction) to confirm */
    recoilThreshold:  number;
    /** Price where recoil confirmation was first reached (when confirmed) */
    confirmedAt?:     number;

    /**
     * True when the pivot is confirmed but the candle subsequently made a new
     * extreme beyond `touchPrice`. The marker renders smaller, at `confirmedAt`,
     * inside the candle instead of at the bar's extreme.
     */
    superseded: boolean;

    // ── Minute-resolution timing (for exact-minute x-positioning) ────────────

    /** Unix timestamp of the minute bar when price first entered the touch zone */
    touchMinuteTime: number;
    /**
     * Unix timestamp of the minute bar when the recoil threshold was first crossed.
     * Populated only when status === 'confirmed' (or superseded).
     */
    confirmMinuteTime?: number;
    /**
     * Unix timestamp of the minute bar when a new extreme past `touchPrice`
     * occurred after confirmation. Populated only when superseded === true.
     */
    supersededMinuteTime?: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface EarlyPivotConfig {
    /** Master toggle — enables the entire early pivot detection system */
    enabled:            boolean;
    /** Show transparent provisional markers when price enters a touch zone */
    provisionalEnabled: boolean;
    /**
     * Use price-recoil as the confirmation rule.
     * Displays an amber threshold line; crossing it confirms the pivot.
     */
    recoilEnabled:      boolean;
    /**
     * How far price must move back (as a %) from touchPrice to confirm.
     * e.g. 0.5 → price must retrace 0.5% from the touch zone midline.
     */
    recoilPct:          number;   // 0.1–5
}

export const DEFAULT_EARLY_PIVOT_CONFIG: EarlyPivotConfig = {
    enabled:            false,
    provisionalEnabled: true,
    recoilEnabled:      true,
    recoilPct:          0.5,
};
