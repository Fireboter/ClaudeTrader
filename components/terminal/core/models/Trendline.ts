// ─── Trendline Model ──────────────────────────────────────────────────────────

export type TrendlineType = 'resistance' | 'support';

/**
 * A detected trendline passing through two or more pivot points.
 *
 * Line equation: price = slope * dayIndex + intercept
 *
 * start_index: first bar index where the line is valid (after raycast)
 * end_index:   last bar index the line extends to (playback "now")
 * pivotIndices: dayIndex values of all pivots that sit on the line
 * score:       (touches × 100) + longevity  — higher is better
 */
export interface Trendline {
    /** Stable dedup key: slope rounded 6dp + intercept rounded 2dp */
    id:           string;

    start_index:  number;
    end_index:    number;
    start_price:  number;
    end_price:    number;

    slope:        number;
    intercept:    number;

    type:         TrendlineType;

    /** Number of pivots lying on this line */
    touches:      number;
    /** All dayIndex values of pivots on the line (sorted ascending) */
    pivotIndices: number[];

    /** Quality metric: (touches × 100) + longevity */
    score:        number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export type PivotSource = 'window' | 'early' | 'both';

export interface TrendlineConfig {
    // Pivot source selection
    /** Which confirmed pivot pool feeds the trendline detector.
     *  'window'  — only window-size swing pivots (PivotManager)
     *  'early'   — only price-change recoil confirmed pivots (EarlyPivotManager)
     *  'both'    — union of both sources (default)
     */
    pivotSource: PivotSource;

    // Detection
    minPivots:   number;   // 2–10
    tolerance:   number;   // pivot-to-line tolerance, 0.001–0.02
    errorRate:   number;   // raycast error allowance, 0–0.10

    // Display filters
    proximity:   number;   // 0–1 (fraction of current price; 0 = off)

    // NMS (Non-Maximum Suppression)
    useNMS:               boolean;
    nmsPriceTolerance:    number;   // 0–0.05
    nmsSlopeTolerance:    number;   // 0–0.5
    nmsLevelSlopeCutoff:  number;   // 0.001–0.05
    nmsLevelTolerance:    number;   // 0.0005–0.01

    // Display count filters
    useClosestFilter:      boolean;
    closestFilterCount:    number;
    useMostValuableFilter: boolean;
    mostValuableCount:     number;

    // Touch zones
    touchZoneEnabled: boolean;
    touchZonePct:     number;   // 0–5  (percent)
}

export const DEFAULT_TRENDLINE_CONFIG: TrendlineConfig = {
    pivotSource: 'both',

    minPivots:   2,
    tolerance:   0.005,
    errorRate:   0.0,

    proximity:   0,

    useNMS:               true,
    nmsPriceTolerance:    0.005,
    nmsSlopeTolerance:    0.15,
    nmsLevelSlopeCutoff:  0.01,
    nmsLevelTolerance:    0.001,

    useClosestFilter:      false,
    closestFilterCount:    4,
    useMostValuableFilter: false,
    mostValuableCount:     4,

    touchZoneEnabled: false,
    touchZonePct:     0.5,
};
