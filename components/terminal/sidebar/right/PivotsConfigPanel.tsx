"use client";

import React from 'react';
import { useTerminal } from '../../TerminalContext';
import { ToggleSwitch } from '../../../ui/ToggleSwitch';

export function PivotsConfigPanel() {
    const {
        state,
        setPivotWindowSize,
        setEarlyPivotConfig,
    } = useTerminal();

    const { pivotWindowSize, pivots, earlyPivots, earlyConfirmedPivots, earlyPivotConfig } = state;

    const confirmedHighs = pivots.filter(p => p.type === 'high').length;
    const confirmedLows  = pivots.filter(p => p.type === 'low').length;

    const earlyProvHighs    = earlyPivots.filter(p => p.type === 'high').length;
    const earlyProvLows     = earlyPivots.filter(p => p.type === 'low').length;
    const earlyConfHighs    = earlyConfirmedPivots.filter(p => p.type === 'high').length;
    const earlyConfLows     = earlyConfirmedPivots.filter(p => p.type === 'low').length;

    return (
        <div className="space-y-5">

            {/* ── WINDOW SIZE ─────────────────────────────────────────── */}
            <div>
                <label className="block text-xs text-slate-500 mb-1">
                    Window Size <span className="text-slate-600">(bars each side)</span>
                </label>
                <input
                    type="range"
                    min="1"
                    max="20"
                    step="1"
                    value={pivotWindowSize}
                    onChange={e => setPivotWindowSize(parseInt(e.target.value))}
                    className="w-full accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                    <span>1 (sensitive)</span>
                    <span className="text-emerald-400 font-medium">{pivotWindowSize} bars</span>
                    <span>20 (major)</span>
                </div>
                <p className="text-[10px] text-slate-700 mt-1.5">
                    A bar is a pivot high when its high exceeds all {pivotWindowSize} bars on
                    each side. Mirror logic for lows.
                </p>
            </div>

            {/* ── DETECTED PIVOTS (window) ─────────────────────────────── */}
            <div className="border-t border-slate-800 pt-4">
                <label className="block text-xs uppercase text-slate-500 font-bold mb-3">
                    Detected Pivots
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-800/40 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-red-400">{confirmedHighs}</div>
                        <div className="text-[10px] text-slate-500">Swing Highs</div>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-emerald-400">{confirmedLows}</div>
                        <div className="text-[10px] text-slate-500">Swing Lows</div>
                    </div>
                </div>
            </div>

            {/* ── EARLY PIVOT DETECTION ────────────────────────────────── */}
            <div className="border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between mb-1">
                    <label className="text-xs uppercase text-slate-500 font-bold">
                        Early Pivot Detection
                    </label>
                    <ToggleSwitch
                        enabled={earlyPivotConfig.enabled}
                        onChange={() => setEarlyPivotConfig({ enabled: !earlyPivotConfig.enabled })}
                        color="#a855f7"
                    />
                </div>
                <p className="text-[10px] text-slate-700 mb-3">
                    Detects pivots after 1 day using trendline touch zones.
                    Requires trendlines with touch zone % &gt; 0.
                </p>

                {earlyPivotConfig.enabled && (
                    <div className="space-y-3 pl-2 border-l border-slate-800">

                        {/* Provisional toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs text-slate-400">Provisional Pivot</div>
                                <div className="text-[10px] text-slate-600">
                                    Transparent marker when price enters zone
                                </div>
                            </div>
                            <ToggleSwitch
                                enabled={earlyPivotConfig.provisionalEnabled}
                                onChange={() => setEarlyPivotConfig({
                                    provisionalEnabled: !earlyPivotConfig.provisionalEnabled,
                                })}
                                color="#f59e0b"
                            />
                        </div>

                        {/* Price Recoil toggle */}
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs text-slate-400">Price Recoil Confirmation</div>
                                <div className="text-[10px] text-slate-600">
                                    Confirms pivot when price recoils by configured %
                                </div>
                            </div>
                            <ToggleSwitch
                                enabled={earlyPivotConfig.recoilEnabled}
                                onChange={() => setEarlyPivotConfig({
                                    recoilEnabled: !earlyPivotConfig.recoilEnabled,
                                })}
                                color="#a855f7"
                            />
                        </div>

                        {/* Recoil % slider */}
                        {earlyPivotConfig.recoilEnabled && (
                            <div>
                                <label className="block text-[10px] text-slate-500 mb-1">
                                    Recoil Threshold
                                </label>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="5"
                                    step="0.1"
                                    value={earlyPivotConfig.recoilPct}
                                    onChange={e => setEarlyPivotConfig({
                                        recoilPct: parseFloat(e.target.value),
                                    })}
                                    className="w-full accent-purple-500"
                                />
                                <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                                    <span>0.1%</span>
                                    <span className="text-purple-400 font-medium">
                                        {earlyPivotConfig.recoilPct.toFixed(1)}%
                                    </span>
                                    <span>5%</span>
                                </div>
                            </div>
                        )}

                        {/* Early pivot stats */}
                        <div className="border-t border-slate-800 pt-3">
                            <label className="block text-[10px] uppercase text-slate-600 font-bold mb-2">
                                Early Pivot Stats
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                                <div className="bg-slate-800/40 rounded p-2 text-center">
                                    <div className="text-sm font-bold text-red-400/60">{earlyProvHighs}</div>
                                    <div className="text-[9px] text-slate-600">Prov. Highs</div>
                                </div>
                                <div className="bg-slate-800/40 rounded p-2 text-center">
                                    <div className="text-sm font-bold text-emerald-400/60">{earlyProvLows}</div>
                                    <div className="text-[9px] text-slate-600">Prov. Lows</div>
                                </div>
                                <div className="bg-slate-800/40 rounded p-2 text-center">
                                    <div className="text-sm font-bold text-red-400">{earlyConfHighs}</div>
                                    <div className="text-[9px] text-slate-600">Conf. Highs</div>
                                </div>
                                <div className="bg-slate-800/40 rounded p-2 text-center">
                                    <div className="text-sm font-bold text-emerald-400">{earlyConfLows}</div>
                                    <div className="text-[9px] text-slate-600">Conf. Lows</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
