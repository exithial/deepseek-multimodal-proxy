# Dashboard Range Selector & Historical Endpoint — Design Spec

**Status:** Approved (brainstorming 2026-07-30)
**Slug:** `dashboard-range-and-history`
**Date:** 2026-07-30
**Branch:** `feat/dashboard-range-and-history`
**Supersedes:** None
**Builds on:** `2026-07-23-proxy-dashboard-design.md`

## Goal

The dashboard's hero cards show "Σ total" summed across the entire SQLite
table (lifetime since `DASHBOARD_RETENTION_DAYS` ago). After running for
several weeks the totals grow into the tens-of-millions, the figure
overflows the card visually, and the user has no idea what time window
the number covers or how to look at "last month" or any arbitrary range.

This spec adds:

1. **Window labels on every hero card** so the user always sees what
   range the totals cover.
2. **A range selector** (`24h / 7d / 30d / 90d / total`) above the hero
   that re-computes all six cards against a moving window. Next month
   starts from zero simply because the user picks `30d` and the window
   slides.
3. **Compact number formatting** for the hero figures so values like
   `48.844.860` render as `48,8M` and never visually overflow the card.
4. **A new endpoint** `GET /v1/dashboard/range?from=<iso>&to=<iso>` that
   returns the same shape as `/v1/dashboard/snapshot` but for an
   arbitrary half-open interval, capped at `DASHBOARD_RETENTION_DAYS`.
   A custom `from`/`to` pair in the chart header lets the user replace
   the default 24h / 30d series with the returned series.

## Decisions log

Resolved through brainstorming on 2026-07-30:

1. **Scope:** card fix + range selector + arbitrary-range endpoint, all
   in one ship.
2. **Selector values:** `24h / 7d / 30d / 90d / total`. `90d` lines up
   with the default `DASHBOARD_RETENTION_DAYS=90`. `total` = lifetime
   (current behavior of the card).
3. **Reset semantics:** no reset button, no cron-based reset. The
   selector is the reset mechanism — `30d` is a moving window, so the
   next calendar month starts "from zero" automatically.
4. **Range endpoint bucket size:** auto. `span <= 48h` → hourly,
   otherwise daily. Same SQL path as `hourlyBuckets` but driven by
   explicit `[fromTs, toTs)` bounds.
5. **Range endpoint cap:** if `toTs - fromTs > retentionDays`, return
   `400 range_exceeds_retention` with the max allowed ms in the body.
   The client never silently receives partial data.
6. **Snapshot compat:** `/v1/dashboard/snapshot` keeps its current shape
   and is the default poll target. `/v1/dashboard/range` is opt-in from
   the chart's custom-from/to inputs.
7. **Where the selector lives:** one segmented control above the
   `<section class="cards">`, not inside each card. Same visual style
   as the existing `24h / 30d` chart toggle.
8. **Card tag:** only the `Tokens` card's `card-tag` becomes
   `Σ <window>`. The other five keep their existing tags.

## Architecture

Two backend additions, three frontend additions.

### Backend

- `src/services/dashboardService.ts`
  - `totalsRow(rangeMs?: number)` — extract the existing SQL into a
    method that adds `WHERE ts >= ?` when `rangeMs` is provided.
  - `totalsInRange(fromTs: number, toTs: number)` — same shape as
    `totalsRow` but with explicit half-open bounds. Returns
    `{ promptTokens, completionTokens, totalTokens, costUsd,
    requestCount, errorCount, cacheHits }`.
  - `hourlyBucketsInRange(fromTs: number, toTs: number, bucketMs:
    number)` — same SQL shape as `hourlyBuckets`, but takes explicit
    bounds instead of `count`. Used by `getRange`.
  - `getRange(args)` — new public method. Accepts
    `{ startTime, version, fromTs, toTs, mode?, providers?,
    activeModels? }`. Returns
    `DashboardSnapshot` (existing type) but with `last24hHourly` and
    `last30dDaily` both set to a fresh `series` field that carries the
    auto-bucketed range.

    Decision: extend `MetricsSnapshot` with an optional `series?: {
    fromTs: number; toTs: number; bucketMs: number; buckets: HourBucket[]
    }`. The existing `last24hHourly` / `last30dDaily` stay in
    `getSnapshot` for backward compat. `getRange` only sets `series`.

