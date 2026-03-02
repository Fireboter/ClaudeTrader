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
    series:  ISeriesApi<"Candlestick"> | null;
    pivots:  Pivot[];
    enabled: boolean;
}

/**
 * PivotOverlay — renderless, drives confirmed pivot markers on the chart.
 * Red arrowDown for swing highs, green arrowUp for swing lows.
 */
export function PivotOverlay({ series, pivots, enabled }: PivotOverlayProps) {

    const primRef  = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
    const countRef = useRef<number>(-1);

    // ── Create / destroy primitive on series change ───────────────────────────
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

    // ── Sync markers ─────────────────────────────────────────────────────────
    useEffect(() => {
        const prim = primRef.current;
        if (!prim) return;

        if (!enabled || pivots.length === 0) {
            if (countRef.current !== 0) {
                prim.setMarkers([]);
                countRef.current = 0;
            }
            return;
        }

        if (countRef.current === pivots.length) return;

        const markers: SeriesMarker<Time>[] = pivots.map(p => ({
            time:     p.time as Time,
            position: p.type === 'high' ? 'aboveBar' : 'belowBar',
            shape:    p.type === 'high' ? 'arrowDown' : 'arrowUp',
            color:    p.type === 'high' ? '#ef4444'   : '#22c55e',
            size:     1,
            text:     '',
        }));

        markers.sort((a, b) => (a.time as number) - (b.time as number));
        prim.setMarkers(markers);
        countRef.current = pivots.length;

    }, [pivots, enabled]);

    return null;
}
