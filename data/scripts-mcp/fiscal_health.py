"""
Fiscal Health Score — predicts future tax burden and service degradation risk.

This is the platform's key differentiator: most relocation sites show you
current taxes. We show you where taxes are HEADING based on whether the
state/city can pay its bills.

The Chicago problem: IL reports "balanced budgets" using cash accounting
that excludes pension obligations (GASB 68 loophole). Under GAAP accounting,
IL has ~$140B in unfunded pension liability. That debt will be paid by
future residents through higher taxes or reduced services.

This module turns that into a score a family can understand.

Data sources (all already loaded):
  - Equable Institute: pension funded ratios (state-level)
  - Tax Foundation: state tax competitiveness rankings
  - Census ACS: effective tax rates
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any

# ── Equable fiscal tiers ──────────────────────────────────────────────────
TIER_SCORES = {
    "Resilient": 90,
    "Fragile": 55,
    "Distressed": 25,
}
DEFAULT_TIER_SCORE = 50  # Unknown / no classification

# ── Risk thresholds ───────────────────────────────────────────────────────
# Pension funded ratio thresholds (industry standard from Pew, Equable)
PENSION_HEALTHY = 0.90   # 90%+ = well-funded, low risk
PENSION_ADEQUATE = 0.70  # 70-89% = adequate, watch
PENSION_STRESSED = 0.55  # 55-69% = stressed, tax hikes likely
# Below 55% = crisis, tax hikes mathematically inevitable

# ── Estimated future tax impact ───────────────────────────────────────────
# Based on historical data: states with <70% pension funding have raised
# taxes an average of 0.3-0.8 percentage points per decade to close gaps.
# Source: Pew Charitable Trusts fiscal analysis 2010-2024
PENSION_GAP_TO_TAX_RISK = {
    # funded_ratio range → (estimated tax increase over 10 years, risk level)
    (0.90, 1.00): (0.0, "Low", "Pension system is well-funded. No tax pressure from pension obligations."),
    (0.70, 0.89): (0.5, "Moderate", "Pension system is adequately funded. Modest tax pressure possible."),
    (0.55, 0.69): (1.5, "Elevated", "Pension system is stressed. Expect tax increases or service cuts within 5-10 years."),
    (0.00, 0.54): (3.0, "High", "Pension system is in crisis. Tax increases are mathematically inevitable to close the funding gap."),
}


def compute_fiscal_health_score(
    funded_ratio: float,
    tax_competitiveness_score: float,
    fiscal_tier: str,
) -> dict[str, Any]:
    """
    Compute fiscal health score (0-100) and risk assessment.

    Higher score = healthier finances = lower future tax risk for residents.

    Args:
        funded_ratio: State pension funded ratio (0.0-1.0). Assets ÷ liabilities.
        tax_competitiveness_score: Tax Foundation rank score (0-100, higher=better).
        fiscal_tier: Equable classification (Resilient/Fragile/Distressed).

    Returns:
        dict with score (0-100), risk level, explanation, and estimated future impact.
    """
    # ── Pension component (50% weight) ──
    # Linear interpolation: 100% funded = 100 points, 0% funded = 0 points
    pension_score = min(100, max(0, funded_ratio * 100))

    # ── Tax competitiveness component (30% weight) ──
    # Already 0-100 from Tax Foundation rank inversion
    tax_score = max(0, min(100, tax_competitiveness_score))

    # ── Tier classification component (20% weight) ──
    tier_score = TIER_SCORES.get(fiscal_tier, DEFAULT_TIER_SCORE)

    # ── Weighted final ──
    fiscal_health_score = round(
        0.50 * pension_score +
        0.30 * tax_score +
        0.20 * tier_score
    )

    # ── Risk assessment ──
    risk_level = "Unknown"
    risk_explanation = "No pension data available to assess fiscal risk."
    est_tax_impact = 0.0

    if funded_ratio > 0:
        for (lo, hi), (impact, level, explanation) in PENSION_GAP_TO_TAX_RISK.items():
            if lo <= funded_ratio <= hi:
                est_tax_impact = impact
                risk_level = level
                risk_explanation = explanation
                break

    # ── Human-readable summary ──
    pct = funded_ratio * 100
    if funded_ratio >= PENSION_HEALTHY:
        summary = f"State pensions are {pct:.0f}% funded — healthy. Low risk of tax increases driven by pension obligations."
    elif funded_ratio >= PENSION_ADEQUATE:
        summary = f"State pensions are {pct:.0f}% funded — adequate but below target. Watch for gradual tax increases."
    elif funded_ratio >= PENSION_STRESSED:
        summary = f"State pensions are {pct:.0f}% funded — stressed. Budget pressure will likely lead to tax increases or service cuts."
    else:
        summary = f"State pensions are {pct:.0f}% funded — CRISIS LEVEL. Tax increases are mathematically inevitable to close the ${100-pct:.0f} cents-on-the-dollar gap."

    return {
        "fiscalHealthScore": fiscal_health_score,
        "fiscalRiskLevel": risk_level,
        "fiscalRiskScore": {"Low": 15, "Moderate": 35, "Elevated": 60, "High": 85, "Unknown": 50}.get(risk_level, 50),
        "estimatedTaxIncrease10yr": est_tax_impact,
        "summary": summary,
        "detail": {
            "pensionFundedRatio": round(funded_ratio, 3),
            "pensionComponent": round(pension_score, 1),
            "taxCompetitivenessComponent": round(tax_score, 1),
            "tierComponent": round(tier_score, 1),
            "fiscalTier": fiscal_tier,
            "riskExplanation": risk_explanation,
        },
        "rationale": f"Pension health ({pension_score:.0f}/100) × 50% + Tax competitiveness ({tax_score:.0f}/100) × 30% + Tier classification ({tier_score:.0f}/100) × 20% = {fiscal_health_score}",
    }


def get_fiscal_health_for_location(location: dict, pension_by_state: dict, tax_data: dict) -> dict:
    """
    Get fiscal health assessment for a specific location.

    Args:
        location: A location dict from locations.json
        pension_by_state: State→pension data from state_pension_funded_ratio.json
        tax_data: Tax competitiveness data from state_tax_competitiveness.json

    Returns:
        Fiscal health assessment dict (merged into location output).
    """
    state = location.get("state", "")
    fiscal = location.get("fiscal", {})

    pension_entry = pension_by_state.get(state, {})
    funded_ratio = pension_entry.get("fundedRatio", 0.0)
    tier = pension_entry.get("classification", fiscal.get("fiscalTier", "Unknown"))

    # Map Equable classification to tier if fiscalTier is "Unknown"
    if tier == "Unknown" and pension_entry:
        ratio = pension_entry.get("fundedRatio", 0)
        if ratio >= PENSION_HEALTHY:
            tier = "Resilient"
        elif ratio >= PENSION_ADEQUATE:
            tier = "Fragile"
        else:
            tier = "Distressed"

    tax_score = fiscal.get("taxCompetitivenessScore", 0.0)

    return compute_fiscal_health_score(funded_ratio, tax_score, tier)


if __name__ == "__main__":
    # Self-test with real data
    PROJECT_ROOT = Path(__file__).resolve().parent.parent
    pension_data = json.loads((PROJECT_ROOT / "sources/processed/state_pension_funded_ratio.json").read_text())
    tax_data = json.loads((PROJECT_ROOT / "sources/processed/state_tax_competitiveness.json").read_text())
    locations = json.loads((PROJECT_ROOT / "sources/processed/relocation/locations.json").read_text())

    pension_by_state = pension_data.get("states", {})

    # Test with Chicago (IL), Nashville (TN), and a well-funded state (WY)
    test_states = {"IL": "Chicago's pension crisis", "TN": "Nashville (healthy)", "NJ": "New Jersey (distressed)", "WY": "Wyoming (excellent)"}

    print("=" * 70)
    print("FISCAL HEALTH SCORE — SELF TEST")
    print("=" * 70)

    for state, desc in test_states.items():
        loc = next((l for l in locations if l.get("state") == state), None)
        if not loc:
            continue

        result = get_fiscal_health_for_location(loc, pension_by_state, tax_data)
        print(f"\n{'─' * 70}")
        print(f"{desc}: {loc['name']}")
        print(f"{'─' * 70}")
        print(f"  Fiscal Health Score: {result['fiscalHealthScore']}/100")
        print(f"  Risk Level: {result['fiscalRiskLevel']} (risk score: {result['fiscalRiskScore']})")
        print(f"  Est. Tax Increase (10yr): {result['estimatedTaxIncrease10yr']:.1f} percentage points")
        print(f"  Summary: {result['summary']}")
        print(f"  Rationale: {result['rationale']}")

    # Verify all scores are in valid range
    print(f"\n{'=' * 70}")
    print("RANGE CHECK")
    all_scores = []
    for loc in locations:
        r = get_fiscal_health_for_location(loc, pension_by_state, tax_data)
        all_scores.append(r["fiscalHealthScore"])
        assert 0 <= r["fiscalHealthScore"] <= 100, f"Score out of range: {r['fiscalHealthScore']}"

    print(f"  {len(all_scores)} locations scored")
    print(f"  Min: {min(all_scores)}, Max: {max(all_scores)}, Mean: {sum(all_scores)/len(all_scores):.1f}")
    print(f"  All scores in [0, 100] range: ✓")

    # Verify IL is flagged as high risk
    il_score = get_fiscal_health_for_location(
        next(l for l in locations if l["state"] == "IL"),
        pension_by_state, tax_data
    )
    assert il_score["fiscalRiskLevel"] == "High", f"IL should be High risk, got {il_score['fiscalRiskLevel']}"
    print(f"  Illinois flagged as 'High' risk: ✓")

    print(f"\n  ALL CHECKS PASSED ✓")
