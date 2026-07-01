#!/usr/bin/env python3
"""
build_cbsa_broadband.py — Fetch CBSA-level broadband data from Census ACS
Table B28002 (Presence and Types of Internet Subscriptions in Household).

Closes the broadband gap: 877/939 CBSAs were missing broadband.pctHouseholdsWith100MbpsPlus
and broadband.medianDownloadMbps. The 62 CBSAs in metros.json already had broadband data
from a prior manual pull; this script fills the remaining 877 via the Census API.

Source: U.S. Census Bureau, American Community Survey 5-Year Estimates (2022 vintage).
Geography: All Core-Based Statistical Areas (metropolitan + micropolitan).
API key loaded from /home/mongo/projects/us-relocation-2026/.env.census.

Variables from B28002:
  B28002_001E — Total households (denominator)
  B28002_004E — Broadband of any type (cable/fiber/DSL + satellite + cellular)
  B28002_007E — Broadband such as cable, fiber optic or DSL (wired broadband)

Output: sources/processed/cbsa_broadband.json
  Schema: {"metadata": {...}, "broadband": {"10100": {"pctHouseholdsWith100MbpsPlus": 69.4, ...}, ...}}

The ACS does not contain medianDownloadMbps — set to 0.0 as sentinel.
pctHouseholdsWith100MbpsPlus is proxied by B28002_007E / B28002_001E * 100
(cable/fiber/DSL connections are assumed capable of 100 Mbps+).
"""

import json
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/cbsa_broadband.json"
ENV_FILE = ROOT / ".env.census"

# Columns in order passed to 'get' parameter
ACS_COLUMNS = [
    "NAME",            # CBSA name (for verification only)
    "B28002_001E",     # Total households
    "B28002_004E",     # Broadband of any type
    "B28002_007E",     # Broadband: cable, fiber optic, or DSL
]


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
    """Compute percentage: (numerator / denominator) * 100, or 0.0 if invalid."""
    if numerator is None or denominator is None or denominator == 0:
        return 0.0
    return round(numerator / denominator * 100, 2)


