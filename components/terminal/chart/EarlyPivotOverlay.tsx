"use client";

import { useEffect, useRef, useCallback } from 'react';
import type { ISeriesApi, IChartApi, Time, IPriceLine } from 'lightweight-charts';
import type { EarlyPivot, EarlyPivotConfig } from '../core/models/EarlyPivot';
import type { DayCandle } from '../core/models/Candle';

interface EarlyPivotOverlayProps {
    chart:       IChartApi | null;
    series:      ISeriesApi<'Candlestick'> | null;
    days:        DayCandle[];
    earlyPivots: EarlyPivot[];
    config:      EarlyPivotConfig;
    enabled:     boolean;
}

/**
 * EarlyPivotOverlay — SVG layer drawn over the lightweight-charts canvas,
 * plus native chart price lines for recoil thresholds.
 *
 * Renders four visual elements for the early pivot detection system:
 *
 *  A. Provisional markers (transparent arrows) — above/below the bar's high/low.
 *     Shown only when `config.provisionalEnabled` and pivot.status === 'provisional'.
 *
 *  B. Recoil threshold lines — rendered as NATIVE chart price lines via
 *     series.createPriceLine(), NOT as SVG elements. This guarantees the line is
 *     always rendered by the same canvas pipeline as the candlesticks, so it can
 *     never drift when the price scale auto-adjusts mid-bar.
 *     - Line appears when a provisional pivot is detected.
 *     - Line price is updated ONLY when recoilThreshold changes (e.g. the running
 *       high extended far enough to touch a tighter resistance trendline).
 *     - Line is removed when the pivot is confirmed or expires.
 *     Shown for every provisional pivot when `config.recoilEnabled`.
 *
 *  C. Superseded confirmed markers — small solid arrows at confirmedAt price,
 *     inside the candle body.
 *     Shown for pivots where status === 'confirmed' && superseded === true.
 *
 *  D. Confirmed non-superseded markers — full-opacity arrows above/below the bar,
 *     at the same x as the daily candle.
 *     Shown for status === 'confirmed' && superseded === false.
 *
 * All SVG x-coordinates use timeToCoordinate(day.time) — the daily bar's pixel
 * position — so markers are always visually aligned with their candle.
 * The "exact minute" timing is enforced by the EarlyPivotFilter (which filters
 * minutes by playbackTime), not by x-interpolation.
 */
export function EarlyPivotOverlay({
    chart,
    series,
    days,
    earlyPivots,
    config,
    enabled,
}: EarlyPivotOverlayProps) {

    const svgRef          = useRef<SVGSVGElement | null>(null);
    const containerRef    = useRef<HTMLDivElement | null>(null);
    const rafRef          = useRef<number | null>(null);
    const priceLineMapRef = useRef<Map<string, IPriceLine>>(new Map());

    // ── Create SVG element once ───────────────────────────────────────────────
    useEffect(() => {
        if (!chart) return;
        const parent = chart.chartElement().parentElement as HTMLElement | null;
        if (!parent) return;

        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }

        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:11;';
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

    // ── Section B: native chart price lines for recoil thresholds ────────────
    //
    // We use series.createPriceLine() instead of SVG <line> elements so the
    // threshold is drawn by lightweight-charts' own canvas pipeline.  It is
    // therefore always in perfect sync with the price scale — no one-frame lag,
    // no drift when auto-scale adjusts mid-bar during a recoil.
    //
    // A price line is created the first time a provisional pivot is seen, updated
    // (via applyOptions) ONLY when recoilThreshold actually changes (i.e. when
    // the running high/low extends further and a tighter trendline becomes the
    // active one), and removed when the pivot is no longer provisional.
    useEffect(() => {
        if (!series) return;

        const map = priceLineMapRef.current;
        const activePivotKeys = new Set<string>();

        if (enabled && config.recoilEnabled) {
            for (const ep of earlyPivots) {
                if (ep.status !== 'provisional') continue;

                const key = `${ep.trendlineId}|${ep.dayIndex}|${ep.type}`;
                activePivotKeys.add(key);

                const existing = map.get(key);
                if (!existing) {
                    // First time this provisional pivot is seen — create the line
                    const priceLine = series.createPriceLine({
                        price:             ep.recoilThreshold,
                        color:             '#f59e0b',
                        lineWidth:         1,
                        lineStyle:         2,     // LineStyle.Dashed
                        axisLabelVisible:  true,
                        title:             '',
                        axisLabelColor:    '#f59e0b',
                        axisLabelTextColor:'#0f172a',
                    });
                    map.set(key, priceLine);
                } else if (existing.options().price !== ep.recoilThreshold) {
                    // recoilThreshold changed (e.g. running high reached a tighter
                    // resistance trendline) — update in place, no flicker
                    existing.applyOptions({ price: ep.recoilThreshold });
                }
                // If price is unchanged: do nothing — the line is already stable
            }
        }

        // Remove lines for pivots that are no longer provisional
        for (const [key, priceLine] of map.entries()) {
            if (!activePivotKeys.has(key)) {
                try { series.removePriceLine(priceLine); } catch (_) { /* ignore */ }
                map.delete(key);
            }
        }
    }, [series, earlyPivots, config.recoilEnabled, enabled]);

    // ── Clean up all price lines when series is replaced or component unmounts ─
    useEffect(() => {
        const currentSeries = series;
        const map           = priceLineMapRef.current;
        return () => {
            if (!currentSeries) return;
            for (const priceLine of map.values()) {
                try { currentSeries.removePriceLine(priceLine); } catch (_) { /* ignore */ }
            }
            map.clear();
        };
    }, [series]);

    // ── Main draw function (SVG: sections A, C, D only) ──────────────────────
    const draw = useCallback(() => {
        const svg = svgRef.current;
        if (!svg || !chart || !series) return;

        while (svg.firstChild) svg.removeChild(svg.firstChild);

        if (!enabled || earlyPivots.length === 0 || days.length === 0) return;

        const timeScale = chart.timeScale();
        const fragment  = document.createDocumentFragment();

        for (const ep of earlyPivots) {
            const day = days[ep.dayIndex];
            if (!day) continue;

            // All markers for a pivot are anchored at the daily bar's x position.
            const x = timeScale.timeToCoordinate(day.time as Time);
            if (x === null) continue;

            const isHigh    = ep.type === 'high';
            const baseColor = isHigh ? '#ef4444' : '#22c55e';

            // ── A. Provisional markers ────────────────────────────────────────
            if (ep.status === 'provisional' && config.provisionalEnabled) {
                const priceY = series.priceToCoordinate(isHigh ? day.high : day.low);
                if (priceY !== null) {
                    const yOffset = isHigh ? -18 : 18;
                    _appendArrow(fragment, x, priceY + yOffset, isHigh, baseColor, 0.30, 10, 8);
                }
            }

            // ── C. Superseded confirmed markers (inside the candle body) ──────
            if (ep.status === 'confirmed' && ep.superseded && ep.confirmedAt !== undefined) {
                const insideY = series.priceToCoordinate(ep.confirmedAt);
                if (insideY !== null) {
                    _appendArrow(fragment, x, insideY, isHigh, baseColor, 1.0, 7, 5);
                }
            }

            // ── D. Confirmed non-superseded markers (above/below bar) ─────────
            if (ep.status === 'confirmed' && !ep.superseded) {
                const priceY = series.priceToCoordinate(isHigh ? day.high : day.low);
                if (priceY !== null) {
                    const yOffset = isHigh ? -18 : 18;
                    _appendArrow(fragment, x, priceY + yOffset, isHigh, baseColor, 1.0, 10, 8);
                }
            }
        }

        svg.setAttribute('pointer-events', 'none');
        svg.appendChild(fragment);
    }, [chart, series, days, earlyPivots, config, enabled]);

    // ── Trigger draw on every prop change ────────────────────────────────────
    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(draw);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [draw]);

    // ── Redraw on chart time-scale scroll/zoom ────────────────────────────────
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

// ─── SVG arrow helper ─────────────────────────────────────────────────────────

/**
 * Appends a filled triangle arrow to the SVG fragment.
 *
 * @param fragment  DocumentFragment to append into.
 * @param cx        Centre X in pixels.
 * @param cy        Tip Y in pixels (point of the arrow).
 * @param pointDown True = ↓ (high pivot), False = ↑ (low pivot).
 * @param color     Fill colour string.
 * @param opacity   Fill opacity (0–1).
 * @param w         Width of the triangle base in pixels.
 * @param h         Height of the triangle in pixels.
 */
function _appendArrow(
    fragment:  DocumentFragment,
    cx:        number,
    cy:        number,
    pointDown: boolean,
    color:     string,
    opacity:   number,
    w:         number,
    h:         number,
): void {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    let d: string;
    if (pointDown) {
        // Tip at bottom (cy), base at top
        d = `M ${cx},${cy} L ${cx - w / 2},${cy - h} L ${cx + w / 2},${cy - h} Z`;
    } else {
        // Tip at top (cy), base at bottom
        d = `M ${cx},${cy} L ${cx - w / 2},${cy + h} L ${cx + w / 2},${cy + h} Z`;
    }

    path.setAttribute('d',            d);
    path.setAttribute('fill',         color);
    path.setAttribute('fill-opacity', String(opacity));
    path.setAttribute('stroke',       'none');
    fragment.appendChild(path);
}
