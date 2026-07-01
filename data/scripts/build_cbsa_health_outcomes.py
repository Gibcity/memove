#!/usr/bin/env python3
"""
build_cbsa_health_outcomes.py
Download County Health Rankings data and aggregate to CBSA level.

Methodology:
1. Download County Health Rankings analytic data CSV (2024 release)
2. Parse county-level health metrics:
   - Life expectancy (v147_rawvalue)
   - Adult obesity % (v011_rawvalue)
   - Adult smoking % (v009_rawvalue)
   - Physical inactivity % (v070_rawvalue)
   - Mental health providers per 100k (v062_rawvalue)
   - Poor mental health days (v042_rawvalue)
   - Drug overdose deaths per 100k (v138_rawvalue)
   - Primary care physicians per 100k (v004_rawvalue)
3. Aggregate county → CBSA using population-weighted average
4. Output to sources/processed/cbsa_health_outcomes.json

Uses Python stdlib only.
"""

import csv
import json
import os
import urllib.request
from datetime import datetime, timezone

# ─── Paths ───────────────────────────────────────────────────
BASE_DIR = "/home/mongo/projects/us-relocation-2026"
CROSSWALK_PATH = f"{BASE_DIR}/sources/processed/cbsa_county_crosswalk.json"
RAW_DIR = f"{BASE_DIR}/sources/raw"
OUTPUT_PATH = f"{BASE_DIR}/sources/processed/cbsa_health_outcomes.json"

CHR_URL = "https://www.countyhealthrankings.org/sites/default/files/media/document/analytic_data2024.csv"
CHR_LOCAL = f"{RAW_DIR}/chr_analytic_data2024.csv"

# ─── Variable mapping ────────────────────────────────────────
# (csv_column_name, output_key, conversion_multiplier)
# - percentage metrics (0-1 ratio) → multiply by 100 for pct
# - provider metrics (per-capita) → multiply by 100000 for per-100k
# - life_expectancy and days metrics → no conversion (multiplier=1)
VARIABLE_MAP = {
    "v147_rawvalue": ("lifeExpectancy", 1),           # years
    "v011_rawvalue": ("adultObesityPct", 100),        # 0-1 → pct
    "v009_rawvalue": ("adultSmokingPct", 100),        # 0-1 → pct
    "v070_rawvalue": ("physicalInactivityPct", 100),  # 0-1 → pct
    "v062_rawvalue": ("mentalHealthProvidersPer100k", 100000),  # per-capita → per-100k
    "v042_rawvalue": ("poorMentalHealthDays", 1),      # days (already 0-30 scale)
    "v138_rawvalue": ("drugOverdoseDeathsPer100k", 1), # already per-100k
    "v004_rawvalue": ("primaryCarePhysiciansPer100k", 100000),  # per-capita → per-100k
}

# Population field for weighting
POPULATION_FIELD = "v051_rawvalue"

# ─── Download ────────────────────────────────────────────────
def download_chr():
    """Download County Health Rankings data if not already cached."""
    os.makedirs(RAW_DIR, exist_ok=True)

    if os.path.exists(CHR_LOCAL):
        size_mb = os.path.getsize(CHR_LOCAL) / (1024 * 1024)
        print(f"[1/4] CHR data already cached: {CHR_LOCAL} ({size_mb:.1f} MB)")
        return CHR_LOCAL

    print(f"[1/4] Downloading County Health Rankings data...")
    print(f"  URL: {CHR_URL}")
    try:
        urllib.request.urlretrieve(CHR_LOCAL, filename=CHR_LOCAL)
        size_mb = os.path.getsize(CHR_LOCAL) / (1024 * 1024)
        print(f"  Downloaded: {size_mb:.1f} MB")
    except Exception as e:
        print(f"  ERROR downloading: {e}")
        raise
    return CHR_LOCAL


