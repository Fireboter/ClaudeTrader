"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Data Management Panel — manages asset data downloads, quality checks, etc.
 * Shown in the right sidebar when "Data Management" is selected.
 */

interface AssetInfo {
    symbol: string;
    providers?: Record<string, Record<string, { status: string; count?: number; start?: string; end?: string }>>;
    category?: string;
}

function AssetRow({ asset, onDownload, onDelete }: { asset: AssetInfo; onDownload: (symbol: string) => void; onDelete: (symbol: string) => void }) {
    const providers = asset.providers || {};
    const providerKeys = Object.keys(providers);

    return (
        <div className="flex items-center justify-between py-2 px-2 hover:bg-slate-800/30 rounded">
            <div>
                <div className="text-sm text-slate-200 font-medium">{asset.symbol}</div>
                <div className="text-[10px] text-slate-500">
                    {providerKeys.map(p => {
                        const resolutions = Object.keys(providers[p]).filter(k => k !== 'active' && k !== 'configured');
                        return `${p}: ${resolutions.join(', ')}`;
                    }).join(' | ') || 'No data'}
                </div>
            </div>
            <div className="flex items-center gap-1">
                <button onClick={() => onDownload(asset.symbol)} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-emerald-400 transition-colors" title="Download">
                    <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onDelete(asset.symbol)} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400 transition-colors" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}

export default function DataManagementPanel() {
    const [inventory, setInventory] = useState<AssetInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ stocks: true, macro: false });

    useEffect(() => {
        const fetchInventory = async () => {
            try {
                const res = await axios.get('http://localhost:8000/api/data/stats');
                setInventory(res.data || []);
            } catch (e) {
                console.error('Failed to fetch inventory:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchInventory();
    }, []);

    const handleDownload = async (symbol: string) => {
        try {
            await axios.post(`http://localhost:8000/api/data/download`, { symbol });
        } catch (e) {
            console.error('Download failed:', e);
        }
    };

    const handleDelete = async (symbol: string) => {
        try {
            await axios.delete(`http://localhost:8000/api/data/${symbol}`);
            setInventory(prev => prev.filter(a => a.symbol !== symbol));
        } catch (e) {
            console.error('Delete failed:', e);
        }
    };

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const FRED_whitelist = ['CPIAUCSL', 'FEDFUNDS', 'UNRATE', 'GDPC1', 'DGS10'];
    const stockAssets = inventory.filter(a => !FRED_whitelist.includes(a.symbol) && a.category !== 'macro' && a.category !== 'economic');
    const macroAssets = inventory.filter(a => FRED_whitelist.includes(a.symbol) || a.category === 'macro' || a.category === 'economic');

    if (loading) {
        return <div className="p-4 text-slate-500 text-sm animate-pulse">Loading inventory...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Refresh */}
            <button
                onClick={() => { setLoading(true); axios.get('http://localhost:8000/api/data/stats').then(r => setInventory(r.data || [])).finally(() => setLoading(false)); }}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs font-medium text-slate-300 flex items-center justify-center gap-2 transition-colors"
            >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh Inventory
            </button>

            {/* Stocks */}
            <div>
                <button onClick={() => toggleGroup('stocks')} className="w-full flex items-center justify-between px-2 py-2 hover:bg-slate-800/30 rounded">
                    <span className="text-xs font-bold uppercase text-slate-400">Market Assets ({stockAssets.length})</span>
                    {expandedGroups['stocks'] ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                </button>
                {expandedGroups['stocks'] && (
                    <div className="space-y-0.5">
                        {stockAssets.map(a => <AssetRow key={a.symbol} asset={a} onDownload={handleDownload} onDelete={handleDelete} />)}
                    </div>
                )}
            </div>

            {/* FRED / Macro */}
            <div>
                <button onClick={() => toggleGroup('macro')} className="w-full flex items-center justify-between px-2 py-2 hover:bg-slate-800/30 rounded">
                    <span className="text-xs font-bold uppercase text-slate-400">FRED / Macro ({macroAssets.length})</span>
                    {expandedGroups['macro'] ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                </button>
                {expandedGroups['macro'] && (
                    <div className="space-y-0.5">
                        {macroAssets.map(a => <AssetRow key={a.symbol} asset={a} onDownload={handleDownload} onDelete={handleDelete} />)}
                    </div>
                )}
            </div>
        </div>
    );
}
