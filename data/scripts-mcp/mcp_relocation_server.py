#!/usr/bin/env python3
"""
Relocation Intelligence MCP Server

Exposes the location scoring engine as MCP tools so any AI agent can:
  - search_locations: filter 939 CBSAs by criteria
  - score_locations: rank by weighted preferences (MCDA engine)
  - compare_locations: side-by-side comparison
  - explain_score: why a location got its score

Data source: sources/processed/relocation/locations.json (939 CBSAs)
Scoring logic: port of app/src/lib/scoring.ts (computeNormalizationStats + scoreAll)

Run: python3 mcp_relocation_server.py
Protocol: MCP over stdio (JSON-RPC 2.0)
"""

from __future__ import annotations

import json
import os
import sys
import math
from pathlib import Path
from typing import Any

# ── Data loading ──────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOCATIONS_PATH = PROJECT_ROOT / "sources/processed/relocation/locations.json"
PENSION_PATH = PROJECT_ROOT / "sources/processed/state_pension_funded_ratio.json"
TAX_PATH = PROJECT_ROOT / "sources/processed/state_tax_competitiveness.json"

_locations_cache: list[dict] | None = None
_stats_cache: dict | None = None
_pension_cache: dict | None = None
_tax_cache: dict | None = None


def load_locations() -> list[dict]:
    global _locations_cache
    if _locations_cache is None:
        with open(LOCATIONS_PATH) as f:
            _locations_cache = json.load(f)
    return _locations_cache


def load_pension_data() -> dict:
    global _pension_cache
    if _pension_cache is None:
        with open(PENSION_PATH) as f:
            _pension_cache = json.load(f).get("states", {})
    return _pension_cache


def load_tax_data() -> dict:
    global _tax_cache
    if _tax_cache is None:
        with open(TAX_PATH) as f:
            _tax_cache = json.load(f)
    return _tax_cache


# ── Scoring engine (port of app/src/lib/scoring.ts) ───────────────────────

FIELD_PATHS = {
    "medianHomeValue": "cost.medianHomeValue",
    "medianRent": "cost.medianRent",
    "costOfLivingIndex": "cost.costOfLivingIndex",
    "propertyTaxRate": "cost.propertyTaxRate",
    "stateIncomeTaxRate": "cost.stateIncomeTaxRate",
    "taxCompetitivenessScore": "fiscal.taxCompetitivenessScore",
    "tornadoRiskScore": "climate.tornadoRiskScore",
    "hurricaneRiskScore": "climate.hurricaneRiskScore",
    "floodRiskScore": "climate.floodRiskScore",
    "earthquakeRiskScore": "climate.earthquakeRiskScore",
    "wildfireRiskScore": "climate.wildfireRiskScore",
    "daysMaxGt90FAnnual": "climate.daysMaxGt90FAnnual",
    "daysMinLt32FAnnual": "climate.daysMinLt32FAnnual",
    "sunshineHoursAnnual": "climate.sunshineHoursAnnual",
    "annualPrecipitationInches": "climate.annualPrecipitationInches",
    "healthcareAccessScore": "healthcare.healthcareAccessScore",
    "hospitalCountWithin10mi": "healthcare.hospitalCountWithin10mi",
    "violentCrimeRatePer100k": "crime.violentCrimeRatePer100k",
    "pctHouseholdsWith100MbpsPlus": "broadband.pctHouseholdsWith100MbpsPlus",
    "medianDownloadMbps": "broadband.medianDownloadMbps",
}


def _get_nested(obj: dict, path: str) -> float:
    val = obj
    for key in path.split("."):
        val = val.get(key, 0) if isinstance(val, dict) else 0
    return float(val) if val else 0.0


def compute_normalization_stats(locations: list[dict]) -> dict[str, dict]:
    """Compute min/max/n for each field, excluding 0.0 sentinels."""
    stats = {}
    for field, path in FIELD_PATHS.items():
        vals = [_get_nested(loc, path) for loc in locations]
        vals = [v for v in vals if v != 0 and v is not None and not math.isnan(v)]
        stats[field] = {
            "min": min(vals) if vals else 0,
            "max": max(vals) if vals else 1,
            "n": len(vals),
        }
    return stats


