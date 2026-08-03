# DeepSeek V4 docs cleanup + restore `reasoning_effort: "max"` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore `reasoning_effort: "max"` in every direct DeepSeek payload (the v2.0.0 default that the v3.2.0 refactor silently dropped), add a unit test, and bring `MODELS.md` / `README.md` / `CLAUDE.md` in line with the actual behavior.

**Architecture:** One-line code fix in `deepseekBrainProvider.buildPayload`, two-line test additions in the existing test file, three docs files corrected to reflect actual behavior. Each task is small, focused, and produces a commit that passes `npm run build` / `npm run test:unit` / `npm run lint`.

**Tech Stack:** TypeScript, Vitest, Markdown, `git`.

## Global Constraints

- Working branch: `chore/docs-deepseek-v4-flash` (already created; not renamed mid-flight).
- Spec: `docs/superpowers/specs/2026-08-03-deepseek-v4-flash-docs-cleanup.md` (most recent commit `5450345` — expanded scope).
- No `BRAIN_MODELS_BASE` change — `proxy/deepseek-v4-flash` stays unavailable in `BRAIN_MODE=opencode`.
- No `opencodeGoBrainProvider.ts` change — OpenCode Go is an abstraction over multiple upstreams; we cannot assume `reasoning_effort` is supported on every one.
- No `CHANGELOG.md` change.
- `opencode.deepseek.json` already correct at line 18; do not edit.
- Commit messages: English, conventional commits, no agent signatures, no emojis.
- File encoding: UTF-8. Trailing newline on every file (existing convention).
- The verbatim JSON in Task 4 must match `opencode.deepseek.json` byte-for-byte.

---

## File Structure

Files modified by this plan:

| File | Responsibility | Change |
|------|---------------|--------|
| `src/services/deepseekBrainProvider.ts` | Direct-DeepSeek API caller | Add `reasoning_effort: "max"` to payload when `thinking: true` |
| `tests/unit/services/deepseekBrainProvider.test.ts` | Provider unit tests | Assert `reasoning_effort` is set when thinking is on, absent when off; add Flash test |
| `MODELS.md` | Brain catalog reference | Add Flash row to Brain Models; remove stale "Removed" row; correct "max thinking" claims |
| `README.md` | User-facing install + config guide | Add Flash row to Pricing; add sub-section for `BRAIN_MODE=deepseek` opencode.json |
| `CLAUDE.md` | AI agent operating context | Split Brain options line into mode-scoped bullets; correct line 14 |

No new files.

---

## Task 1: Restore `reasoning_effort: "max"` in `DeepSeekBrainProvider.buildPayload`

**Files:**
- Modify: `src/services/deepseekBrainProvider.ts:67` — extend the `thinking` block to also set `reasoning_effort: "max"`

**Interfaces:**
- Consumes: the existing `thinking: boolean` parameter from `BrainModelEntry` (already passed into `buildPayload`); the caller's intent is "use maximum reasoning when thinking is on".
- Produces: a payload that, when `thinking === true`, carries both `thinking: { type: "enabled" }` and `reasoning_effort: "max"`; when `thinking === false`, neither.

- [ ] **Step 1: Read current `buildPayload` to confirm target line**

Run:
```bash
sed -n '46,70p' src/services/deepseekBrainProvider.ts
```

Expected: shows the current `if (thinking) payload.thinking = { type: "enabled" };` line as the last line of the function.

- [ ] **Step 2: Extend the `thinking` block to also set `reasoning_effort: "max"`**

The `Edit` tool call. Anchor: the full single-line `if (thinking) payload.thinking = { type: "enabled" };` line. Replace with:

```typescript
    if (thinking) {
      payload.thinking = { type: "enabled" };
      payload.reasoning_effort = "max";
    }
```

Use indentation matching the file (4 spaces). The surrounding `if (request.tools) payload.tools = request.tools;` and `if (thinking) payload.thinking = { type: "enabled" };` are both 4-space indented single-liners; we are converting the latter into a 4-space-indented 3-line block.

- [ ] **Step 3: Verify the diff is exactly the conversion**

Run:
```bash
git diff src/services/deepseekBrainProvider.ts
```

