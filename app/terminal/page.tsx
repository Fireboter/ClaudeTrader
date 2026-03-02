"use client";

import React, { useRef, useCallback, useMemo } from 'react';
import { TerminalProvider, useTerminal } from '../../components/terminal/TerminalContext';
import TerminalLayout from '../../components/terminal/layout/TerminalLayout';
import LeftSidebar from '../../components/terminal/sidebar/left/LeftSidebar';
import RightSidebar from '../../components/terminal/sidebar/right/RightSidebar';
import TopBar from '../../components/terminal/panels/TopBar';
import BottomBar from '../../components/terminal/panels/BottomBar';
import MainChart from '../../components/terminal/chart/MainChart';
import IndicatorCharts, { CHART_INDICATORS, MACRO_DEFINITIONS } from '../../components/terminal/chart/IndicatorCharts';

// ─── Constants ───────────────────────────────────────────────────

const MIN_INDICATOR_RATIO = 0.1;
const MAX_INDICATOR_RATIO = 0.8;

// ─── Terminal Content (Chart + Indicator sub-charts) ─────────────

function TerminalContent() {
    const { state, setIndicatorAreaRatio } = useTerminal();
    const { indicatorAreaRatio, enabledIndicators } = state;
    const containerRef = useRef<HTMLDivElement>(null);
    const isResizingRef = useRef(false);

    const hasActiveChartIndicators = useMemo(() => {
        const hasStandard = CHART_INDICATORS.some(ind => enabledIndicators[ind.key]);
        const hasMacro = Object.keys(MACRO_DEFINITIONS).some(key => enabledIndicators[key]);
        return hasStandard || hasMacro;
    }, [enabledIndicators]);

    const handleMouseDown = useCallback(() => {
        isResizingRef.current = true;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const handleMouseUp = useCallback(() => {
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizingRef.current || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const indicatorHeight = rect.height - (e.clientY - rect.top);
        let ratio = indicatorHeight / rect.height;
        ratio = Math.max(MIN_INDICATOR_RATIO, Math.min(MAX_INDICATOR_RATIO, ratio));
        setIndicatorAreaRatio(ratio);
    }, [setIndicatorAreaRatio]);

    React.useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const mainHeight = hasActiveChartIndicators
        ? `${(1 - indicatorAreaRatio) * 100}%`
        : '100%';

    return (
        <div ref={containerRef} className="h-full flex flex-col relative overflow-hidden">
            {/* Main Price Chart */}
            <div
                style={{ height: mainHeight, maxHeight: mainHeight }}
                className="min-h-0 relative flex-shrink-0 z-0 overflow-hidden isolate"
            >
                <MainChart />
            </div>

            {hasActiveChartIndicators && (
                <>
                    {/* Indicator / Chart resize handle */}
                    <div
                        className="h-1 bg-slate-800 hover:bg-blue-500 cursor-row-resize transition-colors z-20 flex-shrink-0 relative"
                        onMouseDown={handleMouseDown}
                    />

                    {/* Indicator Sub-Charts */}
                    <div
                        style={{ height: `${indicatorAreaRatio * 100}%` }}
                        className="min-h-0 overflow-auto flex flex-col flex-shrink-0 relative z-10"
                    >
                        <IndicatorCharts />
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Page ────────────────────────────────────────────────────────

export default function TerminalPage() {
    return (
        <TerminalProvider>
            <TerminalLayout
                leftSidebar={<LeftSidebar />}
                rightSidebar={<RightSidebar />}
                topBar={<TopBar />}
                bottomBar={<BottomBar />}
            >
                <TerminalContent />
            </TerminalLayout>
        </TerminalProvider>
    );
}
