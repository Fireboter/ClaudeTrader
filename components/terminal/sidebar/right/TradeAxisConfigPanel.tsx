"use client";

import React, { useMemo } from 'react';
import { useTerminal } from '../../TerminalContext';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';

export function TradeAxisConfigPanel() {
    const { state, setTradeAxisConfig, setStrategyConfig } = useTerminal();
    const config = state.tradeAxisConfig;
    const strategyConfig = state.strategyConfig;

    return useMemo(() => (
        <div className="space-y-6">
            {/* Pivots Filter */}
            <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">Pivots Filter</label>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Window Size <span className="text-slate-400">(bars)</span></label>
                        <input type="range" min="1" max="20" step="1" value={config.windowSize}
                            onChange={e => setTradeAxisConfig({ windowSize: parseInt(e.target.value) })} className="w-full accent-emerald-500" />
                        <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>Short</span><span>{config.windowSize} bars</span><span>Long</span></div>
                    </div>
                </div>
            </div>

            {/* Trendline Filter */}
            <div className="border-t border-slate-800 pt-4">
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">Trendline Filter</label>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Min Pivots per Line</label>
                        <input type="range" min="2" max="10" step="1" value={config.minPivots}
                            onChange={e => setTradeAxisConfig({ minPivots: parseInt(e.target.value) })} className="w-full accent-emerald-500" />
                        <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>Loose</span><span>{config.minPivots} pivots</span><span>Strict</span></div>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Tolerance <span className="text-slate-400">(line fit)</span></label>
                        <input type="range" min="0.001" max="0.02" step="0.001" value={config.tolerance}
                            onChange={e => setTradeAxisConfig({ tolerance: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
                        <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>Loose</span><span>{(config.tolerance * 100).toFixed(2)}%</span><span>Tight</span></div>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Error Rate <span className="text-slate-400">(0-10%)</span></label>
                        <input type="range" min="0" max="0.10" step="0.001" value={config.errorRate}
                            onChange={e => setTradeAxisConfig({ errorRate: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
                        <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>0%</span><span>{(config.errorRate * 100).toFixed(2)}%</span><span>10%</span></div>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Proximity to Price</label>
                        <input type="range" min="0" max="1" step="0.05" value={config.proximity}
                            onChange={e => setTradeAxisConfig({ proximity: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
                        <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>Show Many</span><span>{(config.proximity * 100).toFixed(0)}% band</span><span>Very Close</span></div>
                    </div>

                    {/* Best Fit / NMS Logic */}
                    <div className="border-t border-slate-800 pt-4 mt-2">
                        <label className="block text-xs uppercase text-slate-500 font-bold mb-3">Best Fit Logic</label>

                        <div className="bg-slate-800/30 rounded-lg p-3 mb-3">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <div className="text-sm text-slate-300">Anchor Grouping</div>
                                    <div className="text-xs text-slate-500">Group by start point</div>
                                </div>
                                <ToggleSwitch enabled={config.bestFitUseAnchorGrouping} onChange={() => setTradeAxisConfig({ bestFitUseAnchorGrouping: !config.bestFitUseAnchorGrouping })} color="#3b82f6" />
                            </div>
                            {config.bestFitUseAnchorGrouping && (
                                <div className="mt-2">
                                    <label className="block text-[10px] text-slate-500 mb-1">Fan Tolerance <span className="text-slate-600">(Slope Diff)</span></label>
                                    <input type="range" min="0" max="0.5" step="0.01" value={config.bestFitAnchorSlopeTolerance}
                                        onChange={e => setTradeAxisConfig({ bestFitAnchorSlopeTolerance: parseFloat(e.target.value) })} className="w-full accent-blue-500" />
                                    <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>Strict</span><span>{config.bestFitAnchorSlopeTolerance}</span><span>Loose</span></div>
                                </div>
                            )}
                        </div>

                        <div className="bg-slate-800/30 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <div className="text-sm text-slate-300">NMS Filter</div>
                                    <div className="text-xs text-slate-500">Remove duplicates</div>
                                </div>
                                <ToggleSwitch enabled={config.bestFitUseNMS} onChange={() => setTradeAxisConfig({ bestFitUseNMS: !config.bestFitUseNMS })} color="#10b981" />
                            </div>
                            {config.bestFitUseNMS && (
                                <div className="space-y-3 mt-2">
                                    <div>
                                        <label className="block text-[10px] text-slate-500 mb-1">Price Tolerance</label>
                                        <input type="range" min="0" max="0.05" step="0.001" value={config.bestFitNmsPriceTolerance}
                                            onChange={e => setTradeAxisConfig({ bestFitNmsPriceTolerance: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
                                        <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>0%</span><span>{(config.bestFitNmsPriceTolerance * 100).toFixed(1)}%</span><span>5%</span></div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-500 mb-1">Slope Tolerance</label>
                                        <input type="range" min="0" max="0.5" step="0.01" value={config.bestFitNmsSlopeTolerance}
                                            onChange={e => setTradeAxisConfig({ bestFitNmsSlopeTolerance: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
                                        <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>Strict</span><span>{config.bestFitNmsSlopeTolerance}</span><span>Loose</span></div>
                                    </div>
                                    <div className="pt-1 border-t border-slate-700/50">
                                        <div className="text-[10px] text-slate-500 mb-1.5">Level mode</div>
                                        <div>
                                            <label className="block text-[10px] text-slate-500 mb-1">Level Cutoff</label>
                                            <input type="range" min="0.001" max="0.05" step="0.001" value={config.bestFitNmsLevelSlopeCutoff ?? 0.01}
                                                onChange={e => setTradeAxisConfig({ bestFitNmsLevelSlopeCutoff: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
                                            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>0.001</span><span>{(config.bestFitNmsLevelSlopeCutoff ?? 0.01).toFixed(3)}</span><span>0.05</span></div>
                                            <div className="text-[9px] text-slate-600 mt-0.5">Slopes below this = Level</div>
                                        </div>
                                        <div className="mt-2">
                                            <label className="block text-[10px] text-slate-500 mb-1">Level Price Tol.</label>
                                            <input type="range" min="0.0005" max="0.01" step="0.0005" value={config.bestFitNmsLevelTolerance ?? 0.001}
                                                onChange={e => setTradeAxisConfig({ bestFitNmsLevelTolerance: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
                                            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>0.05%</span><span>{((config.bestFitNmsLevelTolerance ?? 0.001) * 100).toFixed(2)}%</span><span>1%</span></div>
                                            <div className="text-[9px] text-slate-600 mt-0.5">Strict tolerance for horizontal levels</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Display Filters */}
            <div className="border-t border-slate-800 pt-4">
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">Display Filters</label>
                <div className="space-y-3">
                    <div className="bg-slate-800/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="text-sm text-slate-300">Closest Trendlines</div>
                                <div className="text-xs text-slate-500">N nearest supports + N nearest resistances</div>
                            </div>
                            <ToggleSwitch enabled={strategyConfig.useClosestFilter} onChange={() => setStrategyConfig({ useClosestFilter: !strategyConfig.useClosestFilter })} color="#3b82f6" />
                        </div>
                        <div className={strategyConfig.useClosestFilter ? '' : 'opacity-40'}>
                            <label className="block text-xs text-slate-500 mb-1">Count per side</label>
                            <input type="number" min="1" max="20" step="1" value={strategyConfig.closestFilterCount}
                                onChange={e => setStrategyConfig({ closestFilterCount: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" disabled={!strategyConfig.useClosestFilter} />
                        </div>
                    </div>
                    <div className="bg-slate-800/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="text-sm text-slate-300">Most Valuable</div>
                                <div className="text-xs text-slate-500">N highest-scored supports + N highest-scored resistances</div>
                            </div>
                            <ToggleSwitch enabled={strategyConfig.useMostValuableFilter} onChange={() => setStrategyConfig({ useMostValuableFilter: !strategyConfig.useMostValuableFilter })} color="#a855f7" />
                        </div>
                        <div className={strategyConfig.useMostValuableFilter ? '' : 'opacity-40'}>
                            <label className="block text-xs text-slate-500 mb-1">Count per side</label>
                            <input type="number" min="1" max="20" step="1" value={strategyConfig.mostValuableFilterCount}
                                onChange={e => setStrategyConfig({ mostValuableFilterCount: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" disabled={!strategyConfig.useMostValuableFilter} />
                        </div>
                    </div>
                    <div className="text-[10px] text-slate-600">When both filters are active, lines from each are shown (union). Scoring is controlled by the Trend Scoring toggle.</div>
                </div>
            </div>

            {/* Touch Zones */}
            <div className="border-t border-slate-800 pt-4">
                <label className="block text-xs uppercase text-slate-500 font-bold mb-2">Touch Zones</label>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Touch Zone Width</label>
                    <input type="range" min="0" max="5.0" step="0.05" value={config.touchZone}
                        onChange={e => setTradeAxisConfig({ touchZone: parseFloat(e.target.value) })} className="w-full accent-emerald-500" />
                    <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>Narrow</span><span>{config.touchZone}%</span><span>Wide</span></div>
                </div>
            </div>

            {/* Pivot Confirmation */}
            <div className="border-t border-slate-800 pt-4">
                <label className="block text-xs uppercase text-slate-500 font-bold mb-3">Pivot Confirmation</label>
                <div className="space-y-4">
                    <div className="bg-slate-800/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div><div className="text-sm text-slate-300">Window Size</div><div className="text-xs text-slate-500">Wait N bars after pivot</div></div>
                            <ToggleSwitch enabled={config.useWindowSizeRule} onChange={() => setTradeAxisConfig({ useWindowSizeRule: !config.useWindowSizeRule })} color="#3b82f6" />
                        </div>
                        <div className={config.useWindowSizeRule ? '' : 'opacity-40'}>
                            <input type="range" min="1" max="20" step="1" value={config.windowSize}
                                onChange={e => setTradeAxisConfig({ windowSize: parseInt(e.target.value) })} className="w-full accent-blue-500" disabled={!config.useWindowSizeRule} />
                            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>1</span><span className="text-blue-400 font-medium">{config.windowSize} bars</span><span>20</span></div>
                            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-700/50">
                                <span className="text-[10px] text-slate-400">Confirm on First Minute</span>
                                <ToggleSwitch enabled={config.windowSizeUseFirstMinute} onChange={() => setTradeAxisConfig({ windowSizeUseFirstMinute: !config.windowSizeUseFirstMinute })} color="#3b82f6" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div><div className="text-sm text-slate-300">Price Change</div><div className="text-xs text-slate-500">Confirm on X% recoil from peak</div></div>
                            <ToggleSwitch enabled={config.usePriceChangeRule} onChange={() => setTradeAxisConfig({ usePriceChangeRule: !config.usePriceChangeRule })} color="#10b981" />
                        </div>
                        <div className={config.usePriceChangeRule ? '' : 'opacity-40'}>
                            <input type="range" min="0.005" max="0.10" step="0.005" value={config.priceChangeThreshold}
                                onChange={e => setTradeAxisConfig({ priceChangeThreshold: parseFloat(e.target.value) })} className="w-full accent-emerald-500" disabled={!config.usePriceChangeRule} />
                            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>0.5%</span><span className="text-emerald-400 font-medium">{(config.priceChangeThreshold * 100).toFixed(1)}%</span><span>10%</span></div>
                        </div>
                    </div>

                    <div className="bg-slate-800/30 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                            <div><div className="text-sm text-slate-300">Zone Bounce</div><div className="text-xs text-slate-500">Confirm when price exits zone same side</div></div>
                            <ToggleSwitch enabled={config.useZoneBounce} onChange={() => setTradeAxisConfig({ useZoneBounce: !config.useZoneBounce })} color="#f59e0b" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ), [state.tradeAxisConfig, state.strategyConfig, setTradeAxisConfig, setStrategyConfig]);
}