- `src/routes/dashboard.ts`
  - New `app.get("/v1/dashboard/range", …)` handler. Parses `from` and
    `to` as ISO 8601 strings, validates:
    - both required (`400 missing_params`),
    - parses to finite numbers (`400 invalid_timestamp`),
    - `fromTs < toTs` (`400 invalid_range`),
    - `toTs - fromTs <= retentionMs` (`400 range_exceeds_retention`
      with `{ maxMs: retentionMs }`),
    - the database is enabled (else `503 dashboard_disabled`, matching
      snapshot behavior).

### Frontend

- `public/dashboard/mobile.js`
  - New `fmtCompact(value, { currency?: boolean })` exported helper.
    Pure function, easy to unit test:
    - `NaN` / `Infinity` → `"—"`
    - `0` → `"0"`
    - `< 1.000` → integer
    - `< 1.000.000` → e.g. `"12,3 K"` (1 decimal if not round)
    - `< 1.000.000.000` → e.g. `"48,8 M"` (1 decimal if not round)
    - `>= 1.000.000.000` → e.g. `"1,23 B"` (2 decimals if not round)
    - When `currency === true`, prefix `$` (e.g. `"$27,3"` stays
      full-precision; abbrev kicks in at `>= 1.000` to `"$1,5K"`).

- `public/dashboard/index.html`
  - Add `<div class="cards-range" id="cards-range">` with five buttons
    (`24h / 7d / 30d / 90d / total`) above `<section class="cards">`.
  - Inside the chart panel head, next to the existing
    `24h / 30d` buttons, add a `custom` button that toggles two
    `<input type="datetime-local">` fields and an `apply` button.

- `public/dashboard/app.js`
  - Wire `cards-range` clicks: store `cardRange = "24h" | "7d" | "30d" |
    "90d" | "total"`, update tags, re-render hero with compact
    formatting. Snapshot fetch is unchanged — the server returns all
    five ranges (decisions below).
  - Wire chart custom-range inputs: build ISO strings from
    `datetime-local`, fetch `/v1/dashboard/range?from=…&to=…`, swap
    `chart.data` for the returned `series`. Show the active range in
    the chart's meta line.

### Server response shape decision

To avoid a second round-trip when the user toggles `cards-range`,
`getSnapshot` will return **all five** range totals in a new
`windows` field:

```ts
metrics: {
  ...existing,
  windows: {
    "24h": TotalsRow,
    "7d":  TotalsRow,
    "30d": TotalsRow,
    "90d": TotalsRow,
    "total": TotalsRow,
  }
}
```

`TotalsRow` is the same shape that `totalsRow()` already returns.
Snapshot payload grows by ~5x32 bytes; negligible.

For `getRange`, the response uses the existing `DashboardSnapshot`
type but populates `metrics.series` and leaves `metrics.windows`
empty (`{}`). Hero card values for the custom range are read from
`metrics.series` totals (the union of all buckets).

## Data flow

### Card range toggle

```
user clicks "30d"
  → cardRange = "30d"
  → update tag text to "Σ 30d"
  → renderHero reads snap.metrics.windows["30d"]
  → fmtCompact on each figure
  → no network call (snapshot already carries windows)
```

### Custom chart range

```
user picks from/to, clicks "apply"
  → build URLSearchParams
  → fetch /v1/dashboard/range?from=…&to=…
  → on 400: banner with reason; chart untouched
  → on 200: replace chart.data with snap.metrics.series.buckets
  → tag the chart with "rango · MMM d → MMM d"
  → click 24h/30d → restore default series
```

## Compatibility

- **OpenCode / Claude Code:** untouched. Dashboard is read-only and
  lives behind `/dashboard/*` and `/v1/dashboard/*`. No change to
  `/v1/chat/completions` or `/v1/messages`.
- **`/v1/dashboard/snapshot`:** shape extended, never removed. Existing
  fields keep their types; `windows` is additive.
