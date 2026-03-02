"use client";

import React from 'react';

interface ToggleSwitchProps {
    enabled: boolean;
    onChange: () => void;
    color?: string;
}

export function ToggleSwitch({ enabled, onChange, color = '#10b981' }: ToggleSwitchProps) {
    return (
        <button
            onClick={onChange}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? '' : 'bg-slate-700'}`}
            style={{ backgroundColor: enabled ? color : undefined }}
        >
            <span
                className="inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
                style={{ transform: enabled ? 'translateX(20px)' : 'translateX(4px)' }}
            />
        </button>
    );
}
