"use client";

import React, { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface HorizontalBarRailProps {
    position: 'top' | 'bottom';
    onOpen: () => void;
    icon: ReactNode;
}

export function HorizontalBarRail({ position, onOpen, icon }: HorizontalBarRailProps) {
    return (
        <div
            className={`h-8 w-full bg-slate-900 border-slate-800 flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-800/50 transition-colors ${position === 'top' ? 'border-b' : 'border-t'}`}
            onClick={onOpen}
        >
            {icon}
            {position === 'top'
                ? <ChevronDown className="w-4 h-4 text-slate-500" />
                : <ChevronUp className="w-4 h-4 text-slate-500" />
            }
        </div>
    );
}
