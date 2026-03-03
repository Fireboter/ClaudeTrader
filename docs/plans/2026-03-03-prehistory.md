# Pre-History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepend N configurable daily bars (no minute data) before the actual trading range, rendered in grey with a yellow dashed boundary line, window-size pivots + trendlines active but no signals.

**Architecture:** Backend extends `/api/candles/full` to prepend pre-history days. Frontend splits the returned array at `boundary_time`, feeds two chart series (grey pre-history + normal main), and gates signal/early-pivot computation to the actual range. Stop/reset jumps to boundary; ← arrow can enter pre-history at day resolution.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Python FastAPI, Lightweight Charts v5, axios

---

## Task 1: Backend — extend `/api/candles/full` with `prehistory_bars`

**Files:**
- Modify: `api/routers/candles.py`

**Context:** The `get_full_candles` function currently ignores any concept of pre-history. We need to add a `prehistory_bars` param, slice that many trading days from `daily` before the main window start, build day objects with `minutes: []`, prepend them, and add `boundary_time` to the response.

**Step 1: Add the `prehistory_bars` query param and build pre-history days**

In `api/routers/candles.py`, update `get_full_candles` as follows:

```python
@router.get("/full")
def get_full_candles(
    symbol:          str        = Query(...),
    mode:            str        = Query("random", enum=["fixed", "random"]),
    start_date:      str | None = Query(None),
    end_date:        str | None = Query(None),
    duration_days:   int        = Query(365),
    seed:            float      = Query(0.5),
    prehistory_bars: int        = Query(0, ge=0, description="Daily bars to prepend before the range (no minutes)"),
):
    try:
        daily, df_1m = _load_and_slice(symbol, mode, start_date, end_date, duration_days, seed)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to load full candles for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # ── Pre-history: daily bars immediately before the main range ──────────────
    boundary_time: int | None = None
    prehistory_result: list[dict] = []

    if prehistory_bars > 0 and not daily.empty:
        range_start = daily.index.min()
        # Load all daily bars for the symbol (unsliced) to look back before range_start
        full_daily = _resample_daily(_load_1m(symbol))
        pre = full_daily[full_daily.index < range_start]
        # Take the last N trading days
        pre = pre.iloc[max(0, len(pre) - prehistory_bars):]
        prehistory_result = [
            {**_candle_dict(ts, row), "minutes": []}
            for ts, row in pre.iterrows()
        ]
        boundary_time = int(daily.index[0].timestamp())

    # ── Main range: group 1m bars by date (unchanged logic) ───────────────────
    df_1m_copy = df_1m.copy()
    df_1m_copy["_date"] = df_1m_copy.index.normalize()
    groups = {str(date.date()): grp.drop(columns=["_date"])
              for date, grp in df_1m_copy.groupby("_date")}

    result = []
    for ts, row in daily.iterrows():
        day_key = str(ts.date())
        grp     = groups.get(day_key, pd.DataFrame())
        minutes = [_minute_dict(mts, mrow) for mts, mrow in grp.iterrows()] if not grp.empty else []
        entry   = _candle_dict(ts, row)
        entry["minutes"] = minutes
        result.append(entry)

    return {"days": prehistory_result + result, "boundary_time": boundary_time}
```

**Step 2: Verify with curl**

Start the API server (`python -m api.server` from `C:/ClaudeTrader`), then:

```bash
curl "http://localhost:9001/api/candles/full?symbol=GLD&mode=random&duration_days=30&seed=0.5&prehistory_bars=5"
```

Expected: JSON with `days` array where the first 5 entries have `"minutes": []` and the 6th entry has `"minutes": [...]`. `boundary_time` equals `days[5].time`.

Also verify zero pre-history still works:
```bash
curl "http://localhost:9001/api/candles/full?symbol=GLD&mode=random&duration_days=30&seed=0.5"
```
Expected: `boundary_time` is `null`, all days have minutes as before.

**Step 3: Commit**

