# Spec: DeepSeek V4 Flash docs cleanup (deepseek mode)

**Date**: 2026-08-03
**Status**: Draft (pending user review)
**Scope**: Documentation-only PR. Reflects the actual state of `proxy/deepseek-v4-flash` in `BRAIN_MODE=deepseek` and `hybrid` modes. No code changes.

---

## Goal

Bring `MODELS.md`, `README.md`, and `CLAUDE.md` in line with the current behavior of `proxy/deepseek-v4-flash` (registered runtime in `providerSelector.ts:85-97` for `BRAIN_MODE=deepseek` and `hybrid`, routed via the user's DeepSeek account). Three of the four target docs still describe Flash as removed or omit it from the deepseek-mode list.

### Success Criteria

1. `MODELS.md` Brain Models table includes `proxy/deepseek-v4-flash` for `BRAIN_MODE=deepseek` with the same pricing as `proxy/local-deepseek-v4-flash` ($0.14 in / $0.28 out per 1M, 800K client-visible context, 384K max output, OpenAI endpoint, always-on thinking).
2. `MODELS.md` Legacy Models table no longer lists `proxy/deepseek-v4-flash` as removed (the v3.0.0 entry was historically correct; it is no longer accurate).
3. `README.md` Pricing table includes a row for `proxy/deepseek-v4-flash` (BRAIN_MODE=deepseek, user-billed).
4. `README.md` OpenCode Integration section either references the existing `opencode.deepseek.json` example or notes where the deepseek-mode client config lives.
5. `CLAUDE.md` §"Models" lists `proxy/deepseek-v4-flash` as a peer of `proxy/deepseek-v4-pro` for `BRAIN_MODE=deepseek` alongside the existing hybrid-only `proxy/local-deepseek-v4-flash` line.
6. `npm run build`, `npm run test:unit`, and `npm run lint` all pass with no regressions (no code touched, so this is a sanity check).
7. No `BRAIN_MODELS_BASE` change — `proxy/deepseek-v4-flash` remains unavailable in `BRAIN_MODE=opencode` (user's explicit constraint).

---

## Background

### Current State

- `providerSelector.ts:85-97` already registers `proxy/deepseek-v4-flash` with `providerName: "deepseek-direct"` for `BRAIN_MODE=deepseek` and `proxy/local-deepseek-v4-flash` for `BRAIN_MODE=hybrid`. Pricing in code: input $0.14/M, output $0.28/M, 1M upstream context, 384K max output, OpenAI endpoint, thinking always-on.
- `tests/unit/services/providerSelector.test.ts:127` already asserts the entry exists in `deepseek` mode.
- `tests/unit/services/brainRegistry.test.ts:300-316` already exercises `parseLocalProxyModelId("proxy/local-deepseek-v4-flash")`.
- `opencode.deepseek.json:18` already declares `proxy/deepseek-v4-flash` with cost `$0.14/$0.28` for clients in `BRAIN_MODE=deepseek`.

### Documentation Inconsistencies (the bugs this PR fixes)

| File | Issue | Line |
|------|-------|------|
| `MODELS.md` | Legacy Models table lists `proxy/deepseek-v4-flash` as "Removed — consolidated to 2 brains". True in v3.0.0, no longer true. | 100 |
| `MODELS.md` | Brain Models table omits `proxy/deepseek-v4-flash` for `BRAIN_MODE=deepseek` (only `proxy/local-deepseek-v4-flash` for hybrid is listed). | 5-14 |
| `README.md` | Pricing table omits `proxy/deepseek-v4-flash` row for `BRAIN_MODE=deepseek` (only `proxy/local-deepseek-v4-flash` for hybrid is listed). | 41-50 |
| `README.md` | OpenCode Integration example only shows `proxy/local-deepseek-v4-flash` (hybrid). The matching `proxy/deepseek-v4-flash` (deepseek) is not shown, and the `opencode.deepseek.json` example file is not referenced. | 100-153 |
| `CLAUDE.md` | §"Models" lists only `proxy/deepseek-v4-pro` for `BRAIN_MODE=deepseek`; Flash is missing. | 16-30 |

### Researched facts (2026-08-03)

- DeepSeek V4 Flash was launched on 2026-04-24 alongside V4 Pro (`deepseek.ai/pricing`, `api-docs.deepseek.com/updates`).
- V4 Flash 0731 (2026-07-31) is a post-training refresh of the same 284B/13B MoE architecture; `upstream: "deepseek-v4-flash"` is unchanged.
- API model ID: `deepseek-v4-flash` (legacy aliases `deepseek-chat` / `deepseek-reasoner` were deprecated on 2026-07-24 and map to V4 Flash modes).
- Pricing (current, official, 2026-07-25): $0.14 in / $0.28 out per 1M (cache hit $0.0028/M). Cache is automatic on DeepSeek's side — no SDK change required.
- Context: 1M. Max output: 384K. Concurrency: 2500.

---

## Design

### Change 1 — `MODELS.md` Brain Models table

Add a row for `proxy/deepseek-v4-flash` between `proxy/deepseek-v4-pro` and `proxy/local-deepseek-v4-pro`. Same shape as `proxy/local-deepseek-v4-flash` (line 14) but without the `local-` prefix.

```md
| `proxy/deepseek-v4-flash` | `deepseek-v4-flash` | OpenAI | ✅ Always-on | 800K¹ | 384K | $0.14 / $0.28 | (your account, BRAIN_MODE=deepseek) |
```

Note in the "Combined with MiMo senses" column uses `(your account)` instead of a combined price, matching the convention already used for `proxy/local-deepseek-v4-pro` and `proxy/local-deepseek-v4-flash`.

### Change 2 — `MODELS.md` Legacy Models table

Delete line 100:

```md
| `proxy/deepseek-v4-flash` | Removed — consolidated to 2 brains (later expanded to 4) |
```

The line is now factually wrong. The non-Flash legacy lines (kimi-k2.7-code, kimi-k2.6, glm-5.1, qwen3.7-plus, qwen3.6-plus, minimax-m3, minimax-m2.7) stay.

### Change 3 — `README.md` Pricing table

Add a row after the existing `proxy/local-deepseek-v4-flash` row (line 48):

```md
| `proxy/deepseek-v4-flash` | DeepSeek V4 Flash via your account (BRAIN_MODE=deepseek) | User-billed |
```

### Change 4 — `README.md` OpenCode Integration

Add a sub-section under `## OpenCode Integration` (current line 100), immediately after the closing `}` of the existing `opencode.json` example (current line 153) and before the next h2 (`## Claude Code Integration`, current line 155). Heading: `### For BRAIN_MODE=deepseek`. Reference the `opencode.deepseek.json` file at the repo root and paste its full contents verbatim (the file already exists with `proxy/deepseek-v4-flash` declared at line 18 with correct pricing). Keep the existing `opencode.json` example for `BRAIN_MODE=opencode` / `hybrid` unchanged.

The full JSON to paste (copy of `opencode.deepseek.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "cortex-multimodal": {
      "name": "Cortex Multimodal Proxy",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://localhost:7777/v1",
        "apiKey": "not-needed"
      },
      "models": {
        "proxy/deepseek-v4-pro": {
          "name": "DeepSeek V4 Pro (Cortex Proxy, tu cuenta)",
          "cost": { "input": 0.435, "output": 0.87 },
          "limit": { "context": 819200, "output": 384000 },
          "modalities": { "input": ["text", "image", "audio", "video", "pdf"], "output": ["text"] }
        },
        "proxy/deepseek-v4-flash": {
          "name": "DeepSeek V4 Flash (Cortex Proxy, tu cuenta)",
          "cost": { "input": 0.14, "output": 0.28 },
          "limit": { "context": 819200, "output": 384000 },
          "modalities": { "input": ["text", "image", "audio", "video", "pdf"], "output": ["text"] }
        },
        "MiniMax-M3": {
          "name": "MiniMax M3 (Passthrough directo, tu cuenta)",
          "cost": { "input": 0.30, "output": 1.20 },
          "limit": { "context": 1048576, "output": 131072 },
          "modalities": { "input": ["text", "image", "video"], "output": ["text"] }
        }
      }
    }
  }
}
```

### Change 5 — `CLAUDE.md` §"Models"

Replace line 29:

```md
- Brain options (text-only via `proxy/` prefix): `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`
```

With three mode-scoped bullets (and keep line 30 untouched):

```md
- Brain options (text-only via `proxy/` prefix), per `BRAIN_MODE`:
  - `opencode` (via OpenCode Go): `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`
  - `deepseek` (via your DeepSeek account): `proxy/deepseek-v4-pro`, `proxy/deepseek-v4-flash`
  - `hybrid`: the `opencode` set plus `proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash` (your DeepSeek, prefixed `local-`)
```

Keep the rest of §"Models" (lines 30-38) untouched.

### Out of scope

- Adding `proxy/deepseek-v4-flash` to `BRAIN_MODELS_BASE` (would expose it in `BRAIN_MODE=opencode` via OpenCode Go — user explicitly excluded this).
- Adding cache-hit pricing to `BrainModelEntry` (the codebase has no field for it; DeepSeek applies caching automatically and the existing brains don't track it either).
- Updating CHANGELOG.md (the existing "Removed" entries refer to v3.0.0 historical events and are technically correct as shipped history; this PR only fixes the living docs).
- Refreshing `opencode.deepseek.json` further (already correct at line 18).

### Risks

- **None meaningful**. Pure docs change; no `BrainModelEntry`, no registry, no provider code, no tests. The only consequence of a doc typo is a confused user; reversibility is trivial.
- Verification commands remain green because no code changes; `npm run build` / `npm run test:unit` / `npm run lint` are sanity checks, not regression tests for this PR.

---

## Verification

After applying all five changes:

1. `npm run build` — passes (no code change).
2. `npm run test:unit` — passes (no code change; the existing providerSelector and brainRegistry tests already cover the runtime behavior).
3. `npm run lint` — passes (no code change).
4. Manual read-back of each modified section to confirm:
   - No remaining "Removed" mention of `proxy/deepseek-v4-flash` in `MODELS.md`.
   - Brain Models table shows both `proxy/deepseek-v4-flash` (deepseek) and `proxy/local-deepseek-v4-flash` (hybrid).
   - `README.md` Pricing table shows both rows.
   - `CLAUDE.md` §"Models" references both directions.
5. `git grep -n 'proxy/deepseek-v4-flash'` after the change to confirm no orphan references in `docs/superpowers/specs/` (out of scope — historical specs are immutable records).

---

## Relevant Files

- `MODELS.md` — Brain Models table (5-14), Legacy Models table (100).
- `README.md` — Pricing table (41-50), OpenCode Integration (100-153).
- `CLAUDE.md` — §"Models" (16-30).
- `opencode.deepseek.json` — already correct, not edited but referenced from README.
- `src/services/providerSelector.ts:85-97` — already correct, not edited.
- `tests/unit/services/providerSelector.test.ts:127` — already correct, not edited.
