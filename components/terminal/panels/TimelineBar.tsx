"use client";

import React, { useEffect, useRef } from 'react';
import { useTerminal } from '../TerminalContext';
import { Play, Pause, Square, SkipBack, SkipForward } from 'lucide-react';

function parseResolutionSeconds(res: string): number | null {
    const match = res.trim().match(/^(\d+)([a-zA-Z]+)$/);
    if (!match) return null;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (Number.isNaN(value)) return null;
    if (unit === 'd') return value * 86400;
    if (unit === 'h') return value * 3600;
    if (unit === 'm') return value * 60;
    return null;
}

function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatDateTime(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${date}  ${hh}:${mm}`;
}

export default function TimelineBar() {
    const { state, playTimeline, pauseTimeline, stopTimeline, setPlaybackTime, setPlaybackSpeed } = useTerminal();
    const { config, dataTimeRange, playbackTime, playbackSpeed, isPlaying, timelineEnabled } = state;

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const currentTimeRef = useRef<number | null>(null);

    useEffect(() => { currentTimeRef.current = playbackTime; }, [playbackTime]);

    // Auto-advance
    useEffect(() => {
        if (!isPlaying || !dataTimeRange) return;

        const baseStep = 60; // always 1m = 60 seconds
        const stepSize = baseStep * playbackSpeed;

        intervalRef.current = setInterval(() => {
            const current = currentTimeRef.current ?? dataTimeRange.from;
            const next = current + stepSize;
            if (next >= dataTimeRange.to) {
                setPlaybackTime(dataTimeRange.to);
                pauseTimeline();
            } else {
                setPlaybackTime(next);
            }
        }, 100);

        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [isPlaying, playbackSpeed, dataTimeRange, setPlaybackTime, pauseTimeline]);

    if (!timelineEnabled || !dataTimeRange) return null;

    const { from: startTime, to: endTime, boundaryTime } = dataTimeRange;
    const totalDuration = endTime - startTime;
    const currentTime = playbackTime ?? startTime;
    const progress = totalDuration > 0 ? ((currentTime - startTime) / totalDuration) * 100 : 0;
    const boundaryPct = totalDuration > 0 && boundaryTime != null && boundaryTime > startTime && boundaryTime < endTime
        ? ((boundaryTime - startTime) / totalDuration) * 100
        : null;

    const handlePlayPause = () => {
        if (isPlaying) { pauseTimeline(); }
        else {
            if (currentTime >= endTime) setPlaybackTime(startTime);
            playTimeline();
        }
    };

    const handleSkip = (direction: 'forward' | 'backward') => {
        const oneBar = 60; // always 1m = 60 seconds
        setPlaybackTime(direction === 'forward'
            ? Math.min(currentTime + oneBar, endTime)
            : Math.max(currentTime - oneBar, startTime));
    };

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPlaybackTime(startTime + (parseFloat(e.target.value) / 100) * totalDuration);
    };

    const speedOptions = [0.1, 0.2, 0.5, 1, 2, 5, 10];

    return (
        <div className="h-10 bg-slate-900/80 border-b border-slate-800 flex items-center gap-3 px-4">
            <div className="flex items-center gap-1">
                <button onClick={() => handleSkip('backward')} className="p-1.5 hover:bg-slate-700 rounded transition-colors" title="Skip backward">
                    <SkipBack className="w-4 h-4 text-slate-400" />
                </button>
                <button onClick={handlePlayPause} className="p-1.5 hover:bg-slate-700 rounded transition-colors" title={isPlaying ? 'Pause' : 'Play'}>
                    {isPlaying ? <Pause className="w-4 h-4 text-emerald-400" /> : <Play className="w-4 h-4 text-emerald-400" />}
                </button>
                <button onClick={stopTimeline} className="p-1.5 hover:bg-slate-700 rounded transition-colors" title="Stop and reset">
                    <Square className="w-4 h-4 text-slate-400" />
                </button>
                <button onClick={() => handleSkip('forward')} className="p-1.5 hover:bg-slate-700 rounded transition-colors" title="Skip forward">
                    <SkipForward className="w-4 h-4 text-slate-400" />
                </button>
            </div>

            <select
                value={playbackSpeed}
                onChange={e => setPlaybackSpeed(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
                {speedOptions.map(s => <option key={s} value={s}>{s}x</option>)}
            </select>

            <div className="flex-1 flex items-center gap-3 min-w-0">
                <span className="text-xs text-slate-500 w-20 shrink-0">{formatDate(startTime)}</span>
                <div className="flex-1 relative min-w-0">
                    {boundaryPct != null && (
                        <div className="absolute top-0 bottom-0 w-0 pointer-events-none z-10" style={{ left: `${boundaryPct}%`, marginLeft: -1, borderLeft: '2px dashed #eab308', opacity: 0.9 }} />
                    )}
                    <input type="range" min="0" max="100" step="0.1" value={progress} onChange={handleSliderChange}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                </div>
                <span className="text-xs text-slate-500 w-20 text-right shrink-0">{formatDate(endTime)}</span>
            </div>

            <div className="px-3 py-1 bg-slate-800 rounded text-xs font-medium text-emerald-400 tabular-nums whitespace-nowrap">
                {formatDateTime(currentTime)}
            </div>
        </div>
    );
}
