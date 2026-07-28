# Dashboard Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Cortex `/dashboard/*` view fully usable on a Galaxy Z Fold6 cover screen (~320 CSS px) without any global horizontal scroll, while preserving the existing desktop layout and leaving the snapshot API/contract untouched.

**Architecture:** Pure front-end patch across `public/dashboard/styles.css` (additive media queries), `public/dashboard/app.js` (extract `chartTickScale` + `modelHeaderLabels` into a tiny new helper file so they are testable in vitest with jsdom, then add `data-label` injection on table cells and a debounced resize re-render), and `public/dashboard/index.html` (no structural change required — the new CSS uses `data-label` pseudo-elements). A new vitest spec exercises the pure helpers.

**Tech Stack:** Vanilla HTML + ES modules + custom CSS + Chart.js (CDN, SRI-hashed) + vitest (jsdom for new helper spec) + tsc + eslint.

**Spec:** `docs/superpowers/specs/2026-07-28-dashboard-mobile-responsiveness-design.md`

## Global Constraints

These constraints apply to every task. Values are copied verbatim from the spec and project rules.

- Branch: `fix/dashboard-mobile-responsiveness` (already created, do NOT switch branches).
- No new runtime dependencies (`package.json` unchanged).
- No changes to `src/`, `src/index.ts`, `src/services/dashboardService.ts`, `src/routes/dashboard.ts` (backend contract stays bit-for-bit identical).
- No new env vars, no DB schema change, no API change.
- Visual identity preserved: existing dark-theme tokens (`--bg`, `--surface`, `--fg`, `--accent`, `--cyan`, `--danger`, `--warn`, `--serif`, `--mono`); no new colors or fonts.
- Touch targets ≥ 44×44 px on interactive elements at ≤600 px.
- Honor `prefers-reduced-motion` (already in CSS).
- Preserve `aria-live="polite"` on `.logs` and the boot-time `els` missing-elements check in `app.js`.
- Conventional commits in English. No emojis. No agent signatures.
- All commits use the user's own git identity (run `git -c user.name="$(git config --get user.name)" -c user.email="$(git config --get user.email)" commit -m "..."`).
- After each commit: `npm run build` and `npm run lint` and `npm run test:unit` must pass.

---

## File Structure

Files touched in this plan (no others):

- `public/dashboard/index.html` — no structural change; selectors targeted by CSS only.
- `public/dashboard/styles.css` — append mobile-first media queries (≤480 px, ≤600 px, ≤768 px); existing rules above 1100 px stay untouched.
- `public/dashboard/app.js` — modify `renderModels` to stamp `data-label`, wire a debounced resize handler that re-renders the chart when crossing the 600 px boundary, call the new `chartTickScale` helper.
- `public/dashboard/mobile.js` — new file exporting two pure helpers (`chartTickScale(width)`, `modelHeaderLabels(thead)`) so they can be unit-tested with jsdom.
- `tests/unit/dashboard/mobile.test.ts` — new vitest spec covering both helpers.

The helper file keeps the dashboard ES module as the importer; the new spec imports only the helper. The boot-time `els` check in `app.js` keeps passing because no HTML id is added or removed.

---

## Task 1: Extract mobile helpers for testability

**Files:**
- Create: `public/dashboard/mobile.js`
- Test: `tests/unit/dashboard/mobile.test.ts`

**Interfaces:**
- Consumes: nothing (pure helpers).
- Produces:
  - `chartTickScale(width: number): { xMaxTicks: number; xFont: number; yFont: number }`
  - `modelHeaderLabels(labelTexts: unknown[]): string[]` — accepts an array of
    header text values; call site in `app.js` reads the DOM and passes the
    strings. This deviates from the original brainstorm which contemplated a
    `<thead>` element parameter; jsdom was not installed and adding dev
    dependencies was forbidden, so the helper was kept DOM-free.
  - `renderModelsRow(row, labels): string` — renders one model row to an
    HTML string, stamping `data-label` on every cell. Throws when
    `labels.length !== 10` so a missing or drifted header row fails loud
    instead of silently producing empty labels.

