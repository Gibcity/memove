#!/usr/bin/env python3
"""
Build CBSA-to-county FIPS crosswalk from the Census Bureau's official
CBSA delineation file (List 1, March 2020 OMB delineations).

Output: sources/processed/cbsa_county_crosswalk.json
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RAW_FILE = PROJECT_ROOT / "sources/raw/census/cbsa_delineation_2020.xls"
ACS_FILE = PROJECT_ROOT / "sources/processed/census_acs_cbsa.json"
OUTPUT_FILE = PROJECT_ROOT / "sources/processed/cbsa_county_crosswalk.json"

SOURCE_URL = (
    "https://www2.census.gov/programs-surveys/metro-micro/geographies/"
    "reference-files/2020/delineation-files/list1_2020.xls"
)


def load_acs_cbsa_codes() -> set:
    """Return the set of 5-digit CBSA codes from the ACS data."""
    with open(ACS_FILE) as f:
        acs = json.load(f)
    return {c["cbsa_code"] for c in acs["cbsas"]}


def load_delineation():
    """Parse the Census delineation .xls file and return a list of data rows."""
    df = pd.read_excel(RAW_FILE, skiprows=2)
    # Rename columns for clarity
    df.columns = [
        "cbsa_code", "metro_div_code", "csa_code", "cbsa_title",
        "metro_micro_area", "metro_div_title", "csa_title",
        "county", "state", "fips_state", "fips_county", "central_outlying",
    ]

    # Filter: only rows with a numeric CBSA code
    rows = []
    for _, row in df.iterrows():
        cbsa_raw = row["cbsa_code"]
        if pd.isna(cbsa_raw):
            continue
        try:
            cbsa_code = str(int(float(cbsa_raw))).zfill(5)
        except (ValueError, TypeError):
            continue

        # Build STCOFIPS (state + county FIPS)
        fips_state_raw = row["fips_state"]
        fips_county_raw = row["fips_county"]
        if pd.isna(fips_state_raw) or pd.isna(fips_county_raw):
            continue
        try:
            fips_state = str(int(float(fips_state_raw))).zfill(2)
            fips_county = str(int(float(fips_county_raw))).zfill(3)
            stcofips = fips_state + fips_county
        except (ValueError, TypeError):
            continue

        # Determine area type
        area_type_raw = str(row["metro_micro_area"]).strip() if pd.notna(row["metro_micro_area"]) else ""
        if "Metropolitan" in area_type_raw:
            area_type = "Metro"
        elif "Micropolitan" in area_type_raw:
            area_type = "Micro"
        else:
            area_type = "Unknown"

        rows.append({
            "cbsa_code": cbsa_code,
            "cbsa_name": str(row["cbsa_title"]).strip() if pd.notna(row["cbsa_title"]) else "",
            "area_type": area_type,
            "county": str(row["county"]).strip() if pd.notna(row["county"]) else "",
            "state": str(row["state"]).strip() if pd.notna(row["state"]) else "",
            "stcofips": stcofips,
        })

    return rows


def build_crosswalk(rows):
    """Aggregate rows into a dict keyed by CBSA code."""
    crosswalk = {}
    for r in rows:
        code = r["cbsa_code"]
        if code not in crosswalk:
            crosswalk[code] = {
                "name": r["cbsa_name"],
                "type": r["area_type"],
                "counties": [],
            }
        # Avoid duplicate county entries
        existing_fips = {c["stcofips"] for c in crosswalk[code]["counties"]}
        if r["stcofips"] not in existing_fips:
            crosswalk[code]["counties"].append({
                "stcofips": r["stcofips"],
                "county": r["county"],
                "state": r["state"],
            })

    return crosswalk


def verify(crosswalk, acs_codes):
    """Print verification stats."""
    cbsa_count = len(crosswalk)
    total_counties = sum(len(v["counties"]) for v in crosswalk.values())

    print(f"\n=== VERIFICATION ===")
    print(f"CBSAs in crosswalk: {cbsa_count}")
    print(f"Total county mappings: {total_counties}")
    print(f"Average counties per CBSA: {total_counties / cbsa_count:.1f}" if cbsa_count else "N/A")

    # Check all ACS codes appear
    missing = acs_codes - set(crosswalk.keys())
    extra = set(crosswalk.keys()) - acs_codes
    print(f"\nACS CBSA codes: {len(acs_codes)}")
    print(f"Crosswalk CBSA codes: {len(crosswalk)}")
    if missing:
        print(f"MISSING from crosswalk ({len(missing)}): {sorted(missing)}")
    else:
        print("✓ All ACS CBSA codes found in crosswalk")
    if extra:
        print(f"EXTRA in crosswalk (not in ACS) ({len(extra)}): {sorted(extra)}")

    # Check all STCOFIPS are 5 digits
    bad_fips = []
    for cbsa, data in crosswalk.items():
        for c in data["counties"]:
            stco = c["stcofips"]
            if len(stco) != 5 or not stco.isdigit():
                bad_fips.append((cbsa, stco))
    if bad_fips:
        print(f"\n⚠ BAD FIPS CODES: {bad_fips}")
    else:
        print("✓ All STCOFIPS codes are 5 digits")

    # Spot-check well-known CBSAs
    spot_checks = {
        "19100": "Dallas-Fort Worth-Arlington, TX",  # should have Dallas, Tarrant, Collin, Denton
        "35620": "New York-Newark-Jersey City, NY-NJ-PA",  # 5 boroughs area
        "31080": "Los Angeles-Long Beach-Anaheim, CA",  # LA County
    }
    print("\n--- Spot Checks ---")
    for code, expected_name in spot_checks.items():
        if code in crosswalk:
            cw = crosswalk[code]
            county_names = [c["county"] for c in cw["counties"]]
            print(f"\n{code} ({cw['name']}): {len(cw['counties'])} counties")
            for c in cw["counties"]:
                print(f"  {c['stcofips']} - {c['county']}, {c['state']}")
        else:
            print(f"\n{code} ({expected_name}): NOT FOUND in crosswalk")

    # Coverage stats
    matched = sum(1 for c in acs_codes if c in crosswalk)
    print(f"\n=== COVERAGE ===")
    print(f"ACS CBSAs with ≥1 county mapped: {matched} / {len(acs_codes)} ({100*matched/len(acs_codes):.1f}%)")


def main():
    print("Loading ACS CBSA codes...")
    acs_codes = load_acs_cbsa_codes()
    print(f"  Found {len(acs_codes)} CBSA codes")

    print(f"Parsing delineation file: {RAW_FILE}")
    rows = load_delineation()
    print(f"  Parsed {len(rows)} county rows")

    crosswalk = build_crosswalk(rows)

    # Metadata
    download_time = datetime.now(timezone.utc).isoformat()
    output = {
        "metadata": {
            "source": "census_bureau_metro_micro_delineation_2020",
            "downloaded_at": download_time,
            "source_url": SOURCE_URL,
            "cbsa_count": len(crosswalk),
            "county_count": sum(len(v["counties"]) for v in crosswalk.values()),
            "delineation_year": "2020",
        },
        "crosswalk": crosswalk,
    }

    # Write output
    os.makedirs(OUTPUT_FILE.parent, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nWrote crosswalk to: {OUTPUT_FILE}")

    # Verify
    verify(crosswalk, acs_codes)


if __name__ == "__main__":
    main()