```bash
git add api/routers/candles.py
git commit -m "feat(api): add prehistory_bars param to /api/candles/full"
```

---

## Task 2: `MarketDataStore` — add `preHistoryCount`

**Files:**
- Modify: `components/terminal/core/store/MarketDataStore.ts`

**Context:** `market.days` will now contain pre-history days prepended. Managers need to know where the actual range starts. We add `preHistoryCount` and a computed `boundaryTime` getter.

**Step 1: Update `MarketDataStore`**

Replace the entire file content:

```typescript
import { Observable } from '../Observable';
import type { DayCandle } from '../models/Candle';

/**
 * Central store for fully-preloaded price data.
 * `days` holds every daily bar for the current window, each with its
 * 1-minute bars already embedded under `minutes`.
 *
 * The first `preHistoryCount` days are pre-history bars (minutes: []).
 * Actual-range data starts at index `preHistoryCount`.
 */
export class MarketDataStore extends Observable {
    days:            DayCandle[] = [];
    preHistoryCount: number      = 0;

    setDays(data: DayCandle[], preHistoryCount = 0): void {
        this.days            = data;
        this.preHistoryCount = preHistoryCount;
        this.notify();
    }

    clear(): void {
        this.days            = [];
        this.preHistoryCount = 0;
        this.notify();
    }

    get isEmpty(): boolean { return this.days.length === 0; }

    /** Unix-seconds timestamp of the first actual-range day. Null when no pre-history. */
    get boundaryTime(): number | null {
        if (this.preHistoryCount <= 0 || this.days.length <= this.preHistoryCount) return null;
        return this.days[this.preHistoryCount].time;
    }

    /** Return the index of the day whose UTC-midnight timestamp equals `dayTime`. */
    dayIndexByTime(dayTime: number): number {
        return this.days.findIndex(d => d.time === dayTime);
    }
}
```

**Step 2: TypeScript compile check**

```bash
cd C:/ClaudeTrader && npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/terminal/core/store/MarketDataStore.ts
git commit -m "feat(store): add preHistoryCount + boundaryTime to MarketDataStore"
```

---

## Task 3: `LayoutManager` — stop resets to boundary

**Files:**
- Modify: `components/terminal/core/managers/LayoutManager.ts`

**Context:** Currently `stopTimeline()` sets `playbackTime = null` (free-scroll). With behaviour C, Stop should jump to `boundaryTime` so the user lands at the start of the actual range.

**Step 1: Update `stopTimeline`**

Find this line in `LayoutManager.ts`:
```typescript
stopTimeline(): void { this.isPlaying = false; this.playbackTime = null; this.emit(); }
```

Replace with:
```typescript
stopTimeline(): void {
    this.isPlaying   = false;
    // Reset to boundary (start of actual range) if pre-history is active,
    // otherwise fall back to null (free-scroll).
    this.playbackTime = this.dataTimeRange?.boundaryTime ?? null;
    this.emit();
}
```

