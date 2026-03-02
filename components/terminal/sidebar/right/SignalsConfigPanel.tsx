"use client";

import React, { useMemo } from 'react';
import { useTerminal } from '../../TerminalContext';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';

export function SignalsConfigPanel() {
    const { state, setTradeAxisConfig, setStrategyConfig } = useTerminal();
    const config = state.tradeAxisConfig;
    const strategyConfig = state.strategyConfig;

    return useMemo(() => (
        <div className="space-y-6">
            {/* Entry */}
            <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">Entry</label>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div><div className="text-sm text-slate-300">Pivot Confirmation Signals</div><div className="text-xs text-slate-500">Long/Short at minute when pivot confirms</div></div>
                        <ToggleSwitch enabled={config.useTouchDetection} onChange={() => setTradeAxisConfig({ useTouchDetection: !config.useTouchDetection })} />
                    </div>
                    <div className="flex items-center justify-between">
                        <div><div className="text-sm text-slate-300">Trend Line Breakout Detection</div><div className="text-xs text-slate-500">No pivot inside zone = breakout</div></div>
                        <ToggleSwitch enabled={config.useBreakoutDetection} onChange={() => setTradeAxisConfig({ useBreakoutDetection: !config.useBreakoutDetection })} />
                    </div>

                    <div className="border-t border-slate-800 pt-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm text-slate-300">Angle Filter</div>
                            <ToggleSwitch enabled={config.useAngleFilter} onChange={() => setTradeAxisConfig({ useAngleFilter: !config.useAngleFilter })} />
                        </div>
                        <div className={`grid grid-cols-2 gap-3 ${config.useAngleFilter ? '' : 'opacity-40'}`}>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Min Angle</label>
                                <input type="number" value={config.minAngle} onChange={e => setTradeAxisConfig({ minAngle: parseFloat(e.target.value) })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" disabled={!config.useAngleFilter} />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Max Angle</label>
                                <input type="number" value={config.maxAngle} onChange={e => setTradeAxisConfig({ maxAngle: parseFloat(e.target.value) })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" disabled={!config.useAngleFilter} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Exit */}
            <div className="border-t border-slate-800 pt-4">
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">Exit</label>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div><div className="text-sm text-slate-300">Exit on Trend Line Touch</div><div className="text-xs text-slate-500">Short exits at support, long at resistance</div></div>
                        <ToggleSwitch enabled={config.useZoneExit} onChange={() => setTradeAxisConfig({ useZoneExit: !config.useZoneExit })} />
                    </div>

                    <div className="border-t border-slate-800 pt-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm text-slate-300">Profit Protection</div>
                            <ToggleSwitch enabled={config.useProfitProtection} onChange={() => setTradeAxisConfig({ useProfitProtection: !config.useProfitProtection })} />
                        </div>
                        <div className={config.useProfitProtection ? '' : 'opacity-40'}>
                            <input type="range" min="0.1" max="5.0" step="0.1" value={config.profitProtection}
                                onChange={e => setTradeAxisConfig({ profitProtection: parseFloat(e.target.value) })} className="w-full accent-emerald-500" disabled={!config.useProfitProtection} />
                            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>Loose</span><span>{config.profitProtection}%</span><span>Tight</span></div>
                        </div>
                    </div>

                    <div className="border-t border-slate-800 pt-3 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-slate-300">Stop Loss</div>
                            <ToggleSwitch enabled={config.useStopLoss} onChange={() => setTradeAxisConfig({ useStopLoss: !config.useStopLoss })} />
                        </div>
                        <div className={config.useStopLoss ? '' : 'opacity-40'}>
                            <input type="number" step="0.1" value={strategyConfig.stopLoss} onChange={e => setStrategyConfig({ stopLoss: parseFloat(e.target.value) })}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" disabled={!config.useStopLoss} />
                            <div className="text-[10px] text-slate-600 mt-1">Percent loss from entry</div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <div className="text-sm text-slate-300">Take Profit</div>
                            <ToggleSwitch enabled={config.useTakeProfit} onChange={() => setTradeAxisConfig({ useTakeProfit: !config.useTakeProfit })} />
                        </div>
                        <div className={config.useTakeProfit ? '' : 'opacity-40'}>
                            <input type="number" step="0.1" value={strategyConfig.takeProfit} onChange={e => setStrategyConfig({ takeProfit: parseFloat(e.target.value) })}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" disabled={!config.useTakeProfit} />
                            <div className="text-[10px] text-slate-600 mt-1">Percent gain from entry</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ), [state.tradeAxisConfig, state.strategyConfig, setTradeAxisConfig, setStrategyConfig]);
}
