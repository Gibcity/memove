#!/usr/bin/env python3
"""build_locations.py v2 — bridge processed data into zod Location[] schema.

Consumes all 6 data sources. Master geography table: census_acs_cbsa.json (939 CBSAs).
Joins BEA RPP (cost-of-living), FBI UCR (crime), FEMA NRI (risk scores),
metros.json (legacy rich data for 59 metros), state tax competitiveness,
and NOAA climate normals.

The zod schema uses z.number() (NOT nullable) for almost every field, so
missing data is set to 0.0 as a sentinel — never null. The gap report
tracks fill rates.

Usage:
    python3 sources/scripts/build_locations.py
    # -> sources/processed/relocation/locations.json
    # -> sources/processed/relocation/gap-report.json
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

PROCESSED = Path(__file__).resolve().parent.parent / "processed"
RAW = Path(__file__).resolve().parent.parent / "raw"
OUTPUT_DIR = PROCESSED / "relocation"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# Total non-optional schema fields per location (excludes education.optional())
FIELDS_PER_LOCATION = 35


# ── helpers ──────────────────────────────────────────────────────────────

def load_json(name: str, base: Path = PROCESSED) -> dict | list:
    with open(base / name) as f:
        return json.load(f)


def _safe_float(v) -> float:
    """Convert to float, returning 0.0 for None/empty/invalid (sentinel for gaps)."""
    if v is None or (isinstance(v, str) and v.strip() == ""):
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _provenance(source: str, url: str, license_: str = "public_domain") -> dict:
    return {
        "source": source,
        "pulledAt": "2026-06-28",
        "license": license_,
        "url": url,
    }


# ── state abbreviation ↔ full name ────────────────────────────────────────

_STATE_ABBR_TO_NAME = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming",
    # Territories that appear in CBSA data
    "PR": "Puerto Rico",
}


# ── CBSA name parsing ─────────────────────────────────────────────────────

def extract_state(cbsa_name: str) -> str:
    """Extract primary state abbreviation from a CBSA name.

    Format: "City, ST Metro Area" or "City, ST-ST Micro Area"
    Returns the first 2-letter state code after the comma.
    """
    m = re.search(r",\s*([A-Z]{2})", cbsa_name)
    return m.group(1) if m else ""


def extract_primary_city(cbsa_name: str) -> str:
    """Extract the primary city name from a CBSA name.

    "Aberdeen, SD Micro Area" → "Aberdeen"
    "New York-Newark-Jersey City, NY-NJ-PA Metro Area" → "New York"
    "Boise City, ID Metro Area" → "Boise City"
    """
    city_part = cbsa_name.split(",")[0].strip()
    # Take the full city_part as the primary city (may be hyphenated)
    return city_part


# ── coordinate table ──────────────────────────────────────────────────────

def parse_metro_coords() -> dict[str, tuple[float, float]]:
    """Extract the (lat, lng) table from the sunshine pull script."""
    script = (Path(__file__).parent / "openmeteo_sunshine_pull.py").read_text()
    coords = {}
    for m in re.finditer(r'\(\"([^\"]+)\",\s*(-?[\d.]+),\s*(-?[\d.]+)\)', script):
        sid, lat, lng = m.group(1), float(m.group(2)), float(m.group(3))
        coords[sid] = (lat, lng)
    return coords


# ── FEMA NRI ──────────────────────────────────────────────────────────────

NRI_PERIL_FIELDS = {
    "tornado": "TRND_RISKS",
    "hurricane": "HRCN_RISKS",
    "riverine_flood": "RFLD_RISKS",
    "coastal_flood": "CFLD_RISKS",
    "wildfire": "WFIR_RISKS",
    "earthquake": "ERQK_RISKS",
    "heat_wave": "HWAV_RISKS",
    "hail": "HAIL_RISKS",
    "winter_weather": "WNTW_RISKS",
}


def load_nri_by_fips() -> dict[str, dict]:
    """Map STCOFIPS → per-peril risk scores from FEMA NRI raw."""
    raw = load_json("fema-nri/nri_counties_raw.json", base=RAW)
    out = {}
    for rec in raw:
        fips = str(rec.get("STCOFIPS", ""))
        if not fips:
            continue
        scores = {}
        for peril, field in NRI_PERIL_FIELDS.items():
            scores[peril] = _safe_float(rec.get(field))
        scores["overall"] = _safe_float(rec.get("RISK_SCORE"))
        out[fips] = scores
    return out


def build_state_fema_averages(nri_by_fips: dict[str, dict]) -> dict[str, dict]:
    """Aggregate FEMA scores by state FIPS (first 2 digits of STCOFIPS).

    Returns {state_fips: {peril: avg_score}}.
    """
    state_scores: dict[str, dict[str, list[float]]] = {}
    for fips, scores in nri_by_fips.items():
        sf = fips[:2]
        if sf not in state_scores:
            state_scores[sf] = {p: [] for p in NRI_PERIL_FIELDS}
        for peril in NRI_PERIL_FIELDS:
            v = scores.get(peril, 0.0)
            if v > 0:
                state_scores[sf][peril].append(v)

    state_avg: dict[str, dict[str, float]] = {}
    for sf, perils in state_scores.items():
        state_avg[sf] = {}
        for peril, vals in perils.items():
            state_avg[sf][peril] = sum(vals) / len(vals) if vals else 0.0
    return state_avg


def _aggregate_nri(county_scores: list[dict]) -> dict:
    """Average FEMA NRI per-peril scores across multiple counties.

    Used to roll up county-level NRI to CBSA-level when a CBSA spans multiple
    counties (the crosswalk case). Population-weighting is better but requires
    county populations; a simple mean is a reasonable first approximation and
    avoids zero-out when only some counties are present.
    """
    if not county_scores:
        return {}
    keys = set()
    for cs in county_scores:
        keys.update(cs.keys())
    out = {}
    for k in keys:
        vals = [cs.get(k, 0.0) for cs in county_scores]
        vals = [v for v in vals if v is not None]
        if vals:
            out[k] = sum(vals) / len(vals)
    return out


# ── NOAA annual normals ───────────────────────────────────────────────────

def load_noaa_annual() -> dict[str, dict]:
    """Load pre-computed annual NOAA normals, keyed by station ID."""
    summary = load_json("noaa_climate_summary.json")
    out = {}
    for station, data in summary.get("summaries", {}).items():
        out[station] = {
            "daysMinLt32FAnnual": _safe_float(data.get("annual_days_min_lt_32F")),
            "annualPrecipitationInches": _safe_float(data.get("annual_precip_in")),
            "daysMaxGt90FAnnual": _safe_float(data.get("annual_days_max_gt_90F")),
        }
    return out


# ── Metro lookup from metros.json ─────────────────────────────────────────

def build_metro_lookup(metros: list[dict]) -> dict[tuple[str, str], dict]:
    """Build (primary_city_lower, state_upper) → metro entry."""
    lookup = {}
    for m in metros:
        metro_name = m.get("metro", "")
        state = m.get("state", "")
        if metro_name and state:
            key = (metro_name.strip().lower(), state.strip().upper())
            lookup[key] = m
        # Also index by sid if different from metro
        sid = m.get("sid", "")
        if sid and sid != metro_name and not sid.startswith("all50_"):
            key2 = (sid.strip().lower(), state.strip().upper())
            if key2 not in lookup:
                lookup[key2] = m
    return lookup


def match_cbsa_to_metro(cbsa_name: str, cbsa_state: str,
                         metro_lookup: dict[tuple[str, str], dict]) -> dict | None:
    """Try to match a CBSA to a metros.json entry.

    Strategy: extract primary city from CBSA name and match against metro names.
    Check exact first, then partial matches.
    """
    primary = extract_primary_city(cbsa_name).lower()
    state = cbsa_state.upper()

    # Exact match: primary city + state
    key = (primary, state)
    if key in metro_lookup:
        return metro_lookup[key]

    # Try first word of primary city (for "Boise City" → "Boise")
    first_word = primary.split("-")[0].split()[0]
    key2 = (first_word, state)
    if key2 in metro_lookup:
        return metro_lookup[key2]

    # Fuzzy: check if any metro key's city is contained in primary or vice versa
    for (mcity, mstate), metro in metro_lookup.items():
        if mstate != state:
            continue
        if mcity in primary or primary in mcity:
            return metro
        # Try first-word matches
        mfirst = mcity.split("-")[0].split()[0]
        if mfirst and (mfirst in primary or primary in mfirst):
            return metro

    return None


# ── Crime lookup from FBI UCR ─────────────────────────────────────────────

def build_crime_lookup(crime_data: dict) -> dict[tuple[str, str], dict]:
    """Build (city_lower, state_upper) → crime area entry (legacy FBI UCR)."""
    lookup = {}
    for area in crime_data.get("areas", []):
        name = area.get("name", "")
        city = name.split(",")[0].strip().lower() if "," in name else name.strip().lower()
        state = area.get("state", "").upper()
        key = (city, state)
        lookup[key] = area
    return lookup


def build_cbsa_crime_lookup(cbsa_crime_data: dict) -> dict[str, dict]:
    """Build cbsa_code → crime entry from cbsa_crime.json."""
    return cbsa_crime_data.get("crime", {})


# ── BEA RPP lookup ────────────────────────────────────────────────────────

def build_bea_lookup(bea_data: dict) -> dict[str, dict]:
    """Build cbsa_code → BEA entry."""
    lookup = {}
    for entry in bea_data.get("data", []):
        code = entry.get("geo_code", "")
        if code:
            lookup[code] = entry
    return lookup


# ── _compute_trend ────────────────────────────────────────────────────────

def _compute_trend(trend_dict: dict | None) -> float:
    """Compute YoY trend from a {year: rate} dict. Returns 0.0 if insufficient."""
    if not trend_dict or len(trend_dict) < 2:
        return 0.0
    vals = sorted(trend_dict.items())
    old = _safe_float(vals[0][1])
    new = _safe_float(vals[-1][1])
    if old == 0.0:
        return 0.0
    return (new - old) / old


# ── New category builders ──────────────────────────────────────────────────

def _build_transportation(cbsa_code: str, data: dict) -> dict:
    t = data.get(cbsa_code, {})
    return {
        "avgCommuteMinutes": _safe_float(t.get("avgCommuteMinutes")),
        "pctTransitCommute": _safe_float(t.get("pctTransitCommute")),
        "pctRemoteWork": _safe_float(t.get("pctRemoteWork")),
        "longCommutePct": _safe_float(t.get("longCommutePct")),
    }


def _build_mobility(cbsa_code: str, data: dict) -> dict:
    m = data.get(cbsa_code, {})
    return {
        "upwardMobilityScore": _safe_float(m.get("upwardMobilityScore")),
        "mobilityPercentile": _safe_float(m.get("percentile")),
    }


def _build_health_outcomes(cbsa_code: str, data: dict) -> dict:
    h = data.get(cbsa_code, {})
    return {
        "lifeExpectancy": _safe_float(h.get("lifeExpectancy")),
        "adultObesityPct": _safe_float(h.get("adultObesityPct")),
        "adultSmokingPct": _safe_float(h.get("adultSmokingPct")),
        "poorMentalHealthDays": _safe_float(h.get("poorMentalHealthDays")),
        "primaryCarePhysiciansPer100k": _safe_float(h.get("primaryCarePhysiciansPer100k")),
    }


def _build_education(cbsa_code: str, data: dict) -> dict:
    """Build education block. Schema fields are all .optional(); only emit
    values when we actually have data.

    ponytail: studentTeacherRatio is scaffolded in the source feed but
    always emitted as 0.0 from pull_education.py (NCES CCD not pulled).
    A 0:1 ratio reads as "broken feed" to a parent — worse than no data.
    Skip the field when it isn't a real positive number.
    """
    e = data.get(cbsa_code, {})
    out: dict = {}
    if "publicSchoolRatingAvg" in e:
        out["publicSchoolRatingAvg"] = _safe_float(e["publicSchoolRatingAvg"])
    if "studentTeacherRatio" in e:
        ratio = _safe_float(e["studentTeacherRatio"])
        # ponytail: only emit when the feed has a real value (> 0).
        # 0 / negative are upstream "not available" sentinels.
        if ratio is not None and ratio > 0:
            out["studentTeacherRatio"] = ratio
    return out


def _build_walkability(cbsa_code: str, data: dict) -> dict | None:
    """Build walkability block. Returns None when the CBSA has no NWI
    record so the schema's .optional() field is omitted (not zeroed)."""
    w = data.get(cbsa_code)
    if not w:
        return None
    score = _safe_float(w.get("walkabilityScore"))
    if score <= 0:
        return None
    return {
        "walkabilityScore": score,
        "walkabilityUnweighted": _safe_float(w.get("walkabilityUnweighted")),
        "blockGroupCount": int(_safe_float(w.get("blockGroupCount"))),
        "totPop": int(_safe_float(w.get("totPop"))),
    }