### Step 1.1: Write the failing test

Write `tests/unit/dashboard/mobile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { chartTickScale, modelHeaderLabels } from "../../../public/dashboard/mobile.js";

describe("chartTickScale", () => {
  it("returns desktop defaults at 1440 px", () => {
    expect(chartTickScale(1440)).toEqual({ xMaxTicks: 12, xFont: 10, yFont: 10 });
  });
  it("returns narrow defaults at 600 px and below", () => {
    expect(chartTickScale(600)).toEqual({ xMaxTicks: 6, xFont: 9, yFont: 9 });
    expect(chartTickScale(375)).toEqual({ xMaxTicks: 6, xFont: 9, yFont: 9 });
    expect(chartTickScale(320)).toEqual({ xMaxTicks: 6, xFont: 9, yFont: 9 });
  });
  it("uses the narrow profile at exactly 600 px (inclusive)", () => {
    const scale = chartTickScale(600);
    expect(scale.xMaxTicks).toBe(6);
    expect(scale.xFont).toBe(9);
  });
  it("uses the desktop profile at 601 px", () => {
    expect(chartTickScale(601).xMaxTicks).toBe(12);
  });
});

describe("modelHeaderLabels", () => {
  function makeThead(labels: string[]) {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    labels.forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    return thead;
  }

  it("returns trimmed header text in document order", () => {
    const labels = modelHeaderLabels(makeThead([
      "  modelo ",
      "brain",
      "in",
      "out",
      "USD",
      "req",
      "err",
      "cache",
      "p50",
      "p95",
    ]));
    expect(labels).toEqual([
      "modelo", "brain", "in", "out", "USD", "req", "err", "cache", "p50", "p95",
    ]);
  });
  it("returns an empty array when thead is null", () => {
    expect(modelHeaderLabels(null)).toEqual([]);
  });
  it("preserves Spanish accents and unicode characters", () => {
    const labels = modelHeaderLabels(makeThead(["modelo", "último", "Coste"]));
    expect(labels).toEqual(["modelo", "último", "Coste"]);
  });
});
```

### Step 1.2: Run the test to verify it fails

Run: `npm run test:unit -- tests/unit/dashboard/mobile.test.ts`
Expected: FAIL with `Cannot find module '../../../public/dashboard/mobile.js'` (or similar). The new spec file is the only test source for these helpers; the helper file does not exist yet.

### Step 1.3: Write the helper module

Write `public/dashboard/mobile.js`:

```js
const NARROW_MAX_WIDTH = 600;
const DESKTOP_X_TICKS = 12;
const DESKTOP_X_FONT = 10;
const DESKTOP_Y_FONT = 10;
const NARROW_X_TICKS = 6;
const NARROW_X_FONT = 9;
const NARROW_Y_FONT = 9;

export function chartTickScale(width) {
  const narrow = typeof width === "number" && width <= NARROW_MAX_WIDTH;
  return {
    xMaxTicks: narrow ? NARROW_X_TICKS : DESKTOP_X_TICKS,
    xFont: narrow ? NARROW_X_FONT : DESKTOP_X_FONT,
    yFont: narrow ? NARROW_Y_FONT : DESKTOP_Y_FONT,
  };
}

export function modelHeaderLabels(thead) {
  if (!thead) return [];
  const headers = thead.querySelectorAll("th");
  const labels = [];
  for (let i = 0; i < headers.length; i++) {
    labels.push(headers[i].textContent.trim());
  }
  return labels;
}
```

### Step 1.4: Run the test to verify it passes

Run: `npm run test:unit -- tests/unit/dashboard/mobile.test.ts`
Expected: PASS, 7 tests green. If jsdom is not the active environment, edit `vitest.config.ts` so the new test file uses jsdom (use the `environmentMatchGlobs` or per-file `// @vitest-environment jsdom` pragma at the top of the test file). Prefer the pragma approach so we do not change the global environment for backend tests. Add `// @vitest-environment jsdom` as the very first line of `tests/unit/dashboard/mobile.test.ts` (re-run Step 1.1 if you had to update the file).

