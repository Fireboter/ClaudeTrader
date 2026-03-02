"use client";

import React, { useRef, useCallback, ReactNode, useState, useEffect } from 'react';
import { useTerminal } from '../TerminalContext';
import { ResizeHandle } from './ResizeHandle';
import { SidebarRail } from './SidebarRail';
import { HorizontalBarRail } from './HorizontalBarRail';
import TimelineBar from '../panels/TimelineBar';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Menu, Settings, BarChart3, Bug } from 'lucide-react';

interface TerminalLayoutProps {
    leftSidebar: ReactNode;
    rightSidebar: ReactNode;
    topBar: ReactNode;
    bottomBar: ReactNode;
    children: ReactNode;
}

export default function TerminalLayout({ leftSidebar, rightSidebar, topBar, bottomBar, children }: TerminalLayoutProps) {
    const {
        state,
        toggleLeftSidebar, toggleRightSidebar, toggleTopBar, toggleBottomBar,
        setLeftSidebarWidth, setRightSidebarWidth, setTopBarHeight, setBottomBarHeight,
    } = useTerminal();

    const containerRef = useRef<HTMLDivElement>(null);

    // Defer layout-state-driven rendering until after hydration.
    // LayoutManager.loadState() reads localStorage on the client, so sidebar
    // open/closed state may differ from the server-rendered defaults.
    // We SSR the "closed" (rail) form for every panel, then swap in the real
    // state after mount — this way server and client HTML always match.
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const handleLeftResize = useCallback((delta: number) => {
        if (!containerRef.current) return;
        setLeftSidebarWidth(state.leftSidebarWidth + delta / containerRef.current.offsetWidth);
    }, [state.leftSidebarWidth, setLeftSidebarWidth]);

    const handleRightResize = useCallback((delta: number) => {
        if (!containerRef.current) return;
        setRightSidebarWidth(state.rightSidebarWidth - delta / containerRef.current.offsetWidth);
    }, [state.rightSidebarWidth, setRightSidebarWidth]);

    const handleTopResize = useCallback((delta: number) => {
        if (!containerRef.current) return;
        setTopBarHeight(state.topBarHeight + delta / containerRef.current.offsetHeight);
    }, [state.topBarHeight, setTopBarHeight]);

    const handleBottomResize = useCallback((delta: number) => {
        if (!containerRef.current) return;
        setBottomBarHeight(state.bottomBarHeight - delta / containerRef.current.offsetHeight);
    }, [state.bottomBarHeight, setBottomBarHeight]);

    // Use real state only after mount; fall back to defaults while SSR.
    const topBarOpen     = mounted && state.topBarOpen;
    const bottomBarOpen  = mounted && state.bottomBarOpen;
    const leftSidebarOpen  = mounted && state.leftSidebarOpen;
    const rightSidebarOpen = mounted && state.rightSidebarOpen;

    const leftWidth  = leftSidebarOpen  ? `${state.leftSidebarWidth  * 100}%` : '40px';
    const rightWidth = rightSidebarOpen ? `${state.rightSidebarWidth * 100}%` : '40px';

    return (
        <div ref={containerRef} className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden">

            {/* Top Bar */}
            {topBarOpen ? (
                <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800 overflow-hidden flex flex-col" style={{ height: `${state.topBarHeight * 100}%` }}>
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/80 flex-shrink-0">
                            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                                <Bug className="w-4 h-4" />
                                Debug & Information
                            </div>
                            <button onClick={toggleTopBar} className="p-1 hover:bg-slate-700 rounded transition-colors">
                                <ChevronUp className="w-4 h-4 text-slate-400" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto">{topBar}</div>
                    </div>
                    <ResizeHandle direction="vertical" onDrag={handleTopResize} />
                </div>
            ) : (
                <HorizontalBarRail position="top" onOpen={toggleTopBar} icon={<Bug className="w-4 h-4 text-slate-500" />} />
            )}

            {/* Main Area */}
            <div className="flex-1 flex min-h-0">

                {/* Left Sidebar */}
                {leftSidebarOpen ? (
                    <>
                        <div className="flex-shrink-0 bg-slate-900 border-r border-slate-800 overflow-hidden flex flex-col" style={{ width: leftWidth }}>
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex-shrink-0">
                                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                                    <Menu className="w-4 h-4 text-emerald-400" />
                                    Menu
                                </div>
                                <button onClick={toggleLeftSidebar} className="p-1 hover:bg-slate-700 rounded transition-colors">
                                    <ChevronLeft className="w-4 h-4 text-slate-400" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto">{leftSidebar}</div>
                        </div>
                        <ResizeHandle direction="horizontal" onDrag={handleLeftResize} />
                    </>
                ) : (
                    <SidebarRail side="left" onOpen={toggleLeftSidebar} icon={<Menu className="w-5 h-5 text-slate-400" />} />
                )}

                {/* Center Content */}
                <div className="flex-1 flex flex-col min-w-0">
                    <TimelineBar />
                    <div className="flex-1 min-h-0 overflow-hidden">{children}</div>

                    {/* Bottom Bar */}
                    {bottomBarOpen ? (
                        <>
                            <ResizeHandle direction="vertical" onDrag={handleBottomResize} />
                            <div className="flex-shrink-0 bg-slate-900 border-t border-slate-800 overflow-hidden flex flex-col" style={{ height: `${state.bottomBarHeight * 100}%` }}>
                                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/80 flex-shrink-0">
                                    <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                                        <BarChart3 className="w-4 h-4" />
                                        Backtest & Metrics
                                    </div>
                                    <button onClick={toggleBottomBar} className="p-1 hover:bg-slate-700 rounded transition-colors">
                                        <ChevronDown className="w-4 h-4 text-slate-400" />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-auto">{bottomBar}</div>
                            </div>
                        </>
                    ) : (
                        <HorizontalBarRail position="bottom" onOpen={toggleBottomBar} icon={<BarChart3 className="w-4 h-4 text-slate-500" />} />
                    )}
                </div>

                {/* Right Sidebar */}
                {rightSidebarOpen ? (
                    <>
                        <ResizeHandle direction="horizontal" onDrag={handleRightResize} />
                        <div className="flex-shrink-0 bg-slate-900 border-l border-slate-800 overflow-hidden flex flex-col" style={{ width: rightWidth }}>
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex-shrink-0">
                                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                                    <Settings className="w-4 h-4 text-amber-400" />
                                    Configuration
                                </div>
                                <button onClick={toggleRightSidebar} className="p-1 hover:bg-slate-700 rounded transition-colors">
                                    <ChevronRight className="w-4 h-4 text-slate-400" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto">{rightSidebar}</div>
                        </div>
                    </>
                ) : (
                    <SidebarRail side="right" onOpen={toggleRightSidebar} icon={<Settings className="w-5 h-5 text-slate-400" />} />
                )}

            </div>
        </div>
    );
}
