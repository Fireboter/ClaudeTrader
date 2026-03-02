"use client";

import React, { useMemo } from 'react';
import { useTerminal } from '../../TerminalContext';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';

const PATTERN_TYPES = [
    { key: 'double_top', name: 'Double Top' },
    { key: 'double_bottom', name: 'Double Bottom' },
    { key: 'head_shoulders', name: 'Head & Shoulders' },
    { key: 'inv_head_shoulders', name: 'Inv. H&S' },
    { key: 'ascending_triangle', name: 'Ascending Triangle' },
    { key: 'descending_triangle', name: 'Descending Triangle' },
    { key: 'symmetric_triangle', name: 'Symmetric Triangle' },
    { key: 'wedge', name: 'Wedge' },
    { key: 'flag', name: 'Flag/Pennant' },
    { key: 'channel', name: 'Channel' },
];

export function PatternConfigPanel() {
    const { state, toggleIndicator } = useTerminal();

    return useMemo(() => (
        <div className="space-y-4">
            <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/50">
                <label className="flex items-center justify-between cursor-pointer">
                    <div>
                        <span className="text-sm font-medium text-slate-200">Trend Indicator</span>
                        <div className="text-xs text-slate-500">Show trend direction (-1 to 1)</div>
                    </div>
                    <ToggleSwitch enabled={state.enabledIndicators['pattern_trend'] || false}
                        onChange={() => toggleIndicator('pattern_trend')} color="#8b5cf6" />
                </label>
            </div>

            <div className="text-sm text-slate-400 mb-2 mt-4">Select patterns to detect:</div>
            <div className="space-y-2">
                {PATTERN_TYPES.map(pt => (
                    <label key={pt.key} className="flex items-center gap-3 cursor-pointer hover:bg-slate-800/50 px-2 py-1.5 rounded">
                        <input type="checkbox" checked={state.enabledIndicators[`pattern_${pt.key}`] || false}
                            onChange={() => toggleIndicator(`pattern_${pt.key}`)} className="accent-blue-500" />
                        <span className="text-sm text-slate-300">{pt.name}</span>
                    </label>
                ))}
            </div>

            <div className="border-t border-slate-800 pt-4 mt-4">
                <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors">Train Model</button>
                <button className="w-full py-2 mt-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-medium transition-colors">Manual Debug</button>
            </div>
        </div>
    ), [state.enabledIndicators, toggleIndicator]);
}