def build_property_tax_by_cbsa(data: dict) -> dict[str, float]:
    """Build cbsa_code → effectiveRate lookup from cbsa_property_tax.json.

    Only returns entries with a positive effectiveRate (> 0).
    Zero-rate entries (CT reorganization, _missing flag) and negative-rate
    entries (bad ACS data) are excluded — they fall through to the
    legacy metros.json fallback or the gap reporter.
    """
    rates = data.get("rates", {})
    lookup: dict[str, float] = {}
    for code, entry in rates.items():
        rate = _safe_float(entry.get("effectiveRate"))
        if rate > 0.0:
            lookup[code] = rate
    return lookup


# ── Main location builder ─────────────────────────────────────────────────

def build_location(
    cbsa: dict,
    bea_by_cbsa: dict[str, dict],
    crime_lookup: dict[tuple[str, str], dict],
    crime_by_cbsa: dict[str, dict],
    nri_by_fips: dict[str, dict],
    state_fema_avg: dict[str, dict],
    noaa_annual: dict[str, dict],
    metro_lookup: dict[tuple[str, str], dict],
    coords: dict[str, tuple[float, float]],
    tax_data: dict,
    cbsa_to_state_fips: dict[str, str],
    crosswalk: dict[str, dict],
    coords_by_cbsa: dict[str, dict],
    healthcare_by_cbsa: dict[str, dict],
    climate_by_cbsa: dict[str, dict],
    col_by_cbsa: dict[str, dict],
    broadband_by_cbsa: dict[str, dict],
    pension_by_state: dict[str, dict],
    income_tax_by_state: dict[str, dict],
    blended_by_id: dict[str, dict],
    transportation_by_cbsa: dict[str, dict],
    mobility_by_cbsa: dict[str, dict],
    health_by_cbsa: dict[str, dict],
    broadband_speeds_by_cbsa: dict[str, dict],
    education_by_cbsa: dict[str, dict],
    walkability_by_cbsa: dict[str, dict],
    prop_tax_by_cbsa: dict[str, float] | None = None,
    amenities_by_cbsa: dict[str, dict] | None = None,
) -> tuple[dict, list[dict]]:
    """Map one census_acs_cbsa entry to the zod Location shape.

    Returns (location_dict, gaps_for_this_cbsa).
    """
    cbsa_code = cbsa["cbsa_code"]
    cbsa_name = cbsa["name"]
    metrics = cbsa.get("metrics", {})
    state = extract_state(cbsa_name)
    primary_city = extract_primary_city(cbsa_name)

    gaps: list[dict] = []

    def gap(field: str, reason: str):
        gaps.append({"field": field, "reason": reason})

    # ── Metro match (for rich legacy data) ──────────────────────────────
    metro_match = match_cbsa_to_metro(cbsa_name, state, metro_lookup)

    # ── Coordinates ─────────────────────────────────────────────────────
    # Primary source: Census Gazetteer coords keyed by CBSA code (covers all 939).
    # Fallback: legacy metro coords table (62 metros, keyed by sid).
    if cbsa_code in coords_by_cbsa:
        gc = coords_by_cbsa[cbsa_code]
        lat, lng = float(gc["lat"]), float(gc["lng"])
    elif metro_match:
        sid = metro_match.get("sid", "")
        lat, lng = coords.get(sid, (0.0, 0.0))
        if sid not in coords:
            gap("lat,lng", f"no coordinates for sid={sid}")
    else:
        lat, lng = 0.0, 0.0
        gap("lat,lng", f"no coordinates for CBSA {cbsa_code}")

    # ── Cost ────────────────────────────────────────────────────────────
    median_home_value = _safe_float(metrics.get("median_home_value"))
    median_rent = _safe_float(metrics.get("median_gross_rent"))

    # Cost of living: BEA RPP (authoritative) → CBSA COL proxy fallback
    bea = bea_by_cbsa.get(cbsa_code, {})
    cost_of_living = _safe_float(bea.get("rpp_all_items"))
    if not bea:
        col_entry = col_by_cbsa.get(cbsa_code, {})
        if col_entry:
            cost_of_living = _safe_float(col_entry.get("costOfLivingIndex"))
        else:
            gap("cost.costOfLivingIndex", f"no BEA RPP or COL proxy for CBSA {cbsa_code}")

    # Property tax: primary = CBSA-level Census ACS county aggregate (all 939 CBSAs).
    # Fallback: metros.json county_property_tax (legacy 59 metros).
    # Both sources are Census ACS 2022 5-year county data; the CBSA file
    # aggregates all component counties via population-weighted average.
    property_tax_rate = 0.0
    if prop_tax_by_cbsa and cbsa_code in prop_tax_by_cbsa:
        property_tax_rate = prop_tax_by_cbsa[cbsa_code]
    elif metro_match and metro_match.get("county_property_tax"):
        cpt = metro_match["county_property_tax"]
        property_tax_rate = _safe_float(cpt.get("effective_rate_pct_2022_acs5yr")) / 100.0
    else:
        gap("cost.propertyTaxRate", "no county property tax data")

    # State income tax rate — state-level lookup
    tax_entry = income_tax_by_state.get(state, {})
    state_income_tax_rate = _safe_float(tax_entry.get("topMarginalRate"))
    if not tax_entry:
        gap("cost.stateIncomeTaxRate", f"no income tax data for {state}")

    cost = {
        "costOfLivingIndex": cost_of_living,
        "medianHomeValue": median_home_value,
        "medianRent": median_rent,
        "stateIncomeTaxRate": state_income_tax_rate,
        "propertyTaxRate": property_tax_rate,
    }

    # ── Climate ─────────────────────────────────────────────────────────
    # Try metros.json → NOAA station match → CBSA Open-Meteo fallback.
    # Gaps are recorded only at the END (after all sources attempted) so
    # a successful fallback doesn't leave a stale gap behind.
    if metro_match:
        climate_src = metro_match.get("climate", {})
        station = climate_src.get("station", "")
        days_max_90 = _safe_float(climate_src.get("days_max_gt_90F_annual"))
        sunshine = _safe_float(climate_src.get("sunshine_hours_annual"))
    else:
        climate_src = {}
        station = ""
        days_max_90 = 0.0
        sunshine = 0.0

    noaa = noaa_annual.get(station, {}) if station else {}
    if noaa:
        days_min_32 = noaa["daysMinLt32FAnnual"]
        precip = noaa["annualPrecipitationInches"]
        if days_max_90 == 0.0 and noaa.get("daysMaxGt90FAnnual"):
            days_max_90 = noaa["daysMaxGt90FAnnual"]
    else:
        days_min_32 = 0.0
        precip = 0.0

    # CBSA climate fallback (Open-Meteo archive) — fills any zero weather
    # fields for CBSAs not covered by metros.json + NOAA station match.
    cbsa_climate = climate_by_cbsa.get(cbsa_code, {})
    if cbsa_climate:
        if days_max_90 == 0.0:
            days_max_90 = _safe_float(cbsa_climate.get("daysMaxGt90FAnnual"))
        if sunshine == 0.0:
            sunshine = _safe_float(cbsa_climate.get("sunshineHoursAnnual"))
        if days_min_32 == 0.0:
            days_min_32 = _safe_float(cbsa_climate.get("daysMinLt32FAnnual"))
        if precip == 0.0:
            precip = _safe_float(cbsa_climate.get("annualPrecipitationInches"))

    # Record climate weather gaps only after all sources tried
    if days_max_90 == 0.0:
        gap("climate.daysMaxGt90FAnnual", "no metros/NOAA/CBSA climate data")
    if sunshine == 0.0:
        gap("climate.sunshineHoursAnnual", "no metros/NOAA/CBSA sunshine data")
    if days_min_32 == 0.0:
        gap("climate.daysMinLt32FAnnual", "no metros/NOAA/CBSA climate data")
    if precip == 0.0:
        gap("climate.annualPrecipitationInches", "no metros/NOAA/CBSA climate data")

    # FEMA NRI per-peril scores
    # Primary path: aggregate county-level NRI scores across all CBSA-component
    # counties via the CBSA→county crosswalk. This is population-agnostic mean
    # of FEMA per-county risk scores for the counties making up this CBSA.
    # Fallback 1: single county FIPS from metros.json county_property_tax (legacy).
    # Fallback 2: state-level FEMA average.
    nri: dict = {}
    nri_source = ""  # for gap provenance

    xwalk_entry = crosswalk.get(cbsa_code)
    if xwalk_entry:
        county_fips_list = [c["stcofips"] for c in xwalk_entry.get("counties", [])]
        county_scores: list[dict] = []
        for cfips in county_fips_list:
            cs = nri_by_fips.get(cfips)
            if cs:
                county_scores.append(cs)
        if county_scores:
            nri = _aggregate_nri(county_scores)
            nri_source = "crosswalk_county_aggregate"

    if not nri and metro_match:
        cpt = metro_match.get("county_property_tax", {})
        sf = str(cpt.get("state_fips", ""))
        cf = str(cpt.get("county_fips", ""))
        stcofips = f"{sf}{cf}" if sf and cf else ""
        single = nri_by_fips.get(stcofips, {}) if stcofips else {}
        if single:
            nri = single
            nri_source = "metro_single_county"

    state_fips = cbsa_to_state_fips.get(state, "")
    use_state_avg = False
    if not nri and state_fips:
        state_avg = state_fema_avg.get(state_fips, {})
        if state_avg:
            nri = state_avg
            use_state_avg = True
            nri_source = "state_average"

    if not nri:
        gap("climate.*RiskScore", f"no FEMA NRI for CBSA {cbsa_code} and no state avg")

    tornado = nri.get("tornado", 0.0)
    hurricane = nri.get("hurricane", 0.0)
    # Flood = max of riverine and coastal
    flood = max(nri.get("riverine_flood", 0.0), nri.get("coastal_flood", 0.0))
    earthquake = nri.get("earthquake", 0.0)
    wildfire = nri.get("wildfire", 0.0)

    if use_state_avg:
        gap("climate.*RiskScore", f"using state-level FEMA averages for {state} (no county match)")

    climate = {
        "daysMaxGt90FAnnual": days_max_90,
        "daysMinLt32FAnnual": days_min_32,
        "sunshineHoursAnnual": sunshine,
        "annualPrecipitationInches": precip,
        "tornadoRiskScore": tornado,
        "hurricaneRiskScore": hurricane,
        "floodRiskScore": flood,
        "earthquakeRiskScore": earthquake,
        "wildfireRiskScore": wildfire,
    }

    # ── Crime ────────────────────────────────────────────────────────────
    # Primary: CBSA crime data (cbsa_crime.json, keyed by CBSA code).
    # Fallback 1: FBI UCR city-name match (legacy crime_fbi_ucr.json).
    # Fallback 2: metros.json crime data.
    crime = {
        "violentCrimeRatePer100k": 0.0,
        "propertyCrimeRatePer100k": 0.0,
        "yearOverYearTrend": 0.0,
    }

    crime_matched = False

    # 1. Try CBSA-coded crime data (covers all 939 CBSAs)
    cbsa_crime = crime_by_cbsa.get(cbsa_code)
    if cbsa_crime:
        crime = {
            "violentCrimeRatePer100k": _safe_float(cbsa_crime.get("violentCrimeRatePer100k")),
            "propertyCrimeRatePer100k": _safe_float(cbsa_crime.get("propertyCrimeRatePer100k")),
            "yearOverYearTrend": _safe_float(cbsa_crime.get("yearOverYearTrend")),
        }
        crime_matched = True

    # 2. Fallback: FBI UCR by city name (legacy, for any CBSA missing from cbsa_crime)
    if not crime_matched:
        fbi_key = (primary_city.lower(), state.upper())
        fbi = crime_lookup.get(fbi_key)
        if not fbi:
            fbi_key2 = (primary_city.split("-")[0].split()[0].lower(), state.upper())
            fbi = crime_lookup.get(fbi_key2)

        if fbi:
            crime = {
                "violentCrimeRatePer100k": _safe_float(fbi.get("violent_rate_per_100k")),
                "propertyCrimeRatePer100k": _safe_float(fbi.get("property_rate_per_100k")),
                "yearOverYearTrend": _safe_float(fbi.get("yoy_trend")),
            }
            crime_matched = True

    # 3. Fallback: metros.json crime data
    if not crime_matched and metro_match and metro_match.get("crime"):
        crime_src = metro_match["crime"]
        crime = {
            "violentCrimeRatePer100k": _safe_float(crime_src.get("per_100k_violent_2022")),
            "propertyCrimeRatePer100k": _safe_float(crime_src.get("per_100k_property_2022")),
            "yearOverYearTrend": _compute_trend(crime_src.get("per_100k_trend")),
        }
        crime_matched = True

    if not crime_matched:
        gap("crime.*", "no CBSA crime data, FBI UCR, or metros.json crime data")

    # ── Healthcare ───────────────────────────────────────────────────────
    # Primary: CBSA healthcare file (CMS-derived, covers all 939 CBSAs).
    # Fallback: legacy metros.json family_decision data.
    cbsa_hc = healthcare_by_cbsa.get(cbsa_code, {})
    if cbsa_hc:
        healthcare_access = _safe_float(cbsa_hc.get("healthcareAccessScore"))
        hospital_count = _safe_float(cbsa_hc.get("hospitalCountWithin10mi"))
    elif metro_match:
        fd = metro_match.get("family_decision", {})
        hc = fd.get("healthcare_access", {})
        healthcare_access = _safe_float(hc.get("pct_with_health_insurance"))
        hospital_count = _safe_float(fd.get("hospitals_in_npi"))
    else:
        healthcare_access = 0.0
        hospital_count = 0.0
        gap("healthcare.*", "no CBSA healthcare data and no metros.json family_decision data")

    healthcare = {
        "healthcareAccessScore": healthcare_access,
        "hospitalCountWithin10mi": hospital_count,
    }

    # ── Broadband ────────────────────────────────────────────────────────
    # Primary: CBSA-level Census ACS B28002 data (covers all 939 CBSAs)
    # Fallback: metros.json legacy data (62 metros, for backward compat)
    if cbsa_code in broadband_by_cbsa:
        bb_cbsa = broadband_by_cbsa[cbsa_code]
        pct_broadband = _safe_float(bb_cbsa.get("pctHouseholdsWith100MbpsPlus"))
    elif metro_match:
        fd = metro_match.get("family_decision", {})
        bb = fd.get("broadband", {})
        pct_broadband = _safe_float(bb.get("pct_with_broadband"))
    else:
        pct_broadband = 0.0
        gap("broadband.pctHouseholdsWith100MbpsPlus", "no CBSA broadband data and no metros.json fallback")

    broadband = {
        "pctHouseholdsWith100MbpsPlus": pct_broadband,
        "medianDownloadMbps": _safe_float(
            broadband_speeds_by_cbsa.get(cbsa_code, {}).get("medianDownloadMbps")
        ),
    }
    if pct_broadband == 0.0:
        gap("broadband.pctHouseholdsWith100MbpsPlus", "no CBSA broadband data and no metros.json fallback")
    if broadband["medianDownloadMbps"] == 0.0:
        gap("broadband.medianDownloadMbps", "no FCC or proxy speed data")

    # ── Fiscal ───────────────────────────────────────────────────────────
    if metro_match:
        equable_class = metro_match.get("equable_classification", "Unknown")
    else:
        equable_class = "Unknown"
    valid_tiers = {"Resilient", "Fragile", "Distressed"}
    fiscal_tier = equable_class if equable_class in valid_tiers else "Unknown"

    state_name = _STATE_ABBR_TO_NAME.get(state, state)
    tax_state = tax_data.get("states", {}).get(state_name, {})
    tax_rank = tax_state.get("overall_rank")
    tax_score = ((51 - tax_rank) / 50.0 * 100.0) if tax_rank else 0.0
    if not tax_rank:
        gap("fiscal.taxCompetitivenessScore", f"no tax rank for {state_name}")

    # State pension funded ratio — state-level lookup from Equable
    pension_entry = pension_by_state.get(state, {})
    state_pension_ratio = _safe_float(pension_entry.get("fundedRatio"))
    if not pension_entry:
        gap("fiscal.statePensionFundedRatio", f"no Equable pension data for {state}")

    fiscal = {
        "statePensionFundedRatio": state_pension_ratio,
        "fiscalTier": fiscal_tier,
        "taxCompetitivenessScore": tax_score,
    }

    # ── Amenities ────────────────────────────────────────────────────────
    # Primary: CBSA-level OSM Overpass data (covers all 939 CBSAs).
    # Fallback: metros.json legacy amenities (59 metros).
    if amenities_by_cbsa and cbsa_code in amenities_by_cbsa:
        a = amenities_by_cbsa[cbsa_code]
        if a.get("_error"):
            gap("amenities.*", f"OSM query error: {a['_error']}")
            grocery_density = 0.0
            store_count = 0.0
            recreation = 0.0
            nature_count = 0.0
        else:
            grocery_density = _safe_float(a.get("groceryStoreDensityPerCapita"))
            store_count = _safe_float(a.get("bigBoxStoreCount"))
            recreation = _safe_float(a.get("recreationAreaCount"))
            nature_count = _safe_float(a.get("natureAreaCount"))
    elif metro_match:
        amen = metro_match.get("amenities", {})
        nature = amen.get("nature", {})
        store_count = _safe_float(amen.get("store_count_total"))
        fd = metro_match.get("family_decision", {})
        bb = fd.get("broadband", {})
        total_households = _safe_float(bb.get("total_households"))
        grocery_density = (store_count / total_households) if total_households else 0.0
        recreation = (
            _safe_float(nature.get("parks"))
            + _safe_float(nature.get("dog_parks"))
            + _safe_float(nature.get("trails"))
        )
        nature_count = _safe_float(nature.get("water"))
    else:
        store_count = 0.0
        grocery_density = 0.0
        recreation = 0.0
        nature_count = 0.0
        gap("amenities.*", "no CBSA amenities data and no metros.json fallback")

    amenities = {
        "groceryStoreDensityPerCapita": grocery_density,
        "bigBoxStoreCount": store_count,
        "recreationAreaCount": recreation,
        "natureAreaCount": nature_count,
    }

    # id: primary city + state, slugified (needed early for blended lookup)
    loc_id = _slugify(f"{primary_city}-{state}")

    # ── Blended score ────────────────────────────────────────────────────
    # Primary: pre-computed blended scores for all 939 CBSAs.
    # Fallback: legacy metros.json blended scores (62 metros).
    blended_precomp = blended_by_id.get(loc_id, {})
    if blended_precomp:
        blended = {
            "costScore0to50": _safe_float(blended_precomp.get("costScore0to50")),
            "lifeScore0to50": _safe_float(blended_precomp.get("lifeScore0to50")),
            "totalScore0to100": _safe_float(blended_precomp.get("totalScore0to100")),
        }
    elif metro_match:
        blended_src = metro_match.get("blended", {})
        blended = {
            "costScore0to50": _safe_float(blended_src.get("cost_score_0_50")),
            "lifeScore0to50": _safe_float(blended_src.get("life_score_0_50")),
            "totalScore0to100": _safe_float(blended_src.get("total_score_0_100")),
        }
    else:
        blended = {
            "costScore0to50": 0.0,
            "lifeScore0to50": 0.0,
            "totalScore0to100": 0.0,
        }
        gap("blended.*", "no pre-computed blended score")

    # ── Provenance ───────────────────────────────────────────────────────
    metrics_provenance = {
        "cost.costOfLivingIndex": _provenance(
            "bea_regional_price_parities_2024",
            "https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area",
        ),
        "cost.medianHomeValue": _provenance(
            "us_census_acs_2022_acs5",
            "https://api.census.gov/data/2022/acs/acs5",
        ),
        "cost.medianRent": _provenance(
            "us_census_acs_2022_acs5",
            "https://api.census.gov/data/2022/acs/acs5",
        ),
        "cost.propertyTaxRate": _provenance(
            "us_census_acs_2022_acs5",
            "https://api.census.gov/data/2022/acs/acs5",
        ),
        "climate": _provenance(
            "noaa_ncei_1991_2020_normals",
            "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals",
        ),
        "climate.sunshine": _provenance(
            "open_meteo_historical_archive",
            "https://open-meteo.com/",
        ),
        "climate.riskScores": _provenance(
            "fema_nri_2023",
            "https://hazards.fema.gov/nri/data-resources",
        ),
        "healthcare": _provenance(
            "us_census_acs_2022_acs5",
            "https://api.census.gov/data/2022/acs/acs5",
        ),
        "broadband": _provenance(
            "us_census_acs_2022_acs5",
            "https://api.census.gov/data/2022/acs/acs5",
        ),
        "fiscal": _provenance(
            "equable_institute_2024",
            "https://equable.org/state-of-pensions/",
        ),
        "fiscal.taxRank": _provenance(
            "tax_foundation_2026",
            "https://taxfoundation.org/research/all/state/2026-state-tax-competitiveness-index/",
        ),
        "amenities": _provenance(
            "openstreetmap_overpass",
            "https://overpass-api.de/",
        ),
        "blended": _provenance(
            "internal_pipeline",
            "internal://sources/scripts/build_all50_final.py",
        ),
    }

    # ── Assemble location ────────────────────────────────────────────────
    # loc_id computed above (before blended lookup)

    # ponytail: population is required by the zod schema (relocation.schema.ts
    # `population: z.number()`); the source census_acs_cbsa.json carries it
    # on `metrics.total_population` for all 939 CBSAs — read it from there.
    # 0 is a legitimate tiny-metro value; null is a gap and would fail zod.
    population = int(_safe_float(metrics.get("total_population")))

    location = {
        "id": loc_id,
        "name": f"{primary_city}, {state}",
        "state": state,
        "lat": lat,
        "lng": lng,
        "population": population,
        "cost": cost,
        "climate": climate,
        "crime": crime,
        "healthcare": healthcare,
        "broadband": broadband,
        "fiscal": fiscal,
        "amenities": amenities,
        "blended": blended,
        "fiscalTier": fiscal_tier,
        # New categories (beyond original zod schema — optional enrichment)
        "transportation": _build_transportation(cbsa_code, transportation_by_cbsa),
        "mobility": _build_mobility(cbsa_code, mobility_by_cbsa),
        "healthOutcomes": _build_health_outcomes(cbsa_code, health_by_cbsa),
        "metricsProvenance": metrics_provenance,
    }

    # Education is .optional() in the schema — only attach when we have data
    education_block = _build_education(cbsa_code, education_by_cbsa)
    if education_block:
        location["education"] = education_block

    # Walkability is .optional() in the schema — only attach when we have a real score
    walk_block = _build_walkability(cbsa_code, walkability_by_cbsa)
    if walk_block:
        location["walkability"] = walk_block
        metrics_provenance["walkability"] = _provenance(
            "epa_national_walkability_index_2020",
            "https://geodata.epa.gov/arcgis/rest/services/OA/WalkabilityIndex/MapServer/0",
        )

    return location, gaps


