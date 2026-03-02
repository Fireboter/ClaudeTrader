"use client";

import React, { useState, ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleGroupProps {
    title: string;
    icon: ReactNode;
    defaultOpen?: boolean;
    children: ReactNode;
}

export function CollapsibleGroup({ title, icon, defaultOpen = true, children }: CollapsibleGroupProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border-b border-slate-800">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
            >
                <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                    {icon}
                    {title}
                </div>
                {isOpen
                    ? <ChevronDown className="w-4 h-4 text-slate-500" />
                    : <ChevronRight className="w-4 h-4 text-slate-500" />
                }
            </button>
            {isOpen && <div className="px-4 pb-4">{children}</div>}
        </div>
    );
}
