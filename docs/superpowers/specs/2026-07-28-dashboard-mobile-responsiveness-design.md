# Dashboard Mobile Responsiveness — Design Spec

**Status:** Draft
**Slug:** `dashboard-mobile-responsiveness`
**Date:** 2026-07-28
**Branch:** `fix/dashboard-mobile-responsiveness`
**Supersedes:** nothing (additive fix)

## Goal

Make the `/dashboard/*` view of the Cortex Multimodal Proxy fully usable on a
Samsung Galaxy Z Fold6 cover screen (~320 CSS px logical width) without any
global horizontal scroll, while keeping the existing desktop layout intact and
without changing the dashboard JSON contract or any backend code.

Today the desktop layout at 1440 px renders cleanly (a few minor card overflows
inside the cells are handled by `overflow: hidden`), but on 375 px and below:

- The `.masthead` overflows by 43 px (title + meta column don't wrap).
- The models table pushes the document to 595 px wide (744 px table inside a
  293 px wrapper, horizontally scrolled but produces a global horizontal
  scrollbar).
- The logs panel controls overflow the panel head by 309 px (filter + search +
  refresh don't fit).
- The footer columns stretch to 534 px (the providers JSON literal is too long
  to wrap under the current `display: flex` column).

The user views the dashboard on a Fold6, usually closed, so the fix must hold
down to 320 px without regressions.

## Decisions log

This spec was shaped through brainstorming on 2026-07-28. Decisions:

1. **Target viewport:** robust down to 320 CSS px (Fold6 cover ≈ 320, modern
   Android phones 360–430, iPhones 375–430). Above 1100 px (current desktop
   breakpoint) the layout stays exactly as today; nothing in the desktop view
   moves.
2. **Layout strategy:** adaptive stacked. All sections reorganize into a
   single vertical flow on ≤600 px; no carousel, no horizontal scroll, no
   abridged numbers. Same data, different container.
3. **Models table transformation:** on ≤600 px the same `<table>` becomes a
   stack of per-model cards. The transformation is data-driven in
   `app.js` — every cell receives a `data-label="…"` attribute that mirrors the
   column header. CSS uses those labels to render `Cell: value` rows without
   duplicating data in the DOM. The header is read from
   `<thead id="models-table-head">` via `modelHeaderLabels` and the row
   template lives in `renderModelsRow` (both in `public/dashboard/mobile.js`,
   pure helpers). `renderModelsRow` throws when the column count drifts
   from 10 so a malformed header row fails loud instead of silently
   degrading the mobile UX with empty labels.
4. **Header:** the masthead stacks vertically on ≤600 px: live dot + title on
   one row, meta columns flow below as a horizontal compact strip. On
   601–1100 px the meta columns stay inline but wrap.
5. **Logs panel controls:** on 481–600 px they flow into a 2-column grid
   with `select` spanning the full width on the first row (grid-column 1/-1)
   and `search` + `refresh` sharing the second row. On ≤480 px every
   control gets its own row (single-column grid). All controls grow to
   44 px min height (WCAG 2.5.5 target size) for thumb reach.
6. **Footer:** flex columns become 2-up on ≤480 px, 3-up on 481–768 px; the
   `providers` JSON literal is rendered with `word-break: break-word` and a
   tooltip on hover so it never overflows.
7. **Chart panel:** the 280 px chart-wrap height stays, but on ≤600 px we
   raise `maxTicksLimit` on the X axis from 12→6 (24h) and 10→5 (30d) to keep
   tick labels legible; Y axis keeps `maxTicksLimit: 5` but adds a smaller
   font (9 px) to avoid collisions. Chart.js options in `app.js` adapt via a
   new `chartTickScale()` helper that reads `window.innerWidth`.
8. **No new dependencies.** Pure CSS + vanilla JS. Chart.js is already
   vendored via the existing CDN SRI-hashed script.
9. **No API / contract changes.** `GET /v1/dashboard/snapshot` stays bit-for-
   bit identical. No DB changes, no env var additions.
10. **Accessibility:** keep keyboard order; touch targets ≥ 44×44 px on
    interactive elements (buttons, select, search, segmented controls);
    preserve `prefers-reduced-motion` already in place; `aria-live="polite"`
    on the logs `<pre>` stays.
11. **Visual identity:** retain the existing dark theme tokens (`--bg`,
    `--surface`, `--fg`, `--accent`, `--cyan`, `--danger`, `--warn`,
    `--serif`, `--mono`). No new colors or fonts.

## Architecture

Three files in `public/dashboard/` are modified; no other file in the repo
touches:

- `public/dashboard/styles.css` — media queries for ≤600 px (primary),
  601–1100 px (tablet bridge), ≤480 px (extra-narrow phones like Fold6 cover).
  Additive only; existing rules above 1100 px are untouched.
- `public/dashboard/app.js` — three additions:
  1. In `renderModels`, stamp each `<td>` with `data-label="${th}"` sourced
     from the column headers in the same order as in `index.html`. This keeps
     the DOM truthful (one source of truth) and lets CSS restyle the cell into
     a label/value pair.
  2. A new `chartTickScale()` helper invoked at the top of `renderChart` to
     pick `maxTicksLimit` and the tick font size based on `window.innerWidth`.
  3. A new `resize` listener that re-runs `renderChart` if the viewport
     crosses the 600 px boundary, so a Fold6 opened mid-session gets the
     desktop chart back without a page reload. Debounced to 150 ms.
- `public/dashboard/index.html` — only the `<thead>` gets a new
  `id="models-table-head"` so `renderModels` can read header text without
  relying on positional selectors. No other structural changes; the
  existing element ids stay untouched, so the boot-time "missing
  elements" check in `app.js` keeps passing.

## Layout map

### Desktop ≥ 1100 px (unchanged)

| Section       | Layout                                                      |
| ------------- | ----------------------------------------------------------- |
| Masthead      | Single row, brand left, two meta columns right              |
| Hero cards    | 6 columns grid                                              |
| Chart         | Single panel, segmented 24h/30d toggle right of title       |
| Models table  | 10 columns table with horizontal scroll fallback            |
| Logs          | Single row: count + level + search + refresh                |
| Footer        | 5 columns, last right-aligned                               |

### Tablet 601–1099 px (already 3-up cards, tighten masthead)

| Section       | Layout                                                      |
| ------------- | ----------------------------------------------------------- |
| Masthead      | Brand left, meta columns wrap below title                   |
| Hero cards    | 3 columns grid (already in place)                           |
| Chart         | Same panel, smaller axis font                               |
| Models table  | Same table inside `.table-wrap` with internal scroll        |
| Logs          | Controls wrap to two rows when needed                       |
| Footer        | 3 columns                                                   |

### Mobile ≤ 600 px (new)

| Section       | Layout                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| Masthead      | Brand row + meta strip; 12 px gap; dot animates                         |
| Hero cards    | 1 column (each card full width, internal split stays)                   |
| Chart         | Stack segmented controls below title; axis labels smaller               |
| Models        | Each row becomes a card with label/value lines (model · brain · in · out · USD · req · err · cache · p50 · p95) |
| Logs          | Panel-head becomes two rows: title + count on top, controls stack into a grid below — select spans full width on its own row (1/-1), then search + refresh share the second row at 481–600 px (or each on its own row at ≤480 px) |
| Footer        | 2 columns at ≤480 px, 3 columns 481–768 px; `providers` JSON wraps      |

### Extra-narrow ≤ 480 px (Fold6 cover, also a hard floor)

| Section       | Layout                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------- |
| All           | Padding `12 px` horizontal (was `16 px`); card padding `14 px`; reduce chart height to 220 px |
| Hero cards    | 1 column still; `.card-figure` reduces to 26 px font to keep 7-digit numbers single-line     |
| Logs          | Each control gets its own row; search input stretches to full width; refresh button keeps its label but with `min-height: 44 px`       |

## Component design

### Metric cards (`.card`)

Existing markup keeps the figure + optional split / footer. Mobile rules:

```css
@media (max-width: 600px) {
  .cards { grid-template-columns: 1fr; gap: 12px; }
  .card { padding: 14px 14px 12px; border-radius: 12px; }
  .card-figure { font-size: 26px; }
}
```

`min-width: 0` (already implied by `* { box-sizing: border-box }`) plus
`overflow-wrap: anywhere` on `.card-figure` and `.split-value` so values like
`37.515.242` don't push the card wider than the viewport.

### Masthead

```css
@media (max-width: 600px) {
  .masthead {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding-bottom: 18px;
    margin-bottom: 22px;
  }
  .masthead-right { width: 100%; gap: 16px; }
  .title-main { font-size: 32px; }
}
@media (max-width: 480px) {
  .masthead-right { gap: 14px; }
  .title-main { font-size: 28px; }
}
```

### Models table → cards

The transformation keeps the original `<table>` semantics for screen readers
and the boot check, while visually rendering each row as a card. CSS only:

```css
@media (max-width: 600px) {
  .table-wrap { overflow: visible; }
  .data-table thead { display: none; }
  .data-table, .data-table tbody, .data-table tr, .data-table td {
    display: block;
    width: 100%;
  }
  .data-table tr {
    margin: 0 0 10px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
  }
  .data-table td {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 0;
    border: none;
  }
  .data-table td::before {
    content: attr(data-label);
    color: var(--fg-faint);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }
}
```

`app.js` will inject the `data-label` attribute from the existing header row:

```js
// inside renderModels, before mapping rows:
const headerCells = [...document.querySelectorAll("#models-table thead th")].map(
  (th) => th.textContent.trim(),
);
// ...inside the .map((m) => `<tr>...</tr>`), wrap each <td>:
`<td class="…" data-label="${escape(headerCells[i])}">…</td>`
```

Header column order in `index.html` (model · brain · in · out · USD · req ·
err · cache · p50 · p95) becomes the label order in the cards.

### Logs controls

```css
@media (max-width: 600px) {
  .panel-logs .panel-head { flex-direction: column; align-items: stretch; }
  .panel-logs .panel-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .panel-logs .select,
  .panel-logs .search,
  .panel-logs .btn {
    width: 100%;
    min-height: 44px;
  }
  .panel-logs .search { grid-column: 1 / span 1; }
  .panel-logs .btn    { grid-column: 2 / span 1; }
  .panel-logs .select { grid-column: 1 / -1; }
}
@media (max-width: 480px) {
  .panel-logs .panel-controls { grid-template-columns: 1fr; }
  .panel-logs .btn { grid-column: 1 / -1; }
}
```

### Footer

```css
@media (max-width: 768px) { .footer { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 480px) { .footer { grid-template-columns: repeat(2, 1fr); } }
.foot-val { word-break: break-word; max-width: 100%; }
```

### Chart

`app.js` additions:

```js
function chartTickScale() {
  const narrow = window.innerWidth <= 600;
  return {
    xMaxTicks: narrow ? 6 : 12,
    xFont: narrow ? 9 : 10,
    yFont: narrow ? 9 : 10,
  };
}
```

Used inside both the initial `new Chart(...)` block and the chart-range
listener so the change is consistent on range switch. A debounced `resize`
listener calls `renderChart(lastSnapshot)` when crossing 600 px.

## Failure modes

- **Resize event spam:** debounce the resize handler to 150 ms via
  `requestAnimationFrame`-aligned setTimeout. Without the guard, switching
  between Fold6 cover (320 px) and unfolded (768 px) could fire dozens of
  chart rebuilds per second and re-trigger the visual "rebirth" bug we
  patched earlier.
- **Missing data-label:** `headerCells` reads the static `<thead>` once per
  `renderModels` call, so if a future change adds a column, the label array
  auto-updates. Boot-time `els` check already throws if any expected ID is
  missing.
- **Long model names overflowing the new card:** `.data-table td` uses
  `flex-wrap: wrap` plus `overflow-wrap: anywhere` on `.col-model`, so model
  names like `proxy/deepseek-v4-flash` wrap inside the value cell instead of
  breaking the card.
- **Footer providers JSON literal:** wrapped with `word-break: break-word`
  and a `title` attribute (set in `app.js` once on first render) for
  copy-on-tap.

## Testing approach

- **Manual visual regression** in Chrome DevTools at the following widths:
  320 (Fold6 cover, hard floor), 360 (compact Android), 375 (iPhone SE/12
  mini), 390 (iPhone 13/14), 430 (large Android), 600 (mobile ↔ tablet
  boundary), 768 (tablet), 1100 (tablet ↔ desktop boundary), 1440 (current
  baseline). For each width:
  - Verify `document.documentElement.scrollWidth === window.innerWidth`
    (no global horizontal scroll).
  - Verify each card visibly fits inside its parent.
  - Verify the models section shows one card per model, not a table.
  - Verify logs filters wrap to a stacked layout.
- **Automated:**
  - `npm run build` (tsc) → must pass with zero errors.
  - `npm run lint` → zero errors.
  - `npm run test:unit` → all 229 tests still pass (no backend changes, but
    confirms no accidental import surface change).
  - Smoke `curl -s http://127.0.0.1:7777/dashboard/ -o /dev/null -w "%{http_code} %{size_download}\n"` after restart → expect `200` with size >= today's 9474 bytes.
- **Browser console:** no errors. The boot-time missing-elements check must
  still pass (we don't add or remove any IDs).

## Out of scope

- Adding a hamburger nav or section jump menu.
- Splitting the dashboard into multiple pages or routes.
- Touch gestures (swipe-to-refresh on the chart, pinch-to-zoom).
- Dark/light theme toggle (current design is dark only and stays dark).
- I18n of the metric labels (current Spanish copy stays).
- Hiding metrics behind a "more" toggle — the spec promises all metrics
  remain visible at every viewport.

## Risks and rollback

- **Risk:** the new media queries regress a desktop property somewhere.  
  **Mitigation:** desktop rules are untouched; all new rules are scoped under
  `@media (max-width: 600px)` / `≤ 480 px` / `≤ 768 px`. Test 1440 + 1100
  before merging.
- **Risk:** Chart.js re-rendering on resize flickers.  
  **Mitigation:** debounce 150 ms and only re-render on boundary cross (use a
  `previousNarrow` flag).
- **Risk:** model card height varies wildly because each row has a different
  number of error/cache rows colored.  
  **Mitigation:** the styling uses `gap: 6 px` between rows; the card height
  is content-driven and predictable (~10 rows × 24 px ≈ 240 px).
- **Rollback:** `git revert` of the merge commit restores the previous
  dashboard view. No env var, no DB migration, no API change — pure front-end
  patch.

## Open questions

None — all scope resolved during brainstorming.