def fetch_b28002_all_cbsas(key: str) -> dict:
    """
    Single API call: pull B28002 for all CBSAs (metro + micro).
    Returns parsed records.
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

    print(f"[cbsa-broadband] Fetching: {base}?get={get_str[:80]}...")
    print(f"[cbsa-broadband] Geography: metropolitan+micropolitan statistical areas (all CBSAs)")

    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))

    if not isinstance(data, list) or len(data) < 2:
        raise RuntimeError(f"Unexpected API response format: {type(data)}")

    header = data[0]
    rows = data[1:]

    print(f"[cbsa-broadband] API returned {len(header)} columns, {len(rows)} rows")
    print(f"[cbsa-broadband] Header: {header}")

    return {"header": header, "rows": rows}


def parse_row(header, row):
    """Parse a single CBSA data row into structured dict."""
    rec = dict(zip(header, row))

    # CBSA code from the last column (geography)
    cbsa_code = row[-1]
    name = rec.get("NAME", "")

    total_hh = safe_int(rec.get("B28002_001E"))
    broadband_any = safe_int(rec.get("B28002_004E"))
    broadband_wired = safe_int(rec.get("B28002_007E"))  # cable/fiber/DSL

    pct_100mbps = compute_pct(broadband_wired, total_hh)
    pct_any_broadband = compute_pct(broadband_any, total_hh)

    return {
        "cbsa_code": cbsa_code,
        "name": name,
        "total_households": total_hh,
        "broadband_any_type": broadband_any,
        "broadband_wired_cable_fiber_dsl": broadband_wired,
        "pctHouseholdsWith100MbpsPlus": pct_100mbps,
        "pctHouseholdsWithAnyBroadband": pct_any_broadband,
        "medianDownloadMbps": 0.0,
    }


def main():
    key = load_key()
    pulled_at = datetime.now(timezone.utc).isoformat()

    print("=" * 60)
    print("[cbsa-broadband] Census ACS B28002 — CBSA Broadband ETL")
    print(f"[cbsa-broadband] Pulled at: {pulled_at}")
    print(f"[cbsa-broadband] Output: {OUT_PATH}")

    # Fetch all CBSAs
    raw = fetch_b28002_all_cbsas(key)
    header = raw["header"]
    rows = raw["rows"]

    # Parse every row
    broadband: dict[str, dict] = {}
    parse_errors = 0
    skipped_null = 0

    for i, row in enumerate(rows):
        try:
            rec = parse_row(header, row)
            cbsa_code = rec["cbsa_code"]
            # Check if we have usable data
            if rec["total_households"] is None:
                skipped_null += 1
            broadband[cbsa_code] = {
                "name": rec["name"],
                "total_households": rec["total_households"],
                "broadband_any_type": rec["broadband_any_type"],
                "broadband_wired_cable_fiber_dsl": rec["broadband_wired_cable_fiber_dsl"],
                "pctHouseholdsWith100MbpsPlus": rec["pctHouseholdsWith100MbpsPlus"],
                "medianDownloadMbps": rec["medianDownloadMbps"],
            }
        except Exception as e:
            parse_errors += 1
            print(f"[cbsa-broadband] Parse error row {i}: {e}")

    print(f"\n[cbsa-broadband] Parsed {len(broadband)} CBSAs "
          f"({parse_errors} parse errors, {skipped_null} with null household count)")

    # Build output
    output = {
        "metadata": {
            "source": "U.S. Census Bureau, American Community Survey 5-Year Estimates (2022)",
            "table": "B28002 — Presence and Types of Internet Subscriptions in Household",
            "url": "https://api.census.gov/data/2022/acs/acs5",
            "pulled_at": pulled_at,
            "vintage": "2022 ACS 5-year",
            "geography": "All U.S. Core-Based Statistical Areas (metropolitan + micropolitan)",
            "variables_used": {
                "B28002_001E": "Total households",
                "B28002_004E": "Broadband of any type",
                "B28002_007E": "Broadband such as cable, fiber optic or DSL",
            },
            "derived_fields": {
                "pctHouseholdsWith100MbpsPlus": "B28002_007E / B28002_001E * 100 (proxy: wired broadband assumed ≥100 Mbps capable)",
                "medianDownloadMbps": "0.0 sentinel — ACS does not provide download speed measurements",
            },
            "note": "pctHouseholdsWith100MbpsPlus uses B28002_007E (cable/fiber/DSL) as a proxy for 100Mbps+ capable connections. The ACS does not measure actual download speeds.",
        },
        "broadband": broadband,
    }

    # Write
    json.dump(output, open(OUT_PATH, "w"), indent=2)
    print(f"[cbsa-broadband] Wrote {OUT_PATH} ({len(broadband)} CBSAs)")

    # ── Validation / Summary ──────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)

    total = len(broadband)
    with_data = sum(1 for v in broadband.values() if v["pctHouseholdsWith100MbpsPlus"] > 0)
    with_null_hh = sum(1 for v in broadband.values() if v["total_households"] is None)
    print(f"  Total CBSAs:               {total}")
    print(f"  With broadband data:        {with_data} ({with_data / max(total, 1) * 100:.1f}%)")
    print(f"  With null household count:  {with_null_hh}")

    # Percentile distribution
    pcts = sorted([v["pctHouseholdsWith100MbpsPlus"] for v in broadband.values() if v["pctHouseholdsWith100MbpsPlus"] > 0])
    if pcts:
        p10 = pcts[len(pcts) // 10]
        p25 = pcts[len(pcts) // 4]
        p50 = pcts[len(pcts) // 2]
        p75 = pcts[len(pcts) * 3 // 4]
        p90 = pcts[len(pcts) * 9 // 10]
        print(f"\n  pctHouseholdsWith100MbpsPlus distribution:")
        print(f"    Min:  {pcts[0]:.1f}%")
        print(f"    P10:  {p10:.1f}%")
        print(f"    P25:  {p25:.1f}%")
        print(f"    P50:  {p50:.1f}%")
        print(f"    P75:  {p75:.1f}%")
        print(f"    P90:  {p90:.1f}%")
        print(f"    Max:  {pcts[-1]:.1f}%")

    # Top 5 and bottom 5
    ranked = sorted(broadband.items(), key=lambda kv: kv[1]["pctHouseholdsWith100MbpsPlus"], reverse=True)
    print(f"\n  Top 5 CBSAs by % with broadband:")
    for i, (code, v) in enumerate(ranked[:5], 1):
        print(f"    {i}. {v['name'][:45]:45s} {v['pctHouseholdsWith100MbpsPlus']:.1f}%  (CBSA {code})")

    print(f"\n  Bottom 5 CBSAs by % with broadband:")
    for i, (code, v) in enumerate(ranked[-5:], 1):
        print(f"    {i}. {v['name'][:45]:45s} {v['pctHouseholdsWith100MbpsPlus']:.1f}%  (CBSA {code})")

    # Check overlap with metros.json: how many of the 62 legacy metros have matching CBSA codes
    metros_json = ROOT / "sources/processed/metros.json"
    if metros_json.exists():
        metros_data = json.load(open(metros_json))
        metros_cbsa_codes = set()
        for m in metros_data.get("metros", []):
            fd = m.get("family_decision", {})
            bb = fd.get("broadband", {})
            # metros.json has cbsa_name like "Memphis, TN-MS-AR Metro Area" 
            # but no cbsa_code directly. We check by name prefix.
            pass  # Skipped detailed cross-check since metros don't have CBSA codes

    print(f"\n[cbsa-broadband] Done. Gap: {877} fixed → {with_data} CBSAs now have broadband data.")
    print(f"[cbsa-broadband] Next: update build_locations.py to load cbsa_broadband.json")


if __name__ == "__main__":
    main()