def _normalize(value: float, rmin: float, rmax: float, n: int, invert: bool = False) -> float:
    """Normalize to 0-100. invert=True means lower is better (cost, risk, crime)."""
    if n == 0 or value == 0 or rmax == rmin:
        return 0.0
    norm = (value - rmin) / (rmax - rmin)
    return round((1 - norm if invert else norm) * 100)


DEFAULT_WEIGHTS = {
    "cost": 5, "climate": 4, "safety": 3,
    "healthcare": 3, "jobs": 3, "outdoors": 3,
}


def score_location(
    loc: dict,
    weights: dict[str, int] | None = None,
    stats: dict | None = None,
    filters: dict | None = None,
) -> dict:
    """Score a single location. Returns scored dict with subscores + trace."""
    weights = weights or DEFAULT_WEIGHTS
    stats = stats or compute_normalization_stats(load_locations())
    filters = filters or {}

    fail_reasons: list[str] = []

    # ── Hard filters ──
    if filters.get("states") and loc.get("state") not in filters["states"]:
        fail_reasons.append(f"State {loc.get('state')} not in allowlist")
    if filters.get("excludeStates") and loc.get("state") in filters["excludeStates"]:
        fail_reasons.append(f"State {loc.get('state')} excluded")

    cost = loc.get("cost", {})
    climate = loc.get("climate", {})
    if filters.get("maxHomeValue") and cost.get("medianHomeValue", 0) > filters["maxHomeValue"]:
        fail_reasons.append(f"Home value ${cost.get('medianHomeValue', 0):,.0f} > ${filters['maxHomeValue']:,.0f}")
    if filters.get("maxRent") and cost.get("medianRent", 0) > filters["maxRent"]:
        fail_reasons.append(f"Rent ${cost.get('medianRent', 0):.0f} > ${filters['maxRent']}")
    for risk_key, risk_label in [("maxRiskTornado", "tornadoRiskScore"), ("maxRiskHurricane", "hurricaneRiskScore"),
                                  ("maxRiskEarthquake", "earthquakeRiskScore"), ("maxRiskWildfire", "wildfireRiskScore")]:
        if filters.get(risk_key) and climate.get(risk_label, 0) > filters[risk_key]:
            fail_reasons.append(f"{risk_label} {climate.get(risk_label, 0):.1f} > {filters[risk_key]}")
    if filters.get("maxHotDays") and climate.get("daysMaxGt90FAnnual", 0) > filters["maxHotDays"]:
        fail_reasons.append(f"Hot days {climate.get('daysMaxGt90FAnnual', 0):.0f} > {filters['maxHotDays']}")
    if filters.get("maxColdDays") and climate.get("daysMinLt32FAnnual", 0) > filters["maxColdDays"]:
        fail_reasons.append(f"Cold days {climate.get('daysMinLt32FAnnual', 0):.0f} > {filters['maxColdDays']}")

    def norm(field: str, value: float, invert: bool = False) -> float:
        r = stats[field]
        return _normalize(value, r["min"], r["max"], r["n"], invert)

    # ── Cost subscore (higher = more affordable) ──
    home_score = norm("medianHomeValue", cost.get("medianHomeValue", 0), True)
    rent_score = norm("medianRent", cost.get("medianRent", 0), True)
    col_score = norm("costOfLivingIndex", cost.get("costOfLivingIndex", 0), True) if stats["costOfLivingIndex"]["n"] > 0 else 0
    tax_score = norm("taxCompetitivenessScore", loc.get("fiscal", {}).get("taxCompetitivenessScore", 0))
    cost_parts = [(home_score, 0.35), (rent_score, 0.25)]
    if col_score > 0:
        cost_parts.append((col_score, 0.20))
    else:
        cost_parts.append((tax_score, 0.20))
    cost_parts.append((tax_score, 0.20))
    wsum = sum(w for _, w in cost_parts)
    cost_sub = round(sum(s * w for s, w in cost_parts) / wsum) if wsum else 0

    # ── Climate/risk subscore (higher = safer + milder) ──
    risk_scores = []
    for rk in ["earthquakeRiskScore", "tornadoRiskScore", "hurricaneRiskScore", "floodRiskScore", "wildfireRiskScore"]:
        v = climate.get(rk, 0)
        risk_scores.append(norm(rk.replace("RiskScore", "RiskScore"), v, True) if v > 0 else 100)
    climate_sub = round(sum(risk_scores) / len(risk_scores)) if risk_scores else 50

    # ── Safety subscore (higher = lower crime) ──
    crime = loc.get("crime", {})
    vc = crime.get("violentCrimeRatePer100k", 0)
    if vc > 0 and stats["violentCrimeRatePer100k"]["n"] > 0:
        safety_sub = norm("violentCrimeRatePer100k", vc, True)
    else:
        safety_sub = 50

    # ── Healthcare subscore ──
    hc = loc.get("healthcare", {})
    if hc.get("hospitalCountWithin10mi", 0) > 0 or hc.get("healthcareAccessScore", 0) > 0:
        hc_access = norm("healthcareAccessScore", hc.get("healthcareAccessScore", 0)) if hc.get("healthcareAccessScore", 0) > 0 else 50
        hc_count = norm("hospitalCountWithin10mi", hc.get("hospitalCountWithin10mi", 0)) if hc.get("hospitalCountWithin10mi", 0) > 0 else 0
        healthcare_sub = round((hc_access + hc_count) / 2)
    else:
        healthcare_sub = 50

    # ── Jobs subscore (tax competitiveness + broadband) ──
    bb = loc.get("broadband", {})
    bb_score = norm("pctHouseholdsWith100MbpsPlus", bb.get("pctHouseholdsWith100MbpsPlus", 0)) if bb.get("pctHouseholdsWith100MbpsPlus", 0) > 0 else 0
    jobs_sub = round(0.6 * tax_score + 0.4 * bb_score) if bb_score > 0 else tax_score

    # ── Outdoors subscore (sunshine high, precipitation moderate) ──
    sun = climate.get("sunshineHoursAnnual", 0)
    precip = climate.get("annualPrecipitationInches", 0)
    if sun > 0 or precip > 0:
        sun_score = norm("sunshineHoursAnnual", sun) if sun > 0 else 50
        precip_score = norm("annualPrecipitationInches", precip, True) if precip > 0 else 50
        outdoors_sub = round((sun_score + precip_score) / 2)
    else:
        outdoors_sub = 50

    subscores = {
        "cost": cost_sub, "climate": climate_sub, "safety": safety_sub,
        "healthcare": healthcare_sub, "jobs": jobs_sub, "outdoors": outdoors_sub,
    }

    # ── Weighted final ──
    w = weights
    w_sum = w.get("cost", 0) + w.get("climate", 0) + w.get("safety", 0) + w.get("healthcare", 0) + w.get("jobs", 0) + w.get("outdoors", 0)
    nw = {k: (w.get(k, 0) / w_sum if w_sum else 0) for k in ["cost", "climate", "safety", "healthcare", "jobs", "outdoors"]}

    match_score = round(
        nw["cost"] * cost_sub + nw["climate"] * climate_sub +
        nw["safety"] * safety_sub + nw["healthcare"] * healthcare_sub +
        nw["jobs"] * jobs_sub + nw["outdoors"] * outdoors_sub
    )

    # ── Trace ──
    trace: list[str] = []
    if match_score > 0:
        trace.append(f"Cost: {cost_sub}/100 (home ${cost.get('medianHomeValue', 0):,.0f}, rent ${cost.get('medianRent', 0):.0f})")
        trace.append(f"Risk: {climate_sub}/100 (tornado {climate.get('tornadoRiskScore', 0):.0f}, wildfire {climate.get('wildfireRiskScore', 0):.0f})")
        trace.append(f"Safety: {safety_sub}/100 (violent crime {vc:.0f}/100k)")
        trace.append(f"Healthcare: {healthcare_sub}/100 (hospitals {hc.get('hospitalCountWithin10mi', 0):.0f})")
        trace.append(f"Jobs: {jobs_sub}/100 (tax score {tax_score})")

    # ── Data gap warnings ──
    gaps: list[str] = []
    for field, path in FIELD_PATHS.items():
        if _get_nested(loc, path) == 0:
            gaps.append(field)

    return {
        "location": loc,
        "matchScore": match_score,
        "subscores": subscores,
        "passed": len(fail_reasons) == 0,
        "failReasons": fail_reasons,
        "trace": trace,
        "dataGaps": gaps,
    }


