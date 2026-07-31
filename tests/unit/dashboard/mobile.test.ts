// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  chartTickScale,
  modelHeaderLabels,
  renderModelsRow,
} from "../../../public/dashboard/mobile.js";

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
  it("returns trimmed strings in the given order", () => {
    const labels = modelHeaderLabels([
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
    ]);
    expect(labels).toEqual([
      "modelo", "brain", "in", "out", "USD", "req", "err", "cache", "p50", "p95",
    ]);
  });
  it("returns an empty array when input is empty", () => {
    expect(modelHeaderLabels([])).toEqual([]);
  });
  it("preserves Spanish accents and unicode characters", () => {
    const labels = modelHeaderLabels(["modelo", "último", "Coste"]);
    expect(labels).toEqual(["modelo", "último", "Coste"]);
  });
});

describe("renderModelsRow", () => {
  const fullLabels = [
    "modelo", "brain", "in", "out", "USD", "req", "err", "cache", "p50", "p95",
  ];
  const sampleRow = {
    model: "proxy/deepseek-v4-pro",
    brain: "deepseek-v4-pro",
    promptTokens: "100",
    completionTokens: "50",
    cost: "$0.05",
    req: "3",
    err: "1",
    hits: "1",
    p50: "1000ms",
    p95: "2000ms",
    errorCount: 1,
    cacheHits: 1,
  };

  it("stamps every column header on its corresponding cell", () => {
    const html = renderModelsRow(sampleRow, fullLabels);
    fullLabels.forEach((label) => {
      expect(html).toContain(`data-label="${label}"`);
    });
    expect((html.match(/data-label="/g) || []).length).toBe(10);
  });

  it("escapes HTML in cell values and labels", () => {
    const html = renderModelsRow(
      { ...sampleRow, model: "<script>alert(1)</script>" },
      fullLabels,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("applies col-err only when there are errors", () => {
    expect(renderModelsRow(sampleRow, fullLabels)).toContain(
      '<td class="num col-err" data-label="err">',
    );
    expect(renderModelsRow({ ...sampleRow, errorCount: 0 }, fullLabels)).toContain(
      '<td class="num " data-label="err">',
    );
  });

  it("applies col-cache only when there are hits", () => {
    expect(renderModelsRow(sampleRow, fullLabels)).toContain(
      '<td class="num col-cache" data-label="cache">',
    );
    expect(renderModelsRow({ ...sampleRow, cacheHits: 0 }, fullLabels)).toContain(
      '<td class="num " data-label="cache">',
    );
  });

  it("uses raw counts (not the formatted strings) to decide row classes", () => {
    // Display string is "—" (NaN/fmtFinite fallback) but the raw count
    // is > 0 — col-err must still apply.
    const html = renderModelsRow(
      { ...sampleRow, err: "—", errorCount: 7 },
      fullLabels,
    );
    expect(html).toContain('<td class="num col-err" data-label="err">—</td>');
  });

  it("throws when the header count drifts from 10", () => {
    expect(() => renderModelsRow(sampleRow, ["only-one"])).toThrowError(
      /expected 10 column headers/,
    );
    expect(() => renderModelsRow(sampleRow, [])).toThrowError(
      /expected 10 column headers/,
    );
    expect(() => renderModelsRow(sampleRow, fullLabels.concat("extra"))).toThrowError(
      /expected 10 column headers/,
    );
    expect(() => renderModelsRow(sampleRow, undefined as unknown as string[])).toThrowError(
      /expected 10 column headers/,
    );
  });
});
