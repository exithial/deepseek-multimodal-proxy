import {
  chartTickScale,
  escapeHtml,
  modelHeaderLabels,
  renderModelsRow,
  fmtCompact,
} from "./mobile.js";

const fmt = new Intl.NumberFormat("es-ES");
// USD is conventionally formatted with '.' as the decimal separator
// and ',' as the thousands separator regardless of the viewer's
// locale — Spanish locale would render $1,23 which is confusing
// when the value is meant to be USD. Pin to en-US for cost.
const fmtCost = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const fmtPct = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

let chart = null;
let chartRange = null;
let lastSnapshot = null;
let lastRangeSnap = null;
let lastRefreshAt = 0;
let range = "total";
let pollTimer = null;
let pollIntervalMs = 0;
let inflight = false;
let activeRangeSnap = null;

const els = {
  liveDot: document.getElementById("live-dot"),
  lastRefresh: document.getElementById("last-refresh"),
  pollInterval: document.getElementById("poll-interval"),
  totalTokens: document.getElementById("metric-total-tokens"),
  promptTokens: document.getElementById("metric-prompt-tokens"),
  completionTokens: document.getElementById("metric-completion-tokens"),
  cost: document.getElementById("metric-cost"),
  requests: document.getElementById("metric-requests"),
  requestsOk: document.getElementById("metric-requests-ok"),
  errors: document.getElementById("metric-errors"),
  cacheRatio: document.getElementById("metric-cache-ratio"),
  cacheHits: document.getElementById("metric-cache-hits"),
  cacheMisses: document.getElementById("metric-cache-misses"),
  errorRate: document.getElementById("metric-error-rate"),
  uptime: document.getElementById("metric-uptime"),
  version: document.getElementById("metric-version"),
  modelsTbody: document.getElementById("models-tbody"),
  modelCount: document.getElementById("model-count"),
  logsPane: document.getElementById("logs-pane"),
  logsCount: document.getElementById("logs-count"),
  logLevel: document.getElementById("log-level"),
  logSearch: document.getElementById("log-search"),
  logRefresh: document.getElementById("log-refresh"),
  errorBanner: document.getElementById("error-banner"),
  errorMsg: document.getElementById("error-msg"),
  disabledBanner: document.getElementById("disabled-banner"),
  range24h: document.getElementById("range-24h"),
  range7d: document.getElementById("range-7d"),
  range30d: document.getElementById("range-30d"),
  range90d: document.getElementById("range-90d"),
  rangeTotal: document.getElementById("range-total"),
  rangeCustomBtn: document.getElementById("range-custom"),
  rangeCustomPanel: document.getElementById("range-custom-panel"),
  rangeFrom: document.getElementById("range-from"),
  rangeTo: document.getElementById("range-to"),
  rangeApply: document.getElementById("range-apply"),
  rangeLabel: document.getElementById("range-label"),
  tokensTag: document.querySelector(".card-tokens .card-tag"),
  footVersion: document.getElementById("foot-version"),
  footMode: document.getElementById("foot-mode"),
  footProviders: document.getElementById("foot-providers"),
  footRetention: document.getElementById("foot-retention"),
};

function formatUptime(seconds) {
  if (typeof seconds !== "number" || seconds < 0) return "—";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 1) return "0s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

// Coerce a numeric value to a safe display string. SQLite REAL
// columns can round-trip NaN (becomes NULL) or Infinity through
// better-sqlite3; the dashboard should never show "NaN" or
// "Infinity" as a literal — render as em-dash instead.
function fmtFinite(value, fmtFn) {
  return Number.isFinite(value) ? fmtFn(value) : "—";
}

function activeWindow() {
  if (!activeRangeSnap) return null;
  if (range === "custom") {
    return {
      totals: activeRangeSnap.metrics.totals,
      byModel: activeRangeSnap.metrics.byModel,
      series: activeRangeSnap.metrics.series,
      label: "rango",
    };
  }
  const w = activeRangeSnap.metrics.windows[range];
  if (!w) return null;
  return {
    totals: w,
    byModel: w.byModel,
    series: null,
    label: range,
  };
}

