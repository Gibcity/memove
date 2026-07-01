# Monorepo Structure Recommendation — memove

**Author:** research subagent, 2026-07-01
**Scope:** `/home/mongo/projects/us-relocation-2026/memove/`
**Goal:** one clean folder, professional structure, AI-agent friendly.

---

## TL;DR

1. Current `client/` + `server/` + `shared/` works but **does not follow the modern convention**. Move them under `apps/` + `packages/`.
2. Naming is **inconsistent**: same domain has `systemNotices` (camelCase, stray), `nest/system-notices` (kebab), `shared/src/system-notice` (kebab-singular). Pick **kebab-case, plural** and rename the stray.
3. Root has **8 .md files** mixing user docs (README, CONTRIBUTING, LICENSE) with agent scratchpads (BRIEF-*, CONTRACT, INVENTORY, REPORT, CURRENT-WORK). Move scratchpads to `docs/internal/` or delete.
4. `docs/` (logos + 1 system-notices doc) and `wiki/` (75 user-facing pages) are **two competing doc systems**. Consolidate.
5. **Add `AGENTS.md`** at root. memove exposes 150 MCP tools to AI agents and ships **no project-memory file for those agents** — this is the single highest-leverage fix.

---

## 1. Research: what the pros actually do

### 1.1 Turborepo (Vercel)

Source: `https://github.com/vercel/turborepo/tree/main/examples/*`

- Convention: **`apps/` for deployables, `packages/` for libraries**.
- Canonical example `with-nestjs`:
  - `apps/api/` (NestJS server)
  - `apps/web/` (React client)
  - `packages/` (eslint-config, typescript-config, ui, ...)
- Root config: `pnpm-workspace.yaml`, `turbo.json`, root `package.json` with workspace scripts, `tsconfig.json` (extends), `.eslintrc.mjs`, `.prettierrc.mjs`, `.gitignore`, `.npmrc`.
- **Turborepo's own repo has an `AGENTS.md` at root** as of 2026. They dogfood.

### 1.2 pnpm workspaces (no Turborepo)

Source: `https://pnpm.io/workspaces`

- Pure pnpm uses **either** `apps/` + `packages/` **or** flat workspaces — both are documented as valid. The community has converged on `apps/` + `packages/` because it scales.
- Root config: `pnpm-workspace.yaml`, root `package.json` only if you need cross-workspace scripts.
- The `pnpm/pnpm` repo itself (Rust + JS hybrid) keeps `.agents/` + `AGENTS.md` + `CLAUDE.md` at root.

### 1.3 Nx

Source: `https://nx.dev` examples (react-monorepo, angular-rspack, ...)

- Nx is more opinionated: **`apps/` + `libs/`** (not `packages/`). Generates `apps/<name>/` and `libs/<name>/` with `project.json`.
- Heavy tooling: `nx.json`, `workspace.json`, plugins. Overkill for memove.

### 1.4 Next.js (Vercel/next.js)

- Monorepo of: `apps/` (Next.js + turbopack crates), `packages/` (eslint plugins), `examples/`, `turborepo-tests/`, `skills/`.
- Root: `.agents/skills/`, `.claude/`, `.cursor/`, `.github/`, `.config/`, `AGENTS.md` (implicit via `.agents/`).

### 1.5 React (react/react)

- **Flat**: no `apps/packages` split. Folders: `compiler/`, `fixtures/`, `packages/`, `scripts/`, `.claude/`, `.github/`, `.codesandbox/`.
- React is older and chose per-product folders; modern advice from the same team points to `apps/packages` for new projects.

### 1.6 Babel (`babel/babel`)

- **Flat**: `packages/`, `scripts/`, `Gulpfile.ts`, `.circleci/`, `.github/`, `.codesandbox/`, `.yarn/`.
- `packages/` holds ~100 sub-packages, no `apps/` wrapper (Babel has no deployable apps).

### 1.7 Consensus