Expected: shows a single hunk converting the one-line `if` into a three-line `if` block, with no other changes. No whitespace drift, no imports added, no comments added.

- [ ] **Step 4: Commit `deepseekBrainProvider.ts`**

```bash
git add src/services/deepseekBrainProvider.ts
git commit -m "fix(deepseek): restore reasoning_effort=max on direct provider (v2.0.0 regression)"
```

Expected: a single commit on `chore/docs-deepseek-v4-flash` containing only the one-file code change.

---

## Task 2: Lock in `reasoning_effort: "max"` with unit tests

**Files:**
- Modify: `tests/unit/services/deepseekBrainProvider.test.ts:41-70` — extend two existing tests
- Modify: `tests/unit/services/deepseekBrainProvider.test.ts` — append a new test for `deepseek-v4-flash`

**Interfaces:**
- Consumes: `deepseekBrainProvider.buildPayload` (which now sets `reasoning_effort: "max"` when `thinking: true`).
- Produces: test assertions that fail if a future refactor drops `reasoning_effort: "max"` or applies it when `thinking: false`.

- [ ] **Step 1: Extend the existing `thinking=true` test (line 41)**

The current test ends with `expect(payload.thinking).toEqual({ type: "enabled" });` (line 54). Add one line after:

```typescript
    expect(payload.thinking).toEqual({ type: "enabled" });
    expect(payload.reasoning_effort).toBe("max");
```

The `Edit` tool call. Anchor on the existing `expect(payload.thinking).toEqual({ type: "enabled" });` line (unique in this test file at that point). Replace with the two lines above.

- [ ] **Step 2: Extend the existing `thinking=false` test (line 57)**

The current test ends with `expect(payload.thinking).toBeUndefined();` (line 69). Add one line after:

```typescript
    expect(payload.thinking).toBeUndefined();
    expect(payload.reasoning_effort).toBeUndefined();
```

The `Edit` tool call. Anchor on the existing `expect(payload.thinking).toBeUndefined();` line. Replace with the two lines above.

- [ ] **Step 3: Append a new test for `deepseek-v4-flash`**

Add a new `it(...)` block after the existing `"name is 'deepseek-direct'"` test (line 129, currently the last `it` in the file, before the closing `});` on line 135). The new test:

