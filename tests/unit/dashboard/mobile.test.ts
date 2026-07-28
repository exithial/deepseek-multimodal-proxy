// @vitest-environment node
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