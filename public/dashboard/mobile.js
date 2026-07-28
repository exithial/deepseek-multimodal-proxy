const NARROW_MAX_WIDTH = 600;
const DESKTOP_X_TICKS = 12;
const DESKTOP_X_FONT = 10;
const DESKTOP_Y_FONT = 10;
const NARROW_X_TICKS = 6;
const NARROW_X_FONT = 9;
const NARROW_Y_FONT = 9;
const MODEL_COLUMN_COUNT = 10;

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => HTML_ESCAPES[c],
  );
}

export function chartTickScale(width) {
  const narrow = typeof width === "number" && width <= NARROW_MAX_WIDTH;
  return {
    xMaxTicks: narrow ? NARROW_X_TICKS : DESKTOP_X_TICKS,
    xFont: narrow ? NARROW_X_FONT : DESKTOP_X_FONT,
    yFont: narrow ? NARROW_Y_FONT : DESKTOP_Y_FONT,
  };
}

export function modelHeaderLabels(labelTexts) {
  if (!Array.isArray(labelTexts)) return [];
  const out = [];
  for (let i = 0; i < labelTexts.length; i++) {
    out.push(String(labelTexts[i] ?? "").trim());
  }
  return out;
}

// Renders a single model row to an HTML string, stamping the column
// header on each cell via `data-label`. The CSS at <=600 px turns the
// table into stacked cards using those labels. Pure function so it can
// be exercised by tests without a DOM.
//
// Throws if `labels.length !== MODEL_COLUMN_COUNT` so a missing or
// drifted header row fails loud instead of silently emitting empty
// data-label attributes that degrade the mobile UX.
//
// The row carries two parallel shapes:
//   - `promptTokens`, `completionTokens`, `cost`, `req`, `err`, `hits`,
//     `p50`, `p95`: pre-formatted display strings (already run through
//     Intl.NumberFormat / fmtFinite in the call site).
//   - `errorCount`, `cacheHits`: raw numeric counts used to decide the
//     `col-err` / `col-cache` row highlighting classes. Kept separate
//     from the formatted strings so a display value of "—" or "0" never
//     silently disables highlighting.
export function renderModelsRow(row, labels) {
  if (!Array.isArray(labels) || labels.length !== MODEL_COLUMN_COUNT) {
    throw new Error(
      `dashboard: expected ${MODEL_COLUMN_COUNT} column headers, got ${Array.isArray(labels) ? labels.length : 0}`,
    );
  }
  const label = (i) => escapeHtml(labels[i]);
  const errClass = row.errorCount > 0 ? "col-err" : "";
  const cacheClass = row.cacheHits > 0 ? "col-cache" : "";
  // role="listitem" pairs with role="list" on the tbody to compensate for
  // the visual table-to-cards transformation at <=600 px: the underlying
  // <table> semantics are degraded on narrow screens, and assistive tech
  // announces the data-label pseudo-content more reliably when ARIA roles
  // are present. Above 1100 px the table reads as a table (no role
  // override) so screen readers still see a proper data table.
  return `<tr role="listitem">
    <td class="col-model" data-label="${label(0)}">${escapeHtml(row.model)}</td>
    <td class="col-brain" data-label="${label(1)}">${escapeHtml(row.brain)}</td>
    <td class="num" data-label="${label(2)}">${row.promptTokens}</td>
    <td class="num" data-label="${label(3)}">${row.completionTokens}</td>
    <td class="num col-cost" data-label="${label(4)}">$${row.cost}</td>
    <td class="num" data-label="${label(5)}">${row.req}</td>
    <td class="num ${errClass}" data-label="${label(6)}">${row.err}</td>
    <td class="num ${cacheClass}" data-label="${label(7)}">${row.hits}</td>
    <td class="num" data-label="${label(8)}">${row.p50}</td>
    <td class="num" data-label="${label(9)}">${row.p95}</td>
  </tr>`;
}
