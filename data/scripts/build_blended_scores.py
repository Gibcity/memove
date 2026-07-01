#!/usr/bin/env python3
"""
build_blended_scores.py — Compute blended scores for all 939 CBSAs.

Uses the same subscore logic as app/src/lib/scoring.ts:
  - Per-category subscores (cost, climate, safety, healthcare, jobs, outdoors)
    computed via min-max normalization (excluding 0.0 sentinels).
  - costScore0to50: percentile-based. Compute percentile of medianHomeValue
    (higher home value = higher percentile = worse), then
    costScore0to50 = 0.5 * (100 - percentile). Range 0-50, higher = more affordable.
  - lifeScore0to50: weighted average of (climate, safety, healthcare, jobs, outdoors)
    subscores using scoring.ts default weights renormalized without cost,
    then scaled to 0-50.
  - totalScore0to100 = costScore0to50 + lifeScore0to50.

Output: sources/processed/blended_scores.json
  {"metadata": {...}, "blended": {"location-id": {"costScore0to50": ..., ...}, ...}}
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
LOCATIONS_PATH = ROOT / "sources/processed/relocation/locations.json"
OUT_PATH = ROOT / "sources/processed/blended_scores.json"

# ── Normalization stats (same fields as scoring.ts computeNormalizationStats) ──

FIELD_PATH = {
    "medianHomeValue": ["cost", "medianHomeValue"],
    "medianRent": ["cost", "medianRent"],
    "costOfLivingIndex": ["cost", "costOfLivingIndex"],
    "propertyTaxRate": ["cost", "propertyTaxRate"],
    "stateIncomeTaxRate": ["cost", "stateIncomeTaxRate"],
    "taxCompetitivenessScore": ["fiscal", "taxCompetitivenessScore"],
    "tornadoRiskScore": ["climate", "tornadoRiskScore"],
    "hurricaneRiskScore": ["climate", "hurricaneRiskScore"],
    "floodRiskScore": ["climate", "floodRiskScore"],
    "earthquakeRiskScore": ["climate", "earthquakeRiskScore"],
    "wildfireRiskScore": ["climate", "wildfireRiskScore"],
    "daysMaxGt90FAnnual": ["climate", "daysMaxGt90FAnnual"],
    "daysMinLt32FAnnual": ["climate", "daysMinLt32FAnnual"],
    "sunshineHoursAnnual": ["climate", "sunshineHoursAnnual"],
    "annualPrecipitationInches": ["climate", "annualPrecipitationInches"],
    "healthcareAccessScore": ["healthcare", "healthcareAccessScore"],
    "hospitalCountWithin10mi": ["healthcare", "hospitalCountWithin10mi"],
    "violentCrimeRatePer100k": ["crime", "violentCrimeRatePer100k"],
    "pctHouseholdsWith100MbpsPlus": ["broadband", "pctHouseholdsWith100MbpsPlus"],
    "medianDownloadMbps": ["broadband", "medianDownloadMbps"],
}


def get_nested(obj, path):
    """Navigate obj through path list, returning value or 0."""
    for key in path:
        obj = obj.get(key, 0) if isinstance(obj, dict) else 0
    return obj if isinstance(obj, (int, float)) else 0


def compute_normalization_stats(locations):
    """Compute min/max/n for each field, excluding zero sentinels."""
    fields = list(FIELD_PATH.keys())
    stats = {}
    for field in fields:
        path = FIELD_PATH[field]
        vals = []
        for loc in locations:
            v = get_nested(loc, path)
            if v != 0 and v is not None and not math.isnan(v):
                vals.append(v)
        stats[field] = {
            "min": min(vals) if vals else 0,
            "max": max(vals) if vals else 1,
            "n": len(vals),
        }
    return stats


def normalize(value, range_stats, invert=False):
    """Min-max normalize to 0-100. invert=True means lower is better."""
    if range_stats["n"] == 0 or value == 0 or range_stats["max"] == range_stats["min"]:
        return 0
    norm = (value - range_stats["min"]) / (range_stats["max"] - range_stats["min"])
    return round((1 - norm if invert else norm) * 100)


def avg(*vals):
    return round(sum(vals) / len(vals))


def weighted_avg(vals, weights):
    w_sum = sum(weights)
    weighted = sum(v * w for v, w in zip(vals, weights))
    return round(weighted / w_sum)


def compute_subscores(loc, stats):
    """Compute per-category subscores (0-100) using scoring.ts logic."""

    # ── COST subscore ──
    home_score = normalize(
        get_nested(loc, FIELD_PATH["medianHomeValue"]),
        stats["medianHomeValue"], invert=True
    )
    rent_score = normalize(
        get_nested(loc, FIELD_PATH["medianRent"]),
        stats["medianRent"], invert=True
    )
    col_score = (
        normalize(
            get_nested(loc, FIELD_PATH["costOfLivingIndex"]),
            stats["costOfLivingIndex"], invert=True
        )
        if stats["costOfLivingIndex"]["n"] > 0 else 0
    )
    tax_score = normalize(
        get_nested(loc, FIELD_PATH["taxCompetitivenessScore"]),
        stats["taxCompetitivenessScore"], invert=False
    )

    cost_parts = [home_score, rent_score]
    cost_weights = [0.35, 0.25]
    if col_score > 0:
        cost_parts.append(col_score)
        cost_weights.append(0.20)
    cost_parts.append(tax_score)
    cost_weights.append(0.20)
    cost_sub = weighted_avg(cost_parts, cost_weights)

    # ── CLIMATE/RISK subscore ──
    eq_val = get_nested(loc, FIELD_PATH["earthquakeRiskScore"])
    eq_score = normalize(eq_val, stats["earthquakeRiskScore"], invert=True) if eq_val > 0 else 100
    tor_val = get_nested(loc, FIELD_PATH["tornadoRiskScore"])
    tor_score = normalize(tor_val, stats["tornadoRiskScore"], invert=True) if tor_val > 0 else 100
    hurr_val = get_nested(loc, FIELD_PATH["hurricaneRiskScore"])
    hurr_score = normalize(hurr_val, stats["hurricaneRiskScore"], invert=True) if hurr_val > 0 else 100
    flood_val = get_nested(loc, FIELD_PATH["floodRiskScore"])
    flood_score = normalize(flood_val, stats["floodRiskScore"], invert=True) if flood_val > 0 else 100
    wf_val = get_nested(loc, FIELD_PATH["wildfireRiskScore"])
    wf_score = normalize(wf_val, stats["wildfireRiskScore"], invert=True) if wf_val > 0 else 100
    climate_sub = avg(eq_score, tor_score, hurr_score, flood_score, wf_score)

    # ── SAFETY subscore ──
    crime_val = get_nested(loc, FIELD_PATH["violentCrimeRatePer100k"])
    if crime_val > 0 and stats["violentCrimeRatePer100k"]["n"] > 0:
        safety_sub = normalize(crime_val, stats["violentCrimeRatePer100k"], invert=True)
    else:
        safety_sub = 50  # neutral

    # ── HEALTHCARE subscore ──
    hc_access_val = get_nested(loc, FIELD_PATH["healthcareAccessScore"])
    hc_count_val = get_nested(loc, FIELD_PATH["hospitalCountWithin10mi"])
    if hc_access_val > 0 or hc_count_val > 0:
        hc_access = (
            normalize(hc_access_val, stats["healthcareAccessScore"], invert=False)
            if hc_access_val > 0 else 50
        )
        hc_count = (
            normalize(hc_count_val, stats["hospitalCountWithin10mi"], invert=False)
            if hc_count_val > 0 else 0
        )
        healthcare_sub = avg(hc_access, hc_count)
    else:
        healthcare_sub = 50

    # ── JOBS subscore ──
    bb_score = (
        normalize(
            get_nested(loc, FIELD_PATH["pctHouseholdsWith100MbpsPlus"]),
            stats["pctHouseholdsWith100MbpsPlus"], invert=False
        )
        if get_nested(loc, FIELD_PATH["pctHouseholdsWith100MbpsPlus"]) > 0 else 0
    )
    if bb_score > 0:
        jobs_sub = weighted_avg([tax_score, bb_score], [0.6, 0.4])
    else:
        jobs_sub = tax_score

    # ── OUTDOORS subscore ──
    sun_val = get_nested(loc, FIELD_PATH["sunshineHoursAnnual"])
    precip_val = get_nested(loc, FIELD_PATH["annualPrecipitationInches"])
    if sun_val > 0 or precip_val > 0:
        sun = (
            normalize(sun_val, stats["sunshineHoursAnnual"], invert=False)
            if sun_val > 0 else 50
        )
        precip = (
            normalize(precip_val, stats["annualPrecipitationInches"], invert=True)
            if precip_val > 0 else 50
        )
        outdoors_sub = avg(sun, precip)
    else:
        outdoors_sub = 50

    return {
        "cost": cost_sub,
        "climate": climate_sub,
        "safety": safety_sub,
        "healthcare": healthcare_sub,
        "jobs": jobs_sub,
        "outdoors": outdoors_sub,
    }


# ── Blended score computation ──

def compute_blended(locations, subscores_list):
    """
    Compute blended scores from subscores.

    costScore0to50: percentile-based on medianHomeValue.
      - Compute percentile rank of medianHomeValue (higher value = higher percentile = worse).
      - costScore0to50 = 0.5 * (100 - percentile).

    lifeScore0to50: weighted avg of non-cost subscores, scaled to 0-50.
      - Default weights (from scoring.ts): climate=4, safety=3, healthcare=3, jobs=3, outdoors=3.
      - Sum without cost = 16. Normalized: climate=0.25, safety=0.1875, etc.
      - lifeScore0to50 = 0.5 * weighted_avg(...)
    """
    # Cost percentile: rank by medianHomeValue (exclude 0.0 sentinels)
    home_values = []
    for loc in locations:
        hv = get_nested(loc, FIELD_PATH["medianHomeValue"])
        if hv > 0:
            home_values.append((loc["id"], hv))

    home_values.sort(key=lambda x: x[1])  # ascending: cheapest first
    n = len(home_values)
    cost_percentile = {}
    for rank_zero, (lid, hv) in enumerate(home_values):
        percentile = (rank_zero / (n - 1)) * 100 if n > 1 else 50
        cost_percentile[lid] = percentile

    # Life weights (scoring.ts default, renormalized without cost)
    # weights: cost=5, climate=4, safety=3, healthcare=3, jobs=3, outdoors=3
    life_weights = {
        "climate": 4 / 16,
        "safety": 3 / 16,
        "healthcare": 3 / 16,
        "jobs": 3 / 16,
        "outdoors": 3 / 16,
    }

    blended = {}
    for loc, subs in zip(locations, subscores_list):
        lid = loc["id"]

        # costScore0to50
        cp = cost_percentile.get(lid, 50)
        cost_score = round(0.5 * (100 - cp), 1)

        # lifeScore0to50
        life_weighted = (
            life_weights["climate"] * subs["climate"]
            + life_weights["safety"] * subs["safety"]
            + life_weights["healthcare"] * subs["healthcare"]
            + life_weights["jobs"] * subs["jobs"]
            + life_weights["outdoors"] * subs["outdoors"]
        )
        life_score = round(0.5 * life_weighted, 1)

        total = round(cost_score + life_score, 1)

        blended[lid] = {
            "costScore0to50": cost_score,
            "lifeScore0to50": life_score,
            "totalScore0to100": total,
        }

    return blended


# ── Main ──

def main():
    print(f"[blended-scores] Loading locations from {LOCATIONS_PATH}")
    with open(LOCATIONS_PATH) as f:
        locations = json.load(f)

    n = len(locations)
    print(f"[blended-scores] Loaded {n} locations")

    # Compute normalization stats
    print("[blended-scores] Computing normalization stats...")
    stats = compute_normalization_stats(locations)

    # Compute subscores for each location
    print("[blended-scores] Computing subscores...")
    subscores_list = []
    for loc in locations:
        subs = compute_subscores(loc, stats)
        subscores_list.append(subs)

    # Compute blended scores
    print("[blended-scores] Computing blended scores...")
    blended = compute_blended(locations, subscores_list)

    # Verify all IDs match
    loc_ids = {loc["id"] for loc in locations}
    blended_ids = set(blended.keys())
    missing = loc_ids - blended_ids
    extra = blended_ids - loc_ids
    if missing:
        print(f"WARNING: {len(missing)} location IDs missing from blended output")
    if extra:
        print(f"WARNING: {len(extra)} extra IDs in blended output")
    assert not missing, f"Missing IDs: {missing}"
    assert not extra, f"Extra IDs: {extra}"
    print(f"[blended-scores] All {n} IDs verified ✓")

    # Build output
    output = {
        "metadata": {
            "source": "internal_pipeline",
            "script": "sources/scripts/build_blended_scores.py",
            "scoring_engine": "app/src/lib/scoring.ts (replicated in Python)",
            "normalization_cost": "percentile (rank of medianHomeValue, higher value = worse)",
            "normalization_life": "min-max (same as scoring.ts), scaled to 0-50 via 0.5 * weighted_avg",
            "weights_life": {
                "climate": 0.25,
                "safety": 0.1875,
                "healthcare": 0.1875,
                "jobs": 0.1875,
                "outdoors": 0.1875,
            },
            "note": "Default user weights from scoring.ts (cost=5, climate=4, safety=3, healthcare=3, jobs=3, outdoors=3), renormalized without cost",
            "location_count": n,
            "blended_count": len(blended),
        },
        "blended": blended,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)
    print(f"[blended-scores] Wrote {OUT_PATH}")

    # Quick stats
    cost_scores = [v["costScore0to50"] for v in blended.values()]
    life_scores = [v["lifeScore0to50"] for v in blended.values()]
    totals = [v["totalScore0to100"] for v in blended.values()]
    print(f"\nBlended score ranges:")
    print(f"  costScore0to50:  {min(cost_scores):.1f} – {max(cost_scores):.1f}")
    print(f"  lifeScore0to50:  {min(life_scores):.1f} – {max(life_scores):.1f}")
    print(f"  totalScore0to100: {min(totals):.1f} – {max(totals):.1f}")

    # Top/bottom 5
    ranked = sorted(blended.items(), key=lambda x: -x[1]["totalScore0to100"])
    print(f"\nTop 5 blended:")
    for lid, scores in ranked[:5]:
        print(f"  {lid:40s} cost={scores['costScore0to50']:5.1f}  life={scores['lifeScore0to50']:5.1f}  total={scores['totalScore0to100']:5.1f}")
    print(f"Bottom 5 blended:")
    for lid, scores in ranked[-5:]:
        print(f"  {lid:40s} cost={scores['costScore0to50']:5.1f}  life={scores['lifeScore0to50']:5.1f}  total={scores['totalScore0to100']:5.1f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
