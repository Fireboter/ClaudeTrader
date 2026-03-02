"use client";

import { useEffect, useRef, useCallback } from 'react';
import type { ISeriesApi, IChartApi, Time } from 'lightweight-charts';
import type { Trendline } from '../core/models/Trendline';
import type { TrendlineConfig } from '../core/models/Trendline';
import type { DayCandle } from '../core/models/Candle';

interface TrendlineOverlayProps {
    chart:      IChartApi | null;
    series:     ISeriesApi<'Candlestick'> | null;
    days:       DayCandle[];
    trendlines: Trendline[];
    config:     TrendlineConfig;
    enabled:    boolean;
}

/**
 * TrendlineOverlay — SVG layer drawn over the lightweight-charts canvas.
 *
 * Renders:
 *  - Solid/dashed lines (resistance = red, support = green)
 *  - Touch zones as trapezoid polygons (15% opacity)
 *  - Score labels at line midpoints
 *  - Hover highlight (white stroke, brighter)
 *
 * The SVG element is sized to fill the chart container and redrawn on every
 * prop change via requestAnimationFrame.
 */
export function TrendlineOverlay({
    chart,
    series,
    days,
    trendlines,
    config,
    enabled,
}: TrendlineOverlayProps) {

    const svgRef        = useRef<SVGSVGElement | null>(null);
    const containerRef  = useRef<HTMLDivElement | null>(null);
    const hoveredIdRef  = useRef<string | null>(null);
    const rafRef        = useRef<number | null>(null);

    // ── Create SVG element once ───────────────────────────────────────────────
    useEffect(() => {
        if (!chart) return;
        // chartElement() returns the div that lightweight-charts rendered into.
        // Its parent is the div we passed to createChart() — that's our anchor.
        const parent = chart.chartElement().parentElement as HTMLElement | null;
        if (!parent) return;

        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }

        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;';
        parent.appendChild(container);
        containerRef.current = container;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;';
        svg.setAttribute('pointer-events', 'none');
        container.appendChild(svg);
        svgRef.current = svg;

        return () => {
            container.remove();
            svgRef.current       = null;
            containerRef.current = null;
        };
    }, [chart]);

    // ── Main draw function ────────────────────────────────────────────────────
    const draw = useCallback(() => {
        const svg    = svgRef.current;
        if (!svg || !chart || !series) return;

        // Clear
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        if (!enabled || trendlines.length === 0 || days.length === 0) return;

        const timeScale = chart.timeScale();
        const axisX     = days.length - 1;
        const curDay    = days[axisX];
        const curPrice  = curDay?.close ?? 0;
        const maxScore  = Math.max(...trendlines.map(l => l.score), 1);
        const zonePct   = config.touchZonePct / 100;
        const fragment  = document.createDocumentFragment();
        const hoveredId = hoveredIdRef.current;

        // Sort so higher-score lines render on top
        const sorted = [...trendlines].sort((a, b) => a.score - b.score);

        sorted.forEach((line, _rank) => {
            const startIdx = Math.max(0, Math.min(line.start_index, days.length - 1));
            const endIdx   = axisX;
            if (startIdx >= endIdx) return;

            const t1 = days[startIdx]?.time;
            const t2 = days[endIdx]?.time;
            if (t1 == null || t2 == null) return;

            const x1 = timeScale.timeToCoordinate(t1 as Time);
            const x2 = timeScale.timeToCoordinate(t2 as Time);
            if (x1 === null || x2 === null) return;

            const p1 = line.slope * startIdx + line.intercept;
            const p2 = line.slope * endIdx   + line.intercept;

            const y1 = series.priceToCoordinate(p1);
            const y2 = series.priceToCoordinate(p2);
            if (y1 === null || y2 === null) return;

            const isRes     = line.type === 'resistance';
            const isHovered = line.id === hoveredId;
            const baseColor = isRes ? '#f87171' : '#34d399';
            const strokeColor = isHovered ? '#f8fafc' : baseColor;

            const scoreRatio  = Math.min(1, line.score / maxScore);
            const strokeWidth = 1.5 + 3.5 * scoreRatio;

            // ── Touch Zone ────────────────────────────────────────────────────
            // Zones are always shown when touchZonePct > 0 (minute-resolution
            // breakout detection relies on knowing where the zone boundary is).
            if (zonePct > 0) {
                const y1t = series.priceToCoordinate(p1 * (1 + zonePct));
                const y1b = series.priceToCoordinate(p1 * (1 - zonePct));
                const y2t = series.priceToCoordinate(p2 * (1 + zonePct));
                const y2b = series.priceToCoordinate(p2 * (1 - zonePct));

                const minPx = 4;
                const h1 = Math.max(minPx, Math.abs((y1t ?? y1) - (y1b ?? y1)));
                const h2 = Math.max(minPx, Math.abs((y2t ?? y2) - (y2b ?? y2)));

                const y1Top = y1 - h1 / 2;
                const y1Bot = y1 + h1 / 2;
                const y2Top = y2 - h2 / 2;
                const y2Bot = y2 + h2 / 2;

                const zone = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                zone.setAttribute('points',
                    `${x1},${y1Top} ${x2},${y2Top} ${x2},${y2Bot} ${x1},${y1Bot}`);
                zone.setAttribute('fill', isRes ? '#ef4444' : '#10b981');
                zone.setAttribute('fill-opacity', '0.15');
                zone.setAttribute('stroke', 'none');
                fragment.appendChild(zone);
            }

            // ── Line ──────────────────────────────────────────────────────────
            const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            lineEl.setAttribute('x1', String(x1));
            lineEl.setAttribute('y1', String(y1));
            lineEl.setAttribute('x2', String(x2));
            lineEl.setAttribute('y2', String(y2));
            lineEl.setAttribute('stroke', strokeColor);
            lineEl.setAttribute('stroke-width', String(isHovered ? strokeWidth + 1.5 : strokeWidth));
            lineEl.setAttribute('stroke-linecap', 'round');
            lineEl.setAttribute('fill', 'none');

            // Dashing: rank 0 (best) = solid; rest = progressively more dashed
            const totalLines = sorted.length;
            const rankInType = sorted
                .filter(l => l.type === line.type)
                .sort((a, b) => b.score - a.score)
                .findIndex(l => l.id === line.id);

            if (rankInType > 0) {
                const step = totalLines > 1 ? rankInType / (totalLines - 1) : 0;
                const dashPattern = step <= 0.33 ? '5 3' : step <= 0.66 ? '7 5' : '9 7';
                const opacity     = step <= 0.33 ? 0.75 : step <= 0.66 ? 0.55 : 0.40;
                lineEl.setAttribute('stroke-dasharray', dashPattern);
                lineEl.setAttribute('stroke-opacity', String(isHovered ? 0.95 : opacity));
            } else {
                lineEl.setAttribute('stroke-opacity', String(isHovered ? 1.0 : 0.85));
            }

            // Tooltip on hover
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = `${line.type.toUpperCase()} | Touches=${line.touches} | Score=${line.score.toFixed(0)} | Slope=${line.slope.toFixed(5)}`;
            lineEl.appendChild(title);

            // Hover interaction — re-enable pointer events on line only
            lineEl.setAttribute('pointer-events', 'stroke');
            lineEl.style.pointerEvents = 'stroke';
            lineEl.addEventListener('mouseenter', () => {
                hoveredIdRef.current = line.id;
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(draw);
            });
            lineEl.addEventListener('mouseleave', () => {
                hoveredIdRef.current = null;
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(draw);
            });

            fragment.appendChild(lineEl);

            // ── Score Label ───────────────────────────────────────────────────
            const midIdx   = Math.round((startIdx + endIdx) / 2);
            const midT     = days[midIdx]?.time;
            if (midT != null) {
                const midX = timeScale.timeToCoordinate(midT as Time);
                const midP = line.slope * midIdx + line.intercept;
                const midY = series.priceToCoordinate(midP);

                if (midX !== null && midY !== null) {
                    const label      = line.score.toFixed(0);
                    const labelW     = label.length * 6 + 10;
                    const labelH     = 14;
                    const labelYOff  = isRes ? -14 : 4;   // above line for resistance, below for support

                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x',       String(midX - labelW / 2));
                    rect.setAttribute('y',       String(midY + labelYOff - labelH / 2));
                    rect.setAttribute('width',   String(labelW));
                    rect.setAttribute('height',  String(labelH));
                    rect.setAttribute('rx',      '3');
                    rect.setAttribute('fill',    '#0f172a');
                    rect.setAttribute('fill-opacity', isHovered ? '0.90' : '0.65');
                    fragment.appendChild(rect);

                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.textContent = label;
                    text.setAttribute('x',           String(midX));
                    text.setAttribute('y',           String(midY + labelYOff + 4));
                    text.setAttribute('fill',         isHovered ? '#f8fafc' : '#94a3b8');
                    text.setAttribute('font-size',    isHovered ? '11' : '10');
                    text.setAttribute('font-weight',  '600');
                    text.setAttribute('text-anchor',  'middle');
                    text.setAttribute('font-family',  'monospace');
                    fragment.appendChild(text);
                }
            }
        });

        // Keep SVG itself at none — individual <line> elements already have
        // pointer-events:stroke set, so hover still works without blocking
        // the chart's own pan/zoom mouse handling.
        svg.setAttribute('pointer-events', 'none');
        svg.style.pointerEvents = 'none';
        svg.appendChild(fragment);
    }, [chart, series, days, trendlines, config, enabled]);

    // ── Trigger draw on every prop change ────────────────────────────────────
    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(draw);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [draw]);

    // ── Redraw on chart scroll/zoom ───────────────────────────────────────────
    useEffect(() => {
        if (!chart) return;
        const handler = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(draw);
        };
        chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
        return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
    }, [chart, draw]);

    return null;
}
