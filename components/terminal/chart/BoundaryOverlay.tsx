"use client";

import React, { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

interface Props {
    chart:        IChartApi | null;
    series:       ISeriesApi<"Candlestick"> | null;
    boundaryTime: number | null;
}

/**
 * Renders a yellow dashed vertical line at the boundary between pre-history
 * and the actual trading range.  Uses an absolutely-positioned SVG that
 * covers the chart container.  Repositions whenever the time-scale scrolls
 * or zooms.
 */
export function BoundaryOverlay({ chart, series, boundaryTime }: Props) {
    const svgRef  = useRef<SVGSVGElement>(null);
    const lineRef = useRef<SVGLineElement>(null);

    useEffect(() => {
        if (!chart || !series || boundaryTime == null) {
            if (lineRef.current) lineRef.current.setAttribute('visibility', 'hidden');
            return;
        }

        const reposition = () => {
            const svg  = svgRef.current;
            const line = lineRef.current;
            if (!svg || !line) return;

            const x = chart.timeScale().timeToCoordinate(boundaryTime as never);
            if (x === null || !isFinite(x)) {
                line.setAttribute('visibility', 'hidden');
                return;
            }

            const h = svg.clientHeight;
            line.setAttribute('x1', String(x));
            line.setAttribute('x2', String(x));
            line.setAttribute('y1', '0');
            line.setAttribute('y2', String(h));
            line.setAttribute('visibility', 'visible');
        };

        reposition();
        chart.timeScale().subscribeVisibleTimeRangeChange(reposition);
        return () => chart.timeScale().unsubscribeVisibleTimeRangeChange(reposition);
    }, [chart, series, boundaryTime]);

    if (boundaryTime == null) return null;

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%' }}
        >
            <line
                ref={lineRef}
                stroke="#eab308"
                strokeWidth={2}
                strokeDasharray="6 4"
                opacity={0.9}
                visibility="hidden"
            />
        </svg>
    );
}
