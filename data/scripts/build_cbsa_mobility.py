#!/usr/bin/env python3
"""
build_cbsa_mobility.py — Build CBSA-level economic mobility data
from the Harvard Opportunity Atlas tract-level data.

Downloads tract_outcomes_simple.csv from Opportunity Insights,
aggregates kfr_pooled_pooled_p25 (absolute upward mobility) to CBSA level
using population-weighted averages via the CBSA→county crosswalk.

Source: Opportunity Insights — The Opportunity Atlas
URL: https://opportunityinsights.org/wp-content/uploads/2018/10/tract_outcomes_simple.csv

Key metric: kfr_pooled_pooled_p25 — mean household income rank in adulthood
for children born to families at the 25th income percentile.
Higher = better upward mobility. Typical range: 35-55.

Output: sources/processed/cbsa_mobility.json
"""

import csv
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import urllib.request

# ── Paths ──────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RAW_DIR = PROJECT_ROOT / "sources/raw/opportunity_atlas"
OUT_PATH = PROJECT_ROOT / "sources/processed/cbsa_mobility.json"
CROSSWALK_PATH = PROJECT_ROOT / "sources/processed/cbsa_county_crosswalk.json"
ACS_CBSA_PATH = PROJECT_ROOT / "sources/processed/census_acs_cbsa.json"

DATA_URL = "https://opportunityinsights.org/wp-content/uploads/2018/10/tract_outcomes_simple.csv"

# ── Helpers ────────────────────────────────────────────────────────────────

def load_crosswalk() -> tuple[dict, dict]:
    """Load CBSA→county crosswalk and build county→CBSA reverse index.

    Returns:
        (crosswalk, county_to_cbsa):
            crosswalk: CBSA code → {name, type, counties: [...]}
            county_to_cbsa: stcofips (5-digit) → CBSA code
    """
    with open(CROSSWALK_PATH) as f:
        data = json.load(f)

    crosswalk = data["crosswalk"]
    county_to_cbsa = {}

    for cbsa_code, cbsa_data in crosswalk.items():
        for county in cbsa_data["counties"]:
            stcofips = county["stcofips"]
            # Each county is in exactly one CBSA in the delineation
            county_to_cbsa[stcofips] = cbsa_code

    return crosswalk, county_to_cbsa


def load_acs_cbsa_names() -> dict:
    """Load CBSA names from census_acs_cbsa.json for verification."""
    with open(ACS_CBSA_PATH) as f:
        acs = json.load(f)
    return {c["cbsa_code"]: c.get("name", "") for c in acs.get("cbsas", [])}


def safe_float(val: str) -> Optional[float]:
    """Convert string to float, returning None for empty/invalid/missing."""
    if val is None or val == "" or val == "." or val == "NA" or val == "N/A":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def safe_int(val: str) -> Optional[int]:
    """Convert string to int, returning None for empty/invalid/missing."""
    if val is None or val == "" or val == "." or val == "NA" or val == "N/A":
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def download_csv(url: str, dest: Path) -> Path:
    """Download the tract outcomes CSV if not already present."""
    if dest.exists():
        print(f"[mobility] File already exists: {dest} ({dest.stat().st_size:,} bytes)")
        return dest

    print(f"[mobility] Downloading: {url}")
    print(f"[mobility] Destination: {dest}")

    dest.parent.mkdir(parents=True, exist_ok=True)

    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
    with urllib.request.urlopen(req, timeout=600) as r:
        content = r.read()

    with open(dest, "wb") as f:
        f.write(content)

    print(f"[mobility] Downloaded {len(content):,} bytes to {dest}")
    return dest


def compute_percentile_ranks(scores: dict[str, float]) -> dict[str, float]:
    """Compute percentile ranks (1-100) for a set of CBSA scores.

    Percentile = fraction of CBSAs with a LOWER score × 100.
    Higher mobility = higher percentile.
    """
    if not scores:
        return {}

    # Sort CBSAs by score ascending
    sorted_items = sorted(scores.items(), key=lambda x: x[1])
    n = len(sorted_items)

    percentiles = {}
    for rank, (cbsa_code, score) in enumerate(sorted_items):
        # Percentile = (number of CBSAs with lower score / total) * 100
        # For ties, use the midpoint
        # Simple approach: (rank / (n-1)) * 100, then round to integer
        percentile = round((rank / (n - 1)) * 100) if n > 1 else 50
        percentiles[cbsa_code] = percentile

    return percentiles


# ── Main Aggregation ───────────────────────────────────────────────────────