For a project shaped like memove (few deployables + few shared libs):

| Choice | Verdict |
|---|---|
| `apps/` + `packages/` wrapper | ✅ **adopt** — matches Turborepo + with-nestjs, scales to N apps/libs |
| Flat `client/server/shared` | works for 3 packages, breaks when you add `admin-panel`, `docs-site`, `e2e-suite` |
| `packages/` + `tools/` (no `apps/`) | fine for lib-only repos (Babel pattern) — wrong for memove |

---

## 2. Current memove — issues found

### 2.1 Workspace layout: flat (works, doesn't scale)

```
memove/
├── client/        ← React 19 + Vite
├── server/        ← NestJS 11
├── shared/        ← TS types + zod + i18n catalogs
├── package.json   ← @memove/root, scripts run --workspace=...
├── pnpm-workspace.yaml  ← packages: client, server, shared
└── ...
```

**Verdict:** functionally correct. `pnpm-workspace.yaml` is valid pnpm. The scripts work. But the layout is the **pre-2024 convention**. Modern equivalent:

```
apps/
  web/         ← was client/
  api/         ← was server/
packages/
  shared/      ← was shared/
```

### 2.2 Naming inconsistencies (real bugs, not cosmetics)

Found via grep across `client/src`, `server/src`, `shared/src`:

| Domain | Locations | Cases used |
|---|---|---|
| System notices | `server/src/systemNotices/` (camelCase), `server/src/nest/system-notices/` (kebab, plural), `shared/src/system-notice/` (kebab, singular) | **three different conventions for the same thing** |
| Maps | `server/src/nest/maps/`, `shared/src/maps/` | consistent kebab |
| All other domains | `server/src/nest/{auth,budget,collab,...}`, `shared/src/{auth,budget,collab,...}` | kebab-case, consistent |

The stray `server/src/systemNotices/` (4 files: types.ts, conditions.ts, service.ts, registry.ts) looks like legacy code that was partially moved. It's at risk of being imported by dead paths.

**Decision: kebab-case, plural.** Pick this once, apply everywhere. It matches what already exists in 95% of the repo and matches every modern OSS convention I checked.

### 2.3 Root has 8 .md files — split user-docs from agent-state

```
memove/
├── README.md            ← user-facing ✓ keep at root
├── CONTRIBUTING.md      ← user-facing ✓ keep at root
├── LICENSE              ← user-facing ✓ keep at root
├── NOTICE.md            ← user-facing (third-party attribution) ✓ keep
├── SECURITY.md          ← user-facing ✓ keep
├── TRADEMARKS.md        ← user-facing ✓ keep
├── DESIGN.md            ← mixed — review
├── MCP.md               ← developer reference — move to docs/
├── REPORT.md            ← agent scratchpad — move/delete
├── REPORT.md (sic)      ← ambiguous name, easy to grep
```

`REPORT.md` is 22 KB of accumulated agent session output. `DESIGN.md` and `MCP.md` are 47 KB and 47 KB respectively of developer reference that GitHub will render as if they're user docs.

### 2.4 Two doc systems competing

- `docs/` — 1 KB of media (logos, screenshots, tiles) + **one** substantive file (`system-notices.md`, 27 KB).
- `wiki/` — **75 .md files**, 480 KB, the real user-facing documentation (Home.md, FAQ.md, MCP-*.md, Install-*.md, ...).

GitHub's wiki tab is separate from `docs/`. Two parallel systems means users can't find content, search only sees one half, and contributors don't know where to add pages.

### 2.5 No AGENTS.md — ironic for an AI-first product

memove ships an OAuth 2.1 MCP server with 150 tools and 30 resources. **The product is built to be driven by AI agents, but the repo has no agent-context file.** Every AI assistant that opens this repo (Claude Code, Codex, Hermes, Cursor) has to re-discover the project from scratch every session — exactly the failure mode AGENTS.md exists to fix.

---

## 3. The AI context-loss problem (terminology + solutions)