```typescript
  it("buildPayload sets reasoning_effort: max for deepseek-v4-flash upstream", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test-deepseek");
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

The `Edit` tool. Anchor on the closing `});` of the `"name is 'deepseek-direct'"` test plus the outer `});` of the `describe` block. Replace with the same closing `});` plus the new `it` block inserted between.

- [ ] **Step 4: Run only the DeepSeek provider tests to verify they pass**

Run:
```bash
npm run test:unit -- deepseekBrainProvider
```

Expected: 8 tests pass (the original 5 + the new Flash test + 2 extended existing tests = 8), 0 fail. The new `reasoning_effort: "max"` assertions in Steps 1 and 2 would fail against the pre-fix code; their passing here proves the code change from Task 1 is in effect.

- [ ] **Step 5: Run the full unit suite**

Run:
```bash
npm run test:unit
```

Expected: 266 tests pass (was 264; +2 from extended existing assertions counted as part of the same tests). No regressions.

- [ ] **Step 6: Commit the test file**

```bash
git add tests/unit/services/deepseekBrainProvider.test.ts
git commit -m "test(deepseek): lock in reasoning_effort=max for Pro and Flash payloads"
```

Expected: a single commit on `chore/docs-deepseek-v4-flash` containing only the test file changes.

---

## Task 3: Update `MODELS.md` (Brain Models table, Legacy Models, and thinking claims)

**Files:**
- Modify: `MODELS.md:5-14` (Brain Models table) — add row for `proxy/deepseek-v4-flash`
- Modify: `MODELS.md:19` — replace single-line "max thinking" claim with the actual behavior
- Modify: `MODELS.md:49` — same correction
- Modify: `MODELS.md:101` (Legacy Models table after the previous commit) — delete the stale "Removed" row

**Interfaces:**
- Consumes: the existing `proxy/local-deepseek-v4-flash` row at line 15 as the visual reference for the new row; the existing line 19 and 49 wording as anchors.
- Produces: a Brain Models table that lists both `proxy/deepseek-v4-flash` (deepseek mode) and `proxy/local-deepseek-v4-flash` (hybrid mode); a Legacy Models table that no longer mis-claims Flash was removed; accurate "max thinking" prose that mentions `reasoning_effort: "max"` for the direct DeepSeek path.

- [ ] **Step 1: Read current state of `MODELS.md` lines 1-25**

Run:
```bash
sed -n '1,25p' MODELS.md
```

Expected: shows the Brain Models table and the prose paragraph below it containing lines 17-19 (with the "All brains use `thinking: { type: "enabled" }` for max reasoning" claim).

- [ ] **Step 2: Add `proxy/deepseek-v4-flash` row to Brain Models table**

Insert immediately after the `proxy/deepseek-v4-pro` row (line 10) and before the `proxy/qwen3.7-max` row (line 11). The new row:

```md
| `proxy/deepseek-v4-flash` | `deepseek-v4-flash` | OpenAI | ✅ Always-on | 800K¹ | 384K | $0.14 / $0.28 | (your account, BRAIN_MODE=deepseek) |
```

The `Edit` tool. Anchor on the line 10 row plus the line 11 row. Replace with line 10 + new row + line 11.

- [ ] **Step 3: Update line 19 "max thinking" claim**

The `Edit` tool. Anchor on the existing line:

```md
All brains use `thinking: { type: "enabled" }` for max reasoning.
```

Replace with:

```md
All brains use `thinking: { type: "enabled" }` for max reasoning. The DeepSeek direct path (`BRAIN_MODE=deepseek`/`hybrid`) also sets `reasoning_effort: "max"` for Pro and Flash — restoring the v2.0.0 default that the v3.2.0 refactor inadvertently dropped. OpenCode Go brains inherit the upstream default (`high`).
```

- [ ] **Step 4: Update line 49 "max thinking" claim (now line 49 because no insertion above it)**

The `Edit` tool. Anchor on the existing line:

```md
All 4 brains use max thinking via `thinking: { type: "enabled" }` parameter.
```

Replace with:

```md
All 4 brains (OpenCode Go + DeepSeek direct) use `thinking: { type: "enabled" }`. DeepSeek V4 Pro/Flash via the direct path additionally set `reasoning_effort: "max"` for full agent-grade reasoning (see "Thinking Configuration" below).
```

- [ ] **Step 5: Delete the stale "Removed" row at line ~101**

The exact line to delete (one entry only):

```md
| `proxy/deepseek-v4-flash` | Removed — consolidated to 2 brains (later expanded to 4) |
```

The `Edit` tool. Anchor on the previous table row (`proxy/qwen3.6-plus`) plus the stale row. Replace with just the previous row.

- [ ] **Step 6: Verify the file**

Run:
```bash
grep -n 'deepseek-v4-flash\|reasoning_effort' MODELS.md
```

Expected output (in file order):
- Two Brain Models table rows (one for `proxy/deepseek-v4-flash`, one for `proxy/local-deepseek-v4-flash`).
- One mention of `reasoning_effort` in the corrected line 19 prose.
- One mention of `reasoning_effort` in the corrected line 49 prose.
- NO occurrence of `proxy/deepseek-v4-flash` adjacent to "Removed".

- [ ] **Step 7: Commit `MODELS.md`**

```bash
git add MODELS.md
git commit -m "docs(models): add deepseek-v4-flash row; correct max thinking claims with reasoning_effort"
```

Expected: a single commit on `chore/docs-deepseek-v4-flash` containing only `MODELS.md` changes. This **amends** the prior `6591ef9 docs(models): add deepseek-v4-flash to brain catalog; remove stale Removed entry` commit; the new commit supersedes the parts the previous one handled, and adds the prose corrections. (No force-push, no history rewrite — just a forward commit on top.)

---

## Task 4: Update `README.md`

**Files:**
- Modify: `README.md:41-50` (Pricing table) — add row for `proxy/deepseek-v4-flash`
- Modify: `README.md:100-155` (OpenCode Integration) — add a sub-section `### For BRAIN_MODE=deepseek`

