"use client";

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface InfoModalProps {
    name: string;
    description: string;
    color: string;
    onClose: () => void;
}

export function InfoModal({ name, description, color, onClose }: InfoModalProps) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <h3 className="text-lg font-bold text-slate-100">{name}</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed font-sans mb-4">{description}</p>
                <div className="flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
