"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface ResizeHandleProps {
    direction: 'horizontal' | 'vertical';
    onDrag: (delta: number) => void;
}

export function ResizeHandle({ direction, onDrag }: ResizeHandleProps) {
    const [isDragging, setIsDragging] = useState(false);
    const startPos = useRef(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    }, [direction]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
            const delta = currentPos - startPos.current;
            startPos.current = currentPos;
            onDrag(delta);
        };

        const handleMouseUp = () => setIsDragging(false);

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, direction, onDrag]);

    const isH = direction === 'horizontal';

    return (
        <div
            className={`
                ${isH ? 'w-1.5 h-full cursor-ew-resize' : 'h-1.5 w-full cursor-ns-resize'}
                bg-slate-800 hover:bg-slate-600 transition-colors flex-shrink-0
                ${isDragging ? 'bg-emerald-600' : ''}
            `}
            onMouseDown={handleMouseDown}
        />
    );
}
