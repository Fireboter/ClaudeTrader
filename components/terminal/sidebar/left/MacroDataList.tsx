"use client";

import React, { useMemo, useCallback } from 'react';
import { useTerminal } from '../../TerminalContext';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { MACRO_INDICATORS } from './indicators';

export function MacroDataList() {
    const { state, toggleIndicator, setSelectedItem } = useTerminal();

    const handleSelect = useCallback((key: string) => setSelectedItem('indicator', key), [setSelectedItem]);

    return useMemo(() => (
        <div className="space-y-1">
            {MACRO_INDICATORS.map(item => {
                const enabled = state.enabledIndicators[item.key] || false;
                const isSelected = state.selectedItem.key === item.key;

                return (
                    <div key={item.key} onClick={() => handleSelect(item.key)}
                        className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-slate-700' : 'hover:bg-slate-800/50'}`}>
                        <div className="flex flex-col">
                            <span className={`text-sm ${enabled ? 'text-slate-200' : 'text-slate-400'}`}>{item.name}</span>
                            <span className="text-xs text-slate-600">{item.desc}</span>
                        </div>
                        <ToggleSwitch enabled={enabled} onChange={() => toggleIndicator(item.key)} color="#f59e0b" />
                    </div>
                );
            })}
        </div>
    ), [state.enabledIndicators, state.selectedItem, handleSelect, toggleIndicator]);
}