**Step 2: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/terminal/core/managers/LayoutManager.ts
git commit -m "feat(playback): stop resets to boundary time when pre-history is active"
```

---

## Task 4: `PlaybackManager` — handle pre-history days (no minutes)

**Files:**
- Modify: `components/terminal/core/managers/PlaybackManager.ts`

**Context:** Pre-history days have `minutes: []`. The current `_setFirstMinuteOfDay` / `_setLastMinuteOfDay` silently do nothing when `mins.length === 0`. We need them to fall back to the day's UTC-midnight timestamp so ← / → navigation works in the pre-history zone.

**Step 1: Update both helpers**

Find `_setFirstMinuteOfDay`:
```typescript
private _setFirstMinuteOfDay(dayIdx: number): void {
    const mins = this.market.days[dayIdx].minutes;
    if (mins.length > 0) {
        this.layout.minuteIndex  = 0;
        this.layout.playbackTime = mins[0].time;
    }
}
```

Replace with:
```typescript
private _setFirstMinuteOfDay(dayIdx: number): void {
    const day  = this.market.days[dayIdx];
    const mins = day.minutes;
    if (mins.length > 0) {
        this.layout.minuteIndex  = 0;
        this.layout.playbackTime = mins[0].time;
    } else {
        // Pre-history day: no minutes — park at the day's UTC midnight.
        this.layout.minuteIndex  = 0;
        this.layout.playbackTime = day.time;
    }
}
```

Find `_setLastMinuteOfDay`:
```typescript
private _setLastMinuteOfDay(dayIdx: number): void {
    const mins = this.market.days[dayIdx].minutes;
    if (mins.length > 0) {
        this.layout.minuteIndex  = mins.length - 1;
        this.layout.playbackTime = mins[mins.length - 1].time;
    }
}
```

Replace with:
```typescript
private _setLastMinuteOfDay(dayIdx: number): void {
    const day  = this.market.days[dayIdx];
    const mins = day.minutes;
    if (mins.length > 0) {
        this.layout.minuteIndex  = mins.length - 1;
        this.layout.playbackTime = mins[mins.length - 1].time;
    } else {
        // Pre-history day: no minutes — park at the day's UTC midnight.
        this.layout.minuteIndex  = 0;
        this.layout.playbackTime = day.time;
    }
}
```

**Step 2: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/terminal/core/managers/PlaybackManager.ts
git commit -m "feat(playback): navigate through pre-history days that have no minutes"
```

---

## Task 5: `ChartManager` — add grey `preHistorySeries`

**Files:**
- Modify: `components/terminal/core/managers/ChartManager.ts`

**Context:** Pre-history candles need a visually distinct style. We add a second `CandlestickSeries` mounted *before* the main series (so it renders behind it) with muted grey colours.

**Step 1: Add `preHistorySeries` field and `setPreHistoryData` method**

At the top of the class, after the existing series fields, add:
```typescript
preHistorySeries: ISeriesApi<"Candlestick"> | null = null;
```

In `mount()`, add the pre-history series creation **before** the existing `this.candleSeries = ...` line:
```typescript
this.preHistorySeries = this.chart.addSeries(CandlestickSeries, {
    upColor:      '#4b5563',
    downColor:    '#4b5563',
    borderVisible: false,
    wickUpColor:   '#4b5563',
    wickDownColor: '#4b5563',
});
```

Add the new method after `setVolumeData`:
```typescript
setPreHistoryData(data: unknown[]): void {
    if (!this.preHistorySeries) return;
    if (data.length > 0) {
        this.preHistorySeries.setData(data as Parameters<typeof this.preHistorySeries.setData>[0]);
    } else {
        this.preHistorySeries.setData([]);
    }
}
```

In `unmount()`, add cleanup before the existing `this.chart.remove()` call:
```typescript
// (preHistorySeries is owned by the chart and removed with it)
this.preHistorySeries = null;
```

**Step 2: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/terminal/core/managers/ChartManager.ts
git commit -m "feat(chart): add grey preHistorySeries to ChartManager"
```

---

## Task 6: `BoundaryOverlay` — yellow dashed vertical line

**Files:**
- Create: `components/terminal/chart/BoundaryOverlay.tsx`

**Context:** An SVG overlay (same pattern as `TrendlineOverlay`) that draws a full-height yellow dashed vertical line at `boundaryTime`. It repositions on scroll/zoom by subscribing to the chart's time-scale range change event.

**Step 1: Create the file**

```typescript
"use client";

import React, { useEffect, useRef } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';

interface Props {
    chart:        IChartApi | null;
    series:       ISeriesApi<"Candlestick"> | null;
    boundaryTime: number | null;
}

/**
 * Renders a yellow dashed vertical line at the boundary between pre-history
 * and the actual trading range.  Uses an absolutely-positioned SVG that
 * covers the chart container.  Repositions whenever the time-scale scrolls
 * or zooms.
 */
