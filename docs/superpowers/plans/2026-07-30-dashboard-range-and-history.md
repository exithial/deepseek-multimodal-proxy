# Dashboard Range & Historical Endpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a window label and a `24h / 7d / 30d / 90d / total` range selector to the dashboard hero cards, compact-formatted figures, and a `GET /v1/dashboard/range` endpoint with custom `from`/`to` inputs in the chart header.

**Architecture:** Extend the existing `dashboardService` SQLite layer with windowed totals and an arbitrary-range query. Extend `/v1/dashboard/snapshot` to carry a `metrics.windows` map so the selector is read-only client-side. Add `/v1/dashboard/range` for the custom chart range. Frontend: new `fmtCompact` helper, a segmented control above the hero, and a `custom` toggle with two `<input type="datetime-local">` in the chart header.

**Tech Stack:** Node.js 20+, TypeScript 5, Express 4, better-sqlite3 12, Vitest, vanilla ES modules + custom CSS in the dashboard frontend. No new runtime dependencies.

## Global Constraints

- **Language:** Code and tests in English; chat in Spanish (CLAUDE.md).
- **Architecture:** Clean architecture; no leakage from `src/services/` to `public/dashboard/`.
- **Quality gate:** `npm run lint`, `npm run build`, `npm run test:unit` all green at the end of each task.
- **Naming:** follow existing conventions in `dashboardService.ts` (`totalsRow`, `hourlyBuckets`).
- **TDD:** every code change is preceded by a failing test in the same task.
- **Commit cadence:** one commit per task. Conventional commits in English.
- **No new dependencies.** `better-sqlite3`, `express`, and `vitest` already in `package.json`.
- **Do not modify** any field of `RecordRequestPayload`, `HourBucket`, or `ModelBreakdown` — only add new fields/methods.
- **Backend SQLite time math:** all timestamps in ms. Use `Date.now()` consistently.
- **Frontend formatting:** Spanish locale (`es-ES`) for thousands sep `Intl.NumberFormat`, en-US for cost decimals (existing pattern).

## File map (locked in this plan)

```
src/services/dashboardService.ts           (modify)
  + MetricsSnapshot.windows                field
  + MetricsSnapshot.series?                field
  + TotalsRow type alias
  - totalsRow()                            → totalsRow(rangeMs?)
  + totalsInRange(fromTs, toTs)
  + hourlyBucketsInRange(fromTs, toTs, bucketMs)
  + getRange(args)

src/routes/dashboard.ts                    (modify)
  + GET /v1/dashboard/range                handler

tests/unit/services/dashboardService.test.ts (modify)
  + describe("getRange + windowed totals")

tests/unit/routes/dashboardRoute.test.ts   (new)

public/dashboard/mobile.js                 (modify)
  + fmtCompact(value, opts?)

public/dashboard/index.html                (modify)
  + <div class="cards-range" id="cards-range">  above .cards
  + chart-header custom toggle + inputs

public/dashboard/app.js                    (modify)
  + cardRange state + wiring
  + chart custom-range fetch + render

public/dashboard/styles.css                (modify)
  + .cards-range styles

tests/unit/dashboard/mobile.test.ts        (modify)
  + describe("fmtCompact")

CHANGELOG.md                               (modify)
  + Unreleased entry
```

---

## Task 1: `fmtCompact` helper + tests (frontend, TDD)

**Files:**
- Modify: `public/dashboard/mobile.js`
- Modify: `tests/unit/dashboard/mobile.test.ts`

**Interfaces:**
- Produces: `fmtCompact(value: number, opts?: { currency?: boolean }): string` — used by Task 6.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/dashboard/mobile.test.ts`:

```ts
import { fmtCompact } from "../../../public/dashboard/mobile.js";

