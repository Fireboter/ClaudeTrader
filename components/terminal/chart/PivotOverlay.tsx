"use client";

import { useEffect, useRef } from 'react';
import { createSeriesMarkers } from 'lightweight-charts';
import type {
    ISeriesApi,
    ISeriesMarkersPluginApi,
    SeriesMarker,
    Time,
} from 'lightweight-charts';
import type { Pivot } from '../core/filters/PivotFilter';

interface PivotOverlayProps {
    series:           ISeriesApi<"Candlestick"> | null;
    preHistorySeries: ISeriesApi<"Candlestick"> | null;
    pivots:           Pivot[];
    enabled:          boolean;
    preHistoryCount:  number;
}

/**
 * PivotOverlay — renderless, drives confirmed pivot markers on the chart.
 * Red arrowDown for swing highs, green arrowUp for swing lows.
 *
 * Two marker primitives are maintained:
 *   primRef      → attached to candleSeries   (actual-range pivots)
 *   preHistPrimRef → attached to preHistorySeries (pre-history pivots)
 *
 * This split is required because createSeriesMarkers can only place markers
 * at timestamps that exist as bars in the series it is attached to.
 * Pre-history bars live on preHistorySeries; routing them there prevents
 * lightweight-charts from snapping all pre-history markers to the boundary bar.
 */
export function PivotOverlay({ series, preHistorySeries, pivots, enabled, preHistoryCount }: PivotOverlayProps) {

    const primRef      = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const preHistPrimRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const countRef     = useRef<number>(-1);

    // ── Create / destroy primitive on candleSeries change ────────────────────
    useEffect(() => {
        if (!series) {
            primRef.current  = null;
            countRef.current = -1;
            return;
        }
        const prim = createSeriesMarkers(series, []);
        primRef.current  = prim;
        countRef.current = 0;
        return () => {
            try { prim.detach(); } catch { /* gone */ }
            primRef.current  = null;
            countRef.current = -1;
        };
    }, [series]);

    // ── Create / destroy primitive on preHistorySeries change ────────────────
    useEffect(() => {
        if (!preHistorySeries) {
            preHistPrimRef.current = null;
            return;
        }
        const prim = createSeriesMarkers(preHistorySeries, []);
        preHistPrimRef.current = prim;
        return () => {
            try { prim.detach(); } catch { /* gone */ }
            preHistPrimRef.current = null;
        };
    }, [preHistorySeries]);

    // ── Sync markers ─────────────────────────────────────────────────────────
    useEffect(() => {
        const prim      = primRef.current;
        const prePrim   = preHistPrimRef.current;

        // Clear both primitives when disabled or empty
        if (!enabled || pivots.length === 0) {
            if (countRef.current !== 0) {
                prim?.setMarkers([]);
                prePrim?.setMarkers([]);
                countRef.current = 0;
            }
            return;
        }

        if (countRef.current === pivots.length) return;

        const toMarker = (p: Pivot): SeriesMarker<Time> => ({
            time:     p.time as Time,
            position: p.type === 'high' ? 'aboveBar' : 'belowBar',
            shape:    p.type === 'high' ? 'arrowDown' : 'arrowUp',
            color:    p.type === 'high' ? '#ef4444'   : '#22c55e',
            size:     1,
            text:     '',
        });

        const sort = (arr: SeriesMarker<Time>[]) =>
            arr.sort((a, b) => (a.time as number) - (b.time as number));

        // Route by dayIndex: pre-history → preHistorySeries, rest → candleSeries
        const preHistMarkers = sort(pivots.filter(p => p.dayIndex < preHistoryCount).map(toMarker));
        const mainMarkers    = sort(pivots.filter(p => p.dayIndex >= preHistoryCount).map(toMarker));

        prim?.setMarkers(mainMarkers);
        prePrim?.setMarkers(preHistMarkers);
        countRef.current = pivots.length;

    }, [pivots, enabled, preHistoryCount]);

    return null;
}