# ── MCP tool implementations ──────────────────────────────────────────────

def tool_search_locations(
    states: list[str] | None = None,
    exclude_states: list[str] | None = None,
    max_home_value: float | None = None,
    max_rent: float | None = None,
    max_violent_crime: float | None = None,
    max_risk_tornado: float | None = None,
    max_risk_hurricane: float | None = None,
    max_risk_earthquake: float | None = None,
    max_risk_wildfire: float | None = None,
    max_hot_days: float | None = None,
    max_cold_days: float | None = None,
    min_population: int | None = None,
    name_contains: str | None = None,
    limit: int = 20,
) -> str:
    """Search and filter locations by hard criteria. Returns matching CBSAs."""
    locations = load_locations()
    results = []

    for loc in locations:
        cost = loc.get("cost", {})
        climate = loc.get("climate", {})
        crime = loc.get("crime", {})

        if states and loc.get("state") not in states:
            continue
        if exclude_states and loc.get("state") in exclude_states:
            continue
        if max_home_value and cost.get("medianHomeValue", 0) > max_home_value:
            continue
        if max_rent and cost.get("medianRent", 0) > max_rent:
            continue
        if max_violent_crime and crime.get("violentCrimeRatePer100k", 9999) > max_violent_crime:
            continue
        if max_risk_tornado and climate.get("tornadoRiskScore", 0) > max_risk_tornado:
            continue
        if max_risk_hurricane and climate.get("hurricaneRiskScore", 0) > max_risk_hurricane:
            continue
        if max_risk_earthquake and climate.get("earthquakeRiskScore", 0) > max_risk_earthquake:
            continue
        if max_risk_wildfire and climate.get("wildfireRiskScore", 0) > max_risk_wildfire:
            continue
        if max_hot_days and climate.get("daysMaxGt90FAnnual", 0) > max_hot_days:
            continue
        if max_cold_days and climate.get("daysMinLt32FAnnual", 0) > max_cold_days:
            continue
        if name_contains and name_contains.lower() not in loc.get("name", "").lower():
            continue

        results.append({
            "id": loc["id"],
            "name": loc["name"],
            "state": loc["state"],
            "medianHomeValue": cost.get("medianHomeValue", 0),
            "medianRent": cost.get("medianRent", 0),
            "costOfLivingIndex": cost.get("costOfLivingIndex", 0),
            "violentCrimeRatePer100k": crime.get("violentCrimeRatePer100k", 0),
            "tornadoRiskScore": climate.get("tornadoRiskScore", 0),
            "wildfireRiskScore": climate.get("wildfireRiskScore", 0),
            "earthquakeRiskScore": climate.get("earthquakeRiskScore", 0),
            "daysMaxGt90FAnnual": climate.get("daysMaxGt90FAnnual", 0),
            "daysMinLt32FAnnual": climate.get("daysMinLt32FAnnual", 0),
        })

    return json.dumps({
        "count": len(results),
        "returned": len(results[:limit]),
        "locations": results[:limit],
    }, indent=2)


