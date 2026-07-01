#!/usr/bin/env python3
"""
build_cbsa_transportation.py — Fetch CBSA-level transportation/commute data from Census ACS
Tables B08303 (Travel Time to Work) and B08301 (Means of Transportation).

Source: U.S. Census Bureau, American Community Survey 5-Year Estimates (2022 vintage).
Geography: All Core-Based Statistical Areas (metropolitan + micropolitan).
API key loaded from /home/mongo/projects/us-relocation-2026/.env.census.

B08303 — Travel Time to Work (commute time distribution):
  B08303_001E  Total workers 16+
  B08303_002E  Less than 5 minutes
  B08303_003E  5 to 9 minutes
  B08303_004E  10 to 14 minutes
  B08303_005E  15 to 19 minutes
  B08303_006E  20 to 24 minutes
  B08303_007E  25 to 29 minutes
  B08303_008E  30 to 34 minutes
  B08303_009E  35 to 39 minutes
  B08303_010E  40 to 44 minutes
  B08303_011E  45 to 59 minutes
  B08303_012E  60 to 89 minutes
  B08303_013E  90 or more minutes

B08301 — Means of Transportation to Work:
  B08301_001E  Total workers 16+
  B08301_010E  Public transportation (excluding taxicab)
  B08301_018E  Bicycle
  B08301_019E  Walked
  B08301_021E  Worked from home

Derived fields per CBSA:
  avgCommuteMinutes — weighted average using midpoint of each time band
  pctTransitCommute — B08301_010E / B08301_001E * 100
  pctWalkBike       — (B08301_019E + B08301_018E) / B08301_001E * 100
  pctRemoteWork     — B08301_021E / B08301_001E * 100
  longCommutePct    — (B08303_010E + B08303_011E + B08303_012E + B08303_013E) / B08303_001E * 100

Output: sources/processed/cbsa_transportation.json
"""

import json
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/cbsa_transportation.json"
ENV_FILE = ROOT / ".env.census"

# ── B08303 time bands: variable → (label, midpoint_minutes) ──────────────
TIME_BANDS = [
    ("B08303_002E", "Less than 5 minutes", 2.5),
    ("B08303_003E", "5 to 9 minutes", 7),
    ("B08303_004E", "10 to 14 minutes", 12),
    ("B08303_005E", "15 to 19 minutes", 17),
    ("B08303_006E", "20 to 24 minutes", 22),
    ("B08303_007E", "25 to 29 minutes", 27),
    ("B08303_008E", "30 to 34 minutes", 32),
    ("B08303_009E", "35 to 39 minutes", 37),
    ("B08303_010E", "40 to 44 minutes", 42),
    ("B08303_011E", "45 to 59 minutes", 52),
    ("B08303_012E", "60 to 89 minutes", 74.5),
    ("B08303_013E", "90 or more minutes", 105.0),
]

# ── B08301 variables of interest ─────────────────────────────────────────
B08301_COLS = [
    "B08301_001E",  # Total workers
    "B08301_010E",  # Public transportation
    "B08301_018E",  # Bicycle
    "B08301_019E",  # Walked
    "B08301_021E",  # Worked from home
]

# ── Build the full column list for the API call ──────────────────────────
B08303_VARS = [v for v, _, _ in TIME_BANDS]
ACS_COLUMNS = ["NAME", "B08303_001E"] + B08303_VARS + B08301_COLS

# ── Helper functions ─────────────────────────────────────────────────────

def load_key() -> str:
    """Load Census API key from .env.census file."""
    if not ENV_FILE.exists():
        raise RuntimeError(f"Census API key not found at {ENV_FILE}")
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith("CENSUS_API_KEY="):
            return line.split("=", 1)[1]
    raise RuntimeError("CENSUS_API_KEY not set in env file")


