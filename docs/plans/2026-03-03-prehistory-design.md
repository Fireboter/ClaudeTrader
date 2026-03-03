# Pre-History Design

**Date:** 2026-03-03
**Status:** Approved

---

## Overview

Enable a configurable "pre-history" window that prepends N daily bars (no minute data) before the selected trading range. Pre-history provides pivot and trendline context without triggering signals. The boundary between pre-history and the actual range is visualised with a yellow dashed vertical line on the chart and in the timeline bar.

---

## Behaviour Summary

| Zone | Candle style | Pivots | Trendlines | Early pivots | Signals | Minute nav |
|------|-------------|--------|------------|--------------|---------|------------|
| Pre-history | Muted grey | ✓ (window-size) | ✓ | ✗ | ✗ | ✗ (day-level only) |
| Actual range | Normal colours | ✓ | ✓ | ✓ | ✓ | ✓ |

**Playback (behaviour C):**
- Stop / reset → jumps to `boundaryTime` (first actual-range day)
- ← arrow can navigate backward into pre-history
- Play from pre-history → continues forward from current position

---

## Approach: Extend `/api/candles/full`

Single API call. The backend prepends pre-history days to the `days` array and returns `boundary_time`.

### Response shape

```json
{
  "days": [
    { "time": 1700000000, "open": …, "high": …, "low": …, "close": …, "volume": …, "minutes": [] },
    // … N pre-history days (minutes always []) …
    { "time": 1700500000, "open": …, "minutes": [ … ] },
    // … actual range days …
  ],
  "boundary_time": 1700500000   // null when prehistory_bars = 0
}
```

---

## Files Changed (9)

### 1. `api/routers/candles.py`

- Add `prehistory_bars: int = 0` query param to `/api/candles/full`.
- After resolving `daily_sliced`, look back up to `prehistory_bars` trading days in `daily` before `daily_sliced.index.min()`.
- Build pre-history day objects with `minutes: []`.
- Prepend them to `result`.
- Return `boundary_time = int(daily_sliced.index[0].timestamp())` (or `null` if `prehistory_bars == 0`).
- Edge case: if fewer than `prehistory_bars` days exist before the range start, return however many are available.

### 2. `components/terminal/core/store/MarketDataStore.ts`

- Add `preHistoryCount: number = 0` field.
- Change `setDays(data: DayCandle[], preHistoryCount = 0)` to store both.
- Add computed getter `get boundaryTime(): number | null` → `this.days[this.preHistoryCount]?.time ?? null`.

### 3. `components/terminal/core/managers/LayoutManager.ts`

- Change `stopTimeline()` from `this.playbackTime = null` to `this.playbackTime = this.dataTimeRange?.boundaryTime ?? null`.

### 4. `components/terminal/core/managers/ChartManager.ts`

- Add `preHistorySeries: ISeriesApi<"Candlestick"> | null = null`.
- In `mount()`, create `preHistorySeries` **before** the main `candleSeries` (so it renders underneath) with muted colours:
  - `upColor: '#4b5563'`, `downColor: '#4b5563'`, `wickUpColor: '#4b5563'`, `wickDownColor: '#4b5563'`, `borderVisible: false`.
- Add `setPreHistoryData(data: unknown[]): void` method.
- Clear pre-history series in `unmount()`.

### 5. `components/terminal/core/managers/PlaybackManager.ts`

- `_setFirstMinuteOfDay(dayIdx)`: if `mins.length === 0`, set `playbackTime = day.time` (UTC midnight).
- `_setLastMinuteOfDay(dayIdx)`: same fallback.
- This makes pre-history days navigable via ← / → arrows at day resolution.

### 6. `components/terminal/core/managers/SignalManager.ts`

- In `_recompute()`, read `preHistoryCount = this.market.preHistoryCount`.
- Filter `confirmedEarlyPivots` to `dayIndex >= preHistoryCount` before passing to `SignalFilter.compute()`.
- Filter the `brokenTrendlines` map: only include entries whose break occurred at `dayIndex >= preHistoryCount` (use `trendlineMgr.trendlines` pivot index as proxy, or derive from the day array).
- This ensures no entry signals fire in the pre-history zone.

### 7. `components/terminal/chart/MainChart.tsx`

- Add `strategyConfig.preHistoryBars` to the `/api/candles/full` params (`prehistory_bars`).
- Receive `boundary_time` from the response; derive `preHistoryCount` as `days.findIndex(d => d.time === boundary_time)` (or `0` if `boundary_time` is null).
- Call `market.setDays(data, preHistoryCount)`.
- Call `setDataTimeRange({ from: data[0].time, to: data[data.length-1].time, boundaryTime: boundary_time ?? undefined })`.
- Add `preHistoryCount` to local state.
- In the `priceBars / volumeBars` useMemo: split `visibleDays` into pre-history slice (`[0, preHistoryCount)`) and main slice (`[preHistoryCount, …]`).
- Push pre-history slice to `mgr.setPreHistoryData(…)` and main slice to `mgr.setPriceData(…)` / `mgr.setVolumeData(…)`.
- Re-trigger `preHistoryBars` in the fetch dep array.
- Pass `<BoundaryOverlay chart={chartApi} series={candleSeries} boundaryTime={market.boundaryTime} />`.
- Filter early pivots passed to `EarlyPivotOverlay`: `[...earlyPivots, ...earlyConfirmedPivots].filter(p => p.dayIndex >= preHistoryCount)`.

### 8. `components/terminal/chart/BoundaryOverlay.tsx` *(new file)*

- SVG overlay following the `TrendlineOverlay` / `EarlyPivotOverlay` pattern.
- Props: `chart: IChartApi | null`, `series: ISeriesApi<"Candlestick"> | null`, `boundaryTime: number | null`.
- Uses a `useEffect` that subscribes to `chart.timeScale().subscribeVisibleTimeRangeChange(reposition)`.
- `reposition()`: calls `chart.timeScale().timeToCoordinate(boundaryTime)` → if coordinate is valid, sets the SVG line's `x` position.
- Renders a full-height `<line>` with `stroke="#eab308"` (yellow-500), `strokeDasharray="6 4"`, `strokeWidth={2}`.
- If `boundaryTime` is null, renders nothing.

### 9. `components/terminal/panels/TimelineBar.tsx`

- In `handlePlayPause`: change the reset condition from `setPlaybackTime(startTime)` to `setPlaybackTime(boundaryTime ?? startTime)` when `currentTime >= endTime`.
- The `boundaryPct` yellow dashed line already renders correctly ✓ — no change needed there.

---

## Data Flow Summary

```
User sets preHistoryBars (right sidebar)
  → strategyConfig.preHistoryBars changes
  → MainChart re-fetches /api/candles/full?prehistory_bars=N
  → Response: { days: [preHist…, actual…], boundary_time }
  → market.setDays(days, preHistoryCount)
  → setDataTimeRange({ from, to, boundaryTime })

Chart render:
  visibleDays split → preHistorySeries (grey) + candleSeries (normal)
  BoundaryOverlay → yellow dashed vertical line at boundaryTime

Playback:
  Stop → playbackTime = boundaryTime
  ← arrow → navigates into pre-history (day-level, no minutes)

Signals:
  SignalManager filters confirmedEarlyPivots to dayIndex >= preHistoryCount
  → no entries fire in pre-history zone
```

---

## Non-goals / Out of scope

- No minute-level data in pre-history bars (daily candles only).
- Pre-history does not affect the random seed or fixed date range selection logic.
- Volume bars are not shown for pre-history (volume series is unchanged; pre-history series is candles only).
