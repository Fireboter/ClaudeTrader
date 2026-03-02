"use client";

import React, { useMemo } from 'react';
import { useTerminal } from '../../TerminalContext';

export function ConfidenceConfigPanel() {
    const { state, setStrategyConfig } = useTerminal();
    const config = state.strategyConfig;

    return useMemo(() => (
        <div className="space-y-4">
            <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">
                    Long Entry Threshold: <span className="text-emerald-400">{config.longThreshold}%</span>
                </label>
                <input type="range" min="50" max="95" step="1" value={config.longThreshold}
                    onChange={e => setStrategyConfig({ longThreshold: parseInt(e.target.value) })} className="w-full accent-emerald-500" />
            </div>
            <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">
                    Short Entry Threshold: <span className="text-red-400">{config.shortThreshold}%</span>
                </label>
                <input type="range" min="5" max="50" step="1" value={config.shortThreshold}
                    onChange={e => setStrategyConfig({ shortThreshold: parseInt(e.target.value) })} className="w-full accent-red-500" />
            </div>
            <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">
                    Exit Confidence: <span className="text-amber-400">{config.exitThreshold}%</span>
                </label>
                <input type="range" min="5" max="50" step="1" value={config.exitThreshold}
                    onChange={e => setStrategyConfig({ exitThreshold: parseInt(e.target.value) })} className="w-full accent-amber-500" />
            </div>
            <div className="border-t border-slate-800 pt-4 mt-4">
                <label className="block text-xs uppercase text-slate-500 font-bold mb-3">Risk Management</label>
                {([
                    ['Stop Loss %', 'stopLoss', 0.1],
                    ['Take Profit %', 'takeProfit', 0.1],
                    ['Leverage', 'leverage', 1],
                    ['Risk per Trade %', 'riskPerTrade', 0.5],
                ] as [string, string, number][]).map(([label, key, step]) => (
                    <div key={key} className="mb-3">
                        <label className="block text-xs text-slate-500 mb-1">{label}</label>
                        <input type="number" step={step} value={(config as any)[key]}
                            onChange={e => setStrategyConfig({ [key]: parseFloat(e.target.value) })}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" />
                    </div>
                ))}
            </div>
        </div>
    ), [state.strategyConfig, setStrategyConfig]);
}