# ─── Parse CSV ───────────────────────────────────────────────
def parse_chr(csv_path):
    """Parse the CHR CSV and extract county-level health metrics."""
    print(f"[2/4] Parsing CHR data from {csv_path}...")

    county_data = {}  # fipscode → {output_key: value, ..., "population": value}

    with open(csv_path, newline="", encoding="utf-8") as f:
        # Skip the first header row (long descriptive names) and use the
        # second row (short variable names like fipscode, v001_rawvalue)
        _long_header = f.readline()  # discard "Premature Death raw value", etc.
        short_header = f.readline().strip()
        fieldnames = short_header.split(",")
        reader = csv.DictReader(f, fieldnames=fieldnames)

        for row in reader:
            fips = row.get("fipscode", "").strip()
            if not fips or fips == "00000":
                # Skip the "United States" row and any blanks
                continue

            # Skip state-level aggregates (countycode=000)
            countycode = row.get("countycode", "").strip()
            if countycode == "000":
                continue

            # Get population for weighting
            pop_str = row.get(POPULATION_FIELD, "").strip()
            try:
                population = float(pop_str) if pop_str else 0
            except ValueError:
                population = 0

            if population <= 0:
                continue

            entry = {"population": population}

            for var_name, (output_key, multiplier) in VARIABLE_MAP.items():
                val_str = row.get(var_name, "").strip()
                if val_str:
                    try:
                        raw_val = float(val_str)
                        entry[output_key] = raw_val * multiplier
                    except ValueError:
                        pass  # Leave as missing

            # Only include if we have at least some health data
            if len(entry) > 1:  # more than just population
                county_data[fips] = entry

    print(f"  Parsed {len(county_data)} counties with health data")
    return county_data


# ─── Load Crosswalk ──────────────────────────────────────────
def load_crosswalk():
    """Load CBSA→county crosswalk."""
    with open(CROSSWALK_PATH) as f:
        data = json.load(f)
    crosswalk = data["crosswalk"]
    print(f"  Loaded crosswalk: {len(crosswalk)} CBSAs, "
          f"{sum(len(v.get('counties',[])) for v in crosswalk.values())} county assignments")
    return crosswalk


# ─── Aggregate to CBSA ───────────────────────────────────────
def aggregate_to_cbsa(county_data, crosswalk):
    """Aggregate county-level metrics to CBSA using population-weighted average."""
    print(f"[3/4] Aggregating county data to CBSA level...")

    cbsa_health = {}
    matched_counties = set()
    unmatched_cbsas = []
    counties_per_cbsa = {}

    for cbsa_code, cbsa_info in crosswalk.items():
        counties = cbsa_info.get("counties", [])
        cbsa_pop_total = 0
        output_keys = [v[0] for v in VARIABLE_MAP.values()]
        weighted_sums = {key: 0.0 for key in output_keys}
        county_count = 0

        for county in counties:
            fips = county.get("stcofips", "")
            if fips in county_data:
                pop = county_data[fips]["population"]
                cbsa_pop_total += pop
                matched_counties.add(fips)
                county_count += 1

                for var_name, (output_key, multiplier) in VARIABLE_MAP.items():
                    if output_key in county_data[fips]:
                        weighted_sums[output_key] += county_data[fips][output_key] * pop

        counties_per_cbsa[cbsa_code] = {
            "total": len(counties),
            "matched": county_count,
        }

        if cbsa_pop_total > 0:
            cbsa_entry = {}
            for output_key in output_keys:
                if weighted_sums[output_key] > 0:
                    cbsa_entry[output_key] = round(weighted_sums[output_key] / cbsa_pop_total, 2)

            if cbsa_entry:
                cbsa_health[cbsa_code] = cbsa_entry
        else:
            unmatched_cbsas.append((cbsa_code, cbsa_info.get("name", "Unknown")))

    # Report coverage
    total_chr_counties = len(county_data)
    matched_pct = len(matched_counties) / max(total_chr_counties, 1) * 100
    print(f"  CHR counties matched to CBSAs: {len(matched_counties)}/{total_chr_counties} ({matched_pct:.1f}%)")
    print(f"  CBSAs with health data: {len(cbsa_health)}/{len(crosswalk)}")

    if unmatched_cbsas:
        print(f"  CBSAs with NO population (unmatched): {len(unmatched_cbsas)}")
        for code, name in unmatched_cbsas[:10]:
            print(f"    {code} {name}")

    # Coverage details
    cbsas_with_full = sum(1 for v in cbsa_health.values() if len(v) == len(VARIABLE_MAP))
    print(f"  CBSAs with ALL {len(VARIABLE_MAP)} metrics: {cbsas_with_full}")
    partial = len(cbsa_health) - cbsas_with_full
    if partial > 0:
        print(f"  CBSAs with partial metrics: {partial}")

    return cbsa_health, counties_per_cbsa


