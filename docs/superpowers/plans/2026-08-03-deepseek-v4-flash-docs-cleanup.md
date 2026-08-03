# DeepSeek V4 Flash Docs Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `MODELS.md`, `README.md`, and `CLAUDE.md` so the doc set reflects that `proxy/deepseek-v4-flash` is currently registered runtime (no code change) for `BRAIN_MODE=deepseek` and `hybrid`.

**Architecture:** Pure docs PR. No code, no tests, no providerSelector changes. Each task touches one file and produces a focused commit. Verification is a sanity sweep over `npm run build`, `npm run test:unit`, `npm run lint`, and a `git grep` for orphan "Removed" mentions.

**Tech Stack:** Markdown, `git`.

## Global Constraints

- Working branch: `chore/docs-deepseek-v4-flash` (already created).
- Spec: `docs/superpowers/specs/2026-08-03-deepseek-v4-flash-docs-cleanup.md` (commit `fd230cd`).
- No `BRAIN_MODELS_BASE` change — `proxy/deepseek-v4-flash` stays unavailable in `BRAIN_MODE=opencode`.
- No `CHANGELOG.md` change.
- `opencode.deepseek.json` already correct at line 18; do not edit.
- Commit messages: English, conventional commits, no agent signatures, no emojis.
- File encoding: UTF-8. Trailing newline on every file (existing convention).
- The verbatim JSON in Task 2 must match `opencode.deepseek.json` byte-for-byte.

---

## File Structure

Files modified by this plan:

| File | Responsibility | Change |
|------|---------------|--------|
| `MODELS.md` | Brain catalog reference | Add Flash row to Brain Models; remove stale "Removed" row |
| `README.md` | User-facing install + config guide | Add Flash row to Pricing; add sub-section for `BRAIN_MODE=deepseek` opencode.json |
| `CLAUDE.md` | AI agent operating context | Split Brain options line into mode-scoped bullets |

No new files. No code changes.

---

## Task 1: Update `MODELS.md`

**Files:**
- Modify: `MODELS.md:5-14` (Brain Models table) — add row for `proxy/deepseek-v4-flash`
- Modify: `MODELS.md:100` (Legacy Models table) — delete the stale "Removed" row

**Interfaces:**
- Consumes: the existing `proxy/local-deepseek-v4-flash` row at line 14 as the visual reference for the new row.
- Produces: a Brain Models table that lists both `proxy/deepseek-v4-flash` (deepseek mode) and `proxy/local-deepseek-v4-flash` (hybrid mode), and a Legacy Models table that no longer mis-claims Flash was removed.

- [ ] **Step 1: Read current state of `MODELS.md` lines 1-25 and 95-102**

Run:
```bash
sed -n '1,25p;95,102p' MODELS.md
```

Expected: shows the Brain Models table (with `proxy/local-deepseek-v4-flash` at line 14) and the Legacy Models table (with the stale `proxy/deepseek-v4-flash` "Removed" entry at line 100).

- [ ] **Step 2: Add `proxy/deepseek-v4-flash` row to Brain Models table**

Insert immediately after the `proxy/deepseek-v4-pro` row (line 10) and before the `proxy/qwen3.7-max` row (line 11). The new row:

```md
| `proxy/deepseek-v4-flash` | `deepseek-v4-flash` | OpenAI | ✅ Always-on | 800K¹ | 384K | $0.14 / $0.28 | (your account, BRAIN_MODE=deepseek) |
```

The `Edit` tool call: replace line 10's literal content (including the trailing newline) with line 10 + the new row.

- [ ] **Step 3: Verify the Brain Models table now has both Flash rows**

Run:
```bash
grep -n 'deepseek-v4-flash' MODELS.md
```

Expected output (in file order):
```
10:| `proxy/deepseek-v4-flash` | `deepseek-v4-flash` | OpenAI | ✅ Always-on | 800K¹ | 384K | $0.14 / $0.28 | (your account, BRAIN_MODE=deepseek) |
15:| `proxy/local-deepseek-v4-flash` | `deepseek-v4-flash` | OpenAI | ✅ | 800K | 384K | $0.14 / $0.28 | (your account) |
```

