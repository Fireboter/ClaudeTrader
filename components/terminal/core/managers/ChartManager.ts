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

    /**
     * Track previous bar counts so we can use series.update() instead of
     * series.setData() when only the last bar was added or modified.
     * series.update() is O(1) — it only touches the last bar.
     * series.setData() is O(N) — re-processes every bar and re-renders the chart.
     * Using update() during playback reduces per-keypress cost from O(N) to O(1).
     */
    private _prevPriceLen   = 0;
    private _prevVolLen     = 0;
    private _prevPreHistLen = -1;   // -1 = never set; always run setData on first call

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
        if (!this.candleSeries) return;

        if (data.length === 0) {
            // Symbol cleared — reset the series and the counter
            if (this._prevPriceLen > 0) {
                this.candleSeries.setData([]);
                this._prevPriceLen = 0;
            }
            return;
        }

        // Incremental path: bars only added (+1) or the last bar was updated (same count).
        // series.update() replaces/appends the last bar in O(1) without re-rendering all N bars.
        // Full setData() is needed when bars are removed (backward navigation) or on initial load.
        const isIncremental =
            this._prevPriceLen > 0 &&
            data.length >= this._prevPriceLen &&
            data.length <= this._prevPriceLen + 1;

        if (isIncremental) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.candleSeries.update((data as any)[data.length - 1]);
        } else {
            this.candleSeries.setData(data as Parameters<typeof this.candleSeries.setData>[0]);
        }
        this._prevPriceLen = data.length;
    }

    setVolumeData(data: unknown[]): void {
        if (!this.volumeSeries) return;

        if (data.length === 0) {
            if (this._prevVolLen > 0) {
                this.volumeSeries.setData([]);
                this._prevVolLen = 0;
            }
            return;
        }

        const isIncremental =
            this._prevVolLen > 0 &&
            data.length >= this._prevVolLen &&
            data.length <= this._prevVolLen + 1;

        if (isIncremental) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.volumeSeries.update((data as any)[data.length - 1]);
        } else {
            this.volumeSeries.setData(data as Parameters<typeof this.volumeSeries.setData>[0]);
        }
        this._prevVolLen = data.length;
    }

    setPreHistoryData(data: unknown[]): void {
        if (!this.preHistorySeries) return;

        // Pre-history bars are static during playback — the first preHistoryCount
        // bars never change while the user steps through minutes.  Skip the
        // setData() call when the length is unchanged to avoid an O(N) redraw
        // on every playback step.
        if (data.length === this._prevPreHistLen) return;
        this._prevPreHistLen = data.length;

        this.preHistorySeries.setData(
            data.length > 0
                ? data as Parameters<typeof this.preHistorySeries.setData>[0]
                : [],
        );
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