# ─── Verify ──────────────────────────────────────────────────
def verify(cbsa_health, crosswalk):
    """Run verification checks on the output."""
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)

    all_cbsa_codes = set(crosswalk.keys())
    covered = set(cbsa_health.keys())
    missing = all_cbsa_codes - covered
    print(f"1. Coverage: {len(covered)}/{len(all_cbsa_codes)} CBSAs have health data")
    if missing:
        print(f"   Missing ({len(missing)}): {sorted(missing)[:20]}{'...' if len(missing)>20 else ''}")
    else:
        print("   ✓ All CBSAs covered")

    # Distribution checks for each metric
    output_keys = [v[0] for v in VARIABLE_MAP.values()]
    for output_key in output_keys:
        values = [v[output_key] for v in cbsa_health.values() if output_key in v]
        if values:
            print(f"2. {output_key}: min={min(values):.2f}, max={max(values):.2f}, "
                  f"median={sorted(values)[len(values)//2]:.2f}, n={len(values)}")

    # Spot-checks: large metros
    spot_checks = {
        "16980": "Chicago-Naperville-Elgin, IL-IN-WI",
        "35620": "New York-Newark-Jersey City, NY-NJ-PA",
        "31080": "Los Angeles-Long Beach-Anaheim, CA",
        "19100": "Dallas-Fort Worth-Arlington, TX",
        "26420": "Houston-The Woodlands-Sugar Land, TX",
        "12060": "Atlanta-Sandy Springs-Roswell, GA",
    }
    print("\n3. Spot-checks (large metros):")
    for code, name in spot_checks.items():
        data = cbsa_health.get(code, {})
        le = data.get("lifeExpectancy", "N/A")
        ob = data.get("adultObesityPct", "N/A")
        sm = data.get("adultSmokingPct", "N/A")
        print(f"   {code} {name}: LE={le}, Obesity={ob}%, Smoking={sm}%")

    # Small/rural examples
    small_rurals = ["10100", "10140", "10220"]
    print("\n   Small/rural examples:")
    for code in small_rurals:
        data = cbsa_health.get(code, {})
        name = crosswalk.get(code, {}).get("name", "?")
        le = data.get("lifeExpectancy", "N/A")
        ob = data.get("adultObesityPct", "N/A")
        print(f"   {code} {name}: LE={le}, Obesity={ob}%")


# ─── Main ────────────────────────────────────────────────────
def main():
    # Download data
    csv_path = download_chr()

    # Parse county data
    county_data = parse_chr(csv_path)

    # Load crosswalk
    crosswalk = load_crosswalk()

    # Aggregate
    cbsa_health, counties_per_cbsa = aggregate_to_cbsa(county_data, crosswalk)

    # Build output
    output = {
        "metadata": {
            "source": "county_health_rankings_2024",
            "source_url": CHR_URL,
            "methodology": (
                "County-level health metrics from the 2024 County Health Rankings "
                "(Robert Wood Johnson Foundation). Aggregated to CBSA level using "
                "population-weighted average (weight = v051_rawvalue county population). "
                "All 3,143 U.S. counties (excluding state/national aggregates) are included; "
                "counties with clustered=1 share estimates with neighboring counties for "
                "privacy but retain usable per-county values. "
                "Unit conversions applied: percentage metrics (obesity, smoking, inactivity) "
                "×100 for pct; provider metrics (MH providers, PCPs) ×100,000 for per-100k. "
                "Life expectancy and drug overdose deaths kept as-is. "
                "Puerto Rico CBSAs are excluded (CHR only covers 50 states + DC)."
            ),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "cbsa_count": len(cbsa_health),
            "total_cbsas_in_crosswalk": len(crosswalk),
            "chr_counties_parsed": len(county_data),
            "aggregation_method": "population_weighted_average",
            "note": (
                "Variable numbers differ from task description due to actual CSV structure. "
                "v147 (not v001) = life expectancy; v011 (not v166) = adult obesity; "
                "v138 (not v006) = drug overdose deaths."
            ),
        },
        "health": cbsa_health,
    }

    # Write output
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Output written to {OUTPUT_PATH}")
    print(f"  CBSAs with health data: {len(cbsa_health)}")

    # Verify
    verify(cbsa_health, crosswalk)


if __name__ == "__main__":
    main()