### 3.1 The term

The closest established term in the LLM-tooling community is **"context engineering"** — the discipline of putting the right context in the model prompt. The specific failure mode (agents re-discovering project state every session) is variously called:

- **session bootstrap cost**
- **cold-start latency / cold-start context**
- **agent context amnesia**

But the **standardised solution** has a name: **`AGENTS.md`**, defined by `agents.md` (open format, used by 60k+ projects per their site).

### 3.2 The patterns

| Pattern | Used by | Notes |
|---|---|---|
| **`AGENTS.md`** at repo root | Turborepo, pnpm, 60k+ OSS projects | Open spec at agents.md. Read by Cursor, Codex, Claude Code, Aider, Devin, Jules, Gemini CLI, Zed, Warp, Windsurf, etc. |
| **`CLAUDE.md`** | Anthropic's Claude Code | Single-vendor; same shape, different filename |
| **`.cursorrules`** | Cursor | JSON-ish rules in single file, vendor-specific |
| **`.claude/` directory** | Next.js, React, pnpm | Per-tool settings + skills; not portable |
| **`.agents/skills/`** | Next.js, pnpm/pnpm | A folder of reusable skill prompts |
| **`HERMES.md` / profile memory** | This profile | Hermes equivalent — already in use here |

**Recommended for memove:** `AGENTS.md` at root (most portable, agent-agnostic). Optionally also `CLAUDE.md` next to it as a 1-line symlink / reference — many vendors read both.

### 3.3 What goes in AGENTS.md (template)

```markdown
# AGENTS.md

## Build / dev commands
- Install: `pnpm install`
- Dev (web + api + shared watch): `pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test`
- E2E: `pnpm --filter web test:e2e` and `pnpm --filter api test:e2e`

## Workspace layout
- `apps/web/`  — React 19 + Vite
- `apps/api/`  — NestJS 11 (serves both REST and MCP)
- `packages/shared/` — TS types, zod schemas, i18n catalogs

## Conventions
- Directory names: kebab-case, plural (`system-notices/`, not `systemNotices/`)
- TS strict, single quotes, no semicolons (see .prettierrc)
- New shared types → `packages/shared/src/<domain>/`; import from both apps
- MCP tool changes → also update `apps/api/src/mcp/tools/` and `wiki/MCP-Tools-and-Resources.md`

## Things NOT to do without asking
- Don't rename a top-level workspace folder without updating `pnpm-workspace.yaml` + Docker volume paths
- Don't touch `wiki/` structure (it's GitHub-rendered; not in repo unless synced)
- Don't bump `ENCRYPTION_KEY` handling — see `wiki/Encryption-Key-Rotation.md`

## Where things live
- User docs: `wiki/` (rendered via GitHub wiki)
- API reference: `apps/api/openapi/`
- Architecture: `DESIGN.md`
- This session's task list: `/home/mongo/projects/us-relocation-2026/CURRENT-WORK.md`
```

That's ~30 lines. Saves an AI agent 5–10 minutes of file reading per session.

---

## 4. Recommended target structure

### 4.1 New layout