function renderHero() {
  const win = activeWindow();
  if (!win) return;
  const w = win.totals;
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
  const cacheRatioPct =
    requestCount > 0 ? (cacheHits / requestCount) * 100 : 0;
  els.cacheRatio.textContent = Number.isFinite(cacheRatioPct)
    ? fmtPct.format(cacheRatioPct)
    : "—";
  els.cacheHits.textContent = fmtCompact(cacheHits);
  els.cacheMisses.textContent = fmtCompact(cacheMisses);
  const errRate =
    requestCount > 0 ? (w.errorCount / requestCount) * 100 : 0;
  els.errorRate.textContent = fmtPct.format(errRate);
  if (els.tokensTag) {
    els.tokensTag.textContent = `Σ ${win.label}`;
  }
}

function activeChartBuckets() {
  if (!activeRangeSnap) return null;
  if (range === "custom") {
    const series = activeRangeSnap.metrics.series;
    if (!series) return null;
    return { buckets: series.buckets, bucketMs: series.bucketMs, hourly: series.bucketMs <= 60 * 60 * 1000 };
  }
  // 24h uses hourly last24hHourly; all other windows use daily last30dDaily
  // and we just truncate it. Daily buckets already cover up to 30d; for 90d/total
  // we fall back to the same data — beyond 30d the chart compresses.
  const isHourly = range === "24h";
  if (isHourly) {
    return {
      buckets: activeRangeSnap.metrics.last24hHourly,
      bucketMs: 60 * 60 * 1000,
      hourly: true,
    };
  }
  return {
    buckets: activeRangeSnap.metrics.last30dDaily,
    bucketMs: 24 * 60 * 60 * 1000,
    hourly: false,
  };
}

