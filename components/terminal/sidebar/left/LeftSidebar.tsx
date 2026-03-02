"use client";

import React from 'react';
import { Calendar, TrendingUp, Layers, Activity } from 'lucide-react';
import { CollapsibleGroup } from '@/components/ui/CollapsibleGroup';
import { TimeframeConfig } from './TimeframeConfig';
import { IndicatorList } from './IndicatorList';
import { PatternsList } from './PatternsList';
import { StrategyList } from './StrategyList';
import { MacroDataList } from './MacroDataList';

export default function LeftSidebar() {
    return (
        <div className="h-full flex flex-col">
            <CollapsibleGroup title="Timeframe" icon={<Calendar className="w-4 h-4 text-amber-400" />} defaultOpen>
                <TimeframeConfig />
            </CollapsibleGroup>

            <CollapsibleGroup title="Quant Indicators" icon={<TrendingUp className="w-4 h-4 text-purple-400" />} defaultOpen>
                <IndicatorList />
            </CollapsibleGroup>

            <CollapsibleGroup title="Macro Data (FRED)" icon={<Activity className="w-4 h-4 text-emerald-500" />} defaultOpen={false}>
                <MacroDataList />
            </CollapsibleGroup>

            <CollapsibleGroup title="Patterns" icon={<Layers className="w-4 h-4 text-blue-400" />} defaultOpen>
                <PatternsList />
            </CollapsibleGroup>

            <CollapsibleGroup title="Strategy" icon={<Activity className="w-4 h-4 text-amber-400" />} defaultOpen>
                <StrategyList />
            </CollapsibleGroup>
        </div>
    );
}
