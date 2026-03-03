"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { ISeriesApi } from 'lightweight-charts';
import { useTerminal } from '../TerminalContext';
import { ChartManager } from '../core/managers/ChartManager';
import type { DayCandle } from '../core/models/Candle';
import { toTVCandle, toTVVolume } from '../core/models/Candle';
import { PivotOverlay } from './PivotOverlay';
import { TrendlineOverlay } from './TrendlineOverlay';
import { EarlyPivotOverlay } from './EarlyPivotOverlay';
import { SignalOverlay } from './SignalOverlay';
import { BoundaryOverlay } from './BoundaryOverlay';
import type { IChartApi } from 'lightweight-charts';
import axios from 'axios';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:9001';

/**
 * MainChart — always displays daily bars. Minute data is used only to update
 * the last (current) day's candle in real time as you step through minutes,
 * exactly as if you were watching a live daily candle form.
 *
 * Keyboard navigation (click chart to focus):
 *   ← / →  — step back / forward one day
 *   ↑ / ↓  — step forward / back one minute within the current day
 */
export default function MainChart() {
    const terminal = useTerminal();
    const { state, setDataTimeRange } = terminal;
    const {
        config, playbackTime, randomSeed,
        pivots, pivotsEnabled,
        trendlines, trendlinesEnabled, trendlineConfig,
        earlyPivots, earlyConfirmedPivots, earlyPivotConfig,
        signals, activeTrade, tradeAxisConfig,
    } = state;

    const containerRef = useRef<HTMLDivElement>(null);
    const chartMgrRef  = useRef<ChartManager | null>(null);

    const [days,         setDays]         = useState<DayCandle[]>([]);
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState<string | null>(null);
    // Expose the candleSeries reference to PivotOverlay via React state so it
    // re-renders when the chart remounts (Strict Mode / symbol change).
    const [candleSeries, setCandleSeries] = useState<ISeriesApi<"Candlestick"> | null>(null);
    const [chartApi,     setChartApi]     = useState<IChartApi | null>(null);
    const [preHistoryCount, setPreHistoryCount] = useState(0);

    const layout   = terminal.store.layout;
    const market   = terminal.store.marketData;
    const playback = terminal.store.playbackManager;

    // ─── Create / destroy chart ───────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return;
        const mgr = new ChartManager(layout);
        mgr.mount(containerRef.current);
        chartMgrRef.current = mgr;
        setCandleSeries(mgr.candleSeries);
        setChartApi(mgr.chart);
        return () => {
            mgr.unmount();
            chartMgrRef.current = null;
            setCandleSeries(null);
            setChartApi(null);
        };
    }, [layout]);

    // ─── Fetch all data in one request ────────────────────────────────────────
    useEffect(() => {
        if (!config.symbol) return;

        let cancelled = false;
        setLoading(true);
        setError(null);
        setDays([]);
        market.setDays([]);

        const params: Record<string, string | number> = {
            symbol: config.symbol,
            mode:   config.mode,
        };

        if (config.mode === 'fixed') {
            params.start_date = config.startDate;
            params.end_date   = config.endDate;
        } else {
            const dur = (config.years * 365) + (config.months * 30) + config.days;
            params.duration_days = dur > 0 ? dur : 365;
            params.seed          = randomSeed;
        }

        const stratCfg = terminal.store.layout.strategyConfig;
        if (stratCfg.preHistoryBars > 0) {
            params.prehistory_bars = stratCfg.preHistoryBars;
        }

        axios.get<{ days: DayCandle[]; boundary_time?: number }>(`${API}/api/candles/full`, { params })
            .then(res => {
                if (cancelled) return;
                const data       = res.data.days        ?? [];
                const boundaryTs = res.data.boundary_time ?? null;
                if (data.length === 0) {
                    setError(`No data for ${config.symbol} in this range`);
                    return;
                }

                // Derive preHistoryCount from boundary_time
                const phCount   = boundaryTs != null
                    ? data.findIndex((d: { time: number }) => d.time === boundaryTs)
                    : 0;
                const safeCount = phCount < 0 ? 0 : phCount;

                setDays(data);
                setPreHistoryCount(safeCount);
                market.setDays(data, safeCount);
                setDataTimeRange({
                    from: data[0].time,
                    to:   data[data.length - 1].time,
                    ...(boundaryTs != null ? { boundaryTime: boundaryTs } : {}),
                });
            })
            .catch(err => {
                if (cancelled) return;
                const detail = err?.response?.data?.detail ?? err?.message ?? 'Failed to load candles';
                console.error('Candle fetch failed:', detail);
                setError(detail);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.symbol, config.mode, config.startDate, config.endDate,
        config.years, config.months, config.days, randomSeed,
        state.strategyConfig.preHistoryBars]);

    // ─── Compute visible daily bars ───────────────────────────────────────────
    const { priceBars, volumeBars, visibleDays } = useMemo(() => {
        if (days.length === 0) return { priceBars: [], volumeBars: [], visibleDays: [] };

        if (playbackTime === null) {
            return {
                priceBars:   days.map(toTVCandle),
                volumeBars:  days.map(toTVVolume),
                visibleDays: days,
            };
        }

        // Find the active day: last day whose UTC-midnight ≤ playbackTime
        let activeDayIdx = -1;
        for (let i = 0; i < days.length; i++) {
            if (days[i].time <= playbackTime) activeDayIdx = i;
            else break;
        }
        if (activeDayIdx < 0) return { priceBars: [], volumeBars: [], visibleDays: [] };

        const activeDay = days[activeDayIdx];

        // Synthesise live daily candle from minutes seen so far
        let liveDay = activeDay;
        const seenMins = activeDay.minutes.filter(m => m.time <= playbackTime);
        if (seenMins.length > 0) {
            liveDay = {
                ...activeDay,
                open:   seenMins[0].open,
                high:   Math.max(...seenMins.map(m => m.high)),
                low:    Math.min(...seenMins.map(m => m.low)),
                close:  seenMins[seenMins.length - 1].close,
                volume: seenMins.reduce((s, m) => s + m.volume, 0),
            };
        }

        const vDays = [...days.slice(0, activeDayIdx), liveDay];
        return {
            priceBars:   vDays.map(toTVCandle),
            volumeBars:  vDays.map(toTVVolume),
            visibleDays: vDays,
        };
    }, [days, playbackTime]);

    // ─── Split visible bars into pre-history (grey series) and main ───────────
    const { preHistPriceBars, mainPriceBars, mainVolumeBars } = useMemo(() => {
        if (preHistoryCount <= 0 || priceBars.length <= preHistoryCount) {
            return {
                preHistPriceBars: [] as typeof priceBars,
                mainPriceBars:    priceBars,
                mainVolumeBars:   volumeBars,
            };
        }
        return {
            preHistPriceBars: priceBars.slice(0, preHistoryCount),
            mainPriceBars:    priceBars.slice(preHistoryCount),
            mainVolumeBars:   volumeBars.slice(preHistoryCount),
        };
    }, [priceBars, volumeBars, preHistoryCount]);

    // ─── Push price/volume data to chart ──────────────────────────────────────
    useEffect(() => {
        const mgr = chartMgrRef.current;
        if (!mgr) return;
        mgr.setPreHistoryData(preHistPriceBars);
        if (mainPriceBars.length > 0) {
            mgr.setPriceData(mainPriceBars);
            mgr.setVolumeData(mainVolumeBars);
        }
        if (playbackTime === null && (preHistPriceBars.length + mainPriceBars.length) > 0) {
            mgr.fitContent();
        }
    }, [preHistPriceBars, mainPriceBars, mainVolumeBars, playbackTime]);

    // ─── Keyboard navigation ──────────────────────────────────────────────────
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        switch (e.key) {
            case 'ArrowRight': e.preventDefault(); playback.nextDay();    break;
            case 'ArrowLeft':  e.preventDefault(); playback.prevDay();    break;
            case 'ArrowUp':    e.preventDefault(); playback.nextMinute(); break;
            case 'ArrowDown':  e.preventDefault(); playback.prevMinute(); break;
        }
    }, [playback]);

    return (
        <div
            className="h-full w-full relative outline-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 z-20 pointer-events-none">
                    <span className="text-slate-400 text-sm animate-pulse">Loading {config.symbol}…</span>
                </div>
            )}
            {!loading && error && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 z-20 pointer-events-none">
                    <span className="text-red-400 text-sm">{error}</span>
                </div>
            )}

            <div ref={containerRef} className="h-full w-full" />

            {/* Renderless — attaches pivot markers to the chart */}
            <PivotOverlay
                series={candleSeries}
                pivots={pivots}
                enabled={pivotsEnabled}
            />

            {/* SVG trendline overlay */}
            <TrendlineOverlay
                chart={chartApi}
                series={candleSeries}
                days={visibleDays}
                trendlines={trendlines}
                config={trendlineConfig}
                enabled={trendlinesEnabled}
            />

            {/* SVG early pivot overlay — provisional markers, threshold lines, superseded */}
            <EarlyPivotOverlay
                chart={chartApi}
                series={candleSeries}
                days={visibleDays}
                earlyPivots={[...earlyPivots, ...earlyConfirmedPivots].filter(p => p.dayIndex >= preHistoryCount)}
                config={earlyPivotConfig}
                enabled={earlyPivotConfig.enabled}
            />

            {/* Signal overlay — entry arrows + exit markers + SL/TP price lines */}
            <SignalOverlay
                chart={chartApi}
                series={candleSeries}
                days={visibleDays}
                signals={signals}
                activeTrade={activeTrade}
                enabled={tradeAxisConfig.useTouchDetection || tradeAxisConfig.useBreakoutDetection}
                useStopLoss={tradeAxisConfig.useStopLoss}
                useTakeProfit={tradeAxisConfig.useTakeProfit}
            />

            {/* Yellow dashed boundary line between pre-history and actual range */}
            <BoundaryOverlay
                chart={chartApi}
                series={candleSeries}
                boundaryTime={market.boundaryTime}
            />
        </div>
    );
}
