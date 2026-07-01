#!/usr/bin/env python3
"""
build_cbsa_healthcare.py
Pull hospital counts from CMS Hospital General Information dataset
and compute healthcare access scores for all 939 CBSAs.

Methodology:
1. Download CMS hospital data (all 5432 CMS-certified hospitals)
2. Match hospitals to CBSA component counties via county+state name matching
3. Count hospitals per CBSA
4. Compute healthcareAccessScore: percentile rank (0-100) of hospitals_per_100k_population
5. Output to sources/processed/cbsa_healthcare.json

Uses Python stdlib only.
"""

import json
import urllib.request
import time
import math
from datetime import datetime, timezone

# ─── Paths ───────────────────────────────────────────────────
BASE_DIR = "/home/mongo/projects/us-relocation-2026"
CROSSWALK_PATH = f"{BASE_DIR}/sources/processed/cbsa_county_crosswalk.json"
GAZETTEER_PATH = f"{BASE_DIR}/sources/processed/cbsa_gazetteer_coords.json"
ACS_PATH = f"{BASE_DIR}/sources/processed/census_acs_cbsa.json"
OUTPUT_PATH = f"{BASE_DIR}/sources/processed/cbsa_healthcare.json"

CMS_API_BASE = "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0"

# ─── USPS State Abbreviation → Full Name ────────────────────
STATE_ABBR_TO_NAME = {
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
    # Territories (may appear in CMS but not in CBSA crosswalk)
    "AS": "American Samoa", "GU": "Guam", "MP": "Northern Mariana Islands",
    "PR": "Puerto Rico", "VI": "Virgin Islands",
}


def normalize_county_name(raw_name: str) -> str:
    """Normalize county names for comparison: lowercase, strip common suffixes, remove spaces/special chars."""
    import unicodedata
    name = raw_name.strip().lower()
    # Replace common typographical variants
    name = name.replace("\u00f1", "n")  # ñ → n
    # Remove diacritics / convert to ASCII
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    # Common misspellings / typos in CMS data
    replacements = {
        "borouh": "borough",
        "parrish": "parish",
    }
    for wrong, right in replacements.items():
        if name.endswith(" " + wrong):
            name = name[: -(len(wrong) + 1)] + " " + right
    # Order matters: check longer suffixes first
    for suffix in [
        "city and borough", "city and", "census area", "municipio",
        "borough", "county", "parish", "city", "municipality", "island",
    ]:
        if name.endswith(" " + suffix):
            name = name[: -(len(suffix) + 1)]
            break
    # Remove spaces and punctuation for matching
    # (handles "De Kalb" vs "DeKalb", "St. Mary's" vs "St Marys", etc.)
    clean = []
    for ch in name.strip():
        if ch.isalnum():
            clean.append(ch)
    return "".join(clean)


def normalize_state_name(raw_state: str) -> str:
    """Convert state field to lowercase full name for comparison."""
    s = raw_state.strip()
    if len(s) == 2 and s.upper() in STATE_ABBR_TO_NAME:
        return STATE_ABBR_TO_NAME[s.upper()].lower()
    return s.lower()


# ─── Download CMS Hospitals ──────────────────────────────────
def download_cms_hospitals():
    """Download all CMS hospital records via paginated API."""
    print("[1/5] Downloading CMS hospital data...")
    all_hospitals = []
    offset = 0
    limit = 1500  # max per page

    while True:
        url = f"{CMS_API_BASE}?limit={limit}&offset={offset}"
        print(f"  Fetching offset {offset}...", end=" ", flush=True)
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            print(f"ERROR: {e}")
            break
        results = data.get("results", [])
        all_hospitals.extend(results)
        print(f"got {len(results)} records (total: {len(all_hospitals)})")
        if len(results) < limit:
            break
        offset += limit
        time.sleep(0.3)  # be respectful

    print(f"  Total hospitals downloaded: {len(all_hospitals)}")
    return all_hospitals


# ─── Build County Lookup from Crosswalk ──────────────────────
def build_county_to_cbsas(crosswalk):
    """
    Build a lookup: (state_lower, county_normalized) → list of CBSA codes.
    A county can belong to multiple CBSAs (rare, but possible in delineation).
    Also build stcofips → CBSA codes as a fallback.
    """
    print("[2/5] Building county→CBSA lookup from crosswalk...")
    lookup = {}
    fips_lookup = {}

    for cbsa_code, cbsa_info in crosswalk.items():
        for county in cbsa_info.get("counties", []):
            stcofips = county.get("stcofips", "")
            state_name = normalize_state_name(county.get("state", ""))
            county_name_norm = normalize_county_name(county.get("county", ""))
            key = (state_name, county_name_norm)
            if key not in lookup:
                lookup[key] = set()
            lookup[key].add(cbsa_code)

            if stcofips not in fips_lookup:
                fips_lookup[stcofips] = set()
            fips_lookup[stcofips].add(cbsa_code)

    print(f"  Built lookup with {len(lookup)} unique (state,county) entries")
    return lookup, fips_lookup