def tool_score_locations(
    weights: dict[str, int] | None = None,
    states: list[str] | None = None,
    exclude_states: list[str] | None = None,
    max_home_value: float | None = None,
    max_rent: float | None = None,
    max_risk_tornado: float | None = None,
    max_risk_hurricane: float | None = None,
    max_risk_earthquake: float | None = None,
    max_risk_wildfire: float | None = None,
    max_hot_days: float | None = None,
    max_cold_days: float | None = None,
    limit: int = 20,
) -> str:
    """Rank all 939 CBSAs by weighted preferences. Returns scored + ranked list."""
    locations = load_locations()
    stats = compute_normalization_stats(locations)

    weights = weights or DEFAULT_WEIGHTS
    filters = {k: v for k, v in locals().items() if v is not None and k not in ("weights", "limit", "locations", "stats")}
    # rename to filter keys matching score_location
    filter_map = {
        "exclude_states": "excludeStates",
        "max_home_value": "maxHomeValue",
        "max_rent": "maxRent",
        "max_risk_tornado": "maxRiskTornado",
        "max_risk_hurricane": "maxRiskHurricane",
        "max_risk_earthquake": "maxRiskEarthquake",
        "max_risk_wildfire": "maxRiskWildfire",
        "max_hot_days": "maxHotDays",
        "max_cold_days": "maxColdDays",
    }
    clean_filters = {}
    for k, v in filters.items():
        clean_filters[filter_map.get(k, k)] = v

    scored = [score_location(loc, weights, stats, clean_filters) for loc in locations]
    scored.sort(key=lambda s: s["matchScore"], reverse=True)

    passed = [s for s in scored if s["passed"]]
    failed = [s for s in scored if not s["passed"]]

    return json.dumps({
        "totalScored": len(scored),
        "passedFilters": len(passed),
        "returned": len(passed[:limit]),
        "weights": weights,
        "topMatches": [{
            "rank": i + 1,
            "id": s["location"]["id"],
            "name": s["location"]["name"],
            "state": s["location"]["state"],
            "matchScore": s["matchScore"],
            "subscores": s["subscores"],
            "trace": s["trace"],
            "dataGaps": s["dataGaps"][:5] if s["dataGaps"] else [],
            "keyMetrics": {
                "medianHomeValue": s["location"].get("cost", {}).get("medianHomeValue", 0),
                "medianRent": s["location"].get("cost", {}).get("medianRent", 0),
                "costOfLivingIndex": s["location"].get("cost", {}).get("costOfLivingIndex", 0),
                "violentCrimeRatePer100k": s["location"].get("crime", {}).get("violentCrimeRatePer100k", 0),
                "tornadoRiskScore": s["location"].get("climate", {}).get("tornadoRiskScore", 0),
                "daysMaxGt90FAnnual": s["location"].get("climate", {}).get("daysMaxGt90FAnnual", 0),
                "healthcareAccessScore": s["location"].get("healthcare", {}).get("healthcareAccessScore", 0),
            },
        } for i, s in enumerate(passed[:limit])],
    }, indent=2)