(Line numbers may shift after the insert; the second match moves from 14 to 15. If the row content matches above, the edit succeeded.)

- [ ] **Step 4: Delete the stale "Removed" row at old line 100**

The exact line to delete (no longer accurate after v3.2.0):

```md
| `proxy/deepseek-v4-flash` | Removed — consolidated to 2 brains (later expanded to 4) |
```

The `Edit` tool: replace the entire line (including its trailing newline) with an empty string. Use the `Edit` tool with `oldString` containing the table separator row above as anchor (line 99) plus the stale row, and `newString` containing only the anchor.

- [ ] **Step 5: Verify no orphan "Removed" mention of Flash in `MODELS.md`**

Run:
```bash
grep -n 'proxy/deepseek-v4-flash' MODELS.md
```

Expected output: exactly two rows — one in the Brain Models table (the new row from Step 2) and one in the Legacy Models table (none, since Step 4 deleted it). If the legacy table still shows the "Removed" line, repeat Step 4.

- [ ] **Step 6: Commit `MODELS.md`**

```bash
git add MODELS.md
git commit -m "docs(models): add deepseek-v4-flash to brain catalog; remove stale Removed entry"
```

Expected: a single commit on `chore/docs-deepseek-v4-flash` containing only `MODELS.md` changes.

---

## Task 2: Update `README.md`

**Files:**
- Modify: `README.md:41-50` (Pricing table) — add row for `proxy/deepseek-v4-flash`
- Modify: `README.md:100-155` (OpenCode Integration) — add a sub-section `### For BRAIN_MODE=deepseek` immediately after the existing `opencode.json` example (after line 153) and before the `## Claude Code Integration` heading (line 155)

**Interfaces:**
- Consumes: the existing `proxy/local-deepseek-v4-flash` row at line 48 as the visual reference for the new row; the `opencode.deepseek.json` file at the repo root as the verbatim source for the new sub-section.
- Produces: a Pricing table that lists both `proxy/deepseek-v4-flash` (deepseek mode) and `proxy/local-deepseek-v4-flash` (hybrid mode), and an OpenCode Integration section that links to `opencode.deepseek.json` for `BRAIN_MODE=deepseek` users.

- [ ] **Step 1: Read current state of `README.md` lines 41-50 and 100-160**

Run:
```bash
sed -n '41,50p;100,160p' README.md
```

Expected: shows the Pricing table (with `proxy/local-deepseek-v4-flash` at line 48) and the OpenCode Integration / Claude Code Integration sections.

- [ ] **Step 2: Add `proxy/deepseek-v4-flash` row to Pricing table**

Insert immediately after the `proxy/local-deepseek-v4-flash` row (line 48) and before the `mimo-v2.5` (passthrough) row (line 49). The new row:

```md
| `proxy/deepseek-v4-flash` | DeepSeek V4 Flash via your account (BRAIN_MODE=deepseek) | User-billed |
```

The `Edit` tool: anchor on the `proxy/local-deepseek-v4-flash` row plus the existing `mimo-v2.5` row, replace with the same two rows plus the new row inserted between them.

- [ ] **Step 3: Verify the Pricing table now shows both Flash rows**

Run:
```bash
grep -n 'proxy/deepseek-v4-flash' README.md
```

Expected output (in file order):
```
35:- `deepseek` — only DeepSeek brains under their standard IDs (`proxy/deepseek-v4-pro`, `proxy/deepseek-v4-flash`) + MiniMax M3 vision (if `MINIMAX_API_KEY` set). Requires `DEEPSEEK_API_KEY`.
49:| `proxy/deepseek-v4-flash` | DeepSeek V4 Flash via your account (BRAIN_MODE=deepseek) | User-billed |
49_or_50:... (existing `proxy/local-deepseek-v4-flash` row, line may shift)
```

The first match is the existing Modes description (unchanged). The new match is the Pricing table row. Confirm both Pricing rows are present.

- [ ] **Step 4: Add `### For BRAIN_MODE=deepseek` sub-section to OpenCode Integration**

Insert after the existing `opencode.json` example ends (after line 153, which is the closing `}` plus the closing ` ```` ` of the code block) and before the `## Claude Code Integration` heading (line 155). The new sub-section:

```md
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
```

The `Edit` tool: anchor on the closing `}` + ```` ``` ```` of the existing `opencode.json` example (lines 152-153) plus the `## Claude Code Integration` heading (line 155), replace with the same lines plus the new sub-section inserted between them.

- [ ] **Step 5: Verify the JSON in the new sub-section matches `opencode.deepseek.json` byte-for-byte**

Run:
```bash
diff <(sed -n '/^{$/,/^}$/p' README.md | head -40) opencode.deepseek.json
```

Expected: no output (the JSON block extracted from the README sub-section matches `opencode.deepseek.json` byte-for-byte). If `diff` prints any lines, the JSON diverged — re-apply Step 4 from the source file.

- [ ] **Step 6: Commit `README.md`**

```bash
git add README.md
git commit -m "docs(readme): add deepseek-v4-flash pricing row and BRAIN_MODE=deepseek config example"
```

Expected: a single commit on `chore/docs-deepseek-v4-flash` containing only `README.md` changes.

---

## Task 3: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md:29` — replace the single Brain options line with three mode-scoped bullets.

**Interfaces:**
- Consumes: the existing line 29 (lists 4 OpenCode Go brains) and line 30 (lists hybrid-only brains).
- Produces: a `## Models` section that explicitly enumerates which brain IDs are available in each `BRAIN_MODE`.

- [ ] **Step 1: Read current state of `CLAUDE.md` lines 28-32**

Run:
```bash
sed -n '28,32p' CLAUDE.md
```

Expected: shows the current line 29 (`- Brain options (text-only via `proxy/` prefix): `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro``) and the existing line 30 (hybrid-only line, untouched).

- [ ] **Step 2: Replace line 29 with three mode-scoped bullets**

The `Edit` tool: anchor on the existing line 29 literal text plus the existing line 30 (which stays), replace with the four-line version. The new content for line 29:

```md
- Brain options (text-only via `proxy/` prefix), per `BRAIN_MODE`:
  - `opencode` (via OpenCode Go): `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`
  - `deepseek` (via your DeepSeek account): `proxy/deepseek-v4-pro`, `proxy/deepseek-v4-flash`
  - `hybrid`: the `opencode` set plus `proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash` (your DeepSeek, prefixed `local-`)
```

Line 30 (the hybrid-only line) is now redundant since the new bullets cover all three modes. **Delete line 30**:

```md
- Hybrid-only brains (BRAIN_MODE=hybrid only): `proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash`
```

The `Edit` tool: replace the original line 29 + line 30 with the four-line version (new line 29 + three sub-bullets). Use a single `Edit` call covering both original lines.

- [ ] **Step 3: Verify the Models section now lists Flash in deepseek mode**

Run:
```bash
sed -n '28,33p' CLAUDE.md
```

Expected output:
```
## Models
- Brain options (text-only via `proxy/` prefix), per `BRAIN_MODE`:
  - `opencode` (via OpenCode Go): `proxy/glm-5.2`, `proxy/deepseek-v4-pro`, `proxy/qwen3.7-max`, `proxy/mimo-v2.5-pro`
  - `deepseek` (via your DeepSeek account): `proxy/deepseek-v4-pro`, `proxy/deepseek-v4-flash`
  - `hybrid`: the `opencode` set plus `proxy/local-deepseek-v4-pro`, `proxy/local-deepseek-v4-flash` (your DeepSeek, prefixed `local-`)
- All brains: thinking enabled
```

- [ ] **Step 4: Commit `CLAUDE.md`**

```bash
git add CLAUDE.md
git commit -m "docs(claude): split brain options by BRAIN_MODE to expose deepseek-mode Flash"
```

Expected: a single commit on `chore/docs-deepseek-v4-flash` containing only `CLAUDE.md` changes.

---

## Task 4: Verify the full PR

**Files:** None modified. This task is a sanity sweep.

**Interfaces:** Consumes the three commits from Tasks 1-3. Produces: a green verification report and a clear `git log` of the PR.

- [ ] **Step 1: Confirm we are on the right branch and have the right commits**

Run:
```bash
git status
git log --oneline -5
```

Expected:
- `On branch chore/docs-deepseek-v4-flash`
- `nothing to commit, working tree clean`
- Four commits on top of `main`'s `813ca2d`:
  - `chore/docs-deepseek-v4-flash (HEAD)` ← the latest spec commit
  - `docs(claude): split brain options by BRAIN_MODE ...` ← Task 3
  - `docs(readme): add deepseek-v4-flash pricing row ...` ← Task 2
  - `docs(models): add deepseek-v4-flash to brain catalog ...` ← Task 1
  - `813ca2d fix(dashboard): restore .cards-range styles lost in merge` ← main HEAD

- [ ] **Step 2: Verify no orphan "Removed" mention of Flash in living docs**

Run:
```bash
grep -nH 'proxy/deepseek-v4-flash' MODELS.md README.md CLAUDE.md
```

Expected: every match is a positive reference (Brain Models row, Pricing row, or Modes bullet). No line should contain `Removed` adjacent to `proxy/deepseek-v4-flash`.

Run:
```bash
grep -B 0 -A 0 'proxy/deepseek-v4-flash' MODELS.md README.md CLAUDE.md | grep -i 'removed'
```

Expected: no output.

- [ ] **Step 3: Run `npm run build`**

Run:
```bash
npm run build
```

Expected: exit code 0 with the project compiling cleanly. No source files changed, so this is a no-op compile check.

- [ ] **Step 4: Run `npm run test:unit`**

Run:
```bash
npm run test:unit
```

Expected: exit code 0. All existing tests pass. The `providerSelector.test.ts:127` assertion and `brainRegistry.test.ts:300-316` exercise continue to pass (no code change, so these are unchanged).

- [ ] **Step 5: Run `npm run lint`**

Run:
```bash
npm run lint
```

Expected: exit code 0. Lint is configured to also check Markdown via remark/presets per `package.json`; the formatting of the new rows and the JSON block should match the existing style.

- [ ] **Step 6: Final diff summary**

Run:
```bash
git diff main..HEAD --stat
```

Expected: only three files modified, each under 100 lines net change:
```
 CLAUDE.md |  6 +++---
 MODELS.md |  2 +-
 README.md | 50 ++++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 53 insertions(+), 5 deletions(-)
```

(Exact numbers may vary by ±2 lines for the README JSON block; the shape — three files, all under 100 lines, no code files — is the acceptance criterion.)

- [ ] **Step 7: Confirm no push happened (gate for user authorization)**

Run:
```bash
git log origin/chore/docs-deepseek-v4-flash..HEAD 2>/dev/null || echo "branch not on remote yet"
```

Expected: `branch not on remote yet` (the user has not yet authorized a push). The plan completes here; the user will run `git push` and create the PR after reviewing the diff.

---

## Self-Review (already done inline at write time)

- **Spec coverage:** All five spec changes (Changes 1-5) map to the four tasks. Tasks 1+2 each implement two changes; Task 3 implements one; Task 4 verifies.
- **Placeholder scan:** No "TBD"/"TODO"/"implement later" in any step. Every step shows the exact text or command.
- **Type consistency:** No new types introduced (docs-only). Existing naming (`proxy/deepseek-v4-flash`, `BRAIN_MODE=deepseek`, `800K¹`, `$0.14 / $0.28`) is consistent across all three files.
- **Risk note:** No code changes; no `BrainModelEntry` shape changes; no `providerSelector.ts` edits. Verification commands are sanity checks, not regression tests.
