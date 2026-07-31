// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  chartTickScale,
  modelHeaderLabels,
  renderModelsRow,
  fmtCompact,
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
    expect(fmtCompact(12_345)).toBe("12,3 K");
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