def aggregate_mobility(csv_path: Path, county_to_cbsa: dict, crosswalk: dict) -> dict:
    """Stream the tract CSV and aggregate kfr_pooled_pooled_p25 to CBSA level.

    Uses population-weighted average where weight = pooled_pooled_count
    (the number of children in the tract's pooled cohort).

    Returns:
        dict: CBSA code → {upwardMobilityScore, tractCount, totalKids}
    """
    # Accumulators per CBSA
    cbsa_weighted_sum: dict[str, float] = {}  # Σ(kfr * count)
    cbsa_total_count: dict[str, int] = {}      # Σ(count) — for weighted average
    cbsa_tract_count: dict[str, int] = {}       # number of tracts

    # Track counties/tracts not in our crosswalk
    unmapped_counties: set[str] = set()
    skipped_no_kfr = 0
    skipped_no_county = 0
    skipped_no_weight = 0
    total_tracts = 0

    print(f"[mobility] Reading CSV: {csv_path}")

    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            total_tracts += 1

            # Extract identifiers
            state_fips = row.get("state", "").strip()
            county_fips = row.get("county", "").strip()

            # Build 5-digit county FIPS (state + county)
            stcofips = (state_fips.zfill(2) + county_fips.zfill(3)) if state_fips and county_fips else ""

            if not stcofips or len(stcofips) != 5:
                skipped_no_county += 1
                continue

            # Get kfr_pooled_pooled_p25 (mobility metric)
            kfr_str = row.get("kfr_pooled_pooled_p25", "").strip()
            kfr = safe_float(kfr_str)
            if kfr is None:
                skipped_no_kfr += 1
                continue

            # Get weight (number of kids in pooled cohort)
            weight_str = row.get("pooled_pooled_count", "").strip()
            weight = safe_int(weight_str)
            if weight is None or weight <= 0:
                skipped_no_weight += 1
                # Still count tract but use weight=0? No — skip weighting but record tract
                # Actually, without weight we can't contribute to weighted average
                continue

            # Map county → CBSA
            cbsa_code = county_to_cbsa.get(stcofips)
            if cbsa_code is None:
                unmapped_counties.add(stcofips)
                continue

            # Accumulate
            if cbsa_code not in cbsa_weighted_sum:
                cbsa_weighted_sum[cbsa_code] = 0.0
                cbsa_total_count[cbsa_code] = 0
                cbsa_tract_count[cbsa_code] = 0

            # kfr is a fraction (0-1); multiply by 100 for 1-100 scale
            cbsa_weighted_sum[cbsa_code] += kfr * 100 * weight
            cbsa_total_count[cbsa_code] += weight
            cbsa_tract_count[cbsa_code] += 1

            # Progress every 10K tracts
            if total_tracts % 10000 == 0:
                print(f"[mobility] Processed {total_tracts:,} tracts... "
                      f"({len(cbsa_weighted_sum)} CBSAs with data so far)")

    print(f"\n[mobility] Total tracts in CSV: {total_tracts:,}")
    print(f"[mobility] Skipped — no kfr: {skipped_no_kfr}, no county FIPS: {skipped_no_county}, "
          f"no weight: {skipped_no_weight}")
    print(f"[mobility] Unmapped counties (not in crosswalk): {len(unmapped_counties)}")

    # Compute population-weighted averages
    mobility: dict = {}
    for cbsa_code in cbsa_weighted_sum:
        total_weight = cbsa_total_count[cbsa_code]
        if total_weight > 0:
            avg_kfr = cbsa_weighted_sum[cbsa_code] / total_weight
        else:
            avg_kfr = None

        mobility[cbsa_code] = {
            "upwardMobilityScore": round(avg_kfr, 2) if avg_kfr is not None else None,
            "tractCount": cbsa_tract_count[cbsa_code],
            "totalKids": cbsa_total_count[cbsa_code],
            "name": crosswalk.get(cbsa_code, {}).get("name", ""),
        }

    return mobility


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    pulled_at = datetime.now(timezone.utc).isoformat()

    print("=" * 60)
    print("[mobility] CBSA Economic Mobility ETL")
    print(f"[mobility] Pulled at: {pulled_at}")
    print(f"[mobility] Output: {OUT_PATH}")
    print()

    # Load crosswalk
    print("[mobility] Loading CBSA→county crosswalk...")
    crosswalk, county_to_cbsa = load_crosswalk()
    print(f"[mobility]   CBSAs: {len(crosswalk)}")
    print(f"[mobility]   County→CBSA mappings: {len(county_to_cbsa)}")

    # Download data
    print()
    csv_path = download_csv(DATA_URL, RAW_DIR / "tract_outcomes_simple.csv")

    # Aggregate
    print()
    mobility = aggregate_mobility(csv_path, county_to_cbsa, crosswalk)

    # Compute percentile ranks
    scores = {code: m["upwardMobilityScore"] for code, m in mobility.items()
              if m["upwardMobilityScore"] is not None}
    percentiles = compute_percentile_ranks(scores)

    # Merge percentiles into mobility data
    for cbsa_code in mobility:
        if cbsa_code in percentiles:
            mobility[cbsa_code]["percentile"] = percentiles[cbsa_code]
        else:
            mobility[cbsa_code]["percentile"] = None

    # Check coverage: which CBSAs from crosswalk are missing
    covered_cbsas = set(mobility.keys())
    all_cbsas = set(crosswalk.keys())
    missing = all_cbsas - covered_cbsas
    extra = covered_cbsas - all_cbsas

    print(f"\n[mobility] Coverage:")
    print(f"  CBSAs in crosswalk:    {len(all_cbsas)}")
    print(f"  CBSAs with mobility:   {len(covered_cbsas)}")
    print(f"  Missing from mobility: {len(missing)}")
    if extra:
        print(f"  Extra (not in crosswalk): {len(extra)}")

    # Build output
    output = {
        "metadata": {
            "source": "harvard_opportunity_atlas",
            "source_url": DATA_URL,
            "citation": "Chetty, Friedman, Hendren, Jones, Porter (2018). "
                        "The Opportunity Atlas: Mapping the Childhood Roots of Social Mobility.",
            "pulled_at": pulled_at,
            "geography": "All U.S. Core-Based Statistical Areas (metropolitan + micropolitan)",
            "aggregation_method": "Population-weighted average of tract-level kfr_pooled_pooled_p25, "
                                  "weighted by pooled_pooled_count (number of children in tract cohort). "
                                  "Tracts mapped to counties via first 5 digits of tract FIPS code, "
                                  "counties mapped to CBSAs via 2020 Census delineation crosswalk.",
            "key_metric": {
                "field": "upwardMobilityScore",
                "definition": "Mean household income rank in adulthood for children born to "
                              "families at the 25th income percentile. Higher = better upward mobility. "
                              "Theoretical range 1-100, typical range 35-55.",
                "column": "kfr_pooled_pooled_p25",
            },
            "weight_field": "pooled_pooled_count",
            "cbsas_total": len(all_cbsas),
            "cbsas_with_mobility": len(covered_cbsas),
            "cbsas_missing": len(missing),
            "tract_rows_processed": sum(m["tractCount"] for m in mobility.values()),
        },
        "mobility": mobility,
    }

    # Write output
    os.makedirs(OUT_PATH.parent, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n[mobility] Wrote {OUT_PATH}")
    print(f"[mobility] File size: {OUT_PATH.stat().st_size:,} bytes")

    # ── Validation Summary ──────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)

    valid_scores = [m["upwardMobilityScore"] for m in mobility.values()
                    if m["upwardMobilityScore"] is not None]

    if valid_scores:
        valid_scores.sort()
        n = len(valid_scores)
        print(f"  CBSAs with valid mobility scores: {n}")
        print(f"  Score distribution:")
        print(f"    Min:    {valid_scores[0]:.2f}")
        print(f"    P10:    {valid_scores[n // 10]:.2f}")
        print(f"    P25:    {valid_scores[n // 4]:.2f}")
        print(f"    Median: {valid_scores[n // 2]:.2f}")
        print(f"    P75:    {valid_scores[n * 3 // 4]:.2f}")
        print(f"    P90:    {valid_scores[n * 9 // 10]:.2f}")
        print(f"    Max:    {valid_scores[-1]:.2f}")

        # Top 10 CBSAs by upward mobility
        ranked = sorted(mobility.items(),
                        key=lambda kv: kv[1]["upwardMobilityScore"] or 0,
                        reverse=True)
        print(f"\n  Top 10 CBSAs by upward mobility:")
        for i, (code, m) in enumerate(ranked[:10], 1):
            print(f"    {i:2}. {m['name'][:45]:45s} "
                  f"Score: {m['upwardMobilityScore']:.2f}  "
                  f"Pctl: {m.get('percentile', 'N/A')}  "
                  f"Tracts: {m['tractCount']}")

        print(f"\n  Bottom 10 CBSAs by upward mobility:")
        for i, (code, m) in enumerate(ranked[-10:], 1):
            print(f"    {i:2}. {m['name'][:45]:45s} "
                  f"Score: {m['upwardMobilityScore']:.2f}  "
                  f"Pctl: {m.get('percentile', 'N/A')}  "
                  f"Tracts: {m['tractCount']}")

    # How many of 939 CBSAs covered
    coverage_pct = len(covered_cbsas) / len(all_cbsas) * 100 if all_cbsas else 0
    print(f"\n  Coverage: {len(covered_cbsas)} / {len(all_cbsas)} CBSAs ({coverage_pct:.1f}%)")

    # List some missing CBSAs
    if missing:
        print(f"\n  Sample of missing CBSAs ({len(missing)} total):")
        for code in sorted(missing)[:10]:
            name = crosswalk.get(code, {}).get("name", "unknown")
            print(f"    {code}: {name}")

    print(f"\n[mobility] Done.")


if __name__ == "__main__":
    main()
