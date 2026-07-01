#!/usr/bin/env node
/**
 * check-agents-md.mjs — Drift-prevention check for AGENTS.md / CLAUDE.md.
 *
 * Run from repo root: `node scripts/check-agents-md.mjs`
 * Add to CI: `pnpm lint:docs` (wired in package.json).
 *
 * Asserts:
 *   1. Both files exist at repo root.
 *   2. Both files are <300 lines (token-budget rule).
 *   3. Every workspace path mentioned exists in pnpm-workspace.yaml.
 *   4. Every `path/` / `path/file.ext` reference in §2 and §8 resolves to a real file.
 *   5. Section headers are stable (so anchors don't drift).
 *
 * Exits non-zero on the first failure with a one-line diagnostic.
 * No deps — stdlib only.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["AGENTS.md", "CLAUDE.md"];
const MAX_LINES = 300;

let failures = 0;

function fail(msg) {
  console.error(`✗ ${msg}`);
  failures++;
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}

// 1. Existence + 2. line budget
const docs = {};
for (const f of FILES) {
  const p = join(ROOT, f);
  if (!existsSync(p)) {
    fail(`${f} missing at repo root`);
    continue;
  }
  const lines = readFileSync(p, "utf8").split("\n");
  docs[f] = { path: p, lines, text: lines.join("\n") };
  if (lines.length > MAX_LINES) {
    fail(`${f} is ${lines.length} lines (max ${MAX_LINES}). Move detail to docs/wiki/ and link.`);
  } else {
    ok(`${f} exists, ${lines.length} lines`);
  }
}

// 3. Workspace consistency — every workspace mentioned in §2 must exist in pnpm-workspace.yaml
const wsFile = join(ROOT, "pnpm-workspace.yaml");
if (!existsSync(wsFile)) {
  fail("pnpm-workspace.yaml missing — repo layout broken");
} else {
  const wsText = readFileSync(wsFile, "utf8");
  const wsNames = [...wsText.matchAll(/^\s*-\s*(\S+)/gm)].map((m) => m[1]);
  const mentioned = new Set();
  for (const f of FILES) {
    if (!docs[f]) continue;
    const text = docs[f].text;
    for (const m of text.matchAll(/`--filter @memove\/([a-z-]+)`/g)) {
      mentioned.add(m[1]);
    }
    for (const m of text.matchAll(/^\s*[│├└]──\s*([a-z-]+)\s*\//gm)) {
      mentioned.add(m[1]);
    }
    for (const m of text.matchAll(/`([a-z-]+)\/`/g)) {
      if (["client", "server", "shared", "docs", "wiki", "scripts"].includes(m[1])) {
        mentioned.add(m[1]);
      }
    }
  }
  for (const name of mentioned) {
    if (["client", "server", "shared"].includes(name) && !wsNames.includes(name)) {
      fail(`workspace '${name}' mentioned in AGENTS/CLAUDE.md but missing from pnpm-workspace.yaml`);
    } else if (wsNames.includes(name)) {
      ok(`workspace '${name}' referenced consistently`);
    }
  }
}

// 4. Path references in §2 (layout) and §8 (hot files) must resolve.
//    `.db`, `dist/`, `node_modules/` etc. are gitignored — exempt from the check.
const GITIGNORED_SUFFIXES = [".db", ".db-shm", ".db-wal", ".sqlite", ".log"];
const GITIGNORED_DIRS = ["dist/", "node_modules/", "data/", "uploads/", "coverage/"];
const isExempt = (ref) =>
  GITIGNORED_SUFFIXES.some((s) => ref.endsWith(s)) ||
  GITIGNORED_DIRS.some((d) => ref.includes(d));
for (const f of FILES) {
  if (!docs[f]) continue;
  // Strip wildcards (`*` or `**`) so we check the parent path instead of failing.
  // Anchor the path to the START of the backtick string and only forbid the
  // one nested pattern that exists in this repo (`docs/wiki/` shouldn't be
  // captured as starting at `docs/`).
  const refs = [
    ...new Set(
      [...docs[f].text.matchAll(/`(client|server|shared|docs|wiki|scripts)\/(?!\/)(?!wiki\/)([a-zA-Z0-9_.\-]+(?:\/[a-zA-Z0-9_.\-]+)*\*?)\`/g)].map(
        (m) => {
          const joined = `${m[1]}/${m[2]}`;
          const clean = joined.replace(/\*+$/, "").replace(/\/\*+/g, "/");
          return clean.endsWith("/") ? clean.slice(0, -1) : clean;
        },
      ),
    ),
  ];
  let checked = 0;
  let exempt = 0;
  for (const ref of refs) {
    if (isExempt(ref)) {
      exempt++;
      continue;
    }
    const abs = join(ROOT, ref);
    if (
      existsSync(abs) ||
      existsSync(abs + ".ts") ||
      existsSync(abs + ".tsx") ||
      existsSync(abs + ".md") ||
      existsSync(abs + ".json") ||
      existsSync(abs + ".yaml") ||
      (existsSync(abs) && statSync(abs).isDirectory())
    ) {
      checked++;
    } else {
      fail(`${f} references \`${ref}\` but it does not resolve on disk`);
    }
  }
  if (checked > 0) ok(`${f}: ${checked} path references resolve`);
  if (exempt > 0) ok(`${f}: ${exempt} gitignored/runtime references exempt`);
}

// 5. Section header stability
const REQUIRED_HEADERS = {
  "AGENTS.md": [
    /^## 1\. What this is$/m,
    /^## 2\. Repo layout/m,
    /^## 3\. Setup commands/m,
    /^## 4\. Quality gates/m,
    /^## 5\. Code style/m,
    /^## 10\. Anti-patterns/m,
  ],
  "CLAUDE.md": [
    /^## 0\. Session start/m,
    /^## 1\. Subagent delegation/m,
    /^## 2\. Common tasks/m,
    /^## 6\. Drift-prevention/m,
  ],
};
for (const [file, patterns] of Object.entries(REQUIRED_HEADERS)) {
  if (!docs[file]) continue;
  for (const re of patterns) {
    if (!re.test(docs[file].text)) {
      fail(`${file} is missing required section ${re}`);
    }
  }
}
ok("section headers stable");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed. AGENTS.md or CLAUDE.md has drifted.`);
  process.exit(1);
}
console.log("\nAGENTS.md and CLAUDE.md are in sync with the codebase.");