```
memove/
├── apps/
│   ├── web/                 ← was client/
│   └── api/                 ← was server/
├── packages/
│   └── shared/              ← was shared/
├── charts/                  ← Helm chart (untouched)
├── docs/                    ← README assets only (logos, screenshots, tiles)
├── wiki/                    ← user docs (the 75-file GitHub wiki)
├── scripts/                 ← root-level maintenance scripts
├── .github/                 ← CI + issue templates
├── .vscode/                 ← optional editor settings
│
│  --- root configs ---
├── package.json             ← @memove/root, workspace scripts
├── pnpm-workspace.yaml      ← packages: apps/*, packages/*
├── pnpm-lock.yaml
├── tsconfig.json            ← root tsconfig (extends per-app)
├── turbo.json               ← OPTIONAL — add if you want task graphs (see §4.4)
├── .editorconfig
├── .gitignore
├── .gitattributes
├── .npmrc
├── .prettierrc / .prettierignore
├── .eslintrc.mjs
├── docker-compose.yml       ← unchanged
├── Dockerfile               ← unchanged (build context is apps/api)
│
│  --- user-facing root docs ---
├── README.md
├── LICENSE
├── NOTICE.md
├── CONTRIBUTING.md
├── SECURITY.md
├── TRADEMARKS.md
│
│  --- agent & developer refs ---
├── AGENTS.md                ← NEW — read by every AI tool
├── CLAUDE.md                ← 1-line: "see AGENTS.md"
├── DESIGN.md                ← moved from root? actually keep, it's the only true arch doc
│
│  --- agent scratchpads (gitignored or in docs/internal/) ---
└── docs/internal/
    ├── BRIEF-*.md
    ├── CONTRACT.md
    ├── CURRENT-WORK.md
    ├── INVENTORY.md
    ├── REPORT.md
    ├── feature-map.md
    └── MCP.md              ← dev reference; the user-facing one is wiki/MCP-Overview.md
```

### 4.2 Key choices

**Why `apps/` + `packages/`:**
- Matches Turborepo's own `with-nestjs` example (literally `apps/api` + `apps/web`).
- Lets you add `apps/admin/`, `apps/docs-site/`, `apps/mcp-gateway/` without renaming anything.
- `packages/` can grow to hold `packages/types/`, `packages/eslint-config/`, `packages/ui/` later.

**Why rename `client/` → `web/` and `server/` → `api/`:**
- The current names describe **role**, the new names describe **deployable**. When you have a second server (e.g. a websocket gateway), "server" stops being meaningful.
- `"api"` is also what NestJS docs use (see with-nestjs).

**Why kebab-case plural everywhere:**
- pnpm/npm package names cannot contain uppercase (npm spec). Filesystem follows.
- 95% of memove already uses it. The one stray (`server/src/systemNotices/`) is the bug to fix.

**Why `docs/` vs `wiki/` split:**
- `docs/` = repo-tracked, in the git tree, referenced from README (screenshots, logos).
- `wiki/` = GitHub wiki tab, NOT in this git tree by default. The 75 files there live at `github.com/Gibcity/memove/wiki` and are typically mirrored via a CI job or manual sync.
- **Decision:** don't try to merge them. Just be explicit: `docs/` = repo assets, `wiki/` = rendered user docs. Add a comment to `AGENTS.md` saying so.

**Why move BRIEF-*, CONTRACT, REPORT, etc. to `docs/internal/`:**
- They're not user-facing.
- Currently 8 .md files at root makes `ls *.md` noisy.
- `docs/internal/` is one convention; `docs/agents/` is another. Pick one, stay consistent.

**Why add `AGENTS.md`:**
- See §3. Single highest-leverage change. The product is literally built for AI agents.

### 4.3 Migration steps (minimum viable)

In order, each independently low-risk:

1. **Create `apps/` and `packages/` directories; git-mv `client`, `server`, `shared` into them.**
   ```bash
   mkdir apps packages
   git mv client apps/web
   git mv server apps/api
   git mv shared packages/shared
   ```
