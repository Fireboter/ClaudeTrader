"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { useTerminal } from '../../TerminalContext';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { InfoModal } from '@/components/ui/InfoModal';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { QUANT_INDICATORS, INDICATOR_CATEGORIES, type IndicatorDefinition } from './indicators';

function IndicatorCategoryGroup({ category, indicators, color }: { category: string; indicators: IndicatorDefinition[]; color: string }) {
    const { state, toggleIndicator, setSelectedItem } = useTerminal();
    const [isOpen, setIsOpen] = useState(true);
    const [infoIndicator, setInfoIndicator] = useState<IndicatorDefinition | null>(null);

    const enabledCount = indicators.filter(ind => state.enabledIndicators[ind.key]).length;
    const handleSelect = useCallback((key: string) => setSelectedItem('indicator', key), [setSelectedItem]);

    return useMemo(() => (
        <div className="mb-2">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-800/30 rounded transition-colors">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{category}</span>
                    {enabledCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300">{enabledCount}</span>}
                </div>
                {isOpen ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
            </button>
            {isOpen && (
                <div className="ml-3 mt-1 space-y-0.5">
                    {indicators.map(ind => {
                        const enabled = state.enabledIndicators[ind.key] || false;
                        const isSelected = state.selectedItem.type === 'indicator' && state.selectedItem.key === ind.key;
                        return (
                            <div key={ind.key} className="flex flex-col">
                                <div className={`flex items-center justify-between px-2 py-1.5 rounded transition-colors group ${isSelected ? 'bg-slate-700' : 'hover:bg-slate-800/50'}`}>
                                    <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => handleSelect(ind.key)}>
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: enabled ? ind.color : '#475569' }} />
                                        <span className={`text-sm ${enabled ? 'text-slate-200' : 'text-slate-400'}`}>{ind.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={e => { e.stopPropagation(); setInfoIndicator(ind); }}
                                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-600 rounded text-slate-500 hover:text-slate-300 transition-all" title="Info">
                                            <Info className="w-3 h-3" />
                                        </button>
                                        <ToggleSwitch enabled={enabled} onChange={() => toggleIndicator(ind.key)} color={ind.color} />
                                    </div>
                                </div>
                                {ind.key === 'adx' && enabled && (
                                    <div className="pl-6 pr-2 py-1 space-y-2 border-l border-slate-800 ml-3 mb-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-emerald-400">DI+</span>
                                            <ToggleSwitch enabled={state.enabledIndicators['adx_di_plus'] || false} onChange={() => toggleIndicator('adx_di_plus')} color="#22c55e" />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-red-400">DI-</span>
                                            <ToggleSwitch enabled={state.enabledIndicators['adx_di_minus'] || false} onChange={() => toggleIndicator('adx_di_minus')} color="#ef4444" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {infoIndicator && <InfoModal name={infoIndicator.name} description={infoIndicator.description} color={infoIndicator.color} onClose={() => setInfoIndicator(null)} />}
        </div>
    ), [state.enabledIndicators, state.selectedItem, isOpen, infoIndicator, category, indicators, color, enabledCount, handleSelect, toggleIndicator]);
}

export function IndicatorList() {
    const groupedIndicators = useMemo(() => {
        const groups: Record<string, IndicatorDefinition[]> = {};
        QUANT_INDICATORS.forEach(ind => {
            if (!groups[ind.category]) groups[ind.category] = [];
            groups[ind.category].push(ind);
        });
        return groups;
    }, []);

    return (
        <div className="space-y-1">
            {INDICATOR_CATEGORIES.map(cat => {
                const indicators = groupedIndicators[cat.name];
                if (!indicators?.length) return null;
                return <IndicatorCategoryGroup key={cat.name} category={cat.name} indicators={indicators} color={cat.color} />;
            })}
        </div>
    );
}
