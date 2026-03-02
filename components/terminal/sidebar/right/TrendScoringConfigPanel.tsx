"use client";

import React, { useMemo } from 'react';
import { useTerminal } from '../../TerminalContext';

export function TrendScoringConfigPanel() {
    const { state, setStrategyConfig } = useTerminal();
    const config = state.strategyConfig;

    return useMemo(() => (
        <div className="space-y-4">
            <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">Scoring Weights</label>
                <div className="grid grid-cols-2 gap-3">
                    {([
                        ['Time Passed', 'trendScoreTimeWeight'],
                        ['Pivots Through', 'trendScorePivotWeight'],
                        ['Closeness', 'trendScoreClosenessWeight'],
                        ['Slope', 'trendScoreSlopeWeight'],
                    ] as const).map(([label, key]) => (
                        <div key={key}>
                            <label className="block text-xs text-slate-500 mb-1">{label}</label>
                            <input type="number" step="0.1" value={(config as any)[key]}
                                onChange={e => setStrategyConfig({ [key]: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" />
                        </div>
                    ))}
                </div>
            </div>
            <div className="border-t border-slate-800 pt-3 grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Closeness %</label>
                    <input type="number" step="0.1" value={config.trendScoreClosenessPct}
                        onChange={e => setStrategyConfig({ trendScoreClosenessPct: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Slope Ref</label>
                    <input type="number" step="0.001" value={config.trendScoreSlopeRef}
                        onChange={e => setStrategyConfig({ trendScoreSlopeRef: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" />
                </div>
                <div className="col-span-2 text-[10px] text-slate-600">Scores are normalized to 0-100 using the enabled weights.</div>
            </div>
        </div>
    ), [state.strategyConfig, setStrategyConfig]);
}