def tool_compare_locations(location_ids: list[str], weights: dict[str, int] | None = None) -> str:
    """Compare 2-N locations side-by-side across all dimensions."""
    locations = load_locations()
    stats = compute_normalization_stats(locations)
    weights = weights or DEFAULT_WEIGHTS

    locs_by_id = {loc["id"]: loc for loc in locations}
    results = []

    def find_location(query: str) -> dict | None:
        # Exact match
        if query in locs_by_id:
            return locs_by_id[query]
        q = query.lower()
        # Split into city + state (e.g. 'austin-tx' → city='austin', state='tx')
        parts = q.rsplit("-", 1)
        city = parts[0]
        state = parts[1] if len(parts) > 1 else ""
        # Match: location ID starts with city AND ends with state
        candidates = []
        for l in locations:
            lid = l["id"].lower()
            name = l["name"].lower()
            if lid.startswith(city) and (not state or lid.endswith("-" + state)):
                candidates.append(l)
            elif city in name.split(",")[0].lower() and (not state or l.get("state", "").lower() == state):
                candidates.append(l)
        return candidates[0] if candidates else None

    for loc_id in location_ids:
        loc = find_location(loc_id)
        if loc:
            scored = score_location(loc, weights, stats)
            results.append({
                "id": loc["id"],
                "name": loc["name"],
                "state": loc["state"],
                "matchScore": scored["matchScore"],
                "subscores": scored["subscores"],
                "cost": loc.get("cost", {}),
                "climate": loc.get("climate", {}),
                "crime": loc.get("crime", {}),
                "healthcare": loc.get("healthcare", {}),
                "broadband": loc.get("broadband", {}),
                "fiscal": loc.get("fiscal", {}),
                "dataGaps": scored["dataGaps"],
            })

    if len(results) < 2:
        return json.dumps({"error": "Need at least 2 valid location IDs. Use search_locations to find IDs."})

    # Build comparison matrix (numeric values only)
    metrics = {}
    for r in results:
        for cat in ["cost", "climate", "crime", "healthcare", "broadband", "fiscal"]:
            for k, v in r.get(cat, {}).items():
                key = f"{cat}.{k}"
                if not isinstance(v, (int, float)):
                    continue
                if key not in metrics:
                    metrics[key] = []
                metrics[key].append(v)

    return json.dumps({
        "locations": results,
        "comparison": {k: {"values": v, "best": min(v) if ("Risk" in k or "crime" in k or "Value" in k or "Rate" in k or "Rent" in k or "Tax" in k) else max(v)} for k, v in metrics.items()},
        "winner": max(results, key=lambda r: r["matchScore"])["name"],
    }, indent=2)


