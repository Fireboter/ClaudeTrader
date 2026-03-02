"use client";

import React, { useMemo } from 'react';
import { useTerminal } from '../../TerminalContext';
import { Settings } from 'lucide-react';
import { QuantIndicatorConfig } from './QuantIndicatorConfig';
import { TradeAxisConfigPanel } from './TradeAxisConfigPanel';
import { PatternConfigPanel } from './PatternConfigPanel';
import { SignalsConfigPanel } from './SignalsConfigPanel';
import { PreHistoryConfigPanel } from './PreHistoryConfigPanel';
import { TrendScoringConfigPanel } from './TrendScoringConfigPanel';
import { ConfidenceConfigPanel } from './ConfidenceConfigPanel';
import DataManagementPanel from '../../panels/DataManagementPanel';
import { PivotsConfigPanel } from './PivotsConfigPanel';
import { TrendlinesConfigPanel } from './TrendlinesConfigPanel';

function DefaultPanel() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Settings className="w-12 h-12 text-slate-700 mb-4" />
            <p className="text-slate-400 text-sm">Select an indicator or feature from the left sidebar to configure it.</p>
        </div>
    );
}

export default function RightSidebar() {
    const { state } = useTerminal();
    const { selectedItem } = state;

    return useMemo(() => (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-auto p-4">
                {selectedItem.type === null ? <DefaultPanel />
                    : selectedItem.type === 'indicator' ? <QuantIndicatorConfig />
                    : selectedItem.type === 'pivots' ? <PivotsConfigPanel />
                    : selectedItem.type === 'trendlines' ? <TrendlinesConfigPanel />
                    : selectedItem.type === 'tradeaxis' ? <TradeAxisConfigPanel />
                    : selectedItem.type === 'pattern' ? <PatternConfigPanel />
                    : selectedItem.type === 'confidence' ? <ConfidenceConfigPanel />
                    : selectedItem.type === 'signals' ? <SignalsConfigPanel />
                    : selectedItem.type === 'prehistory' ? <PreHistoryConfigPanel />
                    : selectedItem.type === 'trend_scoring' ? <TrendScoringConfigPanel />
                    : selectedItem.type === 'data_management' ? <DataManagementPanel />
                    : <DefaultPanel />}
            </div>
        </div>
    ), [selectedItem]);
}
