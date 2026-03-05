"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useTerminal } from '../TerminalContext';
import { Play, TrendingUp, TrendingDown, DollarSign, Percent, Activity } from 'lucide-react';
import { createChart, IChartApi, LineSeries, Time } from 'lightweight-charts';
import { runBacktestSimulation, type BacktestTrade, type BacktestStats } from '../core/backtest/backtestEngine';

// ─── Sub-components ─────────────────────────────────────────────

function StatCard({ label, value, icon, color = 'text-slate-200' }: { label: string; value: string | number; icon: React.ReactNode; color?: string }) {
    return (
        <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-slate-500 text-xs uppercase font-bold mb-1">{icon}{label}</div>
            <div className={`text-lg font-bold ${color}`}>{value}</div>
        </div>
    );
}

function EquityChart({ data }: { data: { time: Time; value: number }[] }) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current || data.length === 0) return;

        const chart = createChart(containerRef.current, {
            layout: { background: { color: 'transparent' }, textColor: '#64748b' },
            grid: { vertLines: { visible: false }, horzLines: { color: '#1e293b' } },
            rightPriceScale: { borderVisible: false },
            timeScale: { borderVisible: false, visible: false },
            crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
        });

        const series = chart.addSeries(LineSeries, { color: '#10b981', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        series.setData(data);

        const ro = new ResizeObserver(() => {
            if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
        });
        ro.observe(containerRef.current);
        chart.timeScale().fitContent();

        return () => { ro.disconnect(); chart.remove(); };
    }, [data]);

    return <div ref={containerRef} className="h-full w-full" />;
}

function TradesTable({ trades }: { trades: BacktestTrade[] }) {
    if (trades.length === 0) {
        return <div className="flex items-center justify-center h-full text-slate-500 text-sm">No trades yet. Run a backtest to see results.</div>;
    }

    return (
        <div className="overflow-auto h-full">
            <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500 bg-slate-800/50 sticky top-0">
                    <tr>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-right">Entry</th>
                        <th className="px-3 py-2 text-right">Exit</th>
                        <th className="px-3 py-2 text-right">PnL</th>
                        <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {trades.slice(0, 50).map(trade => (
                        <tr key={trade.id} className="border-t border-slate-800 hover:bg-slate-800/30">
                            <td className="px-3 py-2">
                                <span className={`flex items-center gap-1 ${trade.type === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {trade.type === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {trade.type.toUpperCase()}
                                </span>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-300">${trade.entryPrice.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-slate-300">{trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '-'}</td>
                            <td className={`px-3 py-2 text-right font-medium ${(trade.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {trade.pnl !== undefined ? `${trade.pnl >= 0 ? '+' : ''}${(trade.pnl * 100).toFixed(2)}%` : '-'}
                            </td>
                            <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded text-xs ${trade.status === 'active' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                                    {trade.status}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Main BottomBar ─────────────────────────────────────────────

export default function BottomBar() {
    const terminal = useTerminal();
    const { state } = terminal;
    const {
        tradeAxisConfig, strategyConfig, enabledIndicators,
        trendlineConfig, earlyPivotConfig,
    } = state;

    const [isRunning, setIsRunning] = useState(false);
    const [trades, setTrades] = useState<BacktestTrade[]>([]);
    const [equityCurve, setEquityCurve] = useState<{ time: Time; value: number }[]>([]);
    const [stats, setStats] = useState<BacktestStats | null>(null);
    const [backtestError, setBacktestError] = useState<string | null>(null);

    const runBacktest = () => {
        setIsRunning(true);
        setBacktestError(null);

        try {
            if (!enabledIndicators['signals']) {
                throw new Error('Enable Signals in Strategy to run a signals backtest.');
            }

            const market = terminal.store.marketData;
            if (market.days.length === 0) {
                throw new Error('No market data loaded. Load a chart first.');
            }

            const result = runBacktestSimulation(
                market.days,
                market.preHistoryCount,
                tradeAxisConfig,
                strategyConfig,
                trendlineConfig,
                { enabled: true, usePivotConfirmation: true, useBreakoutDetection: false },
                earlyPivotConfig,
            );

            setTrades(result.trades);
            setEquityCurve(result.equityCurve);
            setStats(result.stats);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Backtest failed.';
            setBacktestError(message);
            setTrades([]);
            setEquityCurve([]);
            setStats(null);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="h-full flex">
            {/* Stats Panel */}
            <div className="w-[280px] flex-shrink-0 border-r border-slate-800 p-3 flex flex-col">
                <button onClick={runBacktest} disabled={isRunning}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 mb-4">
                    {isRunning ? <><Activity className="w-4 h-4 animate-spin" />Running...</> : <><Play className="w-4 h-4" />Run Backtest</>}
                </button>
                {backtestError && (
                    <div className="mb-3 text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1">{backtestError}</div>
                )}
                <div className="grid grid-cols-2 gap-2 flex-1">
                    <StatCard label="Return" value={stats ? `${stats.total_return >= 0 ? '+' : ''}${stats.total_return.toFixed(2)}%` : '-'} icon={<Percent className="w-3 h-3" />} color={stats && stats.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                    <StatCard label="Win Rate" value={stats ? `${(stats.win_rate * 100).toFixed(1)}%` : '-'} icon={<TrendingUp className="w-3 h-3" />} color="text-blue-400" />
                    <StatCard label="Trades" value={stats ? stats.total_trades : '-'} icon={<Activity className="w-3 h-3" />} />
                    <StatCard label="Max DD" value={stats ? `${stats.max_drawdown.toFixed(2)}%` : '-'} icon={<TrendingDown className="w-3 h-3" />} color="text-red-400" />
                    <StatCard label="Sharpe" value={stats ? stats.sharpe_ratio.toFixed(2) : '-'} icon={<DollarSign className="w-3 h-3" />} />
                    <StatCard label="Profit Factor" value={stats ? stats.profit_factor.toFixed(2) : '-'} icon={<DollarSign className="w-3 h-3" />} />
                </div>
            </div>

            {/* Equity Chart */}
            <div className="w-[350px] flex-shrink-0 border-r border-slate-800">
                <div className="p-2 text-xs uppercase text-slate-500 font-bold border-b border-slate-800">Equity Curve</div>
                <div className="h-[calc(100%-28px)]">
                    {equityCurve.length > 0 ? <EquityChart data={equityCurve} /> : (
                        <div className="flex items-center justify-center h-full text-slate-500 text-sm">Run backtest to see equity curve</div>
                    )}
                </div>
            </div>

            {/* Trades Table */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="p-2 text-xs uppercase text-slate-500 font-bold border-b border-slate-800">Trades ({trades.length})</div>
                <div className="flex-1 min-h-0"><TradesTable trades={trades} /></div>
            </div>
        </div>
    );
}