export function BoundaryOverlay({ chart, series, boundaryTime }: Props) {
    const svgRef  = useRef<SVGSVGElement>(null);
    const lineRef = useRef<SVGLineElement>(null);

    useEffect(() => {
        if (!chart || !series || boundaryTime == null) {
            if (lineRef.current) lineRef.current.setAttribute('visibility', 'hidden');
            return;
        }

        const reposition = () => {
            const svg  = svgRef.current;
            const line = lineRef.current;
            if (!svg || !line) return;

            const x = chart.timeScale().timeToCoordinate(boundaryTime as never);
            if (x === null || !isFinite(x)) {
                line.setAttribute('visibility', 'hidden');
                return;
            }

            const h = svg.clientHeight;
            line.setAttribute('x1', String(x));
            line.setAttribute('x2', String(x));
            line.setAttribute('y1', '0');
            line.setAttribute('y2', String(h));
            line.setAttribute('visibility', 'visible');
        };

        reposition();
        chart.timeScale().subscribeVisibleTimeRangeChange(reposition);
        return () => chart.timeScale().unsubscribeVisibleTimeRangeChange(reposition);
    }, [chart, series, boundaryTime]);

    if (boundaryTime == null) return null;

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 pointer-events-none"
            style={{ width: '100%', height: '100%' }}
        >
            <line
                ref={lineRef}
                stroke="#eab308"
                strokeWidth={2}
                strokeDasharray="6 4"
                opacity={0.9}
                visibility="hidden"
            />
        </svg>
    );
}
```

**Step 2: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/terminal/chart/BoundaryOverlay.tsx
git commit -m "feat(chart): add BoundaryOverlay SVG component for pre-history boundary line"
```

---

## Task 7: `SignalManager` — filter signals to actual range

**Files:**
- Modify: `components/terminal/core/managers/SignalManager.ts`

**Context:** Entry signals must not fire in the pre-history zone. The `SignalFilter` is fed `confirmedEarlyPivots` (which have a `dayIndex`) and `brokenTrendlines`. We filter early pivots to those at `dayIndex >= preHistoryCount` before passing them in.

**Step 1: Filter confirmedEarlyPivots in `_recompute`**

In `SignalManager._recompute()`, find the line:
```typescript
const { signals: freshSignals } = this.filter.compute(
    this.earlyPivotMgr.confirmedEarlyPivots,
    this.trendlineMgr.trendlines,
```

Replace with:
```typescript
const preHistoryCount = this.market.preHistoryCount;
const actualRangePivots = this.earlyPivotMgr.confirmedEarlyPivots
    .filter(p => p.dayIndex >= preHistoryCount);

const { signals: freshSignals } = this.filter.compute(
    actualRangePivots,
    this.trendlineMgr.trendlines,
```

