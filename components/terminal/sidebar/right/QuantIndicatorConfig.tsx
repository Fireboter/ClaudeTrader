"use client";

import React, { useMemo } from 'react';
import { useTerminal } from '../../TerminalContext';
import { Info } from 'lucide-react';

const INDICATOR_CONFIGS: Record<string, { label: string; configKey: string; min: number; max: number; step: number }[]> = {
    rsi: [{ label: 'RSI Period', configKey: 'rsi_period', min: 2, max: 50, step: 1 }],
    macd: [
        { label: 'Fast Period', configKey: 'macd_fast', min: 2, max: 50, step: 1 },
        { label: 'Slow Period', configKey: 'macd_slow', min: 5, max: 100, step: 1 },
        { label: 'Signal Period', configKey: 'macd_signal', min: 2, max: 30, step: 1 },
    ],
    bollinger: [
        { label: 'Period', configKey: 'bb_period', min: 5, max: 50, step: 1 },
        { label: 'Std Dev', configKey: 'bb_std', min: 0.5, max: 4, step: 0.1 },
    ],
    adx: [{ label: 'ADX Period', configKey: 'adx_period', min: 5, max: 50, step: 1 }],
    atr: [{ label: 'ATR Period', configKey: 'atr_period', min: 5, max: 50, step: 1 }],
    sma: [{ label: 'SMA Period', configKey: 'sma_period', min: 10, max: 500, step: 1 }],
};

export function QuantIndicatorConfig() {
    const { state, setIndicatorConfig } = useTerminal();
    const selectedKey = state.selectedItem.key;
    const configs = INDICATOR_CONFIGS[selectedKey || ''] || [];

    if (configs.length === 0) {
        return (
            <div className="text-sm text-slate-500 px-2">
                <Info className="w-4 h-4 inline mr-2" />
                This indicator uses default settings or is not configurable.
            </div>
        );
    }

    return useMemo(() => (
        <div className="space-y-4">
            {configs.map(cfg => (
                <div key={cfg.configKey}>
                    <label className="block text-xs uppercase text-slate-500 font-bold mb-2">
                        {cfg.label}: <span className="text-slate-300">{(state.indicatorConfig as any)[cfg.configKey]}</span>
                    </label>
                    <input type="range" min={cfg.min} max={cfg.max} step={cfg.step}
                        value={(state.indicatorConfig as any)[cfg.configKey] as number}
                        onChange={e => setIndicatorConfig({ [cfg.configKey]: parseFloat(e.target.value) })}
                        className="w-full accent-emerald-500" />
                    <div className="flex justify-between text-xs text-slate-600 mt-1">
                        <span>{cfg.min}</span><span>{cfg.max}</span>
                    </div>
                </div>
            ))}
        </div>
    ), [state.indicatorConfig, configs, setIndicatorConfig]);
}
