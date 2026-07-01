# CLAUDE.md — Claude Code session bootstrap

> **Companion to `AGENTS.md`.** Read `AGENTS.md` first — it has the universal
> setup, commands, and conventions. This file adds Claude Code-specific
> behavior, subagent protocols, and tools.

---

## 0. Session start (every new conversation)

```bash
# 1. Read these two files first — total ~10K tokens, replaces 30+ file reads:
cat AGENTS.md
cat ../CURRENT-WORK.md    # only if working on the relocation add-on

# 2. If CURRENT-WORK.md is stale (>2 days), check recent commits:
git -C .. log --oneline -5
```

**Do not** session_search, git-log-archaeology, or read the full ROADMAP on
session start. The bootstrap files exist to prevent this.

---

## 1. Subagent delegation (Hermes `delegate_task` / Task tool)

Use the **`memove-delegate-verify`** skill (`~/.hermes/profiles/us-relocation/skills/software-development/memove-delegate-verify/SKILL.md`)
for the full protocol. Quick version:

**Brief format (under 100 words):**
```
Goal: [one sentence]
Workspace: /home/mongo/projects/us-relocation-2026/memove
Pattern to copy: [file:function — subagent reads it]
Verify: [exact command — tsc, vitest, etc.]
Commit: 'type(scope): description'
Push to origin main.

## REQUIRED OUTPUT FORMAT
Return this exact block at the end of your summary:
### CONFIRMATION
- Commit: [hash or "not committed"]
- Files changed: [exact paths, one per line]
- TSC: [pass/fail + error count]
- Tests: [N pass / N fail or "not run"]
- Skipped: [what was skipped and why, or "none"]
- Push: [yes/no]
```

**Mandatory:**
- Subagent MUST end with the CONFIRMATION block — no prose before it matters.
- Trust-but-verify: `git log -3` + `git diff --stat HEAD~1` (2 calls, ~500 tokens).
- Subagents do **not** have access to the codegraph MCP — orchestrator-only.
- Only the orchestrator writes `../CURRENT-WORK.md`. Parallel writes corrupt it.

---

## 2. Common tasks — exact commands

| Task | Command |
|---|---|
| Install everything | `pnpm install && pnpm --filter @memove/shared build` |
| Run dev (3 procs) | `pnpm dev` (concurrently) |
| Run only server | `pnpm --filter @memove/server dev` |
| Run only client | `pnpm --filter @memove/client dev` |
| Typecheck one pkg | `pnpm --filter @memove/server typecheck` |
| Lint one pkg | `pnpm --filter @memove/server lint` |
| Test one pkg | `pnpm --filter @memove/server test` |
| Run one test file | `pnpm --filter @memove/server test path/to/foo.test.ts` |
| Build shared (required before client/server dev) | `pnpm --filter @memove/shared build` |
| Full build | `pnpm build` |
| Eval fixtures | `pnpm eval` |
| Reset admin password | `cd server && node reset-admin.js` |

Server runs on `:3000`, client on `:5173`. SQLite at `server/data/dev.db` (gitignored; created on first boot).

---

## 3. Codebase navigation (when you don't know where something is)

1. **Start with the directory convention** (see AGENTS.md §2): the domain name
   usually maps 1:1 to `shared/src/<domain>/`, `server/src/nest/<domain>/`,
   `client/src/pages/<Domain>/`.
2. **For investigation before delegating**, prefer the **codegraph MCP**
   (`mcp__codegraph__codegraph_explore`) — one capped call replaces 3-5
   `read_file`s. **Do not** use it for post-commit verification (index is stale).
3. **For "where is X used?"** → `search_files pattern=X` (ripgrep-backed).
4. **For "what changed?"** → `git log --oneline -- path/to/file` then read the
   relevant commit.

---

## 4. Things I will get wrong unless reminded

- **Do not run `pnpm build` during a session** unless shipping a release —
  it writes to `dist/` and breaks HMR.
- **Do not edit `../CURRENT-WORK.md`** — orchestrator-only.
- **Do not push without a clean `git status`**.
- **Do not import from `@memove/server` in client code** or vice versa.
- **Do not add deps to the root `package.json`** — add to the workspace package.
- **Do not skip `IdempotencyInterceptor`** on write controllers.
- **Do not use `any`** — `unknown` + Zod parse, or define a type.

If a user asks for something that violates these, flag it once and ask whether
they really mean it. If they confirm, do it and note it in the commit message.

---

## 5. Verification: when to trust the result, when to dig

**Trust the CONFIRMATION block** when:
- Subagent took >60s and used >15 tool calls
- TSC + tests both reported pass with specific counts
- `git diff --stat` matches the claimed files

**Escalate verification** (run `tsc --noEmit` yourself) when:
- Subagent returned in <60s with <15 tool calls AND claims multi-file success
- The CONFIRMATION block is incomplete or missing
- The diff is suspiciously small for the claimed scope
- Files changed don't match the stated goal

**Always check** `git status --short` before pushing — disk state is truth,
summaries lie.

---

## 6. Drift-prevention protocol (this file)

**Rule:** when you change something in the codebase that contradicts
`AGENTS.md` or `CLAUDE.md`, you edit those files in the same commit.

Specifically:
- New workspace package → update `AGENTS.md §2`
- New setup command → update `AGENTS.md §3`
- New quality gate → update `AGENTS.md §4`
- New domain convention → update `AGENTS.md §6`
- New subagent protocol → update `CLAUDE.md §1`

CI runs `node scripts/check-agents-md.mjs` which:
- Asserts both files exist at repo root
- Asserts each is <300 lines
- Asserts every path mentioned resolves to a real file or directory
- Asserts every workspace mentioned exists in `pnpm-workspace.yaml`

If the check fails on a real change, fix the doc. If the check is wrong,
fix the check (in the same commit).

---

## 7. Out of scope for these files

These belong in dedicated docs, not here:
- Full API surface → OpenAPI spec at `server/openapi/` (auto-generated)
- Operator install / Unraid / photo providers → `wiki/`
- System-notices internals → `docs/system-notices.md`
- Relocation planning → root-level `CONTRACT.md`, `INVENTORY.md`, `BRIEF-*.md`
- Vulnerability reporting → `SECURITY.md`
- PR / commit policy → `CONTRIBUTING.md`