**Step 2: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/terminal/core/managers/SignalManager.ts
git commit -m "feat(signals): filter confirmed early pivots to actual range (exclude pre-history)"
```

---

## Task 8: `MainChart.tsx` — wire everything together

**Files:**
- Modify: `components/terminal/chart/MainChart.tsx`

**Context:** This is the central wiring task. We need to:
1. Pass `prehistory_bars` to the API call
2. Read `boundary_time` from the response
3. Compute `preHistoryCount` and store it in local state
4. Feed the two chart series separately
5. Mount `BoundaryOverlay`
6. Filter early pivots in the overlay

**Step 1: Update imports**

Add to the existing imports at the top:
```typescript
import { BoundaryOverlay } from './BoundaryOverlay';
```

**Step 2: Add `preHistoryCount` to local state**

After the existing `useState` declarations, add:
```typescript
const [preHistoryCount, setPreHistoryCount] = useState(0);
```

**Step 3: Pass `prehistory_bars` to the API call**

In the fetch `useEffect`, add the param to the existing `params` object (after `params.seed = ...` or similar):
```typescript
const stratCfg = terminal.store.layout.strategyConfig;
if (stratCfg.preHistoryBars > 0) {
    params.prehistory_bars = stratCfg.preHistoryBars;
}
```

**Step 4: Handle `boundary_time` in the response**

The current response handler is:
```typescript
.then(res => {
    if (cancelled) return;
    const data = res.data.days ?? [];
    if (data.length === 0) {
        setError(`No data for ${config.symbol} in this range`);
        return;
    }
    setDays(data);
    market.setDays(data);
    setDataTimeRange({ from: data[0].time, to: data[data.length - 1].time });
})
```

Replace with:
```typescript
.then(res => {
    if (cancelled) return;
    const data       = res.data.days        ?? [];
    const boundaryTs = res.data.boundary_time ?? null;
    if (data.length === 0) {
        setError(`No data for ${config.symbol} in this range`);
        return;
    }

    // Derive preHistoryCount from boundary_time
    const phCount = boundaryTs != null
        ? data.findIndex((d: { time: number }) => d.time === boundaryTs)
        : 0;
    const safeCount = phCount < 0 ? 0 : phCount;

    setDays(data);
    setPreHistoryCount(safeCount);
    market.setDays(data, safeCount);
    setDataTimeRange({
        from: data[0].time,
        to:   data[data.length - 1].time,
        ...(boundaryTs != null ? { boundaryTime: boundaryTs } : {}),
    });
})
```

**Step 5: Add `strategyConfig.preHistoryBars` to the fetch dep array**

Change the `// eslint-disable-next-line` comment dep array line to include `state.strategyConfig.preHistoryBars`:
```typescript
}, [config.symbol, config.mode, config.startDate, config.endDate,
    config.years, config.months, config.days, randomSeed,
    state.strategyConfig.preHistoryBars]);
```

**Step 6: Split visible days into pre-history and main in the useMemo**

After the existing `const { priceBars, volumeBars, visibleDays } = useMemo(...)` block, add a derived split:
```typescript
const { preHistoryBars: preHistPriceBars, mainPriceBars, mainVolumeBars } = useMemo(() => {
    if (preHistoryCount <= 0 || priceBars.length <= preHistoryCount) {
        return {
            preHistPriceBars: [],
            mainPriceBars:    priceBars,
            mainVolumeBars:   volumeBars,
        };
    }
    return {
        preHistPriceBars: priceBars.slice(0, preHistoryCount),
        mainPriceBars:    priceBars.slice(preHistoryCount),
        mainVolumeBars:   volumeBars.slice(preHistoryCount),
    };
}, [priceBars, volumeBars, preHistoryCount]);
```

**Step 7: Push pre-history and main data to the chart separately**

Find the existing "Push price/volume data to chart" `useEffect`:
```typescript
useEffect(() => {
    const mgr = chartMgrRef.current;
    if (!mgr || priceBars.length === 0) return;
    mgr.setPriceData(priceBars);
    mgr.setVolumeData(volumeBars);
    if (playbackTime === null) mgr.fitContent();
}, [priceBars, volumeBars, playbackTime]);
```

Replace with:
```typescript
useEffect(() => {
    const mgr = chartMgrRef.current;
    if (!mgr) return;
    mgr.setPreHistoryData(preHistPriceBars);
    if (mainPriceBars.length > 0) {
        mgr.setPriceData(mainPriceBars);
        mgr.setVolumeData(mainVolumeBars);
    }
    if (playbackTime === null && (preHistPriceBars.length + mainPriceBars.length) > 0) {
        mgr.fitContent();
    }
}, [preHistPriceBars, mainPriceBars, mainVolumeBars, playbackTime]);
```

**Step 8: Filter early pivots passed to `EarlyPivotOverlay`**

Find the `EarlyPivotOverlay` JSX in the return:
```tsx
<EarlyPivotOverlay
    chart={chartApi}
    series={candleSeries}
    days={visibleDays}
    earlyPivots={[...earlyPivots, ...earlyConfirmedPivots]}
    config={earlyPivotConfig}
    enabled={earlyPivotConfig.enabled}
/>
```