# ─── Match Hospitals to CBSAs ────────────────────────────────
def match_hospitals(hospitals, county_to_cbsas):
    """
    Match each CMS hospital to CBSA(s) via county+state matching.
    Returns dict: cbsa_code → count of hospitals in that CBSA.
    Also tracks unmatched hospitals.
    """
    print("[3/5] Matching hospitals to CBSAs by county...")
    cbsa_hospitals = {}
    unmatched = []

    for hosp in hospitals:
        county_raw = hosp.get("countyparish", "")
        state_raw = hosp.get("state", "")
        if not county_raw or not state_raw:
            continue

        state_norm = normalize_state_name(state_raw)
        county_norm = normalize_county_name(county_raw)
        key = (state_norm, county_norm)

        if key in county_to_cbsas:
            for cbsa_code in county_to_cbsas[key]:
                cbsa_hospitals[cbsa_code] = cbsa_hospitals.get(cbsa_code, 0) + 1
        else:
            unmatched.append({
                "facility_id": hosp.get("facility_id"),
                "facility_name": hosp.get("facility_name"),
                "county": county_raw,
                "state": state_raw,
            })

    print(f"  Matched: {sum(cbsa_hospitals.values())} hospital assignments across {len(cbsa_hospitals)} CBSAs")
    print(f"  Unmatched hospitals: {len(unmatched)}")
    if len(unmatched) <= 20:
        for u in unmatched:
            print(f"    - {u['facility_name']} | {u['county']}, {u['state']}")
    else:
        print(f"    (showing first 10 of {len(unmatched)})")
        for u in unmatched[:10]:
            print(f"    - {u['facility_name']} | {u['county']}, {u['state']}")

    return cbsa_hospitals, unmatched


# ─── Load ACS Population Data ────────────────────────────────
def load_population():
    """Load total_population from ACS data for each CBSA."""
    print("[4/5] Loading population data...")
    with open(ACS_PATH) as f:
        acs_data = json.load(f)

    pop = {}
    for cbsa_entry in acs_data.get("cbsas", []):
        code = cbsa_entry.get("cbsa_code", "")
        metrics = cbsa_entry.get("metrics", {})
        pop[code] = metrics.get("total_population", 0)
    print(f"  Loaded population for {len(pop)} CBSAs")
    return pop


# ─── Compute Healthcare Access Scores ────────────────────────
def compute_scores(cbsa_hospital_counts, population, all_cbsa_codes):
    """
    For each CBSA, compute:
    - hospitalCountWithin10mi: number of hospitals matched by county
    - hospitals_per_100k: hospitals per 100,000 population
    - healthcareAccessScore: percentile rank (0-100) of hospitals_per_100k
    """
    print("[5/5] Computing healthcare access scores...")

    # Compute hospitals_per_100k for CBSAs that have hospitals
    per_100k_values = {}
    for cbsa_code in all_cbsa_codes:
        count = cbsa_hospital_counts.get(cbsa_code, 0)
        pop = population.get(cbsa_code, 1)  # avoid div by 0
        if pop > 0:
            per_100k = (count / pop) * 100000
        else:
            per_100k = 0.0
        per_100k_values[cbsa_code] = per_100k

    # Percentile rank: sort by per_100k, compute 0-100 percentile
    sorted_cbsas = sorted(per_100k_values.items(), key=lambda x: x[1])
    n = len(sorted_cbsas)
    percentile = {}
    for rank, (cbsa_code, val) in enumerate(sorted_cbsas):
        # Percentile rank: 0-100 (using linear percentile)
        if n > 1:
            pct = (rank / (n - 1)) * 100.0
        else:
            pct = 50.0
        percentile[cbsa_code] = round(pct, 1)

    # Build output
    healthcare = {}
    for cbsa_code in all_cbsa_codes:
        count = cbsa_hospital_counts.get(cbsa_code, 0)
        p100k = per_100k_values.get(cbsa_code, 0.0)
        score = percentile.get(cbsa_code, 0.0)
        healthcare[cbsa_code] = {
            "hospitalCountWithin10mi": count,
            "healthcareAccessScore": score,
            "hospitals_per_100k": round(p100k, 2),
        }

    # Summary stats
    counts = [v["hospitalCountWithin10mi"] for v in healthcare.values()]
    scores = [v["healthcareAccessScore"] for v in healthcare.values()]
    print(f"  Hospital counts: min={min(counts)}, max={max(counts)}, mean={sum(counts)/len(counts):.1f}")
    print(f"  Access scores: min={min(scores)}, max={max(scores)}, mean={sum(scores)/len(scores):.1f}")

    return healthcare, sorted_cbsas


