"use client";

import React, { useMemo, useCallback } from 'react';
import { useTerminal } from '../../TerminalContext';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { STRATEGY_FEATURES } from './indicators';
import type { SelectedItemType } from '../../core/store/types';

export function StrategyList() {
    const { state, toggleIndicator, setSelectedItem } = useTerminal();

    const handleSelect = useCallback((key: string) => {
        const typeMap: Record<string, SelectedItemType> = { signals: 'signals', prehistory: 'prehistory', trend_scoring: 'trend_scoring' };
        setSelectedItem(typeMap[key] ?? null, typeMap[key] ? key : null);
    }, [setSelectedItem]);

    return useMemo(() => (
        <div className="space-y-1">
            {STRATEGY_FEATURES.map(feat => {
                const enabled = state.enabledIndicators[feat.key] || false;
                const isSelected = state.selectedItem.type === feat.key && state.selectedItem.key === feat.key;

                return (
                    <div key={feat.key} onClick={() => handleSelect(feat.key)}
                        className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-slate-700' : 'hover:bg-slate-800/50'}`}>
                        <div className="flex flex-col">
                            <span className={`text-sm ${enabled ? 'text-slate-200' : 'text-slate-400'}`}>{feat.name}</span>
                            <span className="text-xs text-slate-600">{feat.desc}</span>
                        </div>
                        <ToggleSwitch enabled={enabled} onChange={() => toggleIndicator(feat.key)} color="#10b981" />
                    </div>
                );
            })}
        </div>
    ), [state.enabledIndicators, state.selectedItem, handleSelect, toggleIndicator]);
}
