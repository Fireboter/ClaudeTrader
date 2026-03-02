"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useTerminal } from '../../TerminalContext';
import { Layers, Shuffle } from 'lucide-react';
import axios from 'axios';

const API = 'http://localhost:8000';

interface AssetInfo {
    start_date:   string;
    end_date:     string;
    trading_days: number;
}

export function TimeframeConfig() {
    const { state, setConfig, regenerateRandom, setSelectedItem, setActiveAsset } = useTerminal();
    const { config, selectedItem } = state;

    const [assets,    setAssets]    = useState<string[]>([]);
    const [assetInfo, setAssetInfo] = useState<AssetInfo | null>(null);
    const [loading,   setLoading]   = useState(false);
    // Suppress client-only content on the server to avoid hydration mismatch
    const [mounted,   setMounted]   = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // ─── Load available symbols once ─────────────────────────────
    useEffect(() => {
        setLoading(true);
        axios.get<{ symbols: string[] }>(`${API}/api/candles/available`)
            .then(res => setAssets(res.data.symbols ?? []))
            .catch(e => console.error('Failed to fetch symbols:', e))
            .finally(() => setLoading(false));
    }, []);

    // ─── Load real date bounds whenever symbol changes ────────────
    useEffect(() => {
        if (!config.symbol) return;
        setAssetInfo(null);
        axios.get<AssetInfo>(`${API}/api/candles/asset-info`, { params: { symbol: config.symbol } })
            .then(res => {
                const info = res.data;
                setAssetInfo(info);
                if (config.mode === 'fixed') {
                    const clamped: Partial<typeof config> = {};
                    if (!config.startDate || config.startDate < info.start_date)
                        clamped.startDate = info.start_date;
                    if (!config.endDate || config.endDate > info.end_date)
                        clamped.endDate = info.end_date;
                    if (Object.keys(clamped).length > 0) setConfig(clamped);
                }
            })
            .catch(e => console.error('Failed to fetch asset info:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.symbol]);

    // ─── Keep activeAsset in sync ─────────────────────────────────
    useEffect(() => {
        if (config.symbol) {
            setActiveAsset({ symbol: config.symbol, provider: 'databento', resolution: '1m' });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.symbol]);

    const shuffle = useCallback(() => { regenerateRandom(); }, [regenerateRandom]);

    const durationDays = (config.years * 365) + (config.months * 30) + config.days;

    return (
        <div className="space-y-3">

            {/* Data Management button */}
            <div className="mb-3">
                <button
                    onClick={() => setSelectedItem('data_management', 'main')}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded text-xs font-bold uppercase tracking-wide transition-all ${selectedItem.type === 'data_management' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'bg-slate-800 text-emerald-500 hover:bg-slate-700 hover:text-emerald-400 border border-emerald-900/30'}`}
                >
                    <Layers className="w-3.5 h-3.5" />
                    Data Management
                </button>
            </div>

            {/* Asset selector
                Server renders a static placeholder; client swaps in the real <select>
                after hydration. This prevents the SSR/client options mismatch. */}
            <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-1">
                    Asset <span className="text-slate-600 normal-case font-normal">· Databento 1m</span>
                </label>
                {!mounted ? (
                    <div className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 h-[38px]" />
                ) : (
                    <select
                        value={config.symbol}
                        onChange={e => setConfig({ symbol: e.target.value })}
                        disabled={loading}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-slate-200 disabled:opacity-50"
                    >
                        {assets.length === 0
                            ? <option value={config.symbol}>{config.symbol}</option>
                            : assets.map(a => <option key={a} value={a}>{a}</option>)
                        }
                    </select>
                )}

                {assetInfo && (
                    <p className="mt-1 text-slate-600 text-xs">
                        {assetInfo.start_date} → {assetInfo.end_date}
                        <span className="ml-1 text-slate-700">({assetInfo.trading_days} days)</span>
                    </p>
                )}
            </div>

            {/* Mode toggle */}
            <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Mode</label>
                <div className="flex bg-slate-800 rounded p-1 border border-slate-700">
                    <button
                        onClick={() => setConfig({ mode: 'random' })}
                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${config.mode === 'random' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >Random</button>
                    <button
                        onClick={() => setConfig({ mode: 'fixed' })}
                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${config.mode === 'fixed' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >Fixed</button>
                </div>
            </div>

            {config.mode === 'random' ? (
                <div>
                    <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Duration</label>
                    <div className="grid grid-cols-3 gap-2">
                        {(['years', 'months', 'days'] as const).map((unit, i) => (
                            <div key={unit} className="flex items-center bg-slate-800 border border-slate-700 rounded px-2 py-1.5">
                                <input
                                    type="number" min="0"
                                    value={config[unit] || ''}
                                    onChange={e => setConfig({ [unit]: parseInt(e.target.value) || 0 })}
                                    className="bg-transparent w-full text-xs focus:outline-none text-slate-200 text-right pr-1"
                                    placeholder="0"
                                />
                                <span className="text-slate-500 text-xs">{['Y', 'M', 'D'][i]}</span>
                            </div>
                        ))}
                    </div>

                    {assetInfo && durationDays > 0 && durationDays > assetInfo.trading_days && (
                        <p className="mt-1 text-amber-500 text-xs">
                            Duration ({durationDays}d) exceeds available data ({assetInfo.trading_days} days) — full range will be used.
                        </p>
                    )}

                    <button
                        onClick={shuffle}
                        disabled={loading || !assetInfo}
                        className="w-full mt-2 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs font-medium text-slate-300 flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Shuffle className="w-3.5 h-3.5" />Shuffle Timeframe
                    </button>
                </div>
            ) : (
                <>
                    <div>
                        <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Start Date</label>
                        <input
                            type="date"
                            value={config.startDate}
                            min={assetInfo?.start_date}
                            max={assetInfo?.end_date}
                            onChange={e => setConfig({ startDate: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-slate-200 scheme-dark"
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase text-slate-500 font-bold mb-1">End Date</label>
                        <input
                            type="date"
                            value={config.endDate}
                            min={assetInfo?.start_date}
                            max={assetInfo?.end_date}
                            onChange={e => setConfig({ endDate: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-slate-200 scheme-dark"
                        />
                    </div>
                </>
            )}

        </div>
    );
}