function renderChart() {
  if (typeof Chart === "undefined") {
    showChartUnavailable();
    return;
  }
  const data = activeChartBuckets();
  if (!data) return;
  try {
    const { buckets, bucketMs, hourly } = data;
    const labels = buckets.map((b) => {
      // Server-side buckets are UTC-aligned (see dashboardService.hourlyBuckets
      // which integer-divides Date.now() by bucketMs). Use UTC accessors so
      // the labels match the hour the bucket actually represents regardless
      // of the viewer's local timezone.
      const d = new Date(b.ts);
      if (hourly) return `${d.getUTCHours()}h`;
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    });
    const inData = buckets.map((b) => b.promptTokens);
    const outData = buckets.map((b) => b.completionTokens);

    if (!chart || chartRange !== range) {
      const canvas = document.getElementById("traffic-chart");
      if (!canvas) {
        showChartUnavailable("missing canvas");
        return;
      }
      clearChartUnavailable();
      if (chart) chart.destroy();
      const ctx = canvas.getContext("2d");
      const gridColor = "rgba(241, 234, 215, 0.06)";
      const tickColor = "rgba(241, 234, 215, 0.4)";
      const tickScale = chartTickScale(window.innerWidth);

      chart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "in",
              data: inData,
              borderColor: "#f0a830",
              backgroundColor: "rgba(240, 168, 48, 0.08)",
              borderWidth: 1.5,
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: "#f0a830",
              pointHoverBorderColor: "#0b0a0e",
              pointHoverBorderWidth: 2,
            },
            {
              label: "out",
              data: outData,
              borderColor: "#4dd4cf",
              backgroundColor: "rgba(77, 212, 207, 0.05)",
              borderWidth: 1.5,
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: "#4dd4cf",
              pointHoverBorderColor: "#0b0a0e",
              pointHoverBorderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: {
            mode: "index",
            intersect: false,
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#14131a",
              borderColor: "#3a3745",
              borderWidth: 1,
              titleColor: "#f1ead7",
              bodyColor: "#b6ad95",
              padding: 12,
              displayColors: true,
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: gridColor, drawTicks: false },
              border: { display: false },
              ticks: {
                color: tickColor,
                font: { family: "JetBrains Mono", size: tickScale.xFont },
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: hourly
                  ? tickScale.xMaxTicks
                  : Math.min(tickScale.xMaxTicks, 10),
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
      chartRange = range;
    } else {
      chart.data.labels = labels;
      chart.data.datasets[0].data = inData;
      chart.data.datasets[1].data = outData;
      chart.update("none");
    }
  } catch (err) {
    showChartUnavailable(err.message);
  }
}

function showChartUnavailable(reason) {
  const canvas = document.getElementById("traffic-chart");
  if (!canvas) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  // Idempotent: remove any prior fallback and re-hide the canvas.
  // Without this, a transient CDN failure sticks the page in the
  // fallback state forever (the canvas stays display:none).
  const existing = wrap.querySelector(".chart-fallback");
  if (existing) existing.remove();
  canvas.style.display = "none";
  const note = document.createElement("div");
  note.className = "chart-fallback";
  note.textContent = reason
    ? `chart no disponible: ${reason}`
    : "chart no disponible (CDN offline?)";
  wrap.appendChild(note);
}

function clearChartUnavailable() {
  const canvas = document.getElementById("traffic-chart");
  if (canvas) canvas.style.display = "";
  const wrap = canvas?.parentElement;
  const note = wrap?.querySelector(".chart-fallback");
  if (note) note.remove();
}

function renderModels() {
  const win = activeWindow();
  if (!win) return;
  const rows = win.byModel;
  els.modelCount.textContent = `${rows.length} ${rows.length === 1 ? "modelo" : "modelos"}`;
  if (rows.length === 0) {
    els.modelsTbody.innerHTML =
      '<tr><td colspan="10" class="empty-row" data-label="estado">sin eventos en este rango — espera a que llegue el primer request</td></tr>';
    return;
  }
  const headerThs = document.querySelectorAll("#models-table-head th");
  const headerLabels = modelHeaderLabels(
    [...headerThs].map((th) => th.textContent ?? ""),
  );
  els.modelsTbody.innerHTML = rows
    .map((m) => {
      const promptTokens = fmtFinite(m.promptTokens, fmt.format);
      const completionTokens = fmtFinite(m.completionTokens, fmt.format);
      const cost = fmtFinite(m.costUsd, fmtCost.format);
      const req = fmtFinite(m.requestCount, fmt.format);
      const err = fmtFinite(m.errorCount, fmt.format);
      const hits = fmtFinite(m.cacheHits, fmt.format);
      const p50 = fmtFinite(m.latencyMs.p50, (v) => `${v}ms`);
      const p95 = fmtFinite(m.latencyMs.p95, (v) => `${v}ms`);
      return renderModelsRow(
        {
          model: m.model,
          brain: m.brain,
          promptTokens,
          completionTokens,
          cost,
          req,
          err,
          hits,
          p50,
          p95,
          errorCount: m.errorCount,
          cacheHits: m.cacheHits,
        },
        headerLabels,
      );
    })
    .join("");
}

function renderLogs(snap) {
  const total = snap.recentLogs.length;
  // Log-level filter dropdown uses synthetic "info+" / "warn+" values
  // for the "include this level and above" UX. The matched log entries
  // only ever carry real levels (info / warn / error / debug / trace);
  // if a structured logger ever emitted a literal "info+" level, the
  // strict switch below falls through to default (no match) instead of
  // accidentally mapping it to "all".
  const VALID_LEVELS = new Set(["all", "info+", "warn+", "error", "debug"]);
  let level = els.logLevel.value;
  if (!VALID_LEVELS.has(level)) level = "all";
  const search = els.logSearch.value.toLowerCase();
  function matchesLevel(l) {
    switch (level) {
      case "all":
        return true;
      case "info+":
        return l.level === "info" || l.level === "warn" || l.level === "error";
      case "warn+":
        return l.level === "warn" || l.level === "error";
      case "error":
      case "debug":
        return l.level === level;
      default:
        // Unknown compound / synthetic level → do NOT match any log
        // entry (in particular do NOT fall through to l.level === level
        // which would treat a literal "info+" log as part of the
        // generic "all" filter).
        return false;
    }
  }
  const filtered = snap.recentLogs.filter(matchesLevel);
  const searched = search
    ? filtered.filter((l) => l.message.toLowerCase().includes(search))
    : filtered;

  const SCROLL_THRESHOLD_PX = 32;
  const pane = els.logsPane;
  if (!pane) return;
  const wasAtBottom =
    pane.scrollTop + pane.clientHeight >= pane.scrollHeight - SCROLL_THRESHOLD_PX;

  if (total === 0) {
    pane.innerHTML =
      '<span class="log-line l-debug">— log vacio (combined.log / error.log) —</span>';
    if (els.logsCount) els.logsCount.textContent = "0 lineas";
    return;
  }
  if (searched.length === 0) {
    pane.innerHTML =
      '<span class="log-line l-debug">— sin logs con ese filtro —</span>';
    if (els.logsCount)
      els.logsCount.textContent = `0 / ${filtered.length} lineas`;
    return;
  }
  // Cap to whatever the server-advertised tail is. Without this,
  // a server returning more lines than the UI can render would
  // silently truncate without telling the user that more exist.
  const renderLimit = snap.operational.logTailLines || 200;
  const slice = searched.slice(0, renderLimit);
  pane.innerHTML = slice
    .map((l) => {
      const ts = l.ts || "—";
      return `<span class="log-line l-${escapeHtml(l.level)}"><span class="log-ts">${escapeHtml(ts)}</span><span class="lvl">${escapeHtml(l.level)}</span>${escapeHtml(l.message)}</span>`;
    })
    .join("");
  if (wasAtBottom) pane.scrollTop = pane.scrollHeight;
  if (els.logsCount) {
    const shown = slice.length;
    const matched = searched.length;
    els.logsCount.textContent =
      shown < matched
        ? `mostrando ${shown} de ${matched} (filtro)`
        : `${matched} linea${matched === 1 ? "" : "s"}`;
  }
}

function renderFooter(snap) {
  els.footVersion.textContent = `v${snap.operational.version}`;
  els.footMode.textContent = snap.operational.mode || "auto";
  els.footProviders.textContent = JSON.stringify(snap.operational.providers || {});
  els.footRetention.textContent = `${snap.operational.logTailLines} lineas`;
  els.pollInterval.textContent = `${snap.operational.pollIntervalMs / 1000}s`;
}

function render(snap, source) {
  lastSnapshot = snap;
  lastRefreshAt = Date.now();
  els.liveDot.classList.remove("is-stale");
  els.errorBanner.hidden = true;
  if (!snap.operational.dashboardEnabled) {
    els.disabledBanner.hidden = false;
  } else {
    els.disabledBanner.hidden = true;
  }
  // Snapshot / range are alternative sources. The snapshot is the
  // "ambient" data; a range response only updates the active range
  // window and reuses the last snapshot for everything else (logs,
  // footer, error banner state, operational).
  if (source === "range") {
    lastRangeSnap = snap;
  } else {
    activeRangeSnap = snap;
  }
  renderHero();
  renderChart();
  renderModels();
  renderLogs(snap);
  renderFooter(snap);
  armPoll(snap.operational.pollIntervalMs);
}

function armPoll(intervalMs) {
  if (pollTimer && pollIntervalMs === intervalMs) return;
  if (pollTimer) clearInterval(pollTimer);
  pollIntervalMs = intervalMs;
  pollTimer = setInterval(() => {
    if (document.hidden || inflight) return;
    fetchSnapshot().catch(() => {});
  }, intervalMs);
}

function tickClock() {
  if (lastRefreshAt > 0) {
    els.lastRefresh.textContent = `hace ${formatAgo(lastRefreshAt)}`;
  }
  const pollMs = lastSnapshot?.operational.pollIntervalMs;
  const staleMs = typeof pollMs === "number" && pollMs > 0 ? pollMs * 3 : 30000;
  if (lastRefreshAt > 0 && Date.now() - lastRefreshAt > staleMs) {
    els.liveDot.classList.add("is-stale");
  }
}

const FIRST_POLL_TIMEOUT_MS = 4000;

async function fetchSnapshot() {
  if (inflight) return;
  inflight = true;
  // Hard timeout = pollIntervalMs * 4 after the first snapshot
  // resolves; FIRST_POLL_TIMEOUT_MS (4s) before that so a hung
  // first request doesn't lock inflight=true for 40s. Without
  // this, a blocked event loop on the server would keep
  // inflight=true, every subsequent poll would early-return, and
  // the dashboard would silently freeze.
  const pollMs =
    (lastSnapshot && lastSnapshot.operational.pollIntervalMs) || null;
  const timeoutMs =
    pollMs !== null ? pollMs * 4 : FIRST_POLL_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/v1/dashboard/snapshot", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      if (body.error === "dashboard_disabled") {
        els.disabledBanner.hidden = false;
        return;
      }
      throw new Error(body.message || "503");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap = await res.json();
    render(snap, "snapshot");
  } catch (err) {
    const reason =
      err.name === "AbortError"
        ? `timeout (>${timeoutMs}ms)`
        : err.message || err;
    els.liveDot.classList.add("is-stale");
    els.errorBanner.hidden = false;
    els.errorMsg.textContent = `dashboard: ${reason}`;
  } finally {
    clearTimeout(timeoutId);
    inflight = false;
  }
}

