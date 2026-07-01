#!/usr/bin/env python3
"""
Build a cost-of-living index for all 939 CBSAs.

Uses BEA RPP where available (rpp_all_items), and fills gaps with a
Census ACS-derived proxy index based on median home value, median gross rent,
and median household income.

Methodology for census_proxy:
  Home value and rent ratios are computed relative to national medians.
  A square-root transform is applied to the home value ratio because
  home prices vary much more widely (coefficient of variation ~3× rent)
  and the relationship with overall cost of living is sub-linear.
  The income offset (national_median / local_median) partially
  compensates for higher local wages in expensive areas.

  index = 0.4 * sqrt(home_value_ratio) * 100
        + 0.3 * rent_ratio * 100
        + 0.3 * income_offset * 100

Output: sources/processed/cbsa_cost_of_living_index.json
"""

import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CENSUS_PATH = PROJECT_ROOT / "sources" / "processed" / "census_acs_cbsa.json"
BEA_PATH = PROJECT_ROOT / "sources" / "processed" / "bea_rpp.json"
OUTPUT_PATH = PROJECT_ROOT / "sources" / "processed" / "cbsa_cost_of_living_index.json"

# Weights for the composite proxy index
W_HOME = 0.4
W_RENT = 0.3
W_INCOME = 0.3


def median_safe(values):
    """Return median of a list of values, ignoring None / zero / negative."""
    clean = [v for v in values if v is not None and v > 0]
    if not clean:
        return None
    return statistics.median(clean)