def tool_explain_score(location_id: str, weights: dict[str, int] | None = None) -> str:
    """Explain why a location got its score. Returns full score trace + data gaps."""
    locations = load_locations()
    stats = compute_normalization_stats(locations)
    weights = weights or DEFAULT_WEIGHTS

    locs_by_id = {l["id"]: l for l in locations}
    loc = locs_by_id.get(location_id)
    if not loc:
        q = location_id.lower()
        parts = q.rsplit("-", 1)
        city = parts[0]
        state = parts[1] if len(parts) > 1 else ""
        candidates = []
        for l in locations:
            lid = l["id"].lower()
            name = l["name"].lower()
            if lid.startswith(city) and (not state or lid.endswith("-" + state)):
                candidates.append(l)
            elif city in name.split(",")[0].lower() and (not state or l.get("state", "").lower() == state):
                candidates.append(l)
        loc = candidates[0] if candidates else None
    if not loc:
        return json.dumps({"error": f"Location '{location_id}' not found. Use search_locations to find valid IDs."})

    scored = score_location(loc, weights, stats)

    return json.dumps({
        "location": {
            "id": loc["id"],
            "name": loc["name"],
            "state": loc["state"],
        },
        "matchScore": scored["matchScore"],
        "subscores": scored["subscores"],
        "explanation": scored["trace"],
        "dataGaps": {
            "count": len(scored["dataGaps"]),
            "fields": scored["dataGaps"],
            "note": f"{len(scored['dataGaps'])} of 20 metrics have no data (0.0 sentinel). Scores use neutral 50 for missing categories.",
        },
        "weightsUsed": weights,
        "allMetrics": {
            "cost": loc.get("cost", {}),
            "climate": loc.get("climate", {}),
            "crime": loc.get("crime", {}),
            "healthcare": loc.get("healthcare", {}),
            "broadband": loc.get("broadband", {}),
            "fiscal": loc.get("fiscal", {}),
            "amenities": loc.get("amenities", {}),
            "blended": loc.get("blended", {}),
        },
    }, indent=2)


def tool_fiscal_health(location_id: str) -> str:
    """Assess the fiscal health of a location's state — predicts future tax burden.

    Uses pension funded ratios, tax competitiveness, and fiscal tier classification
    to forecast whether residents face tax increases or service cuts.
    This is a LEADING indicator: it tells you where taxes are HEADING, not just
    where they are today.
    """
    # Import inline to avoid module path issues
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from fiscal_health import get_fiscal_health_for_location

    locations = load_locations()
    pension_by_state = load_pension_data()
    tax_data = load_tax_data()

    locs_by_id = {l["id"]: l for l in locations}
    loc = locs_by_id.get(location_id)
    if not loc:
        q = location_id.lower()
        parts = q.rsplit("-", 1)
        city = parts[0]
        state = parts[1] if len(parts) > 1 else ""
        candidates = []
        for l in locations:
            lid = l["id"].lower()
            name = l["name"].lower()
            if lid.startswith(city) and (not state or lid.endswith("-" + state)):
                candidates.append(l)
            elif city in name.split(",")[0].lower() and (not state or l.get("state", "").lower() == state):
                candidates.append(l)
        loc = candidates[0] if candidates else None
    if not loc:
        return json.dumps({"error": f"Location '{location_id}' not found."})

    result = get_fiscal_health_for_location(loc, pension_by_state, tax_data)

    return json.dumps({
        "location": {
            "id": loc["id"],
            "name": loc["name"],
            "state": loc["state"],
        },
        **result,
    }, indent=2)


