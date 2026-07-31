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