**Interfaces:**
- Consumes: the existing `proxy/local-deepseek-v4-flash` row at line 48 as the visual reference for the new row; the `opencode.deepseek.json` file at the repo root as the verbatim source for the new sub-section.
- Produces: a Pricing table that lists both `proxy/deepseek-v4-flash` (deepseek mode) and `proxy/local-deepseek-v4-flash` (hybrid mode), and an OpenCode Integration section that links to `opencode.deepseek.json` for `BRAIN_MODE=deepseek` users.

- [ ] **Step 1: Read current state of `README.md` lines 41-50 and 150-160**

Run:
```bash
sed -n '41,50p;150,160p' README.md
```

Expected: shows the Pricing table and the boundary between the existing `opencode.json` example (closing at line 154) and the `## Claude Code Integration` heading (line 156).

- [ ] **Step 2: Add `proxy/deepseek-v4-flash` row to Pricing table**

Insert immediately after the `proxy/local-deepseek-v4-flash` row. The new row:

```md
| `proxy/deepseek-v4-flash` | DeepSeek V4 Flash via your account (BRAIN_MODE=deepseek) | User-billed |
```

The `Edit` tool. Anchor on the `proxy/local-deepseek-v4-flash` row plus the next `mimo-v2.5` row. Replace with both rows plus the new row inserted between them.

- [ ] **Step 3: Add `### For BRAIN_MODE=deepseek` sub-section to OpenCode Integration**

Insert immediately after the closing ` ```` ` of the existing `opencode.json` example (line 154) and before the `## Claude Code Integration` heading (line 156). Heading: `### For BRAIN_MODE=deepseek`. Reference the `opencode.deepseek.json` file at the repo root and paste its full contents verbatim.

The exact text to insert (between the ` ```` ` and the `## Claude Code Integration` heading):

````md
### For BRAIN_MODE=deepseek

Use `opencode.deepseek.json` from the repo root (or copy its contents into `~/.config/opencode/opencode.json`). This file declares `proxy/deepseek-v4-pro` and `proxy/deepseek-v4-flash` (both routed via your DeepSeek account) plus the `MiniMax-M3` passthrough.

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

Required `BRAIN_MODE=deepseek` in `.env` plus `DEEPSEEK_API_KEY`. `MINIMAX_API_KEY` is optional and enables the `MiniMax-M3` passthrough.
````

The `Edit` tool. Anchor on the closing ` ```` ` of the existing example plus the `## Claude Code Integration` heading (with the blank line between them). Replace with ` ```` ` + blank line + new sub-section + blank line + `## Claude Code Integration`.

- [ ] **Step 4: Verify the JSON in the new sub-section matches `opencode.deepseek.json` byte-for-byte**

Run:
```bash
python3 -c "
import re
with open('README.md') as f:
    content = f.read()
m = re.search(r'### For BRAIN_MODE=deepseek.*?\`\`\`json\n(.*?)\n\`\`\`', content, re.DOTALL)
new_json = m.group(1) if m else None
with open('opencode.deepseek.json') as f:
    src_json = f.read().strip()
print('JSON MATCH OK' if new_json == src_json else 'JSON MISMATCH')
"
```

Expected: `JSON MATCH OK`. If `MISMATCH`, re-apply Step 3 from the source file.

- [ ] **Step 5: Commit `README.md`**

```bash
git add README.md
git commit -m "docs(readme): add deepseek-v4-flash pricing row and BRAIN_MODE=deepseek config example"
```

Expected: a single commit on `chore/docs-deepseek-v4-flash` containing only `README.md` changes.

---

## Task 5: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md:14` — replace the misleading "All brains use max thinking" claim with one that distinguishes OpenCode Go from the direct DeepSeek path.
- Modify: `CLAUDE.md:29-30` — replace the single Brain options line and the redundant Hybrid-only line with three mode-scoped bullets that include `proxy/deepseek-v4-flash` in `BRAIN_MODE=deepseek`.

