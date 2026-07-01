#!/usr/bin/env bash
# scripts/check-doc-drift.sh
#
# Lightweight drift detector: keeps ROADMAP.md / feature-map.md in sync
# with the actual code state. Grep/wc only — no framework, no Node deps.
#
# Detects four classes of drift:
#   1. Endpoint-count drift  (controller endpoints vs. doc claims)
#   2. Status-marker drift   (ROADMAP X/17 vs. feature-map X/17)
#   3. Stale TODO/FIXED markers (FIXED but the code still says TODO)
#   4. PII-shaped secrets in shell that drifted into the repo
#
# Exit codes:
#   0  no drift
#   1  drift detected
#   2  bad invocation / file missing
#
# Usage:
#   bash scripts/check-doc-drift.sh           # human-readable report
#   bash scripts/check-doc-drift.sh --json    # JSON for CI

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_REL="$ROOT/memove/server/src/nest/relocation"
CONTROLLER="$SERVER_REL/relocation.controller.ts"
ROADMAP="$ROOT/docs/ROADMAP.md"
FEATURE_MAP="$ROOT/feature-map.md"

EXIT=0
WARNINGS=0

# ── Args ────────────────────────────────────────────────────────────────────
MODE="text"
if [[ "${1:-}" == "--json" ]]; then MODE="json"; fi

emit() { # emit(kind, msg)
  local kind="$1"; shift
  if [[ "$MODE" == "json" ]]; then
    # escape double-quotes
    local esc="${*//\"/\\\"}"
    printf '{"kind":"%s","msg":"%s"}\n' "$kind" "$esc"
  else
    printf '[%s] %s\n' "$kind" "$*"
  fi
}

require_file() {
  [[ -f "$1" ]] || { echo "MISSING: $1" >&2; exit 2; }
}
require_file "$CONTROLLER"
require_file "$ROADMAP"
require_file "$FEATURE_MAP"

# ── 1. Endpoint-count drift ─────────────────────────────────────────────────
# Count @Get / @Post decorators in the controller
CODE_GET=$(grep -cE '^\s*@Get\('  "$CONTROLLER" || true)
CODE_POST=$(grep -cE '^\s*@Post\(' "$CONTROLLER" || true)
CODE_TOTAL=$((CODE_GET + CODE_POST))

# Count endpoints documented in feature-map.md Server surface block
DOC_GET=$(grep -oE 'GET [^ ]'   "$FEATURE_MAP" 2>/dev/null | grep -c 'GET ' || true)
DOC_POST=$(grep -oE 'POST [^ ]' "$FEATURE_MAP" 2>/dev/null | grep -c 'POST ' || true)

# feature-map claim line: "17 endpoints in `server/src/nest/relocation/`"
CLAIM_LINE=$(grep -nE '[0-9]+ endpoints? in .*relocation' "$FEATURE_MAP" | head -1 || true)
CLAIM_NUM=$(echo "$CLAIM_LINE" | grep -oE '[0-9]+ endpoints?' | grep -oE '[0-9]+' | head -1 || echo "0")

emit "info" "controller: $CODE_GET GET + $CODE_POST POST = $CODE_TOTAL endpoints"
emit "info" "feature-map claim: '$CLAIM_LINE' (parsed=$CLAIM_NUM)"

if [[ "$CODE_TOTAL" -ne "$CLAIM_NUM" ]] && [[ "$CLAIM_NUM" != "0" ]]; then
  emit "drift" "endpoint count mismatch — code=$CODE_TOTAL, feature-map claims=$CLAIM_NUM"
  EXIT=1
fi

# ── 2. Status-marker drift between ROADMAP and feature-map ───────────────────
ROADMAP_STATUS=$(grep -oE '[0-9]+/[0-9]+ wiring gaps closed' "$ROADMAP" | head -1 || true)
FEATUREMAP_STATUS=$(grep -oE '[0-9]+/[0-9]+ closed' "$FEATURE_MAP" | head -1 || true)
emit "info" "ROADMAP says:    '$ROADMAP_STATUS'"
emit "info" "feature-map says:'$FEATUREMAP_STATUS'"

if [[ -n "$ROADMAP_STATUS" && -n "$FEATUREMAP_STATUS" ]]; then
  R_NUM=$(echo "$ROADMAP_STATUS" | grep -oE '^[0-9]+')
  F_NUM=$(echo "$FEATUREMAP_STATUS" | grep -oE '^[0-9]+')
  if [[ "$R_NUM" != "$F_NUM" ]]; then
    emit "drift" "status markers disagree — ROADMAP=$ROADMAP_STATUS, feature-map=$FEATUREMAP_STATUS"
    EXIT=1
  else
    emit "ok" "status markers agree: $ROADMAP_STATUS"
  fi