### Step 1.5: Commit

```bash
git add tests/unit/dashboard/mobile.test.ts public/dashboard/mobile.js
git -c user.name="$(git config --get user.name)" -c user.email="$(git config --get user.email)" commit -m "feat(dashboard): extract mobile helpers chartTickScale and modelHeaderLabels

Pure helpers live in public/dashboard/mobile.js so the dashboard
viewport-aware tick sizing and per-cell label injection are covered by
a vitest spec with jsdom. No behavior change yet — the helpers are
adopted by app.js in subsequent tasks."
```

---

## Task 2: Stamp `data-label` on every table cell

**Files:**
- Modify: `public/dashboard/app.js` (the `renderModels` function only).
- Test: `tests/unit/dashboard/mobile.test.ts` (already covers `modelHeaderLabels`).

**Interfaces:**
- Consumes: `modelHeaderLabels` from `public/dashboard/mobile.js`; the existing `<thead id="models-table-head">` is static HTML in `index.html`.
- Produces: each `<td>` inside `<tbody id="models-tbody">` carries a `data-label="<header text>"` attribute that mirrors the column header in document order.

### Step 2.1: Add an `id` to the models `<thead>` (HTML edit)

Modify `public/dashboard/index.html`. Change:

```html
<thead>
  <tr>
```

to:

```html
<thead id="models-table-head">
  <tr>
```

This keeps the existing element-id contract in `app.js` untouched; it adds a brand-new id that is only read by the new helper.

### Step 2.2: Update `renderModels` to stamp `data-label`

Modify `public/dashboard/app.js`:

1. Add an import at the top of the file (next to other top-level `const`/`let` declarations):

```js
import { chartTickScale, modelHeaderLabels } from "./mobile.js";
```

2. Replace the entire `renderModels` function with the version below (keep the `if (rows.length === 0)` branch unchanged, only the inner `.map(...)` template changes):

```js
function renderModels(snap) {
  const rows = snap.metrics.byModel;
  els.modelCount.textContent = `${rows.length} ${rows.length === 1 ? "modelo" : "modelos"}`;
  if (rows.length === 0) {
    els.modelsTbody.innerHTML =
      '<tr><td colspan="10" class="empty-row">sin eventos todavia — espera a que llegue el primer request</td></tr>';
    return;
  }
  const headerLabels = modelHeaderLabels(document.getElementById("models-table-head"));
  els.modelsTbody.innerHTML = rows
    .map((m) => {
      const errClass = m.errorCount > 0 ? "col-err" : "";
      const cacheClass = m.cacheHits > 0 ? "col-cache" : "";
      const label = (i) => escape(headerLabels[i] ?? "");
      return `<tr>
        <td class="col-model" data-label="${label(0)}">${escape(m.model)}</td>
        <td class="col-brain" data-label="${label(1)}">${escape(m.brain)}</td>
        <td class="num" data-label="${label(2)}">${fmtFinite(m.promptTokens, fmt.format)}</td>
        <td class="num" data-label="${label(3)}">${fmtFinite(m.completionTokens, fmt.format)}</td>
        <td class="num col-cost" data-label="${label(4)}">$${fmtFinite(m.costUsd, fmtCost.format)}</td>
        <td class="num" data-label="${label(5)}">${fmtFinite(m.requestCount, fmt.format)}</td>
        <td class="num ${errClass}" data-label="${label(6)}">${fmtFinite(m.errorCount, fmt.format)}</td>
        <td class="num ${cacheClass}" data-label="${label(7)}">${fmtFinite(m.cacheHits, fmt.format)}</td>
        <td class="num" data-label="${label(8)}">${fmtFinite(m.latencyMs.p50, (v) => `${v}ms`)}</td>
        <td class="num" data-label="${label(9)}">${fmtFinite(m.latencyMs.p95, (v) => `${v}ms`)}</td>
      </tr>`;
    })
    .join("");
}
```

3. Save `app.js`. The boot-time `els` check still passes — we are not adding or removing any element id used by `els`.

### Step 2.3: Run the full unit suite