function formatRangeLabel(fromIso, toIso) {
  const fmtDate = new Intl.DateTimeFormat("es-ES", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return `${fmtDate.format(new Date(fromIso))} → ${fmtDate.format(new Date(toIso))} UTC`;
}

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

function setRange(newRange) {
  range = newRange;
  const buttons = [
    els.range24h,
    els.range7d,
    els.range30d,
    els.range90d,
    els.rangeTotal,
    els.rangeCustomBtn,
  ];
  for (const b of buttons) {
    if (!b) continue;
    b.classList.toggle("is-active", b.getAttribute("data-range") === newRange);
  }
  if (els.rangeCustomBtn) {
    els.rangeCustomBtn.setAttribute(
      "aria-expanded",
      newRange === "custom" ? "true" : "false",
    );
  }
  if (els.rangeCustomPanel) {
    els.rangeCustomPanel.hidden = newRange !== "custom";
  }
  if (newRange === "custom") {
    if (els.rangeFrom) els.rangeFrom.focus();
    return;
  }
  if (els.rangeLabel) els.rangeLabel.textContent = "";
  chartRange = null;
  if (lastSnapshot) {
    activeRangeSnap = lastSnapshot;
    renderHero();
    renderChart();
    renderModels();
  }
}

els.range24h.addEventListener("click", () => setRange("24h"));
els.range7d.addEventListener("click", () => setRange("7d"));
els.range30d.addEventListener("click", () => setRange("30d"));
els.range90d.addEventListener("click", () => setRange("90d"));
els.rangeTotal.addEventListener("click", () => setRange("total"));
els.rangeCustomBtn.addEventListener("click", () => setRange("custom"));

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
    range = "custom";
    for (const b of [els.range24h, els.range7d, els.range30d, els.range90d, els.rangeTotal, els.rangeCustomBtn]) {
      if (!b) continue;
      b.classList.toggle("is-active", b.getAttribute("data-range") === "custom");
    }
    if (els.rangeLabel) {
      els.rangeLabel.textContent = formatRangeLabel(fromIso, toIso);
    }
    render(snap, "range");
  } catch (err) {
    els.errorBanner.hidden = false;
    els.errorMsg.textContent = `dashboard: ${err.message || err}`;
  }
});

