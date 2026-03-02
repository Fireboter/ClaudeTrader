"use client";

import React from 'react';
import { useTerminal } from '../../TerminalContext';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { PivotSource } from '../../core/models/Trendline';

function Slider({
    label, sublabel, min, max, step, value, onChange, display,
    disabled = false,
}: {
    label: string; sublabel?: string;
    min: number; max: number; step: number;
    value: number;
    onChange: (v: number) => void;
    display: string;
    disabled?: boolean;
}) {
    return (
        <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
            <label className="block text-xs text-slate-500 mb-1">
                {label}
                {sublabel && <span className="text-slate-600 ml-1">{sublabel}</span>}
            </label>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="w-full accent-emerald-500"
                disabled={disabled}
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                <span>{min}</span>
                <span className="text-emerald-400 font-medium">{display}</span>
                <span>{max}</span>
            </div>
        </div>
    );
}

export function TrendlinesConfigPanel() {
    const { state, setTrendlineConfig } = useTerminal();
    const cfg = state.trendlineConfig;

    const supports    = state.trendlines.filter(l => l.type === 'support').length;
    const resistances = state.trendlines.filter(l => l.type === 'resistance').length;

    const patch = (p: Parameters<typeof setTrendlineConfig>[0]) => setTrendlineConfig(p);

    return (
        <div className="space-y-5 text-sm">

            {/* ── DETECTION ─────────────────────────────────────────────── */}
            <div className="space-y-3">
                <label className="block text-xs uppercase text-slate-500 font-bold">
                    Detection
                </label>

                {/* Pivot source selector */}
                <div>
                    <label className="block text-xs text-slate-500 mb-1.5">Pivot Source</label>
                    <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs font-medium">
                        {([
                            { value: 'window', label: 'Window' },
                            { value: 'early',  label: 'Price Change' },
                            { value: 'both',   label: 'Both' },
                        ] as { value: PivotSource; label: string }[]).map(({ value, label }) => (
                            <button
                                key={value}
                                onClick={() => patch({ pivotSource: value })}
                                className={`flex-1 py-1.5 transition-colors ${
                                    cfg.pivotSource === value
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <p className="text-[9px] text-slate-600 mt-1">
                        {cfg.pivotSource === 'window'  && 'Window-size confirmed swing pivots only'}
                        {cfg.pivotSource === 'early'   && 'Price-change recoil confirmed pivots only'}
                        {cfg.pivotSource === 'both'    && 'Union of window + price-change pivots'}
                        {!cfg.pivotSource              && 'Union of window + price-change pivots'}
                    </p>
                </div>

                <Slider
                    label="Min Pivots per Line"
                    min={2} max={10} step={1}
                    value={cfg.minPivots}
                    onChange={v => patch({ minPivots: v })}
                    display={`${cfg.minPivots} pivots`}
                />

                <Slider
                    label="Tolerance" sublabel="(pivot fit)"
                    min={0.001} max={0.02} step={0.001}
                    value={cfg.tolerance}
                    onChange={v => patch({ tolerance: v })}
                    display={`${(cfg.tolerance * 100).toFixed(2)}%`}
                />

                <Slider
                    label="Error Rate" sublabel="(raycast leniency)"
                    min={0} max={0.10} step={0.001}
                    value={cfg.errorRate}
                    onChange={v => patch({ errorRate: v })}
                    display={`${(cfg.errorRate * 100).toFixed(1)}%`}
                />

                <Slider
                    label="Proximity to Price" sublabel="(0 = off)"
                    min={0} max={1} step={0.05}
                    value={cfg.proximity}
                    onChange={v => patch({ proximity: v })}
                    display={cfg.proximity === 0 ? 'Off' : `${(cfg.proximity * 100).toFixed(0)}% band`}
                />
            </div>

            {/* ── NMS FILTER ────────────────────────────────────────────── */}
            <div className="border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <div className="text-sm font-medium text-slate-200">NMS Filter</div>
                        <div className="text-xs text-slate-500">Remove near-duplicate lines</div>
                    </div>
                    <ToggleSwitch
                        enabled={cfg.useNMS}
                        onChange={() => patch({ useNMS: !cfg.useNMS })}
                        color="#10b981"
                    />
                </div>

                <div className={`space-y-3 ${cfg.useNMS ? '' : 'opacity-40 pointer-events-none'}`}>
                    <Slider
                        label="Price Tolerance"
                        min={0} max={0.05} step={0.001}
                        value={cfg.nmsPriceTolerance}
                        onChange={v => patch({ nmsPriceTolerance: v })}
                        display={`${(cfg.nmsPriceTolerance * 100).toFixed(1)}%`}
                    />

                    <Slider
                        label="Slope Tolerance"
                        min={0} max={0.5} step={0.01}
                        value={cfg.nmsSlopeTolerance}
                        onChange={v => patch({ nmsSlopeTolerance: v })}
                        display={cfg.nmsSlopeTolerance.toFixed(2)}
                    />

                    <div className="border-t border-slate-700/50 pt-3 space-y-3">
                        <div className="text-[10px] text-slate-500 font-semibold uppercase">Level mode</div>
                        <Slider
                            label="Level Slope Cutoff"
                            min={0.001} max={0.05} step={0.001}
                            value={cfg.nmsLevelSlopeCutoff}
                            onChange={v => patch({ nmsLevelSlopeCutoff: v })}
                            display={cfg.nmsLevelSlopeCutoff.toFixed(3)}
                        />
                        <div className="text-[9px] text-slate-600">Slopes below this are treated as horizontal levels</div>

                        <Slider
                            label="Level Price Tol."
                            min={0.0005} max={0.01} step={0.0005}
                            value={cfg.nmsLevelTolerance}
                            onChange={v => patch({ nmsLevelTolerance: v })}
                            display={`${(cfg.nmsLevelTolerance * 100).toFixed(2)}%`}
                        />
                        <div className="text-[9px] text-slate-600">Tighter tolerance for near-horizontal lines</div>
                    </div>
                </div>
            </div>

            {/* ── DISPLAY FILTERS ───────────────────────────────────────── */}
            <div className="border-t border-slate-800 pt-4">
                <label className="block text-xs uppercase text-slate-500 font-bold mb-3">
                    Display Filters
                </label>
                <div className="space-y-3">

                    {/* Closest */}
                    <div className="bg-slate-800/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="text-sm text-slate-300">Closest</div>
                                <div className="text-xs text-slate-500">N nearest each side</div>
                            </div>
                            <ToggleSwitch
                                enabled={cfg.useClosestFilter}
                                onChange={() => patch({ useClosestFilter: !cfg.useClosestFilter })}
                                color="#3b82f6"
                            />
                        </div>
                        <div className={cfg.useClosestFilter ? '' : 'opacity-40 pointer-events-none'}>
                            <label className="block text-xs text-slate-500 mb-1">Count per side</label>
                            <input
                                type="number" min="1" max="20" step="1"
                                value={cfg.closestFilterCount}
                                onChange={e => patch({ closestFilterCount: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
                                disabled={!cfg.useClosestFilter}
                            />
                        </div>
                    </div>

                    {/* Most Valuable */}
                    <div className="bg-slate-800/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="text-sm text-slate-300">Most Valuable</div>
                                <div className="text-xs text-slate-500">N highest-scored each side</div>
                            </div>
                            <ToggleSwitch
                                enabled={cfg.useMostValuableFilter}
                                onChange={() => patch({ useMostValuableFilter: !cfg.useMostValuableFilter })}
                                color="#a855f7"
                            />
                        </div>
                        <div className={cfg.useMostValuableFilter ? '' : 'opacity-40 pointer-events-none'}>
                            <label className="block text-xs text-slate-500 mb-1">Count per side</label>
                            <input
                                type="number" min="1" max="20" step="1"
                                value={cfg.mostValuableCount}
                                onChange={e => patch({ mostValuableCount: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200"
                                disabled={!cfg.useMostValuableFilter}
                            />
                        </div>
                    </div>

                    {(cfg.useClosestFilter || cfg.useMostValuableFilter) && (
                        <p className="text-[10px] text-slate-600">
                            Union of both filters when both are active.
                        </p>
                    )}
                </div>
            </div>

            {/* ── TOUCH ZONES ───────────────────────────────────────────── */}
            <div className="border-t border-slate-800 pt-4">
                <label className="block text-xs uppercase text-slate-500 font-bold mb-3">
                    Touch Zones
                </label>
                <p className="text-[10px] text-slate-600 mb-3">
                    Transparent bands around each line. A line <span className="text-slate-400">disappears</span> when price fully exits the zone on the wrong side (breakout/breakdown).
                </p>
                <Slider
                    label="Zone Width"
                    min={0.1} max={5.0} step={0.1}
                    value={cfg.touchZonePct}
                    onChange={v => patch({ touchZonePct: v })}
                    display={`${cfg.touchZonePct.toFixed(1)}%`}
                />
            </div>

            {/* ── STATS ─────────────────────────────────────────────────── */}
            <div className="border-t border-slate-800 pt-4">
                <label className="block text-xs uppercase text-slate-500 font-bold mb-3">
                    Detected Lines
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-800/40 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-red-400">{resistances}</div>
                        <div className="text-[10px] text-slate-500">Resistance</div>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-emerald-400">{supports}</div>
                        <div className="text-[10px] text-slate-500">Support</div>
                    </div>
                </div>
                {state.trendlines.length > 0 && (
                    <div className="mt-2 text-[10px] text-slate-600 text-center">
                        Score range: {Math.min(...state.trendlines.map(l => l.score)).toFixed(0)}
                        {' – '}
                        {Math.max(...state.trendlines.map(l => l.score)).toFixed(0)}
                    </div>
                )}
            </div>

        </div>
    );
}