**Interfaces:**
- Consumes: the existing line 14 ("All brains use max thinking") and lines 29-30 (Brain options + Hybrid-only brains).
- Produces: a `## Models` section that accurately enumerates brains per `BRAIN_MODE`, and a thinking claim that no longer overstates OpenCode Go behavior.

- [ ] **Step 1: Read current state of `CLAUDE.md` lines 13-32**

Run:
```bash
sed -n '13,32p' CLAUDE.md
```

Expected: shows line 14 ("All brains use max thinking (`thinking: { type: "enabled" }`)"), then lines 28-30 (Models header + Brain options + Hybrid-only brains).

- [ ] **Step 2: Update line 14 "max thinking" claim**

The `Edit` tool. Anchor on the existing line 14:

```md
- All brains use max thinking (`thinking: { type: "enabled" }`)
```

Replace with:

```md
- All brains use max thinking (`thinking: { type: "enabled" }`). Direct DeepSeek V4 Pro/Flash additionally set `reasoning_effort: "max"` (restored from v2.0.0 default; OpenCode Go brains inherit the upstream default).
```

- [ ] **Step 3: Replace lines 29-30 with three mode-scoped bullets**

The `Edit` tool. Anchor on the original lines 29-30:

```md
- Brain options (text-only via `proxy/` prefix): `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`
- Hybrid-only brains (BRAIN_MODE=hybrid only): `proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash`
```

Replace with the four-line version:

```md
- Brain options (text-only via `proxy/` prefix), per `BRAIN_MODE`:
  - `opencode` (via OpenCode Go): `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`
  - `deepseek` (via your DeepSeek account): `proxy/deepseek-v4-pro`, `proxy/deepseek-v4-flash`
  - `hybrid`: the `opencode` set plus `proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash` (your DeepSeek, prefixed `local-`)
```

- [ ] **Step 4: Verify the Models section now lists Flash in deepseek mode and the thinking claim is accurate**

Run:
```bash
sed -n '13,18p;28,34p' CLAUDE.md
```

Expected:
- Line 14 now references `reasoning_effort: "max"` for direct DeepSeek Pro/Flash.
- Lines 29-32 are the three mode-scoped bullets (no longer the single "Brain options" line nor the "Hybrid-only brains" line).

- [ ] **Step 5: Commit `CLAUDE.md`**

```bash
git add CLAUDE.md
git commit -m "docs(claude): split brain options by BRAIN_MODE and clarify reasoning_effort scope"
```

Expected: a single commit on `chore/docs-deepseek-v4-flash` containing only `CLAUDE.md` changes. This amends the prior `5ac1bbc docs(claude): split brain options by BRAIN_MODE ...` commit; the new commit supersedes the Models bullet change and adds the line 14 correction.

---

## Task 6: Verify the full PR

**Files:** None modified. This task is a sanity sweep.

**Interfaces:** Consumes the six commits from Tasks 1-5. Produces: a green verification report and a clear `git log` of the PR.

- [ ] **Step 1: Confirm we are on the right branch and have the right commits**

Run:
```bash
git status
git log --oneline -10
```

Expected:
- `On branch chore/docs-deepseek-v4-flash`
- `nothing to commit, working tree clean`
- Eight commits on top of `main`'s `813ca2d` (latest first):
  - `docs(claude): split brain options by BRAIN_MODE and clarify reasoning_effort scope` ← Task 5
  - `docs(readme): add deepseek-v4-flash pricing row and BRAIN_MODE=deepseek config example` ← Task 4
  - `docs(models): add deepseek-v4-flash row; correct max thinking claims with reasoning_effort` ← Task 3
  - `test(deepseek): lock in reasoning_effort=max for Pro and Flash payloads` ← Task 2
  - `fix(deepseek): restore reasoning_effort=max on direct provider (v2.0.0 regression)` ← Task 1
  - `docs(spec): expand scope to restore reasoning_effort=max in DeepSeekBrainProvider` ← spec update
  - `docs(claude): split brain options by BRAIN_MODE to expose deepseek-mode Flash` ← prior commit
  - `docs(readme): add deepseek-v4-flash pricing row and BRAIN_MODE=deepseek config example` ← prior commit
  - `docs(models): add deepseek-v4-flash to brain catalog; remove stale Removed entry` ← prior commit
  - `docs(plan): implementation plan for deepseek-v4-flash docs cleanup` ← prior commit
  - `docs(spec): DeepSeek V4 Flash docs cleanup spec (deepseek mode)` ← prior commit
  - `813ca2d fix(dashboard): restore .cards-range styles lost in merge` ← main HEAD

