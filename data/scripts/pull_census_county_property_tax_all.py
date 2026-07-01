"""
pull_census_county_property_tax_all.py — County-level effective property tax
rate for ALL 3,221 US counties via Census ACS 5-year (2022 vintage).

Closes the 877-CBSA gap for cost.propertyTaxRate.

Method:
  1. Query Census ACS for all counties (51 calls — one per state + DC + PR)
  2. Compute effective_rate_pct = B25103_001E / B25077_001E * 100
  3. Join counties → CBSAs via cbsa_county_crosswalk.json
  4. For multi-county CBSAs, compute population-weighted average of county rates

Output: sources/processed/cbsa_property_tax.json
  Keyed by CBSA code. Each entry: { effectiveRate, countyCount, counties:[...] }

Key loaded from /home/mongo/projects/us-relocation-2026/.env.census (chmod 600).
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/cbsa_property_tax.json"
COUNTY_OUT = ROOT / "sources/processed/census_acs_county_property_tax_all.json"
ENV_FILE = ROOT / ".env.census"
CROSSWALK_PATH = ROOT / "sources/processed/cbsa_county_crosswalk.json"
CENSUS_ACS_PATH = ROOT / "sources/processed/census_acs_cbsa.json"

# All US states + DC + PR (as defined by Census FIPS codes 01-56, 72)
# Using the 50 states + DC + PR that have counties
STATE_FIPS = [
    "01", "02", "04", "05", "06", "08", "09", "10", "11", "12",
    "13", "15", "16", "17", "18", "19", "20", "21", "22", "23",
    "24", "25", "26", "27", "28", "29", "30", "31", "32", "33",
    "34", "35", "36", "37", "38", "39", "40", "41", "42", "44",
    "45", "46", "47", "48", "49", "50", "51", "53", "54", "55", "56", "72",
]

STATE_NAMES = {
    "01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas",
    "06": "California", "08": "Colorado", "09": "Connecticut", "10": "Delaware",
    "11": "District of Columbia", "12": "Florida", "13": "Georgia", "15": "Hawaii",
    "16": "Idaho", "17": "Illinois", "18": "Indiana", "19": "Iowa",
    "20": "Kansas", "21": "Kentucky", "22": "Louisiana", "23": "Maine",
    "24": "Maryland", "25": "Massachusetts", "26": "Michigan", "27": "Minnesota",
    "28": "Mississippi", "29": "Missouri", "30": "Montana", "31": "Nebraska",
    "32": "Nevada", "33": "New Hampshire", "34": "New Jersey", "35": "New Mexico",
    "36": "New York", "37": "North Carolina", "38": "North Dakota", "39": "Ohio",
    "40": "Oklahoma", "41": "Oregon", "42": "Pennsylvania", "44": "Rhode Island",
    "45": "South Carolina", "46": "South Dakota", "47": "Tennessee", "48": "Texas",
    "49": "Utah", "50": "Vermont", "51": "Virginia", "53": "Washington",
    "54": "West Virginia", "55": "Wisconsin", "56": "Wyoming", "72": "Puerto Rico",
}


def load_key() -> str:
    if not ENV_FILE.exists():
        raise RuntimeError(f"Census API key not found at {ENV_FILE}")
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith("CENSUS_API_KEY="):
            return line.split("=", 1)[1]
    raise RuntimeError("CENSUS_API_KEY not set in env file")


def fetch_state_counties(key: str, state_fips: str) -> list[dict]:
    """Query all counties in a state. Returns list of county records."""
    params = {
        "get": "NAME,B25103_001E,B25077_001E,B01003_001E",
        "for": f"county:*",
        "in": f"state:{state_fips}",
        "key": key,
    }
    url = "https://api.census.gov/data/2022/acs/acs5?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))

    if not isinstance(data, list) or len(data) < 2:
        return []

    header = data[0]
    rows = data[1:]
    results = []
    for row in rows:
        rec = dict(zip(header, row))
        tax_paid = rec.get("B25103_001E")
        home_value = rec.get("B25077_001E")
        population = rec.get("B01003_001E")
        county_fips = rec.get("county", "")

        try:
            tax = int(tax_paid) if tax_paid not in (None, "", "null") else None
            val = int(home_value) if home_value not in (None, "", "null") else None
            pop = int(population) if population not in (None, "", "null") else 0
            rate = (tax / val * 100) if (tax is not None and val and val > 0) else None
        except (TypeError, ValueError):
            tax, val, rate, pop = None, None, None, 0

        results.append({
            "name": rec.get("NAME", ""),
            "state_fips": state_fips,
            "county_fips": county_fips.zfill(3),
            "stcofips": f"{state_fips}{county_fips.zfill(3)}",
            "median_annual_tax_paid_usd": tax,
            "median_home_value_usd": val,
            "effective_rate_pct": round(rate, 3) if rate is not None else None,
            "total_population": pop,
            "suppressed": tax is None or val is None,
        })
    return results


def fetch_all_counties(key: str, resume: dict | None = None) -> list[dict]:
    """Fetch all counties from all 50 states + DC + PR, with resume support."""
    cache = resume or {}
    all_results = list(cache.get("counties", [])) if cache else []
    completed_states = set(cache.get("completed_states", [])) if cache else set()

    for i, sf in enumerate(STATE_FIPS):
        state_name = STATE_NAMES.get(sf, sf)
        if sf in completed_states:
            print(f"  [{i+1:2d}/52] {state_name} (cached)")
            continue

        try:
            counties = fetch_state_counties(key, sf)
            all_results.extend(counties)
            ok = sum(1 for c in counties if not c["suppressed"])
            total = len(counties)
            print(f"  [{i+1:2d}/52] {state_name:25s} → {total} counties ({ok} with rate data)")
        except Exception as e:
            print(f"  [{i+1:2d}/52] {state_name:25s} → ERROR: {e}")
            # Save progress on error (don't lose already-fetched data)
            completed_states.add(sf)
            interim = {
                "counties": all_results,
                "completed_states": list(completed_states),
            }
            with open(COUNTY_OUT.with_suffix(".tmp"), "w") as f:
                json.dump(interim, f)
            continue

        completed_states.add(sf)
        # Save incremental progress every 5 states
        if (i + 1) % 5 == 0:
            interim = {
                "counties": all_results,
                "completed_states": list(completed_states),
            }
            with open(COUNTY_OUT.with_suffix(".tmp"), "w") as f:
                json.dump(interim, f)
            print(f"    💾 Checkpoint saved ({len(all_results)} counties so far)")

        # Rate limit: ~50 states with 0.3s delay = 15s total — very polite
        time.sleep(0.3)

    return all_results


def build_cbsa_rates(county_data: list[dict]) -> dict[str, dict]:
    """Join county property tax rates to CBSAs via crosswalk."""
    with open(CROSSWALK_PATH) as f:
        xwalk = json.load(f)
    crosswalk = xwalk.get("crosswalk", {})

    # Build county lookup: stcofips → effective_rate_pct, population, home_value
    county_lookup: dict[str, dict] = {}
    for c in county_data:
        fips = c.get("stcofips", "")
        if fips:
            county_lookup[fips] = c

    # Load CBSA population data from census_acs_cbsa.json
    cbsa_pop: dict[str, int] = {}
    if CENSUS_ACS_PATH.exists():
        with open(CENSUS_ACS_PATH) as f:
            acs = json.load(f)
        for cbsa in acs.get("cbsas", []):
            code = cbsa.get("cbsa_code", "")
            pop = cbsa.get("metrics", {}).get("total_population", 0) or 0
            if code and pop:
                cbsa_pop[code] = pop

    cbsa_rates: dict[str, dict] = {}
    matched_counties_total = 0
    unmatched_cbsas = 0

    for cbsa_code, entry in sorted(crosswalk.items()):
        counties = entry.get("counties", [])
        cbsa_name = entry.get("name", "")
        rates_found: list[dict] = []

        for county in counties:
            fips = county.get("stcofips", "")
            cdata = county_lookup.get(fips)
            if cdata and cdata.get("effective_rate_pct") is not None:
                rates_found.append(cdata)

        if rates_found:
            # Population-weighted average (better than simple mean for multi-county CBSAs)
            total_pop = sum(r.get("total_population", 0) or 0 for r in rates_found)
            if total_pop > 0:
                weighted_rate = sum(
                    (r.get("effective_rate_pct", 0) or 0) * (r.get("total_population", 0) or 0)
                    for r in rates_found
                ) / total_pop
            else:
                # Fallback to simple average
                weighted_rate = sum(r.get("effective_rate_pct", 0) or 0 for r in rates_found) / len(rates_found)

            cbsa_rates[cbsa_code] = {
                "cbsa_name": cbsa_name,
                "effectiveRate": round(weighted_rate / 100, 6),  # 0-1 range for zod schema
                "effectiveRatePct": round(weighted_rate, 3),
                "countyCount": len(rates_found),
                "totalCounties": len(counties),
                "counties": [
                    {
                        "stcofips": r.get("stcofips", ""),
                        "name": r.get("name", ""),
                        "rate_pct": r.get("effective_rate_pct"),
                        "median_home_value": r.get("median_home_value_usd"),
                        "population": r.get("total_population"),
                    }
                    for r in rates_found
                ],
            }
            matched_counties_total += len(rates_found)
        else:
            unmatched_cbsas += 1
            # Still record the CBSA but with 0
            cbsa_rates[cbsa_code] = {
                "cbsa_name": cbsa_name,
                "effectiveRate": 0.0,
                "effectiveRatePct": 0.0,
                "countyCount": 0,
                "totalCounties": len(counties),
                "counties": [],
                "_missing": True,
            }

    print(f"\n  CBSAs with rate data: {len(cbsa_rates) - unmatched_cbsas}")
    print(f"  CBSAs without rate data: {unmatched_cbsas}")
    print(f"  Total county-to-CBSA matches: {matched_counties_total}")
    return cbsa_rates


def main():
    key = load_key()

    # Test the key
    test_url = (
        "https://api.census.gov/data/2022/acs/acs5?"
        "get=NAME,B25103_001E,B25077_001E&for=county:157&in=state:47&"
        f"key={key}"
    )
    try:
        with urllib.request.urlopen(test_url, timeout=30) as r:
            test_data = json.loads(r.read().decode("utf-8"))
        if not test_data or len(test_data) < 2:
            raise RuntimeError("Key test returned no data")
        test_row = dict(zip(test_data[0], test_data[1]))
        print(f"[prop-tax] Census API key OK. Test county: {test_row.get('NAME')}")
    except Exception as e:
        raise RuntimeError(f"Census API key test failed: {e}")

    # Phase 1: Fetch all county data
    print(f"\n[prop-tax] Phase 1: Fetching county property tax data for all 50 states + DC + PR")
    print(f"[prop-tax] {len(STATE_FIPS)} states/territories to query\n")

    # Resume from existing county file if available
    cache = None
    if COUNTY_OUT.exists():
        try:
            with open(COUNTY_OUT) as f:
                cache = json.load(f)
            print(f"[prop-tax] Resuming from {COUNTY_OUT} ({len(cache.get('counties', []))} counties cached)")
        except (json.JSONDecodeError, OSError):
            pass

    all_counties = fetch_all_counties(key, cache)
    ok_count = sum(1 for c in all_counties if not c["suppressed"])
    print(f"\n[prop-tax] Phase 1 done: {len(all_counties)} counties total, {ok_count} with rate data")

    # Save raw county data
    county_output = {
        "source": {
            "name": "U.S. Census Bureau, ACS 5-Year Estimates (2022)",
            "url": "https://api.census.gov/data/2022/acs/acs5",
            "method": "B25103_001E (median real estate taxes paid) ÷ B25077_001E (median home value)",
            "generated": datetime.now(timezone.utc).isoformat(),
        },
        "total_counties": len(all_counties),
        "counties_with_rate": ok_count,
        "counties": all_counties,
    }
    with open(COUNTY_OUT, "w") as f:
        json.dump(county_output, f, indent=2)
    print(f"[prop-tax] Saved county data to {COUNTY_OUT}")

    # Phase 2: Join counties → CBSAs
    print(f"\n[prop-tax] Phase 2: Joining counties to CBSAs via crosswalk...")
    cbsa_rates = build_cbsa_rates(all_counties)

    # Build final output
    final = {
        "source": {
            "name": "U.S. Census Bureau, ACS 5-Year Estimates (2022)",
            "url": "https://api.census.gov/data/2022/acs/acs5",
            "method": "County-level effective tax rate (B25103_001E ÷ B25077_001E), aggregated to CBSA via population-weighted average",
            "generated": datetime.now(timezone.utc).isoformat(),
        },
        "cbsa_count": len(cbsa_rates),
        "cbsa_count_with_rate": sum(1 for v in cbsa_rates.values() if v.get("effectiveRate", 0) > 0),
        "rates": cbsa_rates,
    }
    with open(OUT_PATH, "w") as f:
        json.dump(final, f, indent=2)
    print(f"[prop-tax] Saved CBSA rates to {OUT_PATH}")

    # Summary
    with_rate = sum(1 for v in cbsa_rates.values() if v.get("effectiveRate", 0) > 0)
    print(f"\n[prop-tax] ======= SUMMARY =======")
    print(f"[prop-tax] CBSAs with rate: {with_rate} / {len(cbsa_rates)}")
    print(f"[prop-tax] Top 10 highest rates:")
    top = sorted(
        [(k, v) for k, v in cbsa_rates.items() if v.get("effectiveRatePct", 0) > 0],
        key=lambda x: -x[1].get("effectiveRatePct", 0)
    )[:10]
    for code, v in top:
        print(f"  {code} {v['cbsa_name']:40s} {v['effectiveRatePct']:.3f}% ({v['countyCount']}/{v['totalCounties']} counties)")
    print(f"\n[prop-tax] Bottom 10 lowest rates:")
    bottom = sorted(
        [(k, v) for k, v in cbsa_rates.items() if v.get("effectiveRatePct", 0) > 0],
        key=lambda x: x[1].get("effectiveRatePct", 0)
    )[:10]
    for code, v in bottom:
        print(f"  {code} {v['cbsa_name']:40s} {v['effectiveRatePct']:.3f}% ({v['countyCount']}/{v['totalCounties']} counties)")

    print(f"\n[prop-tax] Done.")


if __name__ == "__main__":
    main()