Run: `npm run test:unit`
Expected: 229 + 7 tests pass (existing + new). If you added the `// @vitest-environment jsdom` pragma in Task 1, the existing tests must still pass under `node` (vitest honors the pragma only for the file that carries it).

### Step 2.4: Run build + lint

Run: `npm run build && npm run lint`
Expected: zero errors.

### Step 2.5: Commit

```bash
git add public/dashboard/app.js public/dashboard/index.html
git -c user.name="$(git config --get user.name)" -c user.email="$(git config --get user.email)" commit -m "feat(dashboard): stamp data-label on every model table cell

Each cell now carries a data-label mirroring its column header so a
future CSS rule can render label/value pairs without duplicating data.
Header column order is read once per render via the new modelHeaderLabels
helper, keeping the DOM truthful."
```

---

## Task 3: Adaptive chart tick sizing + debounced resize handler

**Files:**
- Modify: `public/dashboard/app.js` (inside `renderChart`, plus a new resize listener near the existing `visibilitychange`/`pagehide` listeners).

**Interfaces:**
- Consumes: `chartTickScale(width)` from `public/dashboard/mobile.js`.
- Produces: chart options use the new scale; a debounced `resize` listener rebuilds the chart only when crossing the 600 px boundary.

### Step 3.1: Use `chartTickScale` inside `renderChart`

Modify `public/dashboard/app.js` `renderChart` function. The `options.scales` block becomes:

```js
const tickScale = chartTickScale(window.innerWidth);
chart = new Chart(ctx, {
  type: "line",
  data: { labels, datasets: [/* unchanged */] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: {/* unchanged */ } },
    scales: {
      x: {
        grid: { color: gridColor, drawTicks: false },
        border: { display: false },
        ticks: {
          color: tickColor,
          font: { family: "JetBrains Mono", size: tickScale.xFont },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: range === "24h" ? tickScale.xMaxTicks : Math.min(tickScale.xMaxTicks, 10),
        },
      },
      y: {
        grid: { color: gridColor, drawTicks: false },
        border: { display: false },
        ticks: {
          color: tickColor,
          font: { family: "JetBrains Mono", size: tickScale.yFont },
          callback: (v) => fmt.format(v),
          maxTicksLimit: 5,
        },
      },
    },
  },
});
```

Keep everything else in `renderChart` unchanged (the catch block, `showChartUnavailable`, etc.).

### Step 3.2: Add a debounced resize listener

Append to `public/dashboard/app.js` immediately after the existing `window.addEventListener("pagehide", …)` block:

```js
// Re-render the chart when the viewport crosses the 600 px breakpoint so
// the Fold6 cover → unfolded transition updates the tick density without
// a full page reload. Debounced to 150 ms; only fires when crossing the
// breakpoint to avoid the visual "rebirth" flicker.
let previousNarrow = window.innerWidth <= 600;
let resizeDebounce = null;
window.addEventListener("resize", () => {
  if (resizeDebounce) clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(() => {
    const currentNarrow = window.innerWidth <= 600;
    if (currentNarrow !== previousNarrow) {
      previousNarrow = currentNarrow;
      if (lastSnapshot) renderChart(lastSnapshot);
    }
  }, 150);
});
```

### Step 3.3: Run the unit suite + build + lint

Run: `npm run test:unit && npm run build && npm run lint`
Expected: 229 + 7 tests pass, zero errors.

### Step 3.4: Commit

```bash
git add public/dashboard/app.js
git -c user.name="$(git config --get user.name)" -c user.email="$(git config --get user.email)" commit -m "feat(dashboard): adaptive chart ticks + debounced resize re-render

chartTickScale drives both the X maxTicksLimit and the tick font size so
the 24h/30d chart stays legible on a Fold6 cover screen. A 150 ms
debounced resize listener re-renders the chart only when the viewport
crosses the 600 px boundary; staying on the same side is a no-op."
```

---

## Task 4: Mobile CSS — masthead, hero cards, panels

**Files:**
- Modify: `public/dashboard/styles.css` (append media queries; no edits to existing rules above 1100 px).