# ── Gap report aggregation ────────────────────────────────────────────────

def summarize_gaps(all_gaps: dict[str, list[dict]], cbsa_count: int) -> dict:
    gaps_by_field: dict[str, int] = {}
    total_gaps = 0
    for gaps in all_gaps.values():
        for g in gaps:
            field = g["field"]
            gaps_by_field[field] = gaps_by_field.get(field, 0) + 1
            total_gaps += 1

    filled = (FIELDS_PER_LOCATION * cbsa_count) - total_gaps
    pct_filled = filled / (FIELDS_PER_LOCATION * cbsa_count) * 100 if cbsa_count else 0

    return {
        "generated_at": NOW,
        "cbsa_count": cbsa_count,
        "fields_per_location": FIELDS_PER_LOCATION,
        "locations_with_gaps": len(all_gaps),
        "total_gaps": total_gaps,
        "total_fields": FIELDS_PER_LOCATION * cbsa_count,
        "field_fill_rate_pct": round(pct_filled, 1),
        "gaps_by_field": dict(sorted(gaps_by_field.items(), key=lambda x: -x[1])),
    }


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    print("=== build_locations.py v2 — CBSA master → zod Location[] ===\n")

    # ── Load data ──────────────────────────────────────────────────────
    print("Loading census_acs_cbsa.json (master geography)...")
    cbsa_data = load_json("census_acs_cbsa.json")
    cbsas = cbsa_data["cbsas"]
    print(f"  {len(cbsas)} CBSAs")

    print("Loading BEA RPP...")
    bea_data = load_json("bea_rpp.json")
    bea_by_cbsa = build_bea_lookup(bea_data)
    print(f"  {len(bea_by_cbsa)} MSA entries")

    print("Loading FBI UCR crime...")
    crime_data = load_json("crime_fbi_ucr.json")
    crime_lookup = build_crime_lookup(crime_data)
    print(f"  {len(crime_lookup)} city entries (legacy)")

    print("Loading CBSA crime data...")
    cbsa_crime_data = load_json("cbsa_crime.json")
    crime_by_cbsa = build_cbsa_crime_lookup(cbsa_crime_data)
    print(f"  {len(crime_by_cbsa)} CBSA crime entries")

    print("Loading FEMA NRI county data...")
    nri = load_nri_by_fips()
    print(f"  {len(nri)} county records")

    print("Building state-level FEMA averages...")
    state_fema_avg = build_state_fema_averages(nri)
    print(f"  {len(state_fema_avg)} state averages")

    print("Loading NOAA annual normals...")
    noaa_annual = load_noaa_annual()
    print(f"  {len(noaa_annual)} stations")

    print("Loading metros.json (legacy rich data)...")
    metros_data = load_json("metros.json")
    metros = metros_data["metros"]
    metro_lookup = build_metro_lookup(metros)
    print(f"  {len(metros)} metros, {len(metro_lookup)} lookup keys")

    print("Extracting coordinate table...")
    coords = parse_metro_coords()
    print(f"  {len(coords)} metro coordinates")

    print("Loading CBSA→county crosswalk...")
    xwalk_data = load_json("cbsa_county_crosswalk.json")
    crosswalk = xwalk_data.get("crosswalk", {})
    print(f"  {len(crosswalk)} CBSAs mapped to counties")

    print("Loading CBSA Gazetteer coordinates...")
    gaz_data = load_json("cbsa_gazetteer_coords.json")
    coords_by_cbsa = gaz_data.get("coords", {})
    print(f"  {len(coords_by_cbsa)} CBSA coordinates")

    print("Loading state tax competitiveness...")
    tax = load_json("state_tax_competitiveness.json")
    print(f"  {len(tax.get('states', {}))} states")

    print("Loading CBSA healthcare (CMS-derived)...")
    hc_data = load_json("cbsa_healthcare.json")
    healthcare_by_cbsa = hc_data.get("healthcare", {})
    print(f"  {len(healthcare_by_cbsa)} CBSA healthcare records")

    print("Loading CBSA climate (Open-Meteo archive)...")
    clim_data = load_json("cbsa_climate_openmeteo_raw.json", base=RAW / "curl")
    climate_by_cbsa = clim_data.get("climate", {})
    print(f"  {len(climate_by_cbsa)} CBSA climate records")

    print("Loading CBSA cost-of-living proxy...")
    col_data = load_json("cbsa_cost_of_living_index.json")
    col_by_cbsa = col_data.get("indices", {})
    print(f"  {len(col_by_cbsa)} CBSA cost-of-living records")

    print("Loading CBSA broadband (ACS B28002)...")
    bb_data = load_json("cbsa_broadband.json")
    broadband_by_cbsa = bb_data.get("broadband", {})
    print(f"  {len(broadband_by_cbsa)} CBSA broadband records")

    print("Loading state pension funded ratios (Equable)...")
    pension_data = load_json("state_pension_funded_ratio.json")
    pension_by_state = pension_data.get("states", {})
    print(f"  {len(pension_by_state)} state pension records")

    print("Loading state income tax rates...")
    income_tax_data = load_json("state_income_tax_rates.json")
    income_tax_by_state = income_tax_data.get("states", {})
    print(f"  {len(income_tax_by_state)} state income tax records")

    print("Loading pre-computed blended scores...")
    blended_data = load_json("blended_scores.json")
    blended_by_id = blended_data.get("blended", {})
    print(f"  {len(blended_by_id)} blended score records")

    print("Loading CBSA transportation (ACS B08303)...")
    trans_data = load_json("cbsa_transportation.json")
    transportation_by_cbsa = trans_data.get("transportation", {})
    print(f"  {len(transportation_by_cbsa)} CBSA transportation records")

    print("Loading CBSA economic mobility (Opportunity Atlas)...")
    mob_data = load_json("cbsa_mobility.json")
    mobility_by_cbsa = mob_data.get("mobility", {})
    print(f"  {len(mobility_by_cbsa)} CBSA mobility records")

    print("Loading CBSA health outcomes (County Health Rankings)...")
    ho_data = load_json("cbsa_health_outcomes.json")
    health_by_cbsa = ho_data.get("health", {})
    print(f"  {len(health_by_cbsa)} CBSA health outcome records")

    print("Loading CBSA property tax rates (Census ACS county aggregate)...")
    prop_tax_data = load_json("cbsa_property_tax.json")
    prop_tax_by_cbsa = build_property_tax_by_cbsa(prop_tax_data)
    print(f"  {len(prop_tax_by_cbsa)} CBSA property tax records (positive rates only)")

    print("Loading CBSA amenities (OSM Overpass)...")
    amenities_data = load_json("cbsa_amenities.json")
    amenities_by_cbsa = amenities_data.get("amenities", {})
    print(f"  {len(amenities_by_cbsa)} CBSA amenities records")

    print("Loading broadband speeds (FCC → Census proxy)...")
    bb_speeds_path = PROCESSED / "cbsa_broadband_speeds.json"
    broadband_speeds_by_cbsa: dict[str, dict] = {}
    if bb_speeds_path.exists():
        bb_speeds_data = load_json("cbsa_broadband_speeds.json")
        if isinstance(bb_speeds_data, dict):
            broadband_speeds_by_cbsa = bb_speeds_data.get("speeds", {})
    print(f"  {len(broadband_speeds_by_cbsa)} CBSA broadband speed records")

    print("Loading CBSA education (ACS S1501)...")
    education_by_cbsa: dict[str, dict] = {}
    edu_path = PROCESSED / "cbsa_education.json"
    if edu_path.exists():
        edu_data = load_json("cbsa_education.json")
        if isinstance(edu_data, dict):
            education_by_cbsa = edu_data.get("education", {})
    print(f"  {len(education_by_cbsa)} CBSA education records")

    print("Loading CBSA walkability (EPA NWI)...")
    walkability_by_cbsa: dict[str, dict] = {}
    walk_path = PROCESSED / "cbsa_walkability.json"
    if walk_path.exists():
        walk_data = load_json("cbsa_walkability.json")
        if isinstance(walk_data, dict):
            walkability_by_cbsa = walk_data.get("walkability", {})
    print(f"  {len(walkability_by_cbsa)} CBSA walkability records")

    # ── Build CBSA → state_fips mapping for FEMA fallback ──────────────
    # We need to map state abbreviation → state FIPS (from NRI data)
    cbsa_to_state_fips: dict[str, str] = {}
    # Use FEMA NRI data to build state abbr → state FIPS
    raw_nri = load_json("fema-nri/nri_counties_raw.json", base=RAW)
    abbr_to_fips: dict[str, str] = {}
    for rec in raw_nri:
        abbr = rec.get("STATEABBRV", "")
        fips = str(rec.get("STATEFIPS", ""))
        if abbr and fips and abbr not in abbr_to_fips:
            abbr_to_fips[abbr] = fips
    # Map state abbreviations from CBSAs to FIPS
    for cbsa in cbsas:
        state = extract_state(cbsa["name"])
        if state and state in abbr_to_fips:
            cbsa_to_state_fips[state] = abbr_to_fips[state]

    # ── Build locations ────────────────────────────────────────────────
    print(f"\nBuilding Location[] for {len(cbsas)} CBSAs...")
    locations = []
    all_gaps: dict[str, list[dict]] = {}
    matched_metros = 0
    matched_bea = 0
    matched_crime = 0

    for i, cbsa in enumerate(cbsas):
        loc, gaps = build_location(
            cbsa, bea_by_cbsa, crime_lookup, crime_by_cbsa, nri, state_fema_avg,
            noaa_annual, metro_lookup, coords, tax, cbsa_to_state_fips,
            crosswalk, coords_by_cbsa,
            healthcare_by_cbsa, climate_by_cbsa, col_by_cbsa,
            broadband_by_cbsa, pension_by_state, income_tax_by_state,
            blended_by_id,
            transportation_by_cbsa, mobility_by_cbsa, health_by_cbsa,
            broadband_speeds_by_cbsa, education_by_cbsa, walkability_by_cbsa,
            prop_tax_by_cbsa, amenities_by_cbsa,
        )
        locations.append(loc)
        if gaps:
            all_gaps[loc["id"]] = gaps

        # Stats
        if loc["lat"] != 0.0:
            matched_metros += 1
        if loc["cost"]["costOfLivingIndex"] != 0.0:
            matched_bea += 1
        if loc["crime"]["violentCrimeRatePer100k"] != 0.0:
            matched_crime += 1

        if (i + 1) % 200 == 0:
            print(f"  {i + 1}/{len(cbsas)}...")

    print(f"  {len(cbsas)}/{len(cbsas)} done")
    print(f"  Metro matches (coords): {matched_metros}")
    print(f"  BEA RPP matches: {matched_bea}")
    print(f"  Crime matches: {matched_crime}")

    # ── Write locations.json ───────────────────────────────────────────
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "locations.json"
    with open(out_path, "w") as f:
        json.dump(locations, f, indent=2)
    print(f"\nWrote {len(locations)} locations to {out_path}")

    # ── Write gap report ───────────────────────────────────────────────
    gap_path = OUTPUT_DIR / "gap-report.json"
    gap_summary = summarize_gaps(all_gaps, len(cbsas))
    with open(gap_path, "w") as f:
        json.dump(gap_summary, f, indent=2)
    print(f"Gap report: {gap_path}")

    # ── Print summary ──────────────────────────────────────────────────
    print(f"\n{'=' * 60}")
    print("GAP SUMMARY")
    print(f"{'=' * 60}")
    total = len(cbsas)
    for field, count in gap_summary["gaps_by_field"].items():
        pct = count / total * 100
        bar = "\u2588" * int(pct / 5)
        print(f"  {field:45s} {count:4d}/{total} ({pct:5.1f}%) {bar}")

    print(f"\n  Field fill rate: {gap_summary['field_fill_rate_pct']}%")
    print(f"  ({gap_summary['total_gaps']} gaps out of {gap_summary['total_fields']} fields)")
    print(f"  {len(locations)} locations total")


if __name__ == "__main__":
    main()
