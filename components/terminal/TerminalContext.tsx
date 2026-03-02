"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { terminalStore } from './core/store/TerminalStore';
import type { TerminalConfig, IndicatorConfig, TradeAxisConfig, StrategyConfig, SelectedItemType } from './core/store/types';
import type { TrendlineConfig } from './core/models/Trendline';
import type { EarlyPivotConfig } from './core/models/EarlyPivot';

// ─── Context ────────────────────────────────────────────────────

const TerminalContext = createContext<ReturnType<typeof buildApi> | null>(null);

function buildApi(tick: number) {
    const layout = terminalStore.layout;
    const fm     = terminalStore.filterManager;
    const pb     = terminalStore.playbackManager;
    const pm     = terminalStore.pivotManager;
    const tm     = terminalStore.trendlineManager;
    const epm    = terminalStore.earlyPivotManager;

    // Stable method references (closures over singletons — references never change)
    const methods = {
        setConfig:           (c: Partial<TerminalConfig>) => layout.setConfig(c),
        setPreviewConfig:    (c: Partial<TerminalConfig> | null) => layout.setPreviewConfig(c),
        setIndicatorConfig:  (c: Partial<IndicatorConfig>) => layout.setIndicatorConfig(c),
        setTradeAxisConfig:  (c: Partial<TradeAxisConfig>) => layout.setTradeAxisConfig(c),
        setStrategyConfig:   (c: Partial<StrategyConfig>) => layout.setStrategyConfig(c),
        setSelectedItem:     (t: SelectedItemType, k: string | null) => layout.setSelectedItem(t, k),
        toggleIndicator:     (k: string) => layout.toggleIndicator(k),
        setTradeAxisPivots:  (p: unknown[]) => fm.setTradeAxisPivots(p),
        setTradeAxisData:    (d: unknown[]) => fm.setTradeAxisData(d),
        setHoveredTime:      (t: number | null) => layout.setHoveredTime(t),
        setActiveAsset:      (a: unknown) => layout.setActiveAsset(a),
        playTimeline:        () => layout.playTimeline(),
        pauseTimeline:       () => layout.pauseTimeline(),
        stopTimeline:        () => layout.stopTimeline(),
        regenerateRandom:    () => layout.regenerateRandomSeed(),
        setPlaybackTime:     (t: number | null) => layout.setPlaybackTime(t),
        setPlaybackSpeed:    (s: number) => layout.setPlaybackSpeed(s),
        setIndicatorAreaRatio: (r: number) => layout.setIndicatorAreaRatio(r),
        setLeftSidebarWidth:   (w: number) => layout.setLeftSidebarWidth(w),
        setRightSidebarWidth:  (w: number) => layout.setRightSidebarWidth(w),
        setTopBarHeight:       (h: number) => layout.setTopBarHeight(h),
        setBottomBarHeight:    (h: number) => layout.setBottomBarHeight(h),
        toggleLeftSidebar:  () => layout.toggleLeftSidebar(),
        toggleRightSidebar: () => layout.toggleRightSidebar(),
        toggleTopBar:       () => layout.toggleTopBar(),
        toggleBottomBar:    () => layout.toggleBottomBar(),
        setVisibleTimeRange: (r: { from: number; to: number } | null) => layout.setVisibleTimeRange(r),
        setDataTimeRange: (r: { from: number; to: number; boundaryTime?: number } | null) => {
            layout.dataTimeRange = r;
            layout.notify();
        },
        PlaybackNextMinute: () => pb.nextMinute(),
        PlaybackPrevMinute: () => pb.prevMinute(),
        PlaybackNextDay:    () => pb.nextDay(),
        PlaybackPrevDay:    () => pb.prevDay(),

        // ─── Pivot controls ───────────────────────────────────────────────────
        setPivotsEnabled:   (on: boolean) => pm.setEnabled(on),
        setPivotWindowSize: (w: number)   => pm.setWindowSize(w),

        // ─── Trendline controls ───────────────────────────────────────────────
        setTrendlinesEnabled: (on: boolean)                  => tm.setEnabled(on),
        setTrendlineConfig:   (p: Partial<TrendlineConfig>)  => tm.setConfig(p),

        // ─── Early pivot controls ─────────────────────────────────────────────
        setEarlyPivotConfig: (p: Partial<EarlyPivotConfig>) => epm.setConfig(p),
    };

    return {
        store: terminalStore,
        state: {
            ...layout,
            enabledIndicators: layout.enabledIndicators,
            tradeAxisData:     fm.tradeAxisData,
            tradeAxisPivots:   fm.tradeAxisPivots,

            // ── Pivot state ──────────────────────────────────────────────────
            pivots:          pm.pivots,
            pivotsEnabled:   pm.enabled,
            pivotWindowSize: pm.windowSize,

            // ── Trendline state ──────────────────────────────────────────────
            trendlines:        tm.trendlines,
            trendlinesEnabled: tm.enabled,
            trendlineConfig:   tm.config,

            // ── Early pivot state ────────────────────────────────────────────
            earlyPivots:           epm.provisionalPivots,
            earlyConfirmedPivots:  epm.confirmedEarlyPivots,
            earlyPivotConfig:      epm.config,
        },
        ...methods,
    };
}

// ─── Provider ───────────────────────────────────────────────────

export function TerminalProvider({ children }: { children: React.ReactNode }) {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const bump = () => setTick(t => t + 1);
        const unsubs = [
            terminalStore.layout.subscribe(bump),
            terminalStore.marketData.subscribe(bump),
            terminalStore.filterManager.subscribe(bump),
            terminalStore.backtestManager.subscribe(bump),
            terminalStore.playbackManager.subscribe(bump),
            terminalStore.pivotManager.subscribe(bump),
            terminalStore.trendlineManager.subscribe(bump),
            terminalStore.earlyPivotManager.subscribe(bump),
        ];
        return () => unsubs.forEach(u => u());
    }, []);

    const api = useMemo(() => buildApi(tick), [tick]);

    return <TerminalContext.Provider value={api}>{children}</TerminalContext.Provider>;
}

// ─── Hooks ──────────────────────────────────────────────────────

export function useTerminal() {
    const ctx = useContext(TerminalContext);
    if (!ctx) throw new Error('useTerminal must be used within TerminalProvider');
    return ctx;
}

export function useLayout()     { return useTerminal().store.layout; }
export function useMarketData() { return useTerminal().store.marketData; }
export function useFilters()    { return useTerminal().store.filterManager; }
export function useBacktest()   { return useTerminal().store.backtestManager; }
export function usePlayback()   { return useTerminal().store.playbackManager; }
export function usePivots()     { return useTerminal().store.pivotManager; }
