"use client";

import React, { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SidebarRailProps {
    side: 'left' | 'right';
    onOpen: () => void;
    icon: ReactNode;
}

export function SidebarRail({ side, onOpen, icon }: SidebarRailProps) {
    return (
        <div
            className={`w-10 h-full bg-slate-900 border-slate-800 flex flex-col items-center py-4 gap-2 cursor-pointer hover:bg-slate-800/50 transition-colors ${side === 'left' ? 'border-r' : 'border-l'}`}
            onClick={onOpen}
        >
            {icon}
            {side === 'left'
                ? <ChevronRight className="w-4 h-4 text-slate-500" />
                : <ChevronLeft className="w-4 h-4 text-slate-500" />
            }
        </div>
    );
}