(Note: the branch carries forward the older commits from the docs-only phase. The two `docs(readme): add deepseek-v4-flash pricing row` commits have identical messages because Tasks 3 and 4 supersede the prior versions but were kept as separate forward commits rather than amended.)

- [ ] **Step 2: Verify no orphan "Removed" mention of Flash in living docs**

Run:
```bash
grep -nH 'proxy/deepseek-v4-flash' MODELS.md README.md CLAUDE.md | grep -i removed
```

Expected: no output. If any line contains "Removed" adjacent to `proxy/deepseek-v4-flash`, the spec change is incomplete.

- [ ] **Step 3: Verify `reasoning_effort` references are scoped correctly**

Run:
```bash
grep -rn 'reasoning_effort' src/ tests/ MODELS.md README.md CLAUDE.md
```

Expected output:
- `src/services/deepseekBrainProvider.ts` — exactly one occurrence (the new `payload.reasoning_effort = "max";` line).
- `tests/unit/services/deepseekBrainProvider.test.ts` — exactly three occurrences (one in each extended/added test).
- `MODELS.md` — two occurrences (one each in the corrected lines 19 and 49).
- `CLAUDE.md` — one occurrence (in the corrected line 14).
- `README.md` — zero occurrences (no change needed there).

- [ ] **Step 4: Run `npm run build`**

Run:
```bash
npm run build
```

Expected: exit code 0.

- [ ] **Step 5: Run `npm run test:unit`**

Run:
```bash
npm run test:unit
```

Expected: exit code 0. **266 tests pass** (was 264; +2 from the two new `reasoning_effort` assertions in the existing two tests; the new Flash test counts as one new test). No regressions in `providerSelector.test.ts`, `brainRegistry.test.ts`, or any other suite.

- [ ] **Step 6: Run `npm run lint`**

Run:
```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 7: Final diff summary vs `main`**

Run:
```bash
git diff main..HEAD --stat
```

Expected: only five files modified (or six, if you count the spec/plan as living files):
```
 CLAUDE.md                                          |   8 +-
 MODELS.md                                          |   4 +-
 README.md                                          |  43 +++
 docs/superpowers/plans/2026-08-03-...             | 392 +++++++ (plan)
 docs/superpowers/specs/2026-08-03-...             | 392 +++++++ (spec, expanded)
 src/services/deepseekBrainProvider.ts             |   3 +-
 tests/unit/services/deepseekBrainProvider.test.ts |   8 +-
```

The `CLAUDE.md` / `MODELS.md` change is now slightly larger than the docs-only plan predicted (because of the corrected prose); `src/services/deepseekBrainProvider.ts` and the test file appear as new (they weren't in the docs-only plan).

- [ ] **Step 8: Confirm no push happened**

Run:
```bash
git log origin/chore/docs-deepseek-v4-flash..HEAD 2>/dev/null || echo "branch not on remote yet"
```

Expected: `branch not on remote yet`. The user has not yet authorized `git push` or PR creation.

---

## Self-Review (already done inline at write time)

- **Spec coverage:** All spec changes (1, 2, 3, 4, 5, 6, 7, 8, 9) map to the six tasks. Tasks 1-2 implement the code fix and tests; Tasks 3-5 implement the docs corrections; Task 6 verifies.
- **Placeholder scan:** No "TBD"/"TODO"/"implement later" in any step. Every step shows the exact text or command.
- **Type consistency:** `reasoning_effort` is consistently a string literal `"max"` across code, test, and docs.
- **Risk note:** The code change is one line plus a wrapping `if` block (3-line diff total). All other changes are docs or test. Reversibility trivial.

---

## Handoff

After all six tasks complete, the branch is ready to push. The user explicitly authorizes `git push` and PR creation in the same conversation turn; otherwise the assistant stops at this verification step and asks for authorization.