import {
    createChart,
    IChartApi,
    ISeriesApi,
    Time,
    CandlestickSeries,
    HistogramSeries,
    ColorType,
} from 'lightweight-charts';
import type { LayoutManager } from './LayoutManager';

/**
 * Manages a single TradingView Lightweight Chart instance.
 * Handles creation, data binding, crosshair sync, and cleanup.
 */
export class ChartManager {
    chart: IChartApi | null = null;
    candleSeries: ISeriesApi<"Candlestick"> | null = null;
    volumeSeries: ISeriesApi<"Histogram"> | null = null;
    preHistorySeries: ISeriesApi<"Candlestick"> | null = null;

    private layout: LayoutManager;
    private container: HTMLElement | null = null;

    constructor(layout: LayoutManager) {
        this.layout = layout;
    }

    mount(container: HTMLElement): void {
        this.container = container;

        this.chart = createChart(container, {
            autoSize: true,
            layout: {
                background: { type: ColorType.Solid, color: '#0f172a' },
                textColor: '#94a3b8',
            },
            grid: {
                vertLines: { color: '#1e293b' },
                horzLines: { color: '#1e293b' },
            },
            timeScale: { timeVisible: true, secondsVisible: false },
            crosshair: { mode: 1 },
        });

        this.preHistorySeries = this.chart.addSeries(CandlestickSeries, {
            upColor:       '#4b5563',
            downColor:     '#4b5563',
            borderVisible: false,
            wickUpColor:   '#4b5563',
            wickDownColor: '#4b5563',
        });

        this.candleSeries = this.chart.addSeries(CandlestickSeries, {
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        });

        this.volumeSeries = this.chart.addSeries(HistogramSeries, {
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: '',
        });
        this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

        // Crosshair sync
        this.chart.subscribeCrosshairMove((param) => {
            this.layout.setHoveredTime(param.time ? (param.time as number) : null);
        });

        // Visible range sync
        this.chart.timeScale().subscribeVisibleTimeRangeChange((timeRange) => {
            if (timeRange) {
                this.layout.setVisibleTimeRange({ from: timeRange.from as number, to: timeRange.to as number });
            }
        });
    }

    unmount(): void {
        // preHistorySeries is owned by the chart and destroyed with it
        this.preHistorySeries = null;
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
        this.container = null;
    }

    setPriceData(data: unknown[]): void {
        if (this.candleSeries && data.length > 0) {
            this.candleSeries.setData(data as Parameters<typeof this.candleSeries.setData>[0]);
        }
    }

    setVolumeData(data: unknown[]): void {
        if (this.volumeSeries) {
            this.volumeSeries.setData(data.length > 0 ? data as Parameters<typeof this.volumeSeries.setData>[0] : []);
        }
    }

    setPreHistoryData(data: unknown[]): void {
        if (!this.preHistorySeries) return;
        if (data.length > 0) {
            this.preHistorySeries.setData(data as Parameters<typeof this.preHistorySeries.setData>[0]);
        } else {
            this.preHistorySeries.setData([]);
        }
    }

    setCrosshairPosition(time: Time): void {
        if (this.chart && this.candleSeries) {
            try { this.chart.setCrosshairPosition(0, time, this.candleSeries); } catch { /* time out of range */ }
        }
    }

    fitContent(): void {
        this.chart?.timeScale().fitContent();
    }

    applyTimeScaleOptions(isOneMinuteResolution: boolean): void {
        if (!this.chart) return;
        (this.chart as IChartApi).applyOptions({
            timeScale: {
                timeVisible: true,
                tickMarkFormatter: isOneMinuteResolution
                    ? (time: number, _tickMarkType: number, locale: string) => {
                        const date = new Date(time * 1000);
                        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
                    }
                    : undefined,
            },
        });
    }
}