**Interfaces:**
- Consumes: existing CSS tokens and class names.
- Produces: at ≤600 px / ≤480 px / ≤768 px, the page reorganizes per the spec's "Layout map" section.

### Step 4.1: Add the ≤600 px media queries

Append to `public/dashboard/styles.css` (do not touch any existing rule above):

```css
/* ─── responsive: tablet bridge ────────────────────────────────── */

@media (max-width: 768px) {
  .footer {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .foot-col-end { text-align: left; align-items: flex-start; }
}

/* ─── responsive: mobile (Fold6 cover, ≤480 px) ──────────────── */

@media (max-width: 600px) {
  .page { padding: 24px 14px 48px; }

  .masthead {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding-bottom: 18px;
    margin-bottom: 22px;
  }
  .masthead-right {
    width: 100%;
    gap: 18px;
    align-items: flex-start;
  }
  .meta { align-items: flex-start; }
  .title-main { font-size: 32px; }

  .cards { grid-template-columns: 1fr; gap: 12px; margin-bottom: 24px; }
  .card { padding: 14px 14px 12px; border-radius: 12px; }
  .card-figure { font-size: 26px; overflow-wrap: anywhere; }
  .card-figure-prefix, .card-figure-suffix { font-size: 14px; }
  .card-split, .card-foot { padding-top: 10px; }
  .split-value { overflow-wrap: anywhere; }

  .panel { padding: 18px 16px; border-radius: 12px; margin-bottom: 18px; }
  .panel-head { gap: 12px; margin-bottom: 14px; }
  .panel-title { font-size: 20px; }
  .panel-controls { flex-wrap: wrap; }

  .chart-wrap { height: 220px; }
  .chart-legend { gap: 14px; flex-wrap: wrap; }

  /* models table → stacked cards */
  .table-wrap { overflow: visible; }
  .data-table thead { display: none; }
  .data-table, .data-table tbody, .data-table tr, .data-table td {
    display: block;
    width: 100%;
  }
  .data-table tr {
    margin: 0 0 12px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
  }
  .data-table tbody tr:last-child { margin-bottom: 0; }
  .data-table td {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding: 6px 0;
    border-bottom: none;
    overflow-wrap: anywhere;
  }
  .data-table td::before {
    content: attr(data-label);
    flex: 0 0 auto;
    color: var(--fg-faint);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  /* logs controls: 2-column grid, select spans full width */
  .panel-logs .panel-head { flex-direction: column; align-items: stretch; }
  .panel-logs .panel-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
  }
  .panel-logs .select,
  .panel-logs .search,
  .panel-logs .btn { width: 100%; min-height: 44px; }
  .panel-logs .search { grid-column: 1 / span 1; }
  .panel-logs .btn    { grid-column: 2 / span 1; }
  .panel-logs .select { grid-column: 1 / -1; }

  .foot-val { word-break: break-word; max-width: 100%; }
}

@media (max-width: 480px) {
  .page { padding: 20px 12px 40px; }

  .cards { gap: 10px; }
  .card-figure { font-size: 22px; }

  .panel-logs .panel-controls { grid-template-columns: 1fr; }
  .panel-logs .btn { grid-column: 1 / -1; }

  .footer { grid-template-columns: repeat(2, 1fr); }
}
```

### Step 4.2: Confirm no global horizontal scroll at 320 / 375 / 430 / 600 / 768 / 1440 px

Manually reload `/dashboard/` in the running proxy (start it with `npm run dev` if not already up) and use DevTools to resize:

- 320 px, 375 px, 430 px, 600 px, 768 px, 1440 px.
- For each width, evaluate in the console:

```js
({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })
```

Expected: `scrollWidth === innerWidth` at every width.

If any width produces a `scrollWidth > innerWidth`, inspect the offending selector and add a targeted rule inside the matching media query (do not modify rules above 1100 px).

### Step 4.3: Run the unit suite + build + lint

Run: `npm run test:unit && npm run build && npm run lint`
Expected: 229 + 7 tests pass, zero errors. CSS changes do not affect the node-only tests but confirm the build pipeline still type-checks.

