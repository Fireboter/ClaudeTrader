"use client";

import React, { useMemo } from 'react';
import { useTerminal } from '../../TerminalContext';

export function PreHistoryConfigPanel() {
    const { state, setStrategyConfig } = useTerminal();
    const config = state.strategyConfig;

    return useMemo(() => (
        <div className="space-y-4">
            <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">Pre-history Window</label>
                <input type="number" min="0" step="10" value={config.preHistoryBars}
                    onChange={e => setStrategyConfig({ preHistoryBars: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" />
                <div className="text-[10px] text-slate-600 mt-1">Number of bars shown before the selected range.</div>
            </div>
        </div>
    ), [state.strategyConfig.preHistoryBars, setStrategyConfig]);
}