# ── MCP protocol (JSON-RPC over stdio) ────────────────────────────────────

TOOL_SCHEMAS = [
    {
        "name": "search_locations",
        "description": "Search and filter US metro areas (939 CBSAs) by criteria like state, max home value, crime rate, disaster risk, climate. Returns matching locations with key metrics. Use this to narrow down candidates before scoring.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "states": {"type": "array", "items": {"type": "string"}, "description": "State codes to include (e.g., ['TX','FL','TN'])"},
                "excludeStates": {"type": "array", "items": {"type": "string"}, "description": "State codes to exclude"},
                "maxHomeValue": {"type": "number", "description": "Maximum median home value in USD"},
                "maxRent": {"type": "number", "description": "Maximum median monthly rent in USD"},
                "maxViolentCrime": {"type": "number", "description": "Maximum violent crime rate per 100k"},
                "maxRiskTornado": {"type": "number", "description": "Maximum FEMA tornado risk score (0-100)"},
                "maxRiskHurricane": {"type": "number", "description": "Maximum FEMA hurricane risk score"},
                "maxRiskEarthquake": {"type": "number", "description": "Maximum FEMA earthquake risk score"},
                "maxRiskWildfire": {"type": "number", "description": "Maximum FEMA wildfire risk score"},
                "maxHotDays": {"type": "number", "description": "Max days >90°F per year"},
                "maxColdDays": {"type": "number", "description": "Max days <32°F per year"},
                "nameContains": {"type": "string", "description": "Filter by name (case-insensitive)"},
                "limit": {"type": "integer", "default": 20, "description": "Max results to return"},
            },
        },
    },
    {
        "name": "score_locations",
        "description": "Rank all 939 US metro areas by weighted preferences (Multi-Criteria Decision Analysis). Pass category weights (0-5 each) and optional hard filters. Returns ranked matches with match scores (0-100), subscores per category, and explanation traces.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "weights": {
                    "type": "object",
                    "description": "Category weights (0=ignore, 5=critical). All default to 3.",
                    "properties": {
                        "cost": {"type": "integer", "description": "Affordability: home prices, rent, taxes, cost of living"},
                        "climate": {"type": "integer", "description": "Low disaster risk: earthquake, tornado, hurricane, wildfire, flood"},
                        "safety": {"type": "integer", "description": "Low crime rates"},
                        "healthcare": {"type": "integer", "description": "Hospital access and healthcare quality"},
                        "jobs": {"type": "integer", "description": "Tax competitiveness + broadband access"},
                        "outdoors": {"type": "integer", "description": "Sunshine hours, low precipitation"},
                    },
                },
                "states": {"type": "array", "items": {"type": "string"}, "description": "State codes to include"},
                "excludeStates": {"type": "array", "items": {"type": "string"}, "description": "State codes to exclude"},
                "maxHomeValue": {"type": "number", "description": "Hard filter: max median home value USD"},
                "maxRent": {"type": "number", "description": "Hard filter: max median monthly rent USD"},
                "maxRiskTornado": {"type": "number"},
                "maxRiskHurricane": {"type": "number"},
                "maxRiskEarthquake": {"type": "number"},
                "maxRiskWildfire": {"type": "number"},
                "maxHotDays": {"type": "number"},
                "maxColdDays": {"type": "number"},
                "limit": {"type": "integer", "default": 20},
            },
        },
    },
    {
        "name": "compare_locations",
        "description": "Compare 2 or more locations side-by-side across all dimensions (cost, climate, crime, healthcare, etc.) with a computed winner. Pass location IDs (e.g., 'austin-tx', 'denver-co'). Use search_locations first to find IDs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "locationIds": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Location IDs to compare (e.g., ['austin-tx','nashville-tn'])",
                    "minItems": 2,
                },
                "weights": {
                    "type": "object",
                    "description": "Optional scoring weights for determining the winner",
                    "properties": {
                        "cost": {"type": "integer"},
                        "climate": {"type": "integer"},
                        "safety": {"type": "integer"},
                        "healthcare": {"type": "integer"},
                        "jobs": {"type": "integer"},
                        "outdoors": {"type": "integer"},
                    },
                },
            },
            "required": ["locationIds"],
        },
    },
    {
        "name": "explain_score",
        "description": "Get a detailed breakdown of WHY a location received its score — subscores per category, human-readable explanation trace, and which data fields are missing (0.0 sentinel). Useful for transparency and debugging rankings.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "locationId": {"type": "string", "description": "Location ID (e.g., 'memphis-tn') or partial name match"},
                "weights": {
                    "type": "object",
                    "description": "Optional scoring weights",
                    "properties": {
                        "cost": {"type": "integer"},
                        "climate": {"type": "integer"},
                        "safety": {"type": "integer"},
                        "healthcare": {"type": "integer"},
                        "jobs": {"type": "integer"},
                        "outdoors": {"type": "integer"},
                    },
                },
            },
            "required": ["locationId"],
        },
    },
    {
        "name": "fiscal_health",
        "description": "Assess the fiscal health of a location's state — predicts FUTURE tax burden based on pension debt, tax trajectory, and fiscal tier. Answers: 'Will my taxes go up in 5 years because the state can't pay its bills?' Returns a fiscal health score (0-100), risk level, estimated tax increase over 10 years, and human-readable explanation. This is the platform's key differentiator.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "locationId": {"type": "string", "description": "Location ID (e.g., 'chicago-il') or partial name match"},
            },
            "required": ["locationId"],
        },
    },
]