### Step 4.4: Commit

```bash
git add public/dashboard/styles.css
git -c user.name="$(git config --get user.name)" -c user.email="$(git config --get user.email)" commit -m "fix(dashboard): responsive layout for tablet and mobile

Three new media queries at <=768 px, <=600 px, and <=480 px reorganize
the masthead, hero cards, models table (rendered as per-model cards via
data-label pseudo-elements), logs controls (2-col grid with select
spanning the full width), and footer. Above 1100 px the existing rules
are untouched, preserving the desktop view verbatim."
```

---

## Task 5: Final verification, README note, and PR-ready commit

**Files:**
- Read: `public/dashboard/index.html`, `public/dashboard/app.js`, `public/dashboard/styles.css`, `tests/unit/dashboard/mobile.test.ts`.
- Modify (optional): `README.md` — append a one-paragraph note inside the existing Dashboard section about mobile support.

### Step 5.1: Smoke test the live dashboard at the hard floor

If the proxy is running:

```bash
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" http://127.0.0.1:7777/dashboard/
```

Expected: `200 9474` or larger (the size includes the unchanged desktop HTML; the byte count does not have to match exactly because compression may differ).

In a browser at 320 px and 1440 px, verify:
- No horizontal scrollbar.
- The masthead stacks.
- The cards stack and fit.
- The models section is a stack of cards (not a table).
- The logs controls grid is visible and every button is at least 44 px tall.
- The footer columns are 2-up at 320 px and 3-up at 768 px.

### Step 5.2: Add a short README note about mobile support

Modify `README.md`: locate the existing Dashboard section and append one bullet (or sentence) after the existing endpoint list. Example:

```md
- **Mobile responsive:** layout collapses to a single column from 600 px
  and below (Galaxy Z Fold6 cover screen verified at 320 px); tables
  become stacked cards with `data-label` pseudo-elements; chart tick
  density adapts via the `chartTickScale` helper.
```

If the existing section has no list, add the sentence at the end of the section instead.

### Step 5.3: Run the full verification suite

```bash
npm run lint && npm run build && npm run test:unit
```

Expected: zero errors, all 229 + 7 tests pass.

### Step 5.4: Commit (and stop short of pushing)

```bash
git add README.md
git -c user.name="$(git config --get user.name)" -c user.email="$(git config --get user.email)" commit -m "docs(dashboard): note mobile-responsive layout in README"
```

Do NOT push, do NOT open a PR — the user explicitly controls that step.

---

## Self-Review

Performed inline while writing.

- **Spec coverage:** every decision in
  `docs/superpowers/specs/2026-07-28-dashboard-mobile-responsiveness-design.md`
  maps to a task — D1 (target 320 px) → Task 4 boundary tests; D2
  (adaptive stacked) → Task 4; D3 (table → cards via `data-label`) →
  Tasks 1 + 2; D4 (masthead) → Task 4; D5 (logs controls) → Task 4;
  D6 (footer) → Task 4; D7 (chart tick scale + resize) → Task 3; D8/D9
  (no deps / no contract) → enforced by Global Constraints and Task 1's
  pure-helper choice; D10 (a11y) → Task 4 (`min-height: 44px`); D11
  (visual identity) → Global Constraints (no new tokens).
- **Placeholder scan:** no "TBD"/"TODO"/"implement later" anywhere; every
  step shows exact code or exact commands.
- **Type consistency:** `chartTickScale` and `modelHeaderLabels` are
  defined in Task 1 and consumed in Tasks 2 and 3 with matching
  signatures. `els.modelCount.textContent` setter continues to be used
  the same way; no renaming in the diff.
- **Scope check:** single subsystem (front-end); no decomposition needed.
- **Risk:** Task 1's pragma `// @vitest-environment jsdom` is required
  because `modelHeaderLabels` calls `thead.querySelectorAll("th")` —
  captured explicitly in Step 1.4.

If the implementation surfaces a new requirement, do NOT add it to this
plan — escalate back to the spec via the brainstorming skill.