# ─── Write Output ────────────────────────────────────────────
def write_output(healthcare, total_hospitals_in_dataset):
    """Write the cbsa_healthcare.json output file."""
    output = {
        "metadata": {
            "source": "cms_hospital_general_information",
            "methodology": (
                "Hospital counts derived from CMS Hospital General Information dataset. "
                "Hospitals matched to CBSA component counties via (state, county_name) normalization. "
                "hospitalCountWithin10mi = count of CMS-certified hospitals in the CBSA's component counties. "
                "healthcareAccessScore = percentile rank (0-100) of hospitals_per_100k across all 939 CBSAs."
            ),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "cbsa_count": len(healthcare),
            "total_hospitals_in_cms_dataset": total_hospitals_in_dataset,
            "total_hospitals_matched": sum(v["hospitalCountWithin10mi"] for v in healthcare.values()),
        },
        "healthcare": healthcare,
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Output written to {OUTPUT_PATH}")
    return output


# ─── Verification ────────────────────────────────────────────
def verify(output, crosswalk):
    """Run all verification checks."""
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)

    healthcare = output.get("healthcare", output)

    all_cbsa_codes = sorted(crosswalk.keys())
    covered = set(healthcare.keys())
    missing = [c for c in all_cbsa_codes if c not in covered]

    print(f"1. Coverage: {len(covered)}/939 CBSAs have healthcare data")
    if missing:
        print(f"   MISSING ({len(missing)}): {missing[:20]}{'...' if len(missing)>20 else ''}")
    else:
        print("   ✓ All 939 covered")

    # Check data types
    bad_types = []
    for cbsa, info in healthcare.items():
        hc = info.get("hospitalCountWithin10mi")
        if not isinstance(hc, int) or hc < 0:
            bad_types.append((cbsa, "hospitalCountWithin10mi", hc))
        score = info.get("healthcareAccessScore")
        if not isinstance(score, (int, float)):
            bad_types.append((cbsa, "healthcareAccessScore", score))
    if bad_types:
        print(f"2. Bad types: {len(bad_types)}")
        for bt in bad_types[:10]:
            print(f"   {bt}")
    else:
        print("   ✓ All hospitalCountWithin10mi are non-negative integers")

    # Score distribution
    scores = [v["healthcareAccessScore"] for v in healthcare.values()]
    print(f"3. Score distribution: min={min(scores):.1f}, max={max(scores):.1f}, "
          f"median={sorted(scores)[len(scores)//2]:.1f}")

    # Spot-checks: large metros
    spot_checks = {
        "16980": "Chicago-Naperville-Elgin, IL-IN-WI",
        "35620": "New York-Newark-Jersey City, NY-NJ-PA",
        "31080": "Los Angeles-Long Beach-Anaheim, CA",
        "19100": "Dallas-Fort Worth-Arlington, TX",
        "26420": "Houston-The Woodlands-Sugar Land, TX",
    }
    print("4. Spot-checks (large metros should have many hospitals):")
    for code, name in spot_checks.items():
        info = healthcare.get(code, {})
        print(f"   {code} {name}: count={info.get('hospitalCountWithin10mi','N/A')}, "
              f"score={info.get('healthcareAccessScore','N/A')}")

    # Small rural examples
    small_rurals = ["10100", "10140", "10220"]  # Aberdeen SD, Aberdeen WA, Ada OK
    print("   Small/rural examples:")
    for code in small_rurals:
        info = healthcare.get(code, {})
        name = crosswalk.get(code, {}).get("name", "?")
        print(f"   {code} {name}: count={info.get('hospitalCountWithin10mi','N/A')}, "
              f"score={info.get('healthcareAccessScore','N/A')}")


# ─── Main ────────────────────────────────────────────────────
def main():
    # Load crosswalk
    with open(CROSSWALK_PATH) as f:
        crosswalk_data = json.load(f)
    crosswalk = crosswalk_data["crosswalk"]
    all_cbsa_codes = sorted(crosswalk.keys())
    print(f"Loaded crosswalk: {len(all_cbsa_codes)} CBSAs")

    # Download CMS hospitals
    hospitals = download_cms_hospitals()

    # Build county→CBSA lookup
    county_to_cbsas, fips_lookup = build_county_to_cbsas(crosswalk)

    # Match hospitals
    cbsa_hospital_counts, unmatched = match_hospitals(hospitals, county_to_cbsas)

    # Load population
    population = load_population()

    # Compute scores
    healthcare, sorted_cbsas = compute_scores(cbsa_hospital_counts, population, all_cbsa_codes)

    # Write output
    output = write_output(healthcare, len(hospitals))

    # Verify
    verify(output, crosswalk)

    # Print unmatched summary for debugging
    if unmatched:
        print(f"\nUnmatched hospitals ({len(unmatched)}) may be in territories or counties not in any CBSA.")
        # Save unmatched for reference
        with open("/tmp/unmatched_hospitals.json", "w") as f:
            json.dump(unmatched, f, indent=2)
        print("Saved unmatched hospitals to /tmp/unmatched_hospitals.json")


if __name__ == "__main__":
    main()