def handle_request(msg: dict) -> dict | None:
    """Process one JSON-RPC request and return response."""
    method = msg.get("method", "")
    msg_id = msg.get("id")
    params = msg.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "relocation-intelligence", "version": "1.0.0"},
            },
        }

    if method == "initialized":
        return None  # notification, no response

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOL_SCHEMAS}}

    if method == "tools/call":
        tool_name = params.get("name")
        args = params.get("arguments", {})

        # Translate camelCase schema args → snake_case function params
        CAMEL_TO_SNAKE = {
            "excludeStates": "exclude_states",
            "maxHomeValue": "max_home_value",
            "maxRent": "max_rent",
            "maxViolentCrime": "max_violent_crime",
            "maxRiskTornado": "max_risk_tornado",
            "maxRiskHurricane": "max_risk_hurricane",
            "maxRiskEarthquake": "max_risk_earthquake",
            "maxRiskWildfire": "max_risk_wildfire",
            "maxHotDays": "max_hot_days",
            "maxColdDays": "max_cold_days",
            "nameContains": "name_contains",
            "locationIds": "location_ids",
            "locationId": "location_id",
        }
        clean_args = {CAMEL_TO_SNAKE.get(k, k): v for k, v in args.items()}

        try:
            if tool_name == "search_locations":
                result = tool_search_locations(**clean_args)
            elif tool_name == "score_locations":
                result = tool_score_locations(**clean_args)
            elif tool_name == "compare_locations":
                result = tool_compare_locations(**clean_args)
            elif tool_name == "explain_score":
                result = tool_explain_score(**clean_args)
            elif tool_name == "fiscal_health":
                result = tool_fiscal_health(**clean_args)
            else:
                return {
                    "jsonrpc": "2.0", "id": msg_id,
                    "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"},
                }

            return {
                "jsonrpc": "2.0", "id": msg_id,
                "result": {"content": [{"type": "text", "text": result}]},
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0", "id": msg_id,
                "error": {"code": -32603, "message": f"Tool error: {e}"},
            }

    if method == "ping":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {}}

    # Unknown method
    if msg_id is not None:
        return {
            "jsonrpc": "2.0", "id": msg_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }
    return None


def main():
    """JSON-RPC over stdio loop."""
    # Signal readiness
    sys.stderr.write("[relocation-mcp] Server ready\n")
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Handle batch requests
        if isinstance(msg, list):
            responses = []
            for m in msg:
                resp = handle_request(m)
                if resp:
                    responses.append(resp)
            if responses:
                sys.stdout.write(json.dumps(responses) + "\n")
                sys.stdout.flush()
        else:
            resp = handle_request(msg)
            if resp:
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()


if __name__ == "__main__":
    main()
