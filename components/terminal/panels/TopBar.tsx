"use client";

import React from 'react';
import { useTerminal } from '../TerminalContext';

/**
 * Debug / Information panel displayed at the top of the terminal.
 * Shows current configuration state and debug info.
 */
export default function TopBar() {
    const { state } = useTerminal();
    const { config, tradeAxisConfig, strategyConfig, enabledIndicators, playbackTime, timelineEnabled } = state;

    const activeIndicators = Object.entries(enabledIndicators)
        .filter(([_, v]) => v)
        .map(([k]) => k);

    return (
        <div className="p-4 text-xs text-slate-400 space-y-3 font-mono">
            <div>
                <span className="text-slate-500 uppercase font-bold">Config:</span>{' '}
                {config.symbol} | 1m | {config.mode}
                {config.mode === 'random'
                    ? ` | ${config.years}Y ${config.months}M ${config.days}D`
                    : ` | ${config.startDate} → ${config.endDate}`
                }
            </div>

            <div>
                <span className="text-slate-500 uppercase font-bold">TradeAxis:</span>{' '}
                window={tradeAxisConfig.windowSize} tol={tradeAxisConfig.tolerance} minPivots={tradeAxisConfig.minPivots}
                {' '}bestFit={tradeAxisConfig.filterBestFit ? 'ON' : 'OFF'}
                {' '}anchor={tradeAxisConfig.bestFitUseAnchorGrouping ? 'ON' : 'OFF'}
                {' '}nms={tradeAxisConfig.bestFitUseNMS ? 'ON' : 'OFF'}
            </div>

            <div>
                <span className="text-slate-500 uppercase font-bold">Strategy:</span>{' '}
                SL={strategyConfig.stopLoss}% TP={strategyConfig.takeProfit}%
                {' '}equity=${strategyConfig.initialEquity.toLocaleString()}
                {' '}closest={strategyConfig.useClosestFilter ? strategyConfig.closestFilterCount : 'OFF'}
                {' '}valuable={strategyConfig.useMostValuableFilter ? strategyConfig.mostValuableFilterCount : 'OFF'}
            </div>

            <div>
                <span className="text-slate-500 uppercase font-bold">Active ({activeIndicators.length}):</span>{' '}
                {activeIndicators.length > 0 ? activeIndicators.join(', ') : 'none'}
            </div>

            {timelineEnabled && (
                <div>
                    <span className="text-slate-500 uppercase font-bold">Playback:</span>{' '}
                    {playbackTime ? new Date(playbackTime * 1000).toISOString().split('T')[0] : 'not started'}
                </div>
            )}
        </div>
    );
}