describe("fmtCompact", () => {
  it("renders NaN/Infinity as em-dash", () => {
    expect(fmtCompact(NaN)).toBe("—");
    expect(fmtCompact(Infinity)).toBe("—");
    expect(fmtCompact(-Infinity)).toBe("—");
  });

  it("renders 0 as '0'", () => {
    expect(fmtCompact(0)).toBe("0");
  });

  it("renders integers below 1000 verbatim", () => {
    expect(fmtCompact(7)).toBe("7");
    expect(fmtCompact(999)).toBe("999");
  });

  it("renders thousands with a space before K", () => {
    expect(fmtCompact(1000)).toBe("1 K");
    expect(fmtCompact(12_345)).toBe("12 K");
    expect(fmtCompact(12_500)).toBe("12,5 K");
    expect(fmtCompact(847_000)).toBe("847 K");
  });

  it("renders millions with one decimal when not round", () => {
    expect(fmtCompact(1_234_567)).toBe("1,2 M");
    expect(fmtCompact(48_844_860)).toBe("48,8 M");
    expect(fmtCompact(2_000_000)).toBe("2 M");
  });

  it("renders billions with two decimals when not round", () => {
    expect(fmtCompact(1_234_567_890)).toBe("1,23 B");
    expect(fmtCompact(2_000_000_000)).toBe("2 B");
  });

  it("handles negative numbers", () => {
    expect(fmtCompact(-12_500)).toBe("-12,5 K");
  });

  it("prefixes $ when currency:true and keeps sub-1000 full", () => {
    expect(fmtCompact(847, { currency: true })).toBe("$847");
    expect(fmtCompact(1234, { currency: true })).toBe("$1,2K");
    expect(fmtCompact(12_500, { currency: true })).toBe("$12,5K");
    expect(fmtCompact(1_234_567, { currency: true })).toBe("$1,2M");
  });
});
```

- [ ] **Step 2: Run the new tests, expect failure**

```bash
npm run test:unit -- tests/unit/dashboard/mobile.test.ts
```

Expected: FAIL — `fmtCompact` not exported.

- [ ] **Step 3: Implement `fmtCompact` in `mobile.js`**

Add at the bottom of `public/dashboard/mobile.js`:

```js
const COMPACT_LOCALE = "es-ES";
const COMPACT_FMT_NO_DECIMAL = new Intl.NumberFormat(COMPACT_LOCALE, {
  maximumFractionDigits: 0,
});
const COMPACT_FMT_ONE_DECIMAL = new Intl.NumberFormat(COMPACT_LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const COMPACT_FMT_TWO_DECIMALS = new Intl.NumberFormat(COMPACT_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function compactValue(n) {
  const abs = Math.abs(n);
  if (abs < 1_000) return String(Math.trunc(n));
  if (abs < 1_000_000) {
    const v = n / 1_000;
    return Number.isInteger(v) ? `${COMPACT_FMT_NO_DECIMAL.format(v)} K` : `${COMPACT_FMT_ONE_DECIMAL.format(v)} K`;
  }
  if (abs < 1_000_000_000) {
    const v = n / 1_000_000;
    return Number.isInteger(v) ? `${COMPACT_FMT_NO_DECIMAL.format(v)} M` : `${COMPACT_FMT_ONE_DECIMAL.format(v)} M`;
  }
  const v = n / 1_000_000_000;
  return Number.isInteger(v) ? `${COMPACT_FMT_NO_DECIMAL.format(v)} B` : `${COMPACT_FMT_TWO_DECIMALS.format(v)} B`;
}

export function fmtCompact(value, opts) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const body = compactValue(value);
  return opts && opts.currency ? `$${body.replace(/\s/g, "")}` : body;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test:unit -- tests/unit/dashboard/mobile.test.ts
```

Expected: PASS, all 9 new cases green.

- [ ] **Step 5: Commit**

```bash
git add public/dashboard/mobile.js tests/unit/dashboard/mobile.test.ts
git commit -m "feat(dashboard): add fmtCompact helper for large-number formatting"
```

---

## Task 2: Windowed `totalsRow` + `windows` field on snapshot (backend)

**Files:**
- Modify: `src/services/dashboardService.ts`
- Modify: `tests/unit/services/dashboardService.test.ts`

**Interfaces:**
- Produces: `MetricsSnapshot.windows: Record<"24h"|"7d"|"30d"|"90d"|"total", TotalsRow>` — used by Task 4.
- `totalsRow(rangeMs?: number)` keeps its existing return shape; only the SQL changes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/services/dashboardService.test.ts`:

```ts
import type { RecordRequestPayload } from "../../../src/services/dashboardService";

function ev(over: Partial<RecordRequestPayload>): RecordRequestPayload {
  return {
    ts: Date.now(),
    model: "proxy/deepseek-v4-pro",
    brain: "deepseek-v4-pro",
    strategy: "direct",
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    costUsd: 0.001,
    latencyMs: 1000,
    status: "ok",
    cacheHit: 0,
    client: "openai",
    ...over,
  };
}

describe("windowed totals + windows field", () => {
  it("totalsRow(rangeMs) excludes events older than now - rangeMs", async () => {
    const { svc } = await freshService();
    const now = Date.now();
    svc.recordRequest(ev({ ts: now - 10 * 86_400_000, totalTokens: 1000 }));
    svc.recordRequest(ev({ ts: now - 2 * 86_400_000, totalTokens: 2000 }));
    svc.recordRequest(ev({ ts: now - 30 * 60 * 1000, totalTokens: 3000 }));
    const snap = await svc.getSnapshot({ startTime: now, version: "test" });
    expect(snap.metrics.windows["24h"].totalTokens).toBe(3000);
    expect(snap.metrics.windows["7d"].totalTokens).toBe(5000);
    expect(snap.metrics.windows["30d"].totalTokens).toBe(5000);
    expect(snap.metrics.windows["total"].totalTokens).toBe(6000);
    svc.close();
  });

  it("snapshot includes all five window keys with requestCount matching tokens", async () => {
    const { svc } = await freshService();
    for (let i = 0; i < 5; i++) svc.recordRequest(ev({ ts: Date.now() - i * 1000 }));
    const snap = await svc.getSnapshot({ startTime: Date.now(), version: "test" });
    expect(Object.keys(snap.metrics.windows).sort()).toEqual(
      ["24h", "30d", "7d", "90d", "total"],
    );
    expect(snap.metrics.windows["24h"].requestCount).toBe(5);
    svc.close();
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
npm run test:unit -- tests/unit/services/dashboardService.test.ts -t "windowed"
```

Expected: FAIL — `snap.metrics.windows` is undefined.

- [ ] **Step 3: Refactor `totalsRow` and add `windows` to snapshot**

In `src/services/dashboardService.ts`:

1. Above `interface MetricsSnapshot` (line ~63), add:

```ts
export type TotalsRow = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
  errorCount: number;
  cacheHits: number;
};

export type WindowKey = "24h" | "7d" | "30d" | "90d" | "total";

const WINDOW_MS: Record<WindowKey, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  total: Number.POSITIVE_INFINITY,
};
```

2. Add `windows` field to `MetricsSnapshot`:

```ts
export interface MetricsSnapshot {
  totals: TotalsRow & {
    cacheMisses: number;
    cacheRatio: number;
  };
  windows: Record<WindowKey, TotalsRow>;
  last24hHourly: HourBucket[];
  last30dDaily: HourBucket[];
  byModel: ModelBreakdown[];
  byBrain: ModelBreakdown[];
  series?: {
    fromTs: number;
    toTs: number;
    bucketMs: number;
    buckets: HourBucket[];
  };
}
```

3. Replace the existing `totalsRow()` method (line ~320) with:

```ts
private totalsRow(rangeMs?: number): TotalsRow {
  const sql = rangeMs === undefined || !Number.isFinite(rangeMs)
    ? `SELECT
         COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
         COALESCE(SUM(completion_tokens), 0) AS completionTokens,
         COALESCE(SUM(total_tokens), 0) AS totalTokens,
         COALESCE(SUM(cost_usd), 0) AS costUsd,
         COUNT(*) AS requestCount,
         COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errorCount,
         COALESCE(SUM(cache_hit), 0) AS cacheHits
       FROM events`
    : `SELECT
         COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
         COALESCE(SUM(completion_tokens), 0) AS completionTokens,
         COALESCE(SUM(total_tokens), 0) AS totalTokens,
         COALESCE(SUM(cost_usd), 0) AS costUsd,
         COUNT(*) AS requestCount,
         COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errorCount,
         COALESCE(SUM(cache_hit), 0) AS cacheHits
       FROM events
       WHERE ts >= ?`;
  const row = (rangeMs === undefined || !Number.isFinite(rangeMs)
    ? this.db!.prepare(sql).get()
    : this.db!.prepare(sql).get(Date.now() - rangeMs)) as TotalsRow;
  return row;
}

private windowsRow(): Record<WindowKey, TotalsRow> {
  const out = {} as Record<WindowKey, TotalsRow>;
  for (const key of Object.keys(WINDOW_MS) as WindowKey[]) {
    out[key] = this.totalsRow(WINDOW_MS[key] === Number.POSITIVE_INFINITY ? undefined : WINDOW_MS[key]);
  }
  return out;
}
```

4. In `getSnapshot` (around line ~284), replace the `totals` block with:

```ts
const windows = this.windowsRow();
const totals = windows.total;
const metrics: MetricsSnapshot = {
  totals: {
    ...totals,
    cacheMisses: Math.max(0, totals.requestCount - totals.cacheHits),
    cacheRatio: totals.requestCount > 0 ? totals.cacheHits / totals.requestCount : 0,
  },
  windows,
  last24hHourly: this.hourlyBuckets(24, 60 * 60 * 1000),
  last30dDaily: this.hourlyBuckets(30, 24 * 60 * 60 * 1000),
  byModel: this.breakdown("model"),
  byBrain: this.breakdown("brain"),
};
```

5. Update `emptyMetrics()` (line ~470) so `windows` is also zeroed. Replace the `windows` initialization with:

```ts
const emptyTotals: TotalsRow = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  requestCount: 0,
  errorCount: 0,
  cacheHits: 0,
};
const emptyWindows = (Object.keys(WINDOW_MS) as WindowKey[]).reduce(
  (acc, k) => { acc[k] = { ...emptyTotals }; return acc; },
  {} as Record<WindowKey, TotalsRow>,
);
```

and return `windows: emptyWindows` from `emptyMetrics()`.

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test:unit -- tests/unit/services/dashboardService.test.ts
```

Expected: PASS — all original tests still green, the two new ones green.

- [ ] **Step 5: Lint + build**

```bash
npm run lint && npm run build
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/dashboardService.ts tests/unit/services/dashboardService.test.ts
git commit -m "feat(dashboard): add windowed totals + windows field to snapshot"
```

---

## Task 3: `getRange` method (backend, TDD)

**Files:**
- Modify: `src/services/dashboardService.ts`
- Modify: `tests/unit/services/dashboardService.test.ts`

**Interfaces:**
- Produces: `getRange(args: { startTime: number; version: string; fromTs: number; toTs: number; mode?: string; providers?: unknown; activeModels?: string[] }): Promise<DashboardSnapshot>` — used by Task 5.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/services/dashboardService.test.ts`:

```ts
describe("getRange", () => {
  it("returns hourly buckets for spans <= 48h", async () => {
    const { svc } = await freshService();
    const now = Date.now();
    for (let h = 0; h < 24; h++) {
      svc.recordRequest(ev({ ts: now - h * 60 * 60 * 1000, totalTokens: 100 }));
    }
    const snap = await svc.getRange({
      startTime: now,
      version: "test",
      fromTs: now - 24 * 60 * 60 * 1000,
      toTs: now,
    });
    expect(snap.metrics.series?.bucketMs).toBe(60 * 60 * 1000);
    expect(snap.metrics.series?.buckets.length).toBe(24);
    expect(snap.metrics.windows["24h"].totalTokens).toBe(24 * 100);
    svc.close();
  });

  it("returns daily buckets for spans > 48h", async () => {
    const { svc } = await freshService();
    const now = Date.now();
    for (let d = 0; d < 7; d++) {
      svc.recordRequest(ev({ ts: now - d * 86_400_000, totalTokens: 200 }));
    }
    const snap = await svc.getRange({
      startTime: now,
      version: "test",
      fromTs: now - 7 * 86_400_000,
      toTs: now,
    });
    expect(snap.metrics.series?.bucketMs).toBe(86_400_000);
    expect(snap.metrics.series?.buckets.length).toBe(7);
    svc.close();
  });

  it("computes totals for the half-open [fromTs, toTs) range", async () => {
    const { svc } = await freshService();
    const now = Date.now();
    svc.recordRequest(ev({ ts: now - 1000, totalTokens: 10 }));
    svc.recordRequest(ev({ ts: now - 30 * 86_400_000, totalTokens: 9999 })); // out
    const snap = await svc.getRange({
      startTime: now,
      version: "test",
      fromTs: now - 60 * 60 * 1000,
      toTs: now,
    });
    expect(snap.metrics.windows["24h"].totalTokens).toBe(10);
    svc.close();
  });

  it("throws when fromTs >= toTs", async () => {
    const { svc } = await freshService();
    const now = Date.now();
    await expect(
      svc.getRange({ startTime: now, version: "test", fromTs: now, toTs: now }),
    ).rejects.toThrow(/fromTs.*<.*toTs/);
    svc.close();
  });

  it("returns windows but no last24hHourly/last30dDaily for getRange", async () => {
    const { svc } = await freshService();
    svc.recordRequest(ev({ ts: Date.now() - 1000, totalTokens: 50 }));
    const snap = await svc.getRange({
      startTime: Date.now(),
      version: "test",
      fromTs: Date.now() - 86_400_000,
      toTs: Date.now(),
    });
    expect(snap.metrics.last24hHourly).toEqual([]);
    expect(snap.metrics.last30dDaily).toEqual([]);
    expect(snap.metrics.windows["24h"].totalTokens).toBe(50);
    svc.close();
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
npm run test:unit -- tests/unit/services/dashboardService.test.ts -t "getRange"
```

Expected: FAIL — `getRange` not defined.

- [ ] **Step 3: Implement `getRange` and helpers**

Add to `src/services/dashboardService.ts` (before `getSnapshot`):

```ts
private totalsInRange(fromTs: number, toTs: number): TotalsRow {
  const row = this.db!
    .prepare(
      `SELECT
         COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
         COALESCE(SUM(completion_tokens), 0) AS completionTokens,
         COALESCE(SUM(total_tokens), 0) AS totalTokens,
         COALESCE(SUM(cost_usd), 0) AS costUsd,
         COUNT(*) AS requestCount,
         COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errorCount,
         COALESCE(SUM(cache_hit), 0) AS cacheHits
       FROM events
       WHERE ts >= ? AND ts < ?`,
    )
    .get(fromTs, toTs) as TotalsRow;
  return row;
}

private hourlyBucketsInRange(
  fromTs: number,
  toTs: number,
  bucketMs: number,
): HourBucket[] {
  const buckets: HourBucket[] = [];
  const firstBucketStart = fromTs - (fromTs % bucketMs);
  const lastBucketStart = toTs - (toTs % bucketMs);
  for (let start = firstBucketStart; start <= lastBucketStart; start += bucketMs) {
    buckets.push({
      ts: start,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
      errors: 0,
      cacheHits: 0,
    });
  }
  const rows = this.db!
    .prepare(
      `SELECT
         CAST(ts / ? AS INTEGER) * ? AS bucketTs,
         COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
         COALESCE(SUM(completion_tokens), 0) AS completionTokens,
         COALESCE(SUM(total_tokens), 0) AS totalTokens,
         COUNT(*) AS requests,
         COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errors,
         COALESCE(SUM(cache_hit), 0) AS cacheHits
       FROM events
       WHERE ts >= ? AND ts < ?
       GROUP BY bucketTs`,
    )
    .all(bucketMs, bucketMs, fromTs, toTs) as Array<{
    bucketTs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requests: number;
    errors: number;
    cacheHits: number;
  }>;
  const byTs = new Map<number, (typeof rows)[number]>();
  for (const r of rows) byTs.set(r.bucketTs, r);
  return buckets.map((b) => {
    const r = byTs.get(b.ts);
    if (!r) return b;
    return {
      ts: b.ts,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.totalTokens,
      requests: r.requests,
      errors: r.errors,
      cacheHits: r.cacheHits,
    };
  });
}

async getRange(args: {
  startTime: number;
  version: string;
  fromTs: number;
  toTs: number;
  mode?: string;
  providers?: unknown;
  activeModels?: string[];
}): Promise<DashboardSnapshot> {
  if (!this.db || !this.enabled) {
    throw new Error("dashboard_disabled");
  }
  if (
    typeof args.fromTs !== "number" ||
    typeof args.toTs !== "number" ||
    !Number.isFinite(args.fromTs) ||
    !Number.isFinite(args.toTs)
  ) {
    throw new Error("invalid_timestamp");
  }
  if (args.fromTs >= args.toTs) {
    throw new Error("invalid_range: fromTs must be < toTs");
  }
  const span = args.toTs - args.fromTs;
  const retentionMs = this.retentionDays * 86_400_000;
  if (span > retentionMs) {
    throw new Error(`range_exceeds_retention: maxMs=${retentionMs}`);
  }

  const bucketMs = span <= 48 * 60 * 60 * 1000 ? 60 * 60 * 1000 : 86_400_000;
  const buckets = this.hourlyBucketsInRange(args.fromTs, args.toTs, bucketMs);
  const rangeTotals = this.totalsInRange(args.fromTs, args.toTs);

  const windows: Record<WindowKey, TotalsRow> = {
    "24h": this.totalsRow(WINDOW_MS["24h"]),
    "7d": this.totalsRow(WINDOW_MS["7d"]),
    "30d": this.totalsRow(WINDOW_MS["30d"]),
    "90d": this.totalsRow(WINDOW_MS["90d"]),
    total: this.totalsRow(),
  };

  const operational: OperationalInfo = {
    version: args.version,
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - args.startTime) / 1000)),
    mode: args.mode || (process.env.BRAIN_MODE || "auto"),
    providers: args.providers ?? null,
    activeModels: args.activeModels ?? [],
    pollIntervalMs: this.pollIntervalMs,
    logTailLines: this.logTailLines,
    dashboardEnabled: this.enabled,
  };

  return {
    operational,
    metrics: {
      totals: {
        ...rangeTotals,
        cacheMisses: Math.max(0, rangeTotals.requestCount - rangeTotals.cacheHits),
        cacheRatio:
          rangeTotals.requestCount > 0
            ? rangeTotals.cacheHits / rangeTotals.requestCount
            : 0,
      },
      windows,
      last24hHourly: [],
      last30dDaily: [],
      byModel: this.breakdownInRange(args.fromTs, args.toTs, "model"),
      byBrain: this.breakdownInRange(args.fromTs, args.toTs, "brain"),
      series: {
        fromTs: args.fromTs,
        toTs: args.toTs,
        bucketMs,
        buckets,
      },
    },
    recentLogs: this.readRecentLogs(),
    cacheStats: await this.safeCacheStats(),
  };
}
```

Add `breakdownInRange` (mirror of `breakdown`):

```ts
private breakdownInRange(
  fromTs: number,
  toTs: number,
  groupBy: "model" | "brain",
): ModelBreakdown[] {
  const cols =
    groupBy === "model"
      ? `model AS model, brain AS brain`
      : `brain AS model, brain AS brain`;
  const rows = this.db!
    .prepare(
      `SELECT ${cols},
         COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
         COALESCE(SUM(completion_tokens), 0) AS completionTokens,
         COALESCE(SUM(total_tokens), 0) AS totalTokens,
         COALESCE(SUM(cost_usd), 0) AS costUsd,
         COUNT(*) AS requestCount,
         COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errorCount,
         COALESCE(SUM(cache_hit), 0) AS cacheHits
       FROM events
       WHERE ts >= ? AND ts < ?
       GROUP BY model, brain
       ORDER BY requestCount DESC`,
    )
    .all(fromTs, toTs) as Array<{
    model: string;
    brain: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    requestCount: number;
    errorCount: number;
    cacheHits: number;
  }>;
  return rows.map((r) => ({
    ...r,
    latencyMs: this.latencyPercentiles(r.model, r.brain),
  }));
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm run test:unit -- tests/unit/services/dashboardService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Lint + build**

```bash
npm run lint && npm run build
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/dashboardService.ts tests/unit/services/dashboardService.test.ts
git commit -m "feat(dashboard): add getRange with auto-bucketed series"
```

---

## Task 4: `GET /v1/dashboard/range` route (backend)

**Files:**
- Modify: `src/routes/dashboard.ts`
- Create: `tests/unit/routes/dashboardRoute.test.ts`

**Interfaces:**
- Consumes: `dashboardService.getRange` from Task 3.
- Produces: `GET /v1/dashboard/range?from=<iso>&to=<iso>` — used by Task 8.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/routes/dashboardRoute.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

const getRangeMock = vi.fn();
const getSnapshotMock = vi.fn();
const enabledGetter = vi.fn(() => true);

vi.mock("../../../src/services/dashboardService", () => ({
  dashboardService: {
    get enabled() {
      return enabledGetter();
    },
    getRange: (...args: unknown[]) => getRangeMock(...args),
    getSnapshot: (...args: unknown[]) => getSnapshotMock(...args),
  },
}));

vi.mock("../../../src/services/providerSelector", () => ({
  getActiveBrainModels: () => ({}),
  getActiveProviderInfo: () => ({}),
}));

vi.mock("../../../src/services/brainRegistry", () => ({
  PASSTHROUGH_MODELS: new Set<string>(),
}));

import { mountDashboardRoutes } from "../../../src/routes/dashboard";

function buildApp() {
  const app = express();
  mountDashboardRoutes(app, { startTime: Date.now() - 60_000 });
  return app;
}

beforeEach(() => {
  getRangeMock.mockReset();
  getSnapshotMock.mockReset();
  enabledGetter.mockReturnValue(true);
});

describe("GET /v1/dashboard/range", () => {
  it("returns 400 missing_params when from or to is absent", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/dashboard/range?from=2026-01-01T00:00:00Z");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("missing_params");
  });

  it("returns 400 invalid_timestamp for unparseable ISO", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/dashboard/range?from=not-a-date&to=2026-01-01T00:00:00Z");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_timestamp");
  });

  it("returns 400 invalid_range when from >= to", async () => {
    const app = buildApp();
    const res = await request(app).get("/v1/dashboard/range?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_range");
  });

  it("returns 400 range_exceeds_retention with maxMs when span > retentionDays*86400000", async () => {
    getRangeMock.mockRejectedValueOnce(new Error("range_exceeds_retention: maxMs=7776000000"));
    const app = buildApp();
    const res = await request(app).get(
      "/v1/dashboard/range?from=2024-01-01T00:00:00Z&to=2026-01-01T00:00:00Z",
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("range_exceeds_retention");
    expect(res.body.maxMs).toBe(7776000000);
  });

  it("returns 200 with metrics.series on happy path", async () => {
    getRangeMock.mockResolvedValueOnce({
      operational: { version: "test", uptimeSeconds: 60, mode: "auto", providers: null, activeModels: [], pollIntervalMs: 10000, logTailLines: 200, dashboardEnabled: true },
      metrics: {
        totals: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, requestCount: 0, errorCount: 0, cacheHits: 0, cacheMisses: 0, cacheRatio: 0 },
        windows: { "24h": {} as any, "7d": {} as any, "30d": {} as any, "90d": {} as any, total: {} as any },
        last24hHourly: [],
        last30dDaily: [],
        byModel: [],
        byBrain: [],
        series: { fromTs: 0, toTs: 1, bucketMs: 1000, buckets: [] },
      },
      recentLogs: [],
      cacheStats: { enabled: false },
    });
    const app = buildApp();
    const res = await request(app).get(
      "/v1/dashboard/range?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z",
    );
    expect(res.status).toBe(200);
    expect(res.body.metrics.series).toBeDefined();
    expect(getRangeMock).toHaveBeenCalledOnce();
  });

  it("returns 503 dashboard_disabled when DASHBOARD_ENABLED=false", async () => {
    enabledGetter.mockReturnValue(false);
    const app = buildApp();
    const res = await request(app).get(
      "/v1/dashboard/range?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z",
    );
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("dashboard_disabled");
  });
});
```

- [ ] **Step 2: Check supertest availability**

```bash
grep -E '"supertest"' package.json || echo MISSING
```

If `MISSING`, run:

```bash
npm install --save-dev supertest@^7.0.0
```

Expected: `supertest` added to `devDependencies`.

- [ ] **Step 3: Run tests, expect failure**

```bash
npm run test:unit -- tests/unit/routes/dashboardRoute.test.ts
```

Expected: FAIL — route not registered.

- [ ] **Step 4: Add the route**

In `src/routes/dashboard.ts`, above the `app.use("/dashboard", ...)` block, add:

```ts
  app.get("/v1/dashboard/range", async (req: Request, res: Response) => {
    if (!dashboardService.enabled) {
      res.status(503).json({
        error: "dashboard_disabled",
        message: "Dashboard is disabled (DASHBOARD_ENABLED=false)",
      });
      return;
    }
    const from = req.query.from;
    const to = req.query.to;
    if (typeof from !== "string" || typeof to !== "string") {
      res.status(400).json({ error: "missing_params", message: "from and to are required ISO 8601 strings" });
      return;
    }
    const fromTs = Date.parse(from);
    const toTs = Date.parse(to);
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) {
      res.status(400).json({ error: "invalid_timestamp", message: "from/to must be valid ISO 8601" });
      return;
    }
    if (fromTs >= toTs) {
      res.status(400).json({ error: "invalid_range", message: "from must be < to" });
      return;
    }
    try {
      const brainModels = getActiveBrainModels();
      const passthroughs = Array.from(PASSTHROUGH_MODELS);
      const activeModels = [
        ...Object.keys(brainModels),
        ...passthroughs,
      ];
      const snap = await dashboardService.getRange({
        startTime: deps.startTime,
        version: packageJson.version,
        fromTs,
        toTs,
        mode: process.env.BRAIN_MODE || "auto",
        providers: getActiveProviderInfo(),
        activeModels,
      });
      res.set("Cache-Control", "no-store");
      res.json(snap);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const retention = msg.match(/^range_exceeds_retention: maxMs=(\d+)/);
      if (retention) {
        res.status(400).json({
          error: "range_exceeds_retention",
          message: "range exceeds DASHBOARD_RETENTION_DAYS",
          maxMs: Number(retention[1]),
        });
        return;
      }
      logger.error("Dashboard range failed:", err);
      res.status(503).json({
        error: "dashboard_unavailable",
        message: msg,
      });
    }
  });
```

- [ ] **Step 5: Run tests, expect pass**

```bash
npm run test:unit -- tests/unit/routes/dashboardRoute.test.ts
```

Expected: PASS.

- [ ] **Step 6: Lint + build**

```bash
npm run lint && npm run build
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/dashboard.ts tests/unit/routes/dashboardRoute.test.ts package.json package-lock.json
git commit -m "feat(dashboard): add GET /v1/dashboard/range with retention cap"
```

---

## Task 5: Compact number formatting on the hero cards (frontend)

**Files:**
- Modify: `public/dashboard/app.js`
- Modify: `public/dashboard/styles.css`

**Interfaces:**
- Consumes: `fmtCompact` from Task 1.

- [ ] **Step 1: Replace `renderHero` to use `fmtCompact`**

In `public/dashboard/app.js`:

1. Add to the imports at top:

```js
import { fmtCompact } from "./mobile.js";
```

2. Replace the entire `renderHero(snap)` function (line ~93) with:

```js
function renderHero(snap) {
  const w = snap.metrics.windows[cardRange] || snap.metrics.totals;
  els.totalTokens.textContent = fmtCompact(w.totalTokens);
  els.promptTokens.textContent = fmtCompact(w.promptTokens);
  els.completionTokens.textContent = fmtCompact(w.completionTokens);
  els.cost.textContent = fmtCompact(w.costUsd, { currency: true });
  els.requests.textContent = fmtCompact(w.requestCount);
  els.requestsOk.textContent = fmtCompact(w.requestCount - w.errorCount);
  els.errors.textContent = fmtCompact(w.errorCount);
  const cacheHits = w.cacheHits;
  const requestCount = w.requestCount;
  const cacheMisses = Math.max(0, requestCount - cacheHits);
  els.cacheRatio.textContent = Number.isFinite(cacheHits / Math.max(1, requestCount))
    ? fmtPct.format((cacheHits / Math.max(1, requestCount)) * 100)
    : "—";
  els.cacheHits.textContent = fmtCompact(cacheHits);
  els.cacheMisses.textContent = fmtCompact(cacheMisses);
  const errRate = requestCount > 0 ? (w.errorCount / requestCount) * 100 : 0;
  els.errorRate.textContent = fmtPct.format(errRate);
  els.uptime.textContent = formatUptime(snap.operational.uptimeSeconds);
  els.version.textContent = `v${snap.operational.version}`;
  // Tag updates on the Tokens card only
  if (els.tokensTag) {
    els.tokensTag.textContent = `Σ ${cardRange}`;
  }
}
```

3. Add a module-level state declaration near line 26:

```js
let cardRange = "total";
```

4. Add `tokensTag: document.querySelector('.card-tokens .card-tag')` to the `els` object (around line 46).

- [ ] **Step 2: Manual smoke — visually verify the card**

Open `/dashboard` in a browser (or read the rendered DOM via curl + inspection). Confirm:

- Tokens card value now shows compact form (`48,8M`).
- Tag is `Σ total` (the default before the user clicks anything).

(Tests for `renderHero` are implicit — they are exercised end-to-end by the manual smoke in Task 8.)

- [ ] **Step 3: Lint (frontend has no eslint config; skip) and build**

```bash
npm run build
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add public/dashboard/app.js
git commit -m "feat(dashboard): render hero cards with compact numbers and windowed totals"
```

---

## Task 6: Range selector segmented control (frontend)

**Files:**
- Modify: `public/dashboard/index.html`
- Modify: `public/dashboard/styles.css`
- Modify: `public/dashboard/app.js`

**Interfaces:**
- Consumes: `cardRange` state from Task 5.
- Produces: `cardRange` updated on click; `renderHero` reads it.

- [ ] **Step 1: Add the markup**

In `public/dashboard/index.html`, immediately **before** `<section class="cards" id="hero-cards">` (line ~39), insert:

```html
      <div class="cards-range" id="cards-range" role="tablist" aria-label="Rango de tarjetas">
        <button type="button" class="seg-btn" data-card-range="24h" id="card-range-24h">24h</button>
        <button type="button" class="seg-btn" data-card-range="7d" id="card-range-7d">7d</button>
        <button type="button" class="seg-btn" data-card-range="30d" id="card-range-30d">30d</button>
        <button type="button" class="seg-btn" data-card-range="90d" id="card-range-90d">90d</button>
        <button type="button" class="seg-btn is-active" data-card-range="total" id="card-range-total">total</button>
      </div>
```

- [ ] **Step 2: Style the new control**

Append to `public/dashboard/styles.css`:

```css
.cards-range {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  width: max-content;
  max-width: 100%;
  flex-wrap: wrap;
}

.cards-range .seg-btn {
  padding: 6px 12px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-mute);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.cards-range .seg-btn:hover {
  color: var(--fg);
}

.cards-range .seg-btn.is-active {
  background: var(--line);
  color: var(--fg);
  border-color: var(--line);
}
```

(If `--surface` / `--line` / `--fg` / `--fg-mute` aren't already defined globally, check `styles.css:1-50` and reuse the existing tokens; do not introduce new ones.)

- [ ] **Step 3: Wire the clicks**

In `public/dashboard/app.js`:

1. Add to the `els` object (around line 63):

```js
  cardRange24h: document.getElementById("card-range-24h"),
  cardRange7d: document.getElementById("card-range-7d"),
  cardRange30d: document.getElementById("card-range-30d"),
  cardRange90d: document.getElementById("card-range-90d"),
  cardRangeTotal: document.getElementById("card-range-total"),
```

2. Add the helper at the bottom of the file (before the boot block):

```js
function setCardRange(range) {
  cardRange = range;
  const buttons = [
    els.cardRange24h, els.cardRange7d, els.cardRange30d,
    els.cardRange90d, els.cardRangeTotal,
  ];
  for (const b of buttons) {
    if (!b) continue;
    b.classList.toggle(
      "is-active",
      b.getAttribute("data-card-range") === range,
    );
  }
  if (lastSnapshot) renderHero(lastSnapshot);
}

els.cardRange24h.addEventListener("click", () => setCardRange("24h"));
els.cardRange7d.addEventListener("click", () => setCardRange("7d"));
els.cardRange30d.addEventListener("click", () => setCardRange("30d"));
els.cardRange90d.addEventListener("click", () => setCardRange("90d"));
els.cardRangeTotal.addEventListener("click", () => setCardRange("total"));
```

- [ ] **Step 4: Manual smoke**

Open `/dashboard`, click each range button. Confirm:

- Active button gets `is-active`.
- Hero card values shrink/grow accordingly.
- Tokens tag updates to `Σ <range>`.

- [ ] **Step 5: Build + commit**

```bash
npm run build
git add public/dashboard/index.html public/dashboard/styles.css public/dashboard/app.js
git commit -m "feat(dashboard): add 24h/7d/30d/90d/total range selector above hero"
```

---

## Task 7: Custom from/to inputs in chart header (frontend, backend-ready)

**Files:**
- Modify: `public/dashboard/index.html`
- Modify: `public/dashboard/styles.css`
- Modify: `public/dashboard/app.js`

**Interfaces:**
- Consumes: `/v1/dashboard/range` endpoint from Task 4.
- Produces: `chart.data` replaced by the returned `series` until the user clicks `24h` or `30d`.

- [ ] **Step 1: Add the markup**

In `public/dashboard/index.html`, replace the `<div class="panel-controls">` block inside the chart panel (line ~140) with:

```html
          <div class="panel-controls">
            <button
              type="button"
              class="seg-btn is-active"
              data-range="24h"
              id="range-24h"
            >
              24h
            </button>
            <button type="button" class="seg-btn" data-range="30d" id="range-30d">
              30d
            </button>
            <button type="button" class="seg-btn" id="range-custom-toggle">
              custom
            </button>
            <div class="range-custom" id="range-custom" hidden>
              <input type="datetime-local" id="range-from" class="search" />
              <span class="range-sep">→</span>
              <input type="datetime-local" id="range-to" class="search" />
              <button type="button" class="btn" id="range-apply">apply</button>
            </div>
          </div>
```

Also replace the `<div class="chart-legend">` block (line ~157) to add a span that shows the active custom range:

```html
        <div class="chart-legend">
          <span class="legend-item">
            <span class="legend-swatch swatch-in"></span>
            <span>in</span>
          </span>
          <span class="legend-item">
            <span class="legend-swatch swatch-out"></span>
            <span>out</span>
          </span>
          <span class="legend-item legend-meta">
            <span>requests · errors</span>
          </span>
          <span class="legend-item legend-meta" id="range-label"></span>
        </div>
```

- [ ] **Step 2: Style the custom range block**

Append to `public/dashboard/styles.css`:

```css
.range-custom {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.range-custom .range-sep {
  color: var(--fg-faint);
}

#range-label {
  font-style: italic;
  color: var(--accent);
}

@media (max-width: 600px) {
  .panel-controls {
    flex-wrap: wrap;
  }
}
```

(Use existing `--accent` / `--fg-faint` tokens. If they don't exist in your CSS, check `styles.css:1-50` and adjust accordingly.)

- [ ] **Step 3: Wire the toggle and the fetch**

In `public/dashboard/app.js`:

1. Add to the `els` object:

```js
  rangeCustomToggle: document.getElementById("range-custom-toggle"),
  rangeCustom: document.getElementById("range-custom"),
  rangeFrom: document.getElementById("range-from"),
  rangeTo: document.getElementById("range-to"),
  rangeApply: document.getElementById("range-apply"),
  rangeLabel: document.getElementById("range-label"),
```

2. Replace the existing `els.range24h.addEventListener(...)` and `els.range30d.addEventListener(...)` blocks (line ~498) with:

```js
function setChartRange(newRange) {
  range = newRange;
  chartRange = null;          // force chart rebuild on next render
  els.range24h.classList.toggle("is-active", newRange === "24h");
  els.range30d.classList.toggle("is-active", newRange === "30d");
  els.rangeCustomToggle.classList.toggle("is-active", newRange === "custom");
  if (newRange !== "custom") els.rangeLabel.textContent = "";
  if (lastSnapshot) renderChart(lastSnapshot);
}

els.range24h.addEventListener("click", () => setChartRange("24h"));
els.range30d.addEventListener("click", () => setChartRange("30d"));

els.rangeCustomToggle.addEventListener("click", () => {
  els.rangeCustom.hidden = !els.rangeCustom.hidden;
  if (!els.rangeCustom.hidden) els.rangeFrom.focus();
});

async function fetchRange(fromIso, toIso) {
  const params = new URLSearchParams({ from: fromIso, to: toIso });
  const res = await fetch(`/v1/dashboard/range?${params.toString()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function formatRangeLabel(fromIso, toIso) {
  const fmt = new Intl.DateTimeFormat("es-ES", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${fmt.format(new Date(fromIso))} → ${fmt.format(new Date(toIso))} UTC`;
}

els.rangeApply.addEventListener("click", async () => {
  const fromVal = els.rangeFrom.value;
  const toVal = els.rangeTo.value;
  if (!fromVal || !toVal) {
    els.errorBanner.hidden = false;
    els.errorMsg.textContent = "dashboard: from y to son obligatorios";
    return;
  }
  const fromIso = new Date(fromVal).toISOString();
  const toIso = new Date(toVal).toISOString();
  try {
    const snap = await fetchRange(fromIso, toIso);
    setChartRange("custom");
    els.rangeLabel.textContent = formatRangeLabel(fromIso, toIso);
    renderCustomChart(snap);
  } catch (err) {
    els.errorBanner.hidden = false;
    els.errorMsg.textContent = `dashboard: ${err.message || err}`;
  }
});
```

3. Add the `renderCustomChart` helper (right after `renderChart`):

```js
function renderCustomChart(snap) {
  const buckets = snap.metrics.series?.buckets ?? [];
  const bucketMs = snap.metrics.series?.bucketMs ?? 86_400_000;
  const labels = buckets.map((b) => {
    const d = new Date(b.ts);
    if (bucketMs <= 60 * 60 * 1000) return `${d.getUTCHours()}h`;
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  });
  chart.data.labels = labels;
  chart.data.datasets[0].data = buckets.map((b) => b.promptTokens);
  chart.data.datasets[1].data = buckets.map((b) => b.completionTokens);
  chart.update("none");
}
```

4. Also clear `chartRange` in the existing `els.range24h` / `els.range30d` handlers (already done by `setChartRange` above).

- [ ] **Step 4: Manual smoke**

Open `/dashboard`, click `custom`, pick a 7-day range, click `apply`. Confirm:

- Chart series swaps to daily buckets.
- Range label shows e.g. `jul 23, 00:00 → jul 30, 00:00 UTC`.
- Click `24h` — chart reverts to hourly.
- Try `from > to` — error banner shows the message.

- [ ] **Step 5: Build + commit**

```bash
npm run build
git add public/dashboard/index.html public/dashboard/styles.css public/dashboard/app.js
git commit -m "feat(dashboard): add custom from/to range for chart"
```

---

## Task 8: CHANGELOG entry + full verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update CHANGELOG**

Prepend under the `## [Unreleased]` header (or the latest unreleased section — check `CHANGELOG.md:1-20` for the format):

```markdown
- **Dashboard: windowed cards + historical range.** The hero now shows a range selector (`24h / 7d / 30d / 90d / total`) so the Σ total card always reflects a labeled window; large numbers are abbreviated (e.g. `48,8 M`). A new `GET /v1/dashboard/range?from=<iso>&to=<iso>` endpoint returns totals + an auto-bucketed series (hourly ≤48h, daily otherwise) capped at `DASHBOARD_RETENTION_DAYS`. The chart header gets a `custom` toggle with two `datetime-local` inputs that fetch the new endpoint and replace the series.
```

- [ ] **Step 2: Run the full test + lint + build gauntlet**

```bash
npm run lint
npm run test:unit
npm run build
```

Expected: zero errors, all unit tests green (≥20 new test cases across `mobile.test.ts`, `dashboardService.test.ts`, `dashboardRoute.test.ts`).

- [ ] **Step 3: Manual end-to-end smoke**

Boot the proxy with a real `OPENCODE_GO_API_KEY`, hit it a handful of times with different `X-Cortex-Mock-Error` headers (or just let it succeed), then:

1. Open `/dashboard`. Confirm: `Σ total` tag, compact numbers (e.g. `48,8M` if you have that much traffic).
2. Click `30d` — totals shrink, tag becomes `Σ 30d`.
3. Click `custom`, pick last 7 days, `apply` — chart swaps to daily series with a labeled range.
4. Try `from > to` — banner explains.
5. Try a 6-month range — banner shows `range_exceeds_retention` with `maxMs`.
6. Refresh the page — defaults to `Σ total` (snapshot still drives the hero).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for dashboard range selector and history endpoint"
```

---

## Self-review

**Spec coverage:**
- "Window labels on every hero card" → Task 5 (tag updates), Task 6 (selector drives it). ✓
- "Range selector 24h/7d/30d/90d/total" → Task 6. ✓
- "Compact number formatting" → Task 1 + Task 5. ✓
- "Custom from/to range" → Task 4 (route) + Task 7 (UI). ✓
- "Snapshot compat preserved" → Task 2 adds `windows` field additively, doesn't remove anything. ✓

**Placeholder scan:** No "TBD", "implement later", "fill in", "similar to". Every code step has a complete block. Every command has expected output.

**Type consistency:** `TotalsRow` defined once in Task 2 and used by Tasks 2, 3, 5. `WindowKey` defined once in Task 2 and reused in Tasks 2, 3. `cardRange` typed in Task 5 as `"24h" | "7d" | "30d" | "90d" | "total"` matching `WindowKey`. ✓