- **Existing dashboard UI:** behavior of `Σ total`, the chart, the
  table, and the logs pane stays the same until the user interacts
  with the new controls.
- **Mobile (≤600 px):** the new `cards-range` segmented control wraps
  gracefully (existing `.seg-btn` styles already flex-wrap on narrow
  screens — see `styles.css:817`).
- **Polling:** unchanged 10 s cadence.

## Testing

### Backend (`tests/unit/services/dashboardService.test.ts`)

Add a `describe("getRange + windowed totals")` block. Reuse the existing
`freshService` helper. Tests:

1. `totalsRow(rangeMs)` filters events older than the window.
2. `totalsRow()` (no arg) returns the full table sum.
3. `getRange({ fromTs: now-24h, toTs: now })` returns 24 hourly
   buckets with the right totals.
4. `getRange({ fromTs: now-7d, toTs: now })` returns 7 daily buckets.
5. Auto-bucket: a 12-hour range returns hourly, a 7-day range returns
   daily.
6. `getRange` returns `rangeMs` in the response so the UI can label
   itself.
7. `getRange` with `fromTs > toTs` throws a structured error the route
   converts to 400.
8. `windows` field in `getSnapshot` contains all five keys with the
   correct sum for each.

### Backend route (`tests/unit/routes/dashboardRoute.test.ts` — new)

Tiny standalone test against the express handler with a stubbed
`dashboardService`. Cases:

1. Missing `from` or `to` → 400 `missing_params`.
2. Unparseable ISO → 400 `invalid_timestamp`.
3. `from >= to` → 400 `invalid_range`.
4. `span > retentionDays*86400000` → 400 `range_exceeds_retention`
   with `maxMs`.
5. Happy path → 200 with `{ operational, metrics: { series } }`.
6. `DASHBOARD_ENABLED=false` → 503 `dashboard_disabled`.

### Frontend (`tests/unit/dashboard/mobile.test.ts`)

Add `describe("fmtCompact")` block:

1. `< 1000` → integer.
2. `0` → `"0"`.
3. `12.345` → `"12 K"`.
4. `12.500` → `"12,5 K"`.
5. `1.234.567` → `"1,2 M"`.
6. `48.844.860` → `"48,8 M"`.
7. `1.234.567.890` → `"1,23 B"`.
8. `NaN`, `Infinity`, `-Infinity` → `"—"`.
9. `currency: true` with `847` → `"$847"`; with `12.345` →
   `"$12,3K"` (note: currency drops the space before K to read like
   a price tag).

### Manual smoke

Document in the PR description:

1. Boot proxy with `OPENCODE_GO_API_KEY` set, hit it a few times.
2. Open `/dashboard`, confirm hero shows `Σ total` and `48,8M`.
3. Click `30d` — totals shrink, tag becomes `Σ 30d`.
4. Click `custom` in the chart, pick last 7 days, `apply` — chart
   swaps to daily series, label shows the range.
5. Try `from > to` — banner shows the 400 reason.
6. Try a 6-month range — banner shows `range_exceeds_retention`.

## Files touched

```
src/services/dashboardService.ts          -- totalsRow(rangeMs?), totalsInRange, hourlyBucketsInRange, getRange, MetricsSnapshot.windows + series
src/routes/dashboard.ts                   -- GET /v1/dashboard/range
tests/unit/services/dashboardService.test.ts -- getRange + windows tests
tests/unit/routes/dashboardRoute.test.ts  -- new
public/dashboard/mobile.js                -- fmtCompact
public/dashboard/index.html               -- cards-range + chart custom inputs
public/dashboard/app.js                   -- cardRange wiring, custom range fetch
public/dashboard/styles.css               -- minor: cards-range layout
tests/unit/dashboard/mobile.test.ts       -- fmtCompact tests
CHANGELOG.md                              -- entry under Unreleased
```

## Out of scope

- Reset button / cron-based monthly reset (decision 3).
- Timezone picker. All UTC, same as existing chart buckets.
- Export to CSV. The arbitrary-range endpoint makes this trivial later
  but it's not asked for.
- Per-card window (only Tokens shows `Σ <window>` — others stay
  fixed-tagged per decision 8).