def safe_int(val):
    """Convert a Census value to int, returning None for null/empty/suppressed."""
    if val is None or val == "" or val == "null" or val == "-999999999":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def compute_pct(numerator, denominator):
    """Compute percentage: (numerator / denominator) * 100, or None if invalid."""
    if numerator is None or denominator is None or denominator == 0:
        return None
    return round(numerator / denominator * 100, 1)


# ── API fetch ─────────────────────────────────────────────────────────────

def fetch_transportation_all_cbsas(key: str) -> dict:
    """
    Single API call: pull B08303 + B08301 for all CBSAs (metro + micro).
    Returns {"header": [...], "rows": [...]}.
    """
    get_str = ",".join(ACS_COLUMNS)
    geo_value = "metropolitan statistical area/micropolitan statistical area:*"

    base = "https://api.census.gov/data/2022/acs/acs5"
    params = {
        "get": get_str,
        "for": geo_value,
        "key": key,
    }
    qs = urllib.parse.urlencode(params, safe="").replace("%2A", "*")
    qs = qs.replace("%2F", "/")
    url = f"{base}?{qs}"

    print(f"[transportation] Fetching: {base}?get={get_str[:100]}...")
    print(f"[transportation] Geography: metropolitan+micropolitan statistical areas (all CBSAs)")

    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))

    if not isinstance(data, list) or len(data) < 2:
        raise RuntimeError(f"Unexpected API response format: {type(data)}")

    header = data[0]
    rows = data[1:]

    print(f"[transportation] API returned {len(header)} columns, {len(rows)} rows")
    print(f"[transportation] Header (first 8): {header[:8]}...")

    return {"header": header, "rows": rows}


# ── Parse + compute ───────────────────────────────────────────────────────

def parse_cbsa_row(header, row):
    """Parse a single CBSA data row and compute transportation metrics."""
    rec = dict(zip(header, row))

    cbsa_code = row[-1]  # geography column is last
    name = rec.get("NAME", "")

    # ── B08303: Travel time distribution ──────────────────────────────────
    total_workers_time = safe_int(rec.get("B08303_001E"))

    band_values = {}
    for var, label, midpoint in TIME_BANDS:
        band_values[var] = safe_int(rec.get(var))

    # Weighted average commute time
    avg_commute = None
    if total_workers_time and total_workers_time > 0:
        weighted_sum = 0.0
        total_in_bands = 0
        for var, label, midpoint in TIME_BANDS:
            val = band_values.get(var)
            if val is not None:
                weighted_sum += val * midpoint
                total_in_bands += val
        if total_in_bands > 0:
            avg_commute = round(weighted_sum / total_in_bands, 1)

    # Long commute: 45+ minutes (B08303_010E + 011E + 012E + 013E)
    long_commute = sum(
        band_values.get(v, 0) or 0
        for v in ["B08303_010E", "B08303_011E", "B08303_012E", "B08303_013E"]
    )
    long_commute_pct = compute_pct(long_commute, total_workers_time)

    # ── B08301: Means of transportation ───────────────────────────────────
    total_commuters = safe_int(rec.get("B08301_001E"))
    transit = safe_int(rec.get("B08301_010E"))
    bicycle = safe_int(rec.get("B08301_018E"))
    walked = safe_int(rec.get("B08301_019E"))
    wfh = safe_int(rec.get("B08301_021E"))

    pct_transit = compute_pct(transit, total_commuters)
    walk_bike = (walked or 0) + (bicycle or 0)
    pct_walk_bike = compute_pct(walk_bike, total_commuters)
    pct_remote = compute_pct(wfh, total_commuters)

    return {
        "cbsa_code": cbsa_code,
        "name": name,
        "total_workers_16plus_time": total_workers_time,
        "total_commuters": total_commuters,
        "avgCommuteMinutes": avg_commute,
        "pctTransitCommute": pct_transit,
        "pctWalkBike": pct_walk_bike,
        "pctRemoteWork": pct_remote,
        "longCommutePct": long_commute_pct,
        # Raw counts for transparency
        "_raw_bands": band_values,
        "_raw_transit": transit,
        "_raw_bicycle": bicycle,
        "_raw_walked": walked,
        "_raw_wfh": wfh,
    }


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    key = load_key()
    pulled_at = datetime.now(timezone.utc).isoformat()

    print("=" * 60)
    print("[transportation] Census ACS B08303 + B08301 — CBSA Transportation ETL")
    print(f"[transportation] Pulled at: {pulled_at}")
    print(f"[transportation] Output: {OUT_PATH}")

    # Fetch
    raw = fetch_transportation_all_cbsas(key)
    header = raw["header"]
    rows = raw["rows"]

    # Parse
    transportation = {}
    parse_errors = 0
    null_total_workers = 0

    for i, row in enumerate(rows):
        try:
            rec = parse_cbsa_row(header, row)
            cbsa_code = rec["cbsa_code"]

            if rec["total_workers_16plus_time"] is None:
                null_total_workers += 1

            transportation[cbsa_code] = {
                "name": rec["name"],
                "avgCommuteMinutes": rec["avgCommuteMinutes"],
                "pctTransitCommute": rec["pctTransitCommute"],
                "pctWalkBike": rec["pctWalkBike"],
                "pctRemoteWork": rec["pctRemoteWork"],
                "longCommutePct": rec["longCommutePct"],
                # Include raw counts for debugging / downstream use
                "totalWorkers": rec["total_workers_16plus_time"],
                "totalCommuters": rec["total_commuters"],
                "transitCommuters": rec["_raw_transit"],
                "bicycleCommuters": rec["_raw_bicycle"],
                "walkedCommuters": rec["_raw_walked"],
                "remoteWorkers": rec["_raw_wfh"],
            }
        except Exception as e:
            parse_errors += 1
            print(f"[transportation] Parse error row {i}: {e}")

    print(f"\n[transportation] Parsed {len(transportation)} CBSAs "
          f"({parse_errors} parse errors, {null_total_workers} with null worker count)")

    # Build output
    output = {
        "metadata": {
            "source": "U.S. Census Bureau, American Community Survey 5-Year Estimates (2022)",
            "tables": [
                "B08303 — Travel Time to Work",
                "B08301 — Means of Transportation to Work",
            ],
            "url": "https://api.census.gov/data/2022/acs/acs5",
            "pulled_at": pulled_at,
            "vintage": "2022 ACS 5-year",
            "geography": "All U.S. Core-Based Statistical Areas (metropolitan + micropolitan)",
            "time_band_midpoints": {
                "B08303_002E": {"label": "Less than 5 minutes", "midpoint": 2.5},
                "B08303_003E": {"label": "5 to 9 minutes", "midpoint": 7},
                "B08303_004E": {"label": "10 to 14 minutes", "midpoint": 12},
                "B08303_005E": {"label": "15 to 19 minutes", "midpoint": 17},
                "B08303_006E": {"label": "20 to 24 minutes", "midpoint": 22},
                "B08303_007E": {"label": "25 to 29 minutes", "midpoint": 27},
                "B08303_008E": {"label": "30 to 34 minutes", "midpoint": 32},
                "B08303_009E": {"label": "35 to 39 minutes", "midpoint": 37},
                "B08303_010E": {"label": "40 to 44 minutes", "midpoint": 42},
                "B08303_011E": {"label": "45 to 59 minutes", "midpoint": 52},
                "B08303_012E": {"label": "60 to 89 minutes", "midpoint": 74.5},
                "B08303_013E": {"label": "90 or more minutes", "midpoint": 105.0},
            },
            "derived_fields": {
                "avgCommuteMinutes": "weighted average of B08303 time bands × midpoints / total workers",
                "pctTransitCommute": "B08301_010E / B08301_001E * 100",
                "pctWalkBike": "(B08301_019E + B08301_018E) / B08301_001E * 100",
                "pctRemoteWork": "B08301_021E / B08301_001E * 100",
                "longCommutePct": "(B08303_010E + B08303_011E + B08303_012E + B08303_013E) / B08303_001E * 100",
            },
        },
        "transportation": transportation,
    }

    # Write
    json.dump(output, open(OUT_PATH, "w"), indent=2)
    print(f"[transportation] Wrote {OUT_PATH} ({len(transportation)} CBSAs)")

    # ── Validation / Summary ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)

    total = len(transportation)
    with_avg = sum(1 for v in transportation.values()
                   if v["avgCommuteMinutes"] is not None)
    with_transit = sum(1 for v in transportation.values()
                       if v["pctTransitCommute"] is not None)
    with_walkbike = sum(1 for v in transportation.values()
                        if v["pctWalkBike"] is not None)
    with_remote = sum(1 for v in transportation.values()
                      if v["pctRemoteWork"] is not None)
    with_long = sum(1 for v in transportation.values()
                    if v["longCommutePct"] is not None)

    print(f"  Total CBSAs:               {total}")
    print(f"  With avg commute:           {with_avg} ({with_avg / max(total, 1) * 100:.1f}%)")
    print(f"  With transit %:             {with_transit} ({with_transit / max(total, 1) * 100:.1f}%)")
    print(f"  With walk/bike %:           {with_walkbike} ({with_walkbike / max(total, 1) * 100:.1f}%)")
    print(f"  With remote work %:         {with_remote} ({with_remote / max(total, 1) * 100:.1f}%)")
    print(f"  With long commute %:        {with_long} ({with_long / max(total, 1) * 100:.1f}%)")

    # Percentile distributions
    for field, label in [
        ("avgCommuteMinutes", "Average commute (minutes)"),
        ("pctTransitCommute", "% Public transit"),
        ("pctWalkBike", "% Walk/Bike"),
        ("pctRemoteWork", "% Remote work"),
        ("longCommutePct", "% Long commute (45+ min)"),
    ]:
        vals = sorted([v[field] for v in transportation.values() if v[field] is not None])
        if vals:
            p10 = vals[len(vals) // 10]
            p25 = vals[len(vals) // 4]
            p50 = vals[len(vals) // 2]
            p75 = vals[len(vals) * 3 // 4]
            p90 = vals[len(vals) * 9 // 10]
            print(f"\n  {label} distribution:")
            print(f"    Min:  {vals[0]:.1f}")
            print(f"    P10:  {p10:.1f}")
            print(f"    P25:  {p25:.1f}")
            print(f"    P50:  {p50:.1f}")
            print(f"    P75:  {p75:.1f}")
            print(f"    P90:  {p90:.1f}")
            print(f"    Max:  {vals[-1]:.1f}")

    # Top/Bottom 5 by avg commute
    ranked = sorted(
        [(k, v) for k, v in transportation.items() if v["avgCommuteMinutes"] is not None],
        key=lambda kv: kv[1]["avgCommuteMinutes"],
        reverse=True,
    )
    print(f"\n  Top 5 CBSAs by avg commute (longest):")
    for i, (code, v) in enumerate(ranked[:5], 1):
        print(f"    {i}. {v['name'][:50]:50s} {v['avgCommuteMinutes']:.1f} min  (CBSA {code})")

    print(f"\n  Bottom 5 CBSAs by avg commute (shortest):")
    for i, (code, v) in enumerate(ranked[-5:], 1):
        print(f"    {i}. {v['name'][:50]:50s} {v['avgCommuteMinutes']:.1f} min  (CBSA {code})")

    # Spot-check NY metro
    ny = transportation.get("35620")
    if ny:
        print(f"\n  Spot Check — New York-Newark-Jersey City, NY-NJ-PA (CBSA 35620):")
        for k, val in ny.items():
            print(f"    {k}: {val}")

    print(f"\n[transportation] Done.")


if __name__ == "__main__":
    main()
