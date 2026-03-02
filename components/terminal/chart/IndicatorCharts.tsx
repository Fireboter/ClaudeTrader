"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTerminal } from '../TerminalContext';
import {
    createChart, IChartApi, ISeriesApi,
    LineSeries, HistogramSeries, Time,
} from 'lightweight-charts';
import axios from 'axios';
import { QUANT_INDICATORS, MACRO_INDICATORS } from '../sidebar/left/indicators';

const API = 'http://localhost:8000';

// ─── Indicator key → chart config ────────────────────────────────────────────

// Keys that render as histogram instead of line
const HISTOGRAM_KEYS = new Set(['macd', 'volume', 'delta', 'ad']);

// Macro key → FRED symbol mapping (mirrors indicators.ts / server)
const MACRO_FRED: Record<string, string> = {
    macro_cpi:          'CPIAUCSL',
    macro_rates:        'DFF',
    macro_unemployment: 'UNRATE',
    macro_gdp:          'GDP',
    macro_treasury:     'DGS10',
    macro_breakeven:    'T10YIE',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface Point { time: number; value: number; }

interface ActiveChart {
    key:         string;
    name:        string;
    color:       string;
    points:      Point[];
    isMacro:     boolean;
    isHistogram: boolean;
    extra?:      { upper: Point[]; lower: Point[] };   // bollinger only
}

// ─── Single indicator sub-chart ───────────────────────────────────────────────

interface IndicatorChartProps {
    chart:             ActiveChart;
    playbackTime:      number | null;
    onCrosshairMove?:  (time: number | null) => void;
    syncTime?:         number | null;
}

function IndicatorChart({ chart, playbackTime, onCrosshairMove, syncTime }: IndicatorChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef     = useRef<IChartApi | null>(null);
    const mainSerRef   = useRef<ISeriesApi<"Line"> | ISeriesApi<"Histogram"> | null>(null);

    // Slice to playback cursor
    const points = useMemo(() => {
        if (playbackTime === null) return chart.points;
        return chart.points.filter(p => p.time <= playbackTime);
    }, [chart.points, playbackTime]);

    const extraUpper = useMemo(() => {
        if (!chart.extra) return [];
        if (playbackTime === null) return chart.extra.upper;
        return chart.extra.upper.filter(p => p.time <= playbackTime);
    }, [chart.extra, playbackTime]);

    const extraLower = useMemo(() => {
        if (!chart.extra) return [];
        if (playbackTime === null) return chart.extra.lower;
        return chart.extra.lower.filter(p => p.time <= playbackTime);
    }, [chart.extra, playbackTime]);

    // Create chart once per mount
    useEffect(() => {
        if (!containerRef.current) return;

        const c = createChart(containerRef.current, {
            autoSize: true,
            layout: {
                background: { color: 'transparent' },
                textColor: '#64748b',
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { color: '#1e293b' },
            },
            rightPriceScale: { borderVisible: false },
            timeScale: { borderVisible: false, visible: false },
            crosshair: { mode: 1 },
        });
        chartRef.current = c;

        c.subscribeCrosshairMove((param) => {
            onCrosshairMove?.(param.time ? (param.time as number) : null);
        });

        return () => {
            c.remove();
            chartRef.current = null;
            mainSerRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Push data whenever points change
    useEffect(() => {
        const c = chartRef.current;
        if (!c || points.length === 0) return;

        // Remove old series
        if (mainSerRef.current) {
            try { c.removeSeries(mainSerRef.current); } catch { /* ok */ }
            mainSerRef.current = null;
        }

        const tvPts = (pts: Point[]) => pts.map(p => ({ time: p.time as Time, value: p.value }));

        if (chart.isHistogram) {
            const s = c.addSeries(HistogramSeries, {
                color: chart.color,
                priceFormat: { type: 'volume' },
                priceLineVisible: false,
                lastValueVisible: false,
            });
            s.setData(tvPts(points));
            mainSerRef.current = s as unknown as ISeriesApi<"Line">;
        } else if (chart.key === 'bollinger' && chart.extra) {
            const mid = c.addSeries(LineSeries, {
                color: chart.color, lineWidth: 1,
                priceLineVisible: false, lastValueVisible: false,
            });
            mid.setData(tvPts(points));
            mainSerRef.current = mid;

            const upper = c.addSeries(LineSeries, {
                color: chart.color, lineWidth: 1, lineStyle: 2,
                priceLineVisible: false, lastValueVisible: false,
            });
            upper.setData(tvPts(extraUpper));

            const lower = c.addSeries(LineSeries, {
                color: chart.color, lineWidth: 1, lineStyle: 2,
                priceLineVisible: false, lastValueVisible: false,
            });
            lower.setData(tvPts(extraLower));
        } else {
            const s = c.addSeries(LineSeries, {
                color: chart.color, lineWidth: 2,
                priceLineVisible: false, lastValueVisible: false,
            });
            s.setData(tvPts(points));
            mainSerRef.current = s;
        }

        c.timeScale().fitContent();
    }, [points, extraUpper, extraLower, chart.color, chart.isHistogram, chart.key, chart.extra]);

    // Sync crosshair from main chart
    useEffect(() => {
        const c = chartRef.current;
        const s = mainSerRef.current;
        if (!c || !s || syncTime == null) return;
        try { c.setCrosshairPosition(0, syncTime as Time, s); } catch { /* time out of range */ }
    }, [syncTime]);

    return (
        <div className="flex-shrink-0 border-t border-slate-800/60" style={{ height: 120 }}>
            <div className="flex items-center px-3 h-6 text-[10px] uppercase font-bold bg-slate-900/60 border-b border-slate-800/40">
                <span className="mr-1.5 text-base leading-none" style={{ color: chart.color }}>●</span>
                <span className="text-slate-500">{chart.name}</span>
                {chart.isMacro && <span className="ml-1 text-slate-700">(FRED)</span>}
            </div>
            <div ref={containerRef} className="w-full" style={{ height: 94 }} />
        </div>
    );
}

// ─── Main IndicatorCharts container ──────────────────────────────────────────

export default function IndicatorCharts() {
    const { state, setHoveredTime } = useTerminal();
    const { config, enabledIndicators, playbackTime, dataTimeRange } = state;

    const [rawData, setRawData] = useState<Record<string, Point[]>>({});

    // Which quant / macro indicators are currently enabled
    const enabledQuantKeys = useMemo(
        () => QUANT_INDICATORS.filter(i => enabledIndicators[i.key]).map(i => i.key),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [JSON.stringify(enabledIndicators)]
    );
    const enabledMacroItems = useMemo(
        () => MACRO_INDICATORS.filter(i => enabledIndicators[i.key]),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [JSON.stringify(enabledIndicators)]
    );

    // ─── Fetch quant indicators ───────────────────────────────────
    useEffect(() => {
        if (enabledQuantKeys.length === 0) return;

        const params: Record<string, string | number> = {
            symbol:     config.symbol,
            mode:       config.mode,
            indicators: enabledQuantKeys.join(','),
        };
        if (config.mode === 'fixed') {
            params.start_date = config.startDate;
            params.end_date   = config.endDate;
        } else {
            const dur = (config.years * 365) + (config.months * 30) + config.days;
            params.duration_days = dur > 0 ? dur : 365;
            params.seed          = state.randomSeed;
        }

        axios.get<Record<string, Point[]>>(`${API}/api/indicators/compute`, { params })
            .then(res => setRawData(prev => ({ ...prev, ...res.data })))
            .catch(e => console.error('Indicator fetch failed:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.symbol, config.mode, config.startDate, config.endDate,
        config.years, config.months, config.days, state.randomSeed,
        enabledQuantKeys.join(',')]);

    // ─── Fetch FRED macro series ──────────────────────────────────
    useEffect(() => {
        if (enabledMacroItems.length === 0 || !dataTimeRange) return;

        const startDate = new Date(dataTimeRange.from * 1000).toISOString().slice(0, 10);
        const endDate   = new Date(dataTimeRange.to   * 1000).toISOString().slice(0, 10);

        enabledMacroItems.forEach(ind => {
            const fredSymbol = MACRO_FRED[ind.key];
            if (!fredSymbol) return;
            axios.get<Point[]>(`${API}/api/indicators/macro`, {
                params: { fred_symbol: fredSymbol, start_date: startDate, end_date: endDate },
            })
                .then(res => setRawData(prev => ({ ...prev, [ind.key]: res.data })))
                .catch(e => console.error(`FRED fetch failed for ${ind.key}:`, e));
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabledMacroItems.map(i => i.key).join(','), dataTimeRange?.from, dataTimeRange?.to]);

    // ─── Build active chart list ──────────────────────────────────
    const activeCharts = useMemo((): ActiveChart[] => {
        const charts: ActiveChart[] = [];

        for (const ind of QUANT_INDICATORS) {
            if (!enabledIndicators[ind.key]) continue;

            if (ind.key === 'bollinger') {
                const mid   = rawData['bollinger_mid']   ?? [];
                const upper = rawData['bollinger_upper'] ?? [];
                const lower = rawData['bollinger_lower'] ?? [];
                if (mid.length > 0) {
                    charts.push({ key: 'bollinger', name: ind.name, color: ind.color,
                        points: mid, isMacro: false, isHistogram: false,
                        extra: { upper, lower } });
                }
            } else if (ind.key === 'adx') {
                // ADX main line
                const adxPts = rawData['adx'] ?? [];
                if (adxPts.length > 0) {
                    charts.push({ key: 'adx', name: 'ADX', color: ind.color,
                        points: adxPts, isMacro: false, isHistogram: false });
                }
                // DI+ sub-toggle
                if (enabledIndicators['adx_di_plus']) {
                    const pts = rawData['adx_di_plus'] ?? [];
                    if (pts.length > 0)
                        charts.push({ key: 'adx_di_plus', name: 'DI+', color: '#22c55e',
                            points: pts, isMacro: false, isHistogram: false });
                }
                // DI- sub-toggle
                if (enabledIndicators['adx_di_minus']) {
                    const pts = rawData['adx_di_minus'] ?? [];
                    if (pts.length > 0)
                        charts.push({ key: 'adx_di_minus', name: 'DI-', color: '#ef4444',
                            points: pts, isMacro: false, isHistogram: false });
                }
            } else {
                const pts = rawData[ind.key] ?? [];
                if (pts.length > 0) {
                    charts.push({ key: ind.key, name: ind.name, color: ind.color,
                        points: pts, isMacro: false, isHistogram: HISTOGRAM_KEYS.has(ind.key) });
                }
            }
        }

        // Macro
        for (const ind of MACRO_INDICATORS) {
            if (!enabledIndicators[ind.key]) continue;
            const pts = rawData[ind.key] ?? [];
            if (pts.length > 0) {
                charts.push({ key: ind.key, name: ind.name, color: '#f59e0b',
                    points: pts, isMacro: true, isHistogram: false });
            }
        }

        return charts;
    }, [enabledIndicators, rawData]);

    if (activeCharts.length === 0) return null;

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            {activeCharts.map(chart => (
                <IndicatorChart
                    key={chart.key}
                    chart={chart}
                    playbackTime={playbackTime}
                    onCrosshairMove={(t) => setHoveredTime(t)}
                    syncTime={state.hoveredTime}
                />
            ))}
        </div>
    );
}

// Re-export so page.tsx imports continue to work
export { QUANT_INDICATORS as CHART_INDICATORS };
export const MACRO_DEFINITIONS: Record<string, { name: string; symbol: string }> =
    Object.fromEntries(MACRO_INDICATORS.map(i => [i.key, { name: i.name, symbol: MACRO_FRED[i.key] ?? '' }]));
