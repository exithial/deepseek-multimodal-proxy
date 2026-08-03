# Spec: DeepSeek V4 docs cleanup + restore `reasoning_effort: "max"` for direct provider

**Date**: 2026-08-03
**Status**: Draft (pending user review)
**Scope**: Documentation cleanup **plus** a one-line code fix that restores a regression in `DeepSeekBrainProvider.buildPayload`. The v2.0.0 proxy sent `reasoning_effort: "max"` to DeepSeek V4 (per `CLAUDE.md` and `ROADMAP.md` from that era); the v3.2.0 pluggable-provider refactor (#9, commit `5d8ceff`) silently dropped the parameter when it created `deepseekBrainProvider.ts` from scratch. The proxy today sends only `thinking: { type: "enabled" }`, which causes DeepSeek V4 to fall back to its upstream default of `reasoning_effort: "high"` instead of `"max"`.

---

## Goal

1. Restore `reasoning_effort: "max"` in every direct DeepSeek payload where `thinking: true` (Pro and Flash, via the user's own `DEEPSEEK_API_KEY` account, in `BRAIN_MODE=deepseek` and `hybrid`).
2. Add a unit test that locks in this behavior.
3. Bring `MODELS.md`, `README.md`, and `CLAUDE.md` in line with the current behavior — `proxy/deepseek-v4-flash` is already registered runtime (no code change needed for that), and the "max thinking" claim now reflects the actual `reasoning_effort: "max"` payload.

### Success Criteria

1. `deepseekBrainProvider.buildPayload` sets `payload.reasoning_effort = "max"` whenever `thinking === true` (any upstream model, both `deepseek-v4-pro` and `deepseek-v4-flash`).
2. New unit test in `tests/unit/services/deepseekBrainProvider.test.ts` asserts `reasoning_effort: "max"` is present in the payload when `thinking: true`, and absent when `thinking: false`.
3. `MODELS.md` line 19 ("All brains use `thinking: { type: "enabled" }` for max reasoning") and line 49 ("All 4 brains use max thinking via `thinking: { type: "enabled" }` parameter") are updated to clarify: the DeepSeek direct path now also sets `reasoning_effort: "max"`; OpenCode Go brains inherit whatever the upstream defaults to.
4. `MODELS.md` Brain Models table includes `proxy/deepseek-v4-flash` for `BRAIN_MODE=deepseek` (unchanged from prior scope).
5. `MODELS.md` Legacy Models table no longer lists `proxy/deepseek-v4-flash` as removed (unchanged).
6. `README.md` Pricing table includes a row for `proxy/deepseek-v4-flash` and an `### For BRAIN_MODE=deepseek` sub-section with the verbatim `opencode.deepseek.json` (unchanged).
7. `CLAUDE.md` §"Models" lists `proxy/deepseek-v4-flash` as a peer of `proxy/deepseek-v4-pro` for `BRAIN_MODE=deepseek` (unchanged).
8. `CLAUDE.md` line 14 ("All brains use max thinking") is updated to distinguish: direct DeepSeek Pro/Flash now actually send `reasoning_effort: "max"`; OpenCode Go brains send only `thinking: { type: "enabled" }` and inherit upstream default.
9. `npm run build`, `npm run test:unit`, and `npm run lint` all pass.
10. No `BRAIN_MODELS_BASE` change — `proxy/deepseek-v4-flash` remains unavailable in `BRAIN_MODE=opencode` (user's explicit constraint).

---

## Background

### Regression evidence (git history)

v2.0.0 era — pre-v3.0.0:
- `CLAUDE.md` (commit before `e490e0d`): *"Both DeepSeek models use `reasoning_effort: "max"` by default"*
- `ROADMAP.md` (commit `75a9d73`): *"Brain | DeepSeek V4 Flash + Pro, `reasoning_effort: max`"*

v3.0.0 (commit `e490e0d`) — replaced DeepSeek direct with OpenCode Go + MiMo V2.5. New CLAUDE.md said: *"All brains use max thinking (`thinking: { type: "enabled" }`)"* — meaning OpenCode Go abstracts this away.

v3.2.0 (commit `5d8ceff`) — added `deepseekBrainProvider.ts` as the direct DeepSeek path for `BRAIN_MODE=deepseek` and `hybrid`. The file was created from scratch and did **not** migrate the `reasoning_effort: "max"` line:

```typescript
// src/services/deepseekBrainProvider.ts:67
if (thinking) payload.thinking = { type: "enabled" };
```

### Why this matters (per DeepSeek V4 official docs, 2026-08-03)

From `api-docs.deepseek.com/guides/thinking_mode`:
- DeepSeek V4 supports both `thinking: { type: "enabled/disabled" }` (toggle) and `reasoning_effort: "high" | "max"` (depth control) as **separate, independent parameters**.
- When `reasoning_effort` is omitted, the upstream default is `"high"` for regular requests. `"max"` is auto-applied only "for some complex agent requests (such as Claude Code, OpenCode)" — but the proxy is not Claude Code/OpenCode from DeepSeek's perspective.
- For agent scenarios (long tool-use chains, repo-scale refactors), DeepSeek explicitly recommends `max`. Flash 0731 benchmarks (Terminal Bench 2.1: 82.7, NL2Repo: 54.2) were measured with `max`.
- Pro output via the proxy is therefore underutilized today: it runs at `high` instead of `max`. Same for Flash, which now has the 0731 re-training precisely tuned for `max` agent tasks.

### Current state

- `providerSelector.ts:85-97` already registers `proxy/deepseek-v4-flash` with `providerName: "deepseek-direct"` for `BRAIN_MODE=deepseek` and `proxy/local-deepseek-v4-flash` for `BRAIN_MODE=hybrid`. Pricing in code: input $0.14/M, output $0.28/M, 1M upstream context, 384K max output, OpenAI endpoint, thinking always-on.
- `tests/unit/services/providerSelector.test.ts:127` already asserts the entry exists in `deepseek` mode.
- `tests/unit/services/brainRegistry.test.ts:300-316` already exercises `parseLocalProxyModelId("proxy/local-deepseek-v4-flash")`.
- `opencode.deepseek.json:18` already declares `proxy/deepseek-v4-flash` with cost `$0.14/$0.28` for clients in `BRAIN_MODE=deepseek`.
- `deepseekBrainProvider.test.ts:41-55` currently asserts only `thinking: { type: "enabled" }` — does not check `reasoning_effort`.

### Documentation inconsistencies (the docs bugs this PR also fixes)

| File | Issue | Line |
|------|-------|------|
| `MODELS.md` | Legacy Models table lists `proxy/deepseek-v4-flash` as "Removed — consolidated to 2 brains". True in v3.0.0, no longer true. | 100 |
| `MODELS.md` | Brain Models table omits `proxy/deepseek-v4-flash` for `BRAIN_MODE=deepseek` (only `proxy/local-deepseek-v4-flash` for hybrid is listed). | 5-14 |
| `MODELS.md` | Lines 19 and 49 claim "All brains use max thinking via `thinking: { type: "enabled" }`" — only OpenCode Go inheriting default. Direct DeepSeek path was not sending `reasoning_effort: "max"` (this PR fixes the code, then fixes the docs to match). | 19, 49 |
| `README.md` | Pricing table omits `proxy/deepseek-v4-flash` row for `BRAIN_MODE=deepseek`. | 41-50 |
| `README.md` | OpenCode Integration example only shows `proxy/local-deepseek-v4-flash` (hybrid). `opencode.deepseek.json` is not referenced. | 100-153 |
| `CLAUDE.md` | §"Models" lists only `proxy/deepseek-v4-pro` for `BRAIN_MODE=deepseek`; Flash is missing. | 16-30 |
| `CLAUDE.md` | Line 14 "All brains use max thinking (`thinking: { type: "enabled" }`)" — true for OpenCode Go, but the direct DeepSeek path was not honoring this until this PR. | 14 |

---

## Design

### Change 1 — `src/services/deepseekBrainProvider.ts`

In `buildPayload` (around line 67), extend the existing `thinking` block to also set `reasoning_effort: "max"`:

Before:
```typescript
    if (thinking) payload.thinking = { type: "enabled" };
```

After:
```typescript
    if (thinking) {
      payload.thinking = { type: "enabled" };
      payload.reasoning_effort = "max";
    }
```

This applies to every direct-DeepSeek call where `thinking: true`, regardless of upstream model. Both `proxy/deepseek-v4-pro` and `proxy/deepseek-v4-flash` (and their `proxy/local-*` hybrids) have `thinking: true` in `BRAIN_MODELS_BASE` and the runtime-registered entries in `providerSelector.ts:73-98`, so both routes benefit.

### Change 2 — `tests/unit/services/deepseekBrainProvider.test.ts`

Add two assertions:

- In the existing test `"buildPayload sets thinking block when entry.thinking=true"` (line 41), add:
  ```typescript
  expect(payload.reasoning_effort).toBe("max");
  ```

- In the existing test `"buildPayload omits thinking when entry.thinking=false"` (line 57), add:
  ```typescript
  expect(payload.reasoning_effort).toBeUndefined();
  ```

- (Optional but valuable) Add a new test that verifies `proxy/deepseek-v4-flash` upstream also gets `reasoning_effort: "max"`, since that is the brain added by this PR:
  ```typescript
  it("buildPayload sets reasoning_effort: max for deepseek-v4-flash too", async () => {
    const { deepseekBrainProvider } = await import(
      "../../../src/services/deepseekBrainProvider"
    );
    const payload = deepseekBrainProvider.buildPayload(
      { model: "x", messages: [{ role: "user" as const, content: "hi" }] },
      "deepseek-v4-flash",
      true,
      1_048_576,
      "openai",
    );
    expect(payload.model).toBe("deepseek-v4-flash");
    expect(payload.thinking).toEqual({ type: "enabled" });
    expect(payload.reasoning_effort).toBe("max");
  });
  ```

### Change 3 — `MODELS.md` lines 19 and 49

Line 19 currently reads:
```md
All brains use `thinking: { type: "enabled" }` for max reasoning.
```

Replace with:
```md
All brains use `thinking: { type: "enabled" }` for max reasoning. The DeepSeek direct path (`BRAIN_MODE=deepseek`/`hybrid`) also sets `reasoning_effort: "max"` for Pro and Flash — restoring the v2.0.0 default that the v3.2.0 refactor inadvertently dropped. OpenCode Go brains inherit the upstream default (`high`), which is what OpenCode Go already represents.
```

Line 49 currently reads:
```md
All 4 brains use max thinking via `thinking: { type: "enabled" }` parameter.
```

Replace with:
```md
All 4 brains (OpenCode Go + DeepSeek direct) use `thinking: { type: "enabled" }`. DeepSeek V4 Pro/Flash via the direct path additionally set `reasoning_effort: "max"` for full agent-grade reasoning (see "Thinking Configuration" below).
```

### Change 4 — `MODELS.md` Brain Models table (unchanged from prior scope)

Add a row for `proxy/deepseek-v4-flash` between `proxy/deepseek-v4-pro` and `proxy/local-deepseek-v4-pro`. Same shape as `proxy/local-deepseek-v4-flash` (line 14) but without the `local-` prefix:

```md
| `proxy/deepseek-v4-flash` | `deepseek-v4-flash` | OpenAI | ✅ Always-on | 800K¹ | 384K | $0.14 / $0.28 | (your account, BRAIN_MODE=deepseek) |
```

### Change 5 — `MODELS.md` Legacy Models table (unchanged from prior scope)

Delete line 100:
```md
| `proxy/deepseek-v4-flash` | Removed — consolidated to 2 brains (later expanded to 4) |
```

### Change 6 — `README.md` Pricing table (unchanged from prior scope)

Add a row after the existing `proxy/local-deepseek-v4-flash` row:
```md
| `proxy/deepseek-v4-flash` | DeepSeek V4 Flash via your account (BRAIN_MODE=deepseek) | User-billed |
```

### Change 7 — `README.md` OpenCode Integration (unchanged from prior scope)

Add a sub-section `### For BRAIN_MODE=deepseek` after the existing `opencode.json` example (after line 153) and before `## Claude Code Integration` (line 155). Paste the verbatim contents of `opencode.deepseek.json` from the repo root (the file already exists with `proxy/deepseek-v4-flash` declared at line 18 with correct pricing).

### Change 8 — `CLAUDE.md` §"Models" (unchanged from prior scope)

Replace line 29 (the original "Brain options" single-line bullet) with three mode-scoped bullets:

```md
- Brain options (text-only via `proxy/` prefix), per `BRAIN_MODE`:
  - `opencode` (via OpenCode Go): `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`
  - `deepseek` (via your DeepSeek account): `proxy/deepseek-v4-pro`, `proxy/deepseek-v4-flash`
  - `hybrid`: the `opencode` set plus `proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash` (your DeepSeek, prefixed `local-`)
```

Delete line 30 (the now-redundant "Hybrid-only brains" bullet):
```md
- Hybrid-only brains (BRAIN_MODE=hybrid only): `proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash`
```

### Change 9 — `CLAUDE.md` line 14

Before:
```md
- All brains use max thinking (`thinking: { type: "enabled" }`)
```

After:
```md
- All brains use max thinking (`thinking: { type: "enabled" }`). Direct DeepSeek V4 Pro/Flash additionally set `reasoning_effort: "max"` (restored from v2.0.0 default; OpenCode Go brains inherit the upstream default).
```

### Out of scope

- Adding `reasoning_effort: "max"` to the OpenCode Go provider (`opencodeGoBrainProvider.ts`). OpenCode Go is an abstraction over glm/qwen/mimo; we cannot assume the parameter is supported on every upstream, and the upstream's default is what the proxy should respect there.
- Adding cache-hit pricing to `BrainModelEntry` (no field for it; DeepSeek caching is automatic and existing brains don't track it).
- Updating `CHANGELOG.md` (historical "Removed" entries are accurate as shipped history; this PR fixes living docs only).
- Renaming the existing `chore/docs-deepseek-v4-flash` branch to reflect the code change. The branch name is slightly imprecise but renaming mid-flight risks the user's open PR draft.

### Risks

- **Code behavior change** (only this single line): all direct-DeepSeek calls now send `reasoning_effort: "max"`. Pro: deeper reasoning, more output tokens billed, higher latency for Flash. Con: Flash 0731 was re-trained *for* this mode, so no surprise. Existing tests must still pass.
- **No behavior change for OpenCode Go path**: only `deepseekBrainProvider.ts` is touched. `opencodeGoBrainProvider.ts` is unmodified.
- **No behavior change for `MiniMax-M3`** passthrough: that provider sends `thinking: { type: "adaptive" }` (or `disabled` for vision), not affected.
- **Reversibility**: trivial. One-line revert.

---

## Verification

After applying all changes:

1. `npm run build` — passes.
2. `npm run test:unit` — passes, including the new `reasoning_effort: "max"` assertions (264 → 266 tests if Change 2's optional new test is added; +2 if only the existing two tests are extended).
3. `npm run lint` — passes.
4. Manual smoke test (optional): with `BRAIN_MODE=deepseek` and `DEEPSEEK_API_KEY`, hit the proxy with a `proxy/deepseek-v4-flash` request and confirm the upstream `reasoning_content` is populated and long (consistent with `max`).
5. `git grep -n 'proxy/deepseek-v4-flash'` shows no orphan "Removed" references in living docs.
6. `git grep -n 'reasoning_effort'` shows exactly one new occurrence in `src/services/deepseekBrainProvider.ts` and the test file.

---

## Relevant Files

- `src/services/deepseekBrainProvider.ts` — `buildPayload`, line 67 (one-line code fix).
- `tests/unit/services/deepseekBrainProvider.test.ts` — three existing tests at lines 41, 57, 72; add `reasoning_effort` assertions; optionally add the new Flash test.
- `MODELS.md` — Brain Models table (5-14), line 19, line 49, Legacy Models table (line 100).
- `README.md` — Pricing table (41-50), OpenCode Integration (100-153).
- `CLAUDE.md` — line 14, §"Models" (lines 28-32).
- `opencode.deepseek.json` — already correct, not edited but referenced from README.
- `src/services/providerSelector.ts:85-97` — already correct, not edited.
- `tests/unit/services/providerSelector.test.ts:127` — already correct, not edited.