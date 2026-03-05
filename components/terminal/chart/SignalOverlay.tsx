"use client";

import { useEffect, useRef, useCallback } from 'react';
import type { ISeriesApi, IChartApi, Time, IPriceLine } from 'lightweight-charts';
import type { Signal, ActiveTrade } from '../core/models/Signal';
import type { DayCandle } from '../core/models/Candle';

interface SignalOverlayProps {
    chart:        IChartApi | null;
    series:       ISeriesApi<'Candlestick'> | null;
    days:         DayCandle[];
    signals:      Signal[];
    activeTrade:  ActiveTrade | null;
    enabled:      boolean;
    useStopLoss:  boolean;
    useTakeProfit: boolean;
}

/**
 * SignalOverlay — SVG layer for entry/exit signal arrows, plus native chart
 * price lines for the active trade's stop-loss and take-profit levels.
 *
 * Visual conventions:
 *   Long entry  — green upward arrow (▲) below entry price
 *   Short entry — red downward arrow (▼) above entry price
 *   Win exit    — filled green circle at exit price
 *   Loss exit   — filled red circle at exit price
 *   SL line     — red dashed native price line (from series.createPriceLine)
 *   TP line     — green dashed native price line
 *
 * All signals are anchored at the daily candle for their dayIndex.
 * Price-to-pixel mapping uses series.priceToCoordinate(sig.price).
 */
export function SignalOverlay({
    chart,
    series,
    days,
    signals,
    activeTrade,
    enabled,
    useStopLoss,
    useTakeProfit,
}: SignalOverlayProps) {

    const svgRef       = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rafRef       = useRef<number | null>(null);

    // Native price lines for SL / TP
    const slLineRef = useRef<IPriceLine | null>(null);
    const tpLineRef = useRef<IPriceLine | null>(null);

    // ── Create SVG element once ───────────────────────────────────────────────
    useEffect(() => {
        if (!chart) return;
        const parent = chart.chartElement().parentElement as HTMLElement | null;
        if (!parent) return;

        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }

        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:12;';
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

    // ── SL / TP native price lines ────────────────────────────────────────────
    useEffect(() => {
        if (!series) return;

        // Stop Loss line
        if (enabled && useStopLoss && activeTrade?.slPrice != null) {
            const price = activeTrade.slPrice;
            if (slLineRef.current) {
                slLineRef.current.applyOptions({ price });
            } else {
                slLineRef.current = series.createPriceLine({
                    price,
                    color:              '#ef4444',
                    lineWidth:          1,
                    lineStyle:          2,    // Dashed
                    axisLabelVisible:   true,
                    title:              'SL',
                    axisLabelColor:     '#ef4444',
                    axisLabelTextColor: '#ffffff',
                });
            }
        } else {
            if (slLineRef.current) {
                try { series.removePriceLine(slLineRef.current); } catch (_) { /* ignore */ }
                slLineRef.current = null;
            }
        }

        // Take Profit line
        if (enabled && useTakeProfit && activeTrade?.tpPrice != null) {
            const price = activeTrade.tpPrice;
            if (tpLineRef.current) {
                tpLineRef.current.applyOptions({ price });
            } else {
                tpLineRef.current = series.createPriceLine({
                    price,
                    color:              '#22c55e',
                    lineWidth:          1,
                    lineStyle:          2,    // Dashed
                    axisLabelVisible:   true,
                    title:              'TP',
                    axisLabelColor:     '#22c55e',
                    axisLabelTextColor: '#ffffff',
                });
            }
        } else {
            if (tpLineRef.current) {
                try { series.removePriceLine(tpLineRef.current); } catch (_) { /* ignore */ }
                tpLineRef.current = null;
            }
        }
    }, [series, activeTrade, enabled, useStopLoss, useTakeProfit]);

    // ── Clean up price lines when series changes or component unmounts ─────────
    useEffect(() => {
        const s = series;
        return () => {
            if (!s) return;
            if (slLineRef.current) {
                try { s.removePriceLine(slLineRef.current); } catch (_) { /* ignore */ }
                slLineRef.current = null;
            }
            if (tpLineRef.current) {
                try { s.removePriceLine(tpLineRef.current); } catch (_) { /* ignore */ }
                tpLineRef.current = null;
            }
        };
    }, [series]);

    // ── Main SVG draw ─────────────────────────────────────────────────────────
    const draw = useCallback(() => {
        const svg = svgRef.current;
        if (!svg || !chart || !series) return;

        while (svg.firstChild) svg.removeChild(svg.firstChild);

        if (!enabled || signals.length === 0 || days.length === 0) return;

        const timeScale = chart.timeScale();
        const fragment  = document.createDocumentFragment();

        for (const sig of signals) {
            const day = days[sig.dayIndex];
            if (!day) continue;

            const x = timeScale.timeToCoordinate(day.time as Time);
            if (x === null) continue;

            const priceY = series.priceToCoordinate(sig.price);
            if (priceY === null) continue;

            if (sig.kind === 'long') {
                // ▲ green upward arrow — 10px below entry price
                _appendArrow(fragment, x, priceY + 14, false, '#22c55e', 1.0, 10, 8);
            } else if (sig.kind === 'short') {
                // ▼ red downward arrow — 10px above entry price
                _appendArrow(fragment, x, priceY - 14, true, '#ef4444', 1.0, 10, 8);
            } else if (sig.kind === 'win') {
                // ◆ small filled green diamond
                _appendDiamond(fragment, x, priceY, '#22c55e', 6);
            } else if (sig.kind === 'loss') {
                // ◆ small filled red diamond
                _appendDiamond(fragment, x, priceY, '#ef4444', 6);
            }
        }

        svg.setAttribute('pointer-events', 'none');
        svg.appendChild(fragment);
    }, [chart, series, days, signals, enabled]);

    // ── Trigger draw on prop changes ──────────────────────────────────────────
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

// ─── SVG helpers ──────────────────────────────────────────────────────────────

/**
 * Filled triangle arrow at (cx, cy).
 * pointDown=true → tip points down (▼, used for short entries above price).
 * pointDown=false → tip points up  (▲, used for long entries below price).
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
        d = `M ${cx},${cy} L ${cx - w / 2},${cy - h} L ${cx + w / 2},${cy - h} Z`;
    } else {
        d = `M ${cx},${cy} L ${cx - w / 2},${cy + h} L ${cx + w / 2},${cy + h} Z`;
    }
    path.setAttribute('d',            d);
    path.setAttribute('fill',         color);
    path.setAttribute('fill-opacity', String(opacity));
    path.setAttribute('stroke',       'none');
    fragment.appendChild(path);
}

/**
 * Filled diamond (rotated square) centred at (cx, cy).
 */
function _appendDiamond(
    fragment: DocumentFragment,
    cx:       number,
    cy:       number,
    color:    string,
    r:        number,   // half-size in pixels
): void {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${cx},${cy - r} L ${cx + r},${cy} L ${cx},${cy + r} L ${cx - r},${cy} Z`;
    path.setAttribute('d',    d);
    path.setAttribute('fill', color);
    path.setAttribute('stroke', 'none');
    fragment.appendChild(path);
}