def main():
    # ── 1. Load Census ACS data ──────────────────────────────────────────
    with open(CENSUS_PATH) as f:
        census_data = json.load(f)

    cbsas = census_data["cbsas"]
    print(f"Loaded {len(cbsas)} CBSAs from census_acs_cbsa.json")

    # ── 2. Load BEA RPP data, build lookup by geo_code ───────────────────
    with open(BEA_PATH) as f:
        bea_data = json.load(f)

    bea_by_code = {}
    for entry in bea_data["data"]:
        code = entry.get("geo_code")
        rpp = entry.get("rpp_all_items")
        if code and rpp is not None:
            bea_by_code[code] = rpp

    print(f"Loaded {len(bea_by_code)} BEA RPP entries (by geo_code)")

    # ── 3. Compute national medians ──────────────────────────────────────
    all_home_values = []
    all_rents = []
    all_incomes = []

    for cbsa in cbsas:
        m = cbsa.get("metrics", {})
        hv = m.get("median_home_value")
        rent = m.get("median_gross_rent")
        income = m.get("median_household_income")
        if hv is not None and hv > 0:
            all_home_values.append(hv)
        if rent is not None and rent > 0:
            all_rents.append(rent)
        if income is not None and income > 0:
            all_incomes.append(income)

    nat_median_home = median_safe(all_home_values)
    nat_median_rent = median_safe(all_rents)
    nat_median_income = median_safe(all_incomes)

    print(f"National medians:")
    print(f"  median_home_value:      ${nat_median_home:,.0f}")
    print(f"  median_gross_rent:      ${nat_median_rent:,.0f}")
    print(f"  median_household_income: ${nat_median_income:,.0f}")

    # ── 4. Build index for each CBSA ─────────────────────────────────────
    indices = {}
    bea_count = 0
    proxy_count = 0

    for cbsa in cbsas:
        code = cbsa["cbsa_code"]
        name = cbsa["name"]
        m = cbsa.get("metrics", {})

        if code in bea_by_code:
            # Use authoritative BEA RPP value
            indices[code] = {
                "costOfLivingIndex": round(bea_by_code[code], 1),
                "method": "bea_rpp",
            }
            bea_count += 1
        else:
            # Derive from Census ACS data
            hv = m.get("median_home_value")
            rent = m.get("median_gross_rent")
            income = m.get("median_household_income")

            # If any metric is missing, we can't compute a proxy
            if (hv is None or hv <= 0 or
                rent is None or rent <= 0 or
                income is None or income <= 0):
                # Fallback: use income offset only, or skip
                print(f"  WARNING: {code} ({name}) missing metrics; "
                      f"hv={hv}, rent={rent}, income={income}")
                indices[code] = {
                    "costOfLivingIndex": None,
                    "method": "insufficient_data",
                }
                continue

            home_idx = math.sqrt(hv / nat_median_home) * 100
            rent_idx = (rent / nat_median_rent) * 100
            income_offset = (nat_median_income / income) * 100

            composite = (W_HOME * home_idx +
                         W_RENT * rent_idx +
                         W_INCOME * income_offset)

            indices[code] = {
                "costOfLivingIndex": round(composite, 1),
                "method": "census_proxy",
            }
            proxy_count += 1

    # Sanity check: all CBSAs should have an entry
    missing_codes = []
    for cbsa in cbsas:
        code = cbsa["cbsa_code"]
        if code not in indices or indices[code]["costOfLivingIndex"] is None:
            missing_codes.append(code)

    total_modeled = bea_count + proxy_count
    print(f"\nCoverage:")
    print(f"  BEA RPP:       {bea_count}")
    print(f"  Census proxy:  {proxy_count}")
    print(f"  Total modeled: {total_modeled}")
    print(f"  Total CBSAs:   {len(cbsas)}")
    if missing_codes:
        print(f"  MISSING:       {len(missing_codes)} — {missing_codes}")
    else:
        print(f"  All {len(cbsas)} CBSAs have an index value.")

    # ── 5. Write output ──────────────────────────────────────────────────
    output = {
        "metadata": {
            "source": "census_acs_derived_proxy",
            "methodology": (
                "Where BEA RPP (Regional Price Parities) rpp_all_items is "
                "available, that value is used as the authoritative "
                "costOfLivingIndex. For all other CBSAs, a composite proxy "
                "index is derived from Census ACS 5-year (2022) data: "
                f"index = {W_HOME}*sqrt(home_value_ratio)*100 + {W_RENT}*"
                f"rent_ratio*100 + {W_INCOME}*income_offset*100. "
                "The square-root transform on home values compensates for "
                "the sub-linear relationship between home prices and "
                "overall cost of living. Ratios are CBSA ÷ national median. "
                "National medians are computed from all 939 CBSAs."
            ),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "cbsa_count": len(cbsas),
            "bea_rpp_covered": bea_count,
            "census_proxy_covered": proxy_count,
            "national_medians": {
                "median_home_value": round(nat_median_home),
                "median_gross_rent": round(nat_median_rent),
                "median_household_income": round(nat_median_income),
            },
        },
        "indices": indices,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nOutput written to: {OUTPUT_PATH}")

    # ── 6. Verification spot-checks ──────────────────────────────────────
    print("\n─── Spot Checks ───")

    # High-cost metros (expected index >> 100)
    high_cost_codes = {
        "41860": "San Francisco-Oakland-Fremont, CA",
        "35620": "New York-Newark-Jersey City, NY-NJ",
        "46520": "Urban Honolulu, HI",
        "31080": "Los Angeles-Long Beach-Anaheim, CA",
    }
    for code, name in high_cost_codes.items():
        entry = indices.get(code)
        if entry:
            idx = entry["costOfLivingIndex"]
            method = entry["method"]
            print(f"  {code} {name}: {idx} ({method})")
            if idx is not None and idx <= 100:
                print(f"    ⚠ Expected >100 for high-cost area!")

    # Low-cost areas (expected index << 100)
    low_cost_codes = {
        "10100": "Aberdeen, SD Micro Area",
        "10740": "Albuquerque, NM",
        "13820": "Birmingham, AL",
    }
    for code, name in low_cost_codes.items():
        entry = indices.get(code)
        if entry:
            idx = entry["costOfLivingIndex"]
            method = entry["method"]
            print(f"  {code} {name}: {idx} ({method})")

    # Index range
    all_indices = [v["costOfLivingIndex"] for v in indices.values()
                   if v["costOfLivingIndex"] is not None]
    if all_indices:
        print(f"\nIndex range: {min(all_indices):.1f} – {max(all_indices):.1f}")
        print(f"Mean index: {statistics.mean(all_indices):.1f}")
        print(f"Median index: {statistics.median(all_indices):.1f}")

    # Verify BEA vs census_proxy split
    bea_check = sum(1 for v in indices.values() if v["method"] == "bea_rpp")
    proxy_check = sum(1 for v in indices.values() if v["method"] == "census_proxy")
    print(f"\nMethod verification: {bea_check} bea_rpp + {proxy_check} census_proxy = {bea_check + proxy_check}")

    return 0 if not missing_codes else 1


if __name__ == "__main__":
    raise SystemExit(main())