Replace with:
```tsx
<EarlyPivotOverlay
    chart={chartApi}
    series={candleSeries}
    days={visibleDays}
    earlyPivots={[...earlyPivots, ...earlyConfirmedPivots].filter(p => p.dayIndex >= preHistoryCount)}
    config={earlyPivotConfig}
    enabled={earlyPivotConfig.enabled}
/>
```

**Step 9: Add `BoundaryOverlay` to the JSX**

Add after `SignalOverlay` (before the closing `</div>`):
```tsx
{/* Yellow dashed boundary line between pre-history and actual range */}
<BoundaryOverlay
    chart={chartApi}
    series={candleSeries}
    boundaryTime={market.boundaryTime}
/>
```

**Step 10: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 11: Commit**

```bash
git add components/terminal/chart/MainChart.tsx
git commit -m "feat(chart): wire pre-history data split, BoundaryOverlay, and early-pivot filtering"
```

---

## Task 9: `TimelineBar` — auto-reset to boundary instead of start

**Files:**
- Modify: `components/terminal/panels/TimelineBar.tsx`

**Context:** When the timeline reaches `endTime` and the user presses play again, it currently resets to `startTime` (before pre-history). It should reset to `boundaryTime` instead (the start of the actual range).

**Step 1: Update `handlePlayPause`**

Find:
```typescript
const handlePlayPause = () => {
    if (isPlaying) { pauseTimeline(); }
    else {
        if (currentTime >= endTime) setPlaybackTime(startTime);
        playTimeline();
    }
};
```

Replace with:
```typescript
const handlePlayPause = () => {
    if (isPlaying) { pauseTimeline(); }
    else {
        if (currentTime >= endTime) setPlaybackTime(boundaryTime ?? startTime);
        playTimeline();
    }
};
```

(`boundaryTime` is already destructured from `dataTimeRange` on line 63.)

**Step 2: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add components/terminal/panels/TimelineBar.tsx
git commit -m "feat(timeline): auto-reset plays from boundary time, not range start"
```

---

## Task 10: End-to-end visual verification

**Goal:** Confirm everything works together in the browser.

**Step 1: Start both servers**

Terminal 1 (API):
```bash
cd C:/ClaudeTrader
python -m api.server
```

Terminal 2 (Next.js):
```bash
cd C:/ClaudeTrader
npm run dev
```

**Step 2: Open the terminal at http://localhost:9000**

**Step 3: Enable pre-history**

1. Open the right sidebar → click **Pre-history** in the left sidebar list.
2. Set **Pre-history Window** to `20` (20 days).
3. The chart should reload.

**Check: Grey pre-history candles**
- The leftmost ~20 bars should be a uniform flat grey (`#4b5563`) with no red/green colouring.

**Check: Yellow dashed boundary line on chart**
- A yellow dashed vertical line should appear between the grey bars and the first coloured bar.

**Check: Yellow dashed boundary line on timeline bar**
- The timeline slider should show a yellow dashed tick at roughly `20 / (20 + rangeLength)` from the left.

**Check: Pivots in pre-history**
- Enable Pivots. Window-size pivot markers should appear on grey bars (pre-history pivots are visible).

**Check: No signals in pre-history**
- Enable Trendlines and Signals. No signal arrows (long/short) should appear in the grey zone.

**Check: Stop → boundary**
- Press Play, let it run a few seconds, then press Stop. The playback cursor should jump to the boundary (first non-grey bar), not to the very beginning.

**Check: ← navigation into pre-history**
- With playback at the boundary, press ← (left arrow). The cursor should step backward into the grey zone one day at a time.

**Check: `preHistoryBars = 0` is clean**
- Set Pre-history Window to `0`. Chart should reload with no grey bars, no boundary line, and Stop should reset to `null` (free-scroll) as before.

**Step 4: Final commit if any tweaks were needed**

```bash
git add -p   # stage only intentional changes
git commit -m "fix(prehistory): visual tweaks from e2e verification"
```