els.logLevel.addEventListener("change", () => {
  if (lastSnapshot) renderLogs(lastSnapshot);
});

els.logSearch.addEventListener("input", () => {
  if (lastSnapshot) renderLogs(lastSnapshot);
});

els.logRefresh.addEventListener("click", () => fetchSnapshot());

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) fetchSnapshot().catch(() => {});
});

// Clear the poll timer when the page is hidden for an extended
// period (iframe teardown, SPA navigation, tab moved to a
// background process) so we don't leave a setInterval running
// across navigation. The polling is resumed on the next
// visibilitychange to visible.
window.addEventListener("pagehide", () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});

// Re-render the chart when the viewport crosses the 600 px breakpoint so
// the Fold6 cover → unfolded transition updates the tick density without
// a full page reload. Debounced to 150 ms; only fires when crossing the
// breakpoint to avoid the visual "rebirth" flicker.
let previousNarrow = window.innerWidth <= 600;
let resizeDebounce = null;
window.addEventListener("resize", () => {
  if (resizeDebounce) clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(() => {
    resizeDebounce = null;
    const currentNarrow = window.innerWidth <= 600;
    if (currentNarrow !== previousNarrow) {
      previousNarrow = currentNarrow;
      renderChart();
    }
  }, 150);
});

// Fail loud at boot if any element ID is missing from the HTML — a
// typo in index.html should throw immediately, not fail silently at
// the first render call.
const missing = Object.entries(els).filter(([, v]) => !v);
if (missing.length > 0) {
  const names = missing.map(([k]) => k).join(", ");
  console.error("dashboard: missing elements", names);
  throw new Error(`dashboard: missing required HTML elements: ${names}`);
}

setInterval(tickClock, 1000);
fetchSnapshot().catch(() => {});