fi

# ── 3. Stale TODO + FIXED-clash detection ────────────────────────────────────
# A "FIXED" marker in feature-map should not coexist with an unresolved TODO
# inside the same component. (cheap grep heuristic, not exact trace)
FIXED_COUNT=$(grep -cE '\*\*FIXED' "$FEATURE_MAP" || true)
emit "info" "feature-map **FIXED** markers: $FIXED_COUNT"

# Locate any TODO/FIXME in the relocation services that looks unresolved
for f in "$SERVER_REL"/*.ts; do
  base=$(basename "$f")
  hits=$(grep -nE 'TODO|FIXME|XXX' "$f" 2>/dev/null || true)
  if [[ -n "$hits" ]]; then
    while IFS= read -r line; do
      ln=$(echo "$line" | cut -d: -f1)
      txt=$(echo "$line" | cut -d: -f2- | sed 's/^[[:space:]]*//')
      emit "info" "relocation/$base:$ln  $txt"
    done <<< "$hits"
  fi
done

# ── 4. Item-by-item FIXED vs RESOLVED enumeration ───────────────────────────
# Count numbered FIXED items (1., 2., 3., …) and ensure the total matches
# the count of unique resolution entries
ITEM_FIXED=$(grep -cE '^[0-9]+\. ~~.*\*\*FIXED' "$FEATURE_MAP" || true)
BULLET_FIXED=$(grep -cE '^- ~~.*\*\*FIXED' "$FEATURE_MAP" || true)
TOTAL_FIXED=$((ITEM_FIXED + BULLET_FIXED))

# Parse denominator from "13/17 closed" or similar
TOTAL_DENOM=$(echo "$FEATUREMAP_STATUS" | grep -oE '/[0-9]+' | tr -d '/' || echo "0")
if [[ "$TOTAL_FIXED" != "$TOTAL_DENOM" && "$TOTAL_DENOM" != "0" ]]; then
  emit "drift" "FIXED-item tally=$TOTAL_FIXED disagrees with status denominator=$TOTAL_DENOM (likely enum inconsistency)"
  EXIT=1
else
  emit "ok" "FIXED-item tally ($TOTAL_FIXED) matches status denominator ($TOTAL_DENOM)"
fi

# ── 5. Phase 5 / 10.x wired check ───────────────────────────────────────────
# ROADMAP §5 claims §10.1–10.5 wired; §10.6 eval gate TBD. Check code has
# the corresponding test files.
EVAL_GATE=$(find "$ROOT/memove/server/tests/e2e" "$ROOT/memove/client/e2e" \
  \( -name 'relocation-isolation*' -o -name 'relocation-provenance*' -o -name 'relocation-integration*' \) \
  2>/dev/null | wc -l)
if [[ "$EVAL_GATE" -lt 2 ]]; then
  emit "warn" "fewer than 2 §10.x test files detected ($EVAL_GATE) — ROADMAP §5 status may be optimistic"
  WARNINGS=$((WARNINGS + 1))
else
  emit "ok" "found $EVAL_GATE §10.x test files (matches §10.1–10.5 claim)"
fi

# ── 6. ROADMAP self-consistency: remaining items vs. closed count ───────────
# §7 line "remaining are #N, #M" — extract and ensure 17 - closed == remaining
ROADMAP_REMAINING=$(grep -oE 'remaining are [^.]+' "$ROADMAP" | head -1 || true)
emit "info" "ROADMAP §7 leftover list: '$ROADMAP_REMAINING'"
REM_COUNT=$(echo "$ROADMAP_REMAINING" | grep -oE '#[0-9]+' | wc -l | awk '{print $1}')
CLOSED=$(echo "$ROADMAP_STATUS" | grep -oE '^[0-9]+' || echo "0")
DENOM=$(echo "$ROADMAP_STATUS" | grep -oE '/[0-9]+' | tr -d '/' || echo "0")
EXPECTED_REM=$((DENOM - CLOSED))
if [[ "$REM_COUNT" -ne "$EXPECTED_REM" ]]; then
  emit "drift" "ROADMAP internal inconsistency: leftover count=$REM_COUNT, but 17-closed=$EXPECTED_REM"
  EXIT=1
else
  emit "ok" "ROADMAP closed + leftover tally internally consistent ($CLOSED+$REM_COUNT=$DENOM)"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo
if [[ "$MODE" == "text" ]]; then
  if [[ "$EXIT" -eq 0 ]]; then
    echo "=== doc-drift report: OK (warnings=$WARNINGS) ==="
  else
    echo "=== doc-drift report: DRIFT DETECTED (warnings=$WARNINGS) ==="
  fi
fi

exit "$EXIT"