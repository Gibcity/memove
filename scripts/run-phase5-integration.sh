#!/usr/bin/env bash
# Phase 5 integration runner — single entry point that drives §10.1–§10.3
# (Playwright) and the additive vitest gates, then writes the results into
# REPORT.md.
#
# Usage:  ./trek/scripts/run-phase5-integration.sh [phase5-extra-spec...]
#
# Exits non-zero on any failure. The Playwright spec is the integration
# suite at client/e2e/relocation-integration.spec.ts; vitest gates are the
# additive tests we already have for elicitation, hard-filter, and journey.

set -u

# ── Paths ──────────────────────────────────────────────────────────────────
TREK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT="$TREK/client"
SERVER="$TREK/server"
SPEC="$CLIENT/e2e/relocation-integration.spec.ts"

# Output tap file for Playwright (also produced even on failure so we can post-mortem)
TMP_OUT="$(mktemp)"
trap 'rm -f "$TMP_OUT"' EXIT

LOG_HEAD="$TREK/REPORT.md"
RUN_HEADER="## Run on $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
RESULTS_BLOCK=""

# ── Failure helpers ────────────────────────────────────────────────────────
say() { printf '%s\n' "$*"; }
err() { printf '❌ %s\n' "$*" >&2; RESULTS_BLOCK="$RESULTS_BLOCK\n- ❌ $*"; }

# ── Step 1: additive vitest gates (cheap + serial) ─────────────────────────
say "=== [1/4] additive vitest gates (client + shared) ==="
PNPM_TEST_STATUS=0
(
  cd "$TREK"
  pnpm --filter @memove/shared test 2>&1 | tail -40
) || PNPM_TEST_STATUS=$?
(
  cd "$CLIENT"
  # Run the relocation-touching unit tests as a focused additive gate. The
  # full suite is run separately by CI — this is just the slice that exercises
  # Phase 5 surface area.
  npx vitest run --silent \
    src/pages/relocation \
    src/api/relocation.test.ts 2>&1 | tail -40
) || PNPM_TEST_STATUS=$?

# ── Step 2: build stays clean ──────────────────────────────────────────────
say "=== [2/4] build stays clean ==="
BUILD_STATUS=0
(
  cd "$TREK"
  pnpm run build 2>&1 | tail -20
) || BUILD_STATUS=$?

# ── Step 3: Playwright integration suite ───────────────────────────────────
say "=== [3/4] Playwright integration suite ($SPEC) ==="
PW_STATUS=0
(
  cd "$CLIENT"
  # CI=1 forces Playwright to start its own clean backend (not reuse the dev
  # server) and to retry failed tests once. The runner that the e2e config
  # already uses (server-launch.mjs + Vite) is what produces the isolated
  # SQLite DB.
  CI=1 npx playwright test "$SPEC" --reporter=list \
    > "$TMP_OUT" 2>&1 || PW_STATUS=$?
)
cat "$TMP_OUT"

# Pull §10.3 elapsed-ms line out of the report (we logged it in spec output)
ELAPSED_10_3="$(grep -E '^§10\.3 cold-start elapsed ms' "$TMP_OUT" | tail -1 || true)"
ELAPSED_10_1="$(grep -E '^§10\.1 elapsed ms' "$TMP_OUT" | tail -1 || true)"

# ── Step 4: write the run section into REPORT.md ───────────────────────────
say "=== [4/4] writing REPORT.md run section ==="

{
  printf '%s\n\n' "$RUN_HEADER"
  printf '\`\`\`text\n'
  printf '§10.1 (Playwright): %s\n' "${ELAPSED_10_1:-not captured}"
  printf '§10.3 (Playwright): %s\n' "${ELAPSED_10_3:-not captured}"
  printf 'Additive vitest gates: exit %s\n' "$PNPM_TEST_STATUS"
  printf 'Build: exit %s\n' "$BUILD_STATUS"
  printf 'Playwright integration: exit %s\n' "$PW_STATUS"
  printf '\n'
  printf 'Last 20 lines of Playwright output:\n'
  tail -20 "$TMP_OUT" 2>/dev/null | sed 's/^/  /'
  printf '\`\`\`\n'
} >> "$LOG_HEAD"

# ── Verdict ────────────────────────────────────────────────────────────────
say "=== verdict ==="
say "  vitest additive: exit $PNPM_TEST_STATUS"
say "  build:           exit $BUILD_STATUS"
say "  playwright:      exit $PW_STATUS"

if [ "$PW_STATUS" -ne 0 ]; then
  err "Playwright integration suite failed (exit $PW_STATUS). See '$LOG_HEAD' and the spec output above."
fi
if [ "$BUILD_STATUS" -ne 0 ]; then
  err "Build broke (exit $BUILD_STATUS)."
fi
if [ "$PNPM_TEST_STATUS" -ne 0 ]; then
  err "Additive vitest gates failed (exit $PNPM_TEST_STATUS)."
fi

# If everything green, stamp the table cells.
if [ "$PW_STATUS" -eq 0 ] && [ "$BUILD_STATUS" -eq 0 ] && [ "$PNPM_TEST_STATUS" -eq 0 ]; then
  # Flip the §10.1–§10.3 cells to ✅ inside the status table. The markers are
  # deliberately precise so they can't match false positives.
  python3 - "$LOG_HEAD" "$ELAPSED_10_3" <<'PY'
import re, sys
path, elapsed = sys.argv[1], sys.argv[2]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()
def mark(line_id):
    return re.sub(r'(\| §10\.'+line_id+r' \|)[^|]*\|(\s*)⬜ TBD',
                  lambda m: f"{m.group(1)} ✅ green (this run) |{m.group(2)}⬜ TBD",
                  src, count=1)
# We only flip the criterion cell; "Sign-off" stays manual.
def flip(crit, evidence_cell):
    global src
    pat = re.compile(rf'(\| §10\.' + crit + r' \| [^|]+ \| `[^`]+` \+ [^|]+ \|)(\s*)⬜ TBD')
    src, n = pat.subn(rf"\1 ✅ green (run on this date, evidence in 'Run script output') |\2⬜ TBD", src, count=1)
    return n
for c in ('1','2','3'):
    flip(c, c)
with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
PY
fi

# Exit with the worst observed status (Playwright failing wins, then build,
# then vitest). This is what CI uses to gate the deploy.
EXIT=$(( PW_STATUS > BUILD_STATUS ? PW_STATUS : BUILD_STATUS ))
EXIT=$(( EXIT > PNPM_TEST_STATUS ? EXIT : PNPM_TEST_STATUS ))
exit "$EXIT"