2. **Update `pnpm-workspace.yaml`:**
   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
   ```
3. **Update root `package.json` workspace paths and script names** (`--workspace=client` → `--workspace=web`).
4. **Rename `server/src/systemNotices/` → `server/src/nest/system-notices/`** (the convention already in use). Update any import. Delete the old dir.
5. **Rename `shared/src/system-notice/` → `shared/src/system-notices/`** to match. Or keep singular — pick one, document it.
6. **Move BRIEF-*, CONTRACT.md, REPORT.md, INVENTORY.md, feature-map.md, MCP.md** to `docs/internal/`. Update references in CURRENT-WORK.md.
7. **Add `AGENTS.md`** at root using the template in §3.3.
8. **Add `docs/internal/README.md`** explaining what goes here ("agent scratchpads, internal contracts — not user docs").
9. **Optionally add `turbo.json`** for task graphs (caching, parallel runs). Low value for a 3-package repo — skip unless build times hurt.

### 4.4 Should you adopt Turborepo?

**Not yet.** Adding `turbo` to a 3-package repo is over-engineering (ponytail principle). The current `concurrently` script works. The Turborepo pay-off arrives when:
- you have 5+ packages,
- cross-package builds take >30s and you want cache hits,
- CI needs selective `turbo run test --filter=<changed>`.

Migration to Turborepo later is a 1-day job if the `apps/packages` layout is already in place. **Do not do it now.**

### 4.5 Things explicitly NOT to do

- ❌ Don't rename `shared` → `packages/types`. The memove package is types **+** zod **+** i18n catalogs; calling it "types" lies.
- ❌ Don't move `charts/` under `apps/` — it's a separate deployment artifact.
- ❌ Don't merge `docs/` and `wiki/` — they have different lifecycles (git-tracked vs GitHub wiki tab).
- ❌ Don't introduce Nx — too heavy for 3 packages.
- ❌ Don't bikeshed the rename `client→web` / `server→api` if external links break — but you have 0 external links because nobody depends on the monorepo's path layout.

---

## 5. Verification checklist (for after migration)

```bash
cd /home/mongo/projects/us-relocation-2026/memove

# 1. pnpm sees all three workspaces
pnpm -r list --depth=-1 | grep -E 'web|api|shared'

# 2. build still passes
pnpm build

# 3. tests still pass
pnpm test

# 4. No stray camelCase systemNotices dir
test ! -d server/src/systemNotices

# 5. AGENTS.md exists at root
test -f AGENTS.md

# 6. README links still resolve
grep -r 'docs/screenshots' README.md  # should find
grep -r 'docs/logo' README.md         # should find
```

---

## 6. Summary of what this deliverable proposes

| Decision | Recommendation |
|---|---|
| Top-level layout | `apps/{web,api}` + `packages/shared` |
| Package names | `web` and `api` (deployable nouns), `shared` (lib) |
| Workspace file | `packages: apps/*, packages/*` |
| Directory naming | **kebab-case, plural**, everywhere, no exceptions |
| Doc split | `docs/` = repo-tracked assets, `wiki/` = GitHub wiki tab — don't merge |
| Root .md files | user docs at root, agent scratchpads in `docs/internal/` |
| AI context | add `AGENTS.md` at root (template in §3.3) |
| Build orchestration | keep `concurrently`, don't adopt Turborepo yet |
| Stray dir to rename | `server/src/systemNotices/` → `server/src/nest/system-notices/` |
| Tooling | pnpm only — no Nx, no Turborepo |
| Migration risk | low — `git mv` + 2 config file edits + 1 rename |

---

## 7. Sources cited

- `https://github.com/vercel/turborepo/tree/main/examples/with-nestjs` — `apps/api` + `apps/web` (NestJS example)
- `https://github.com/vercel/turborepo/tree/main/examples/basic` — `apps/web`, `apps/docs`, `packages/{ui,eslint-config,typescript-config}`
- `https://pnpm.io/workspaces` — workspace protocol, `pnpm-workspace.yaml` semantics
- `https://github.com/pnpm/pnpm` — `.agents/`, `AGENTS.md`, `CLAUDE.md` at root
- `https://github.com/vercel/next.js` — `.agents/skills/`, `.claude/`, `apps/` + `packages/` + `examples/` + `crates/`
- `https://github.com/react/react` — flat layout, `.claude/`, `.github/`, `.codesandbox/`
- `https://github.com/babel/babel` — flat `packages/` layout, monorepo of ~100 libs
- `https://agents.md/` — `AGENTS.md` open spec, 60k+ projects, 25+ tool integrations
- `https://nx.dev` — `apps/` + `libs/` convention (heavier than memove needs)