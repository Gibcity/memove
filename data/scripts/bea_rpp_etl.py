#!/usr/bin/env python3
"""BEA Regional Price Parities ETL — cost-of-living index.

Pulls RPP data from BEA public downloadable ZIP files:
  - MARPP.zip : Metro-area RPP (MSA level)
  - SARPP.zip : State-level RPP (fallback when MSA not matched)

No API key required — BEA publishes these as free bulk downloads.

Output:
  sources/processed/bea_rpp.json

Schema:
  {
    "metadata": {
      "source": "BEA Regional Price Parities",
      "year": 2024,
      "us_average": 100.0,
      "generated_at": "ISO8601"
    },
    "data": [
      {
        "geo": "Metro or state name",
        "geo_code": "CBSA FIPS or state FIPS",
        "rpp_all_items": 100.0,
        "rpp_goods": 100.0,
        "rpp_services_rent": 100.0,
        "rpp_services_other": 100.0,
        "level": "msa|state",
        "year": 2024
      }
    ]
  }

Usage:
    python3 sources/scripts/bea_rpp_etl.py
"""

from __future__ import annotations

import csv
import io
import json
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MARPP_URL = "https://apps.bea.gov/regional/zip/MARPP.zip"
SARPP_URL = "https://apps.bea.gov/regional/zip/SARPP.zip"
MARPP_CSV = "MARPP_MSA_2008_2024.csv"
SARPP_CSV = "SARPP_STATE_2008_2024.csv"
YEAR = "2024"  # Latest available year

PROCESSED = Path(__file__).resolve().parent.parent / "processed"
OUTPUT = PROCESSED / "bea_rpp.json"

# Line codes in BEA RPP tables:
# 1 = All items
# 2 = Goods
# 3 = Services: Housing (rent)
# 4 = Services: Utilities  (not pulled)
# 5 = Services: Other
LINE_CODES = {
    "1": "rpp_all_items",
    "2": "rpp_goods",
    "3": "rpp_services_rent",
    "5": "rpp_services_other",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download_zip(url: str) -> zipfile.ZipFile:
    """Download a ZIP file from BEA and return a ZipFile object."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    resp = urllib.request.urlopen(req, timeout=60)
    data = resp.read()
    return zipfile.ZipFile(io.BytesIO(data))


def _clean(s: str) -> str:
    """Strip quotes and whitespace from CSV values."""
    return s.strip().strip('"')


def _extract_rpp(zf: zipfile.ZipFile, csv_name: str) -> dict[str, dict]:
    """Parse BEA RPP CSV into {geo_fips: {line_code: value}}.

    Returns dict keyed by GeoFIPS (state or MSA code, e.g. '06000' or '12060').
    Each value is a dict mapping line_code string to RPP index value.
    Also includes '_geo_name' key with the human-readable location name.
    """
    out: dict[str, dict] = {}
    with zf.open(csv_name) as f:
        reader = csv.reader(io.TextIOWrapper(f, encoding="utf-8"))
        header = next(reader)
        # Find column index for the target year
        try:
            year_idx = header.index(YEAR)
        except ValueError:
            # If 2024 not available, try 2023
            alt_year = str(int(YEAR) - 1)
            year_idx = header.index(alt_year)

        for row in reader:
            if not row or len(row) <= year_idx:
                continue
            geo_fips = _clean(row[0])
            line_code = _clean(row[4])
            geo_name = _clean(row[1])

            if line_code not in LINE_CODES:
                continue

            val_str = _clean(row[year_idx])
            if not val_str or val_str in ("", "(NA)", "(D)"):
                continue
            try:
                val = float(val_str)
            except ValueError:
                continue

            if geo_fips not in out:
                out[geo_fips] = {"_geo_name": geo_name}
            out[geo_fips][line_code] = val

    return out


def _normalize_metro_name(name: str) -> str:
    """Normalize a metro name for fuzzy matching.

    Examples:
      "Atlanta-Sandy Springs-Roswell, GA (Metropolitan Statistical Area)"
      -> "atlanta"
      "Nashville-Davidson--Murfreesboro--Franklin, TN"
      -> "nashville"
    """
    # Remove state suffix and "(Metropolitan Statistical Area)"
    import re
    # Strip trailing parenthetical and state
    name = re.sub(r'\s*\(.*?\)\s*', '', name)
    # Remove state abbreviation after comma
    name = re.sub(r',\s*[A-Z]{2}(-[A-Z]{2})?\s*$', '', name)
    # Normalize dashes
    name = name.replace('--', '-')
    # Take first part before dash as primary city
    primary = name.split('-')[0].strip().lower()
    # Remove periods
    primary = primary.replace('.', '')
    return primary


def _match_metro_to_msa(metro_name: str, msa_data: dict) -> tuple[str | None, str | None]:
    """Match a metro name to BEA MSA data.

    Returns (geo_fips, geo_name) or (None, None).
    """
    metro_lower = metro_name.lower().strip()

    # Direct match: metro name in MSA geo_name
    for fips, fields in msa_data.items():
        geo_name = fields.get("_geo_name", "")
        # Normalize both
        msa_primary = _normalize_metro_name(geo_name)
        if msa_primary == metro_lower.split(',')[0].strip().lower():
            return fips, geo_name

    # Substring match
    metro_first = metro_lower.split(',')[0].strip().split('-')[0].strip()
    for fips, fields in msa_data.items():
        geo_name = fields.get("_geo_name", "")
        if metro_first in geo_name.lower():
            return fips, geo_name

    return None, None


# ---------------------------------------------------------------------------
# Metro → MSA mapping overrides for tricky names
# ---------------------------------------------------------------------------
METRO_TO_MSA_OVERRIDE: dict[str, str] = {
    # Our name -> BEA GeoFIPS (CBSA code)
    "Boise City, ID": "14260",       # Boise City, ID
    "Urban Honolulu, HI": "46520",   # Urban Honolulu, HI
    "Washington, DC": "47900",       # Washington-Arlington-Alexandria, DC-VA-MD-WV
    "St. Louis, MO": "41180",        # St. Louis, MO-IL
    "Kansas City, MO": "28140",      # Kansas City, MO-KS
    "Minneapolis, MN": "33460",      # Minneapolis-St. Paul-Bloomington, MN-WI
    "Dallas, TX": "19100",           # Dallas-Fort Worth-Arlington, TX
    "Portland, ME": "38860",         # Portland-South Portland, ME
    "Bend, OR": "13460",             # Bend, OR
    "Bozeman, MT": "14580",          # Bozeman, MT
    "Boulder, CO": "14500",          # Boulder, CO
    "Grand Rapids, MI": "24340",     # Grand Rapids-Kentwood, MI
    "Salt Lake City, UT": "41620",   # Salt Lake City, UT
    "Colorado Springs, CO": "17820", # Colorado Springs, CO
    "San Antonio, TX": "41700",      # San Antonio-New Braunfels, TX
    "Oklahoma City, OK": "36420",    # Oklahoma City, OK
    "Little Rock, AR": "30780",      # Little Rock-North Little Rock-Conway, AR
    "Greenville, SC": "24860",       # Greenville-Anderson, SC
    "Fargo, ND": "22020",            # Fargo, ND-MN
    "Cheyenne, WY": "16940",         # Cheyenne, WY
    "Indianapolis, IN": "26900",     # Indianapolis-Carmel-Anderson, IN
    "Wichita, KS": "48620",          # Wichita, KS
    "Spokane, WA": "44060",          # Spokane-Spokane Valley, WA
    "Des Moines, IA": "19780",       # Des Moines-West Des Moines, IA
    "Birmingham, AL": "13820",       # Birmingham-Hoover, AL
    "Jacksonville, FL": "27260",     # Jacksonville, FL
    "Pittsburgh, PA": "38300",       # Pittsburgh, PA
    "Rochester, MN": "40340",        # Rochester, MN
    "Kalamazoo, MI": "28020",        # Kalamazoo-Portage, MI
    "Nashville, TN": "34980",        # Nashville-Davidson--Murfreesboro--Franklin, TN
    "Albuquerque, NM": "10740",      # Albuquerque, NM
    "Jackson, MS": "27140",          # Jackson, MS
    "Charlotte, NC": "16740",        # Charlotte-Concord-Gastonia, NC-SC
    "Atlanta, GA": "12060",          # Atlanta-Sandy Springs-Roswell, GA
    "Las Vegas, NV": "29820",        # Las Vegas-Henderson-Paradise, NV
    "Cincinnati, OH": "17140",       # Cincinnati, OH-KY-IN
    "Omaha, NE": "36540",            # Omaha-Council Bluffs, NE-IA
    "Appleton, WI": "11540",         # Appleton, WI
    "Richmond, VA": "40060",         # Richmond, VA
    "Austin, TX": "12420",           # Austin-Round Rock-San Marcos, TX
    "Dover, DE": "20100",            # Dover, DE
    "Columbus, OH": "18140",         # Columbus, OH
    "Rochester, NY": "40380",        # Rochester, NY
    "Louisville, KY": "31140",       # Louisville/Jefferson County, KY-IN
    "Baltimore, MD": "12580",        # Baltimore-Columbia-Towson, MD
    "Chicago, IL": "16980",          # Chicago-Naperville-Elgin, IL-IN-WI
    "Hartford, CT": "25540",         # Hartford-East Hartford-Middletown, CT
    "Madison, WI": "31540",          # Madison, WI
    "Denver, CO": "19740",           # Denver-Aurora-Lakewood, CO
    "Manchester, NH": "31700",       # Manchester-Nashua, NH
    "Sacramento, CA": "40900",       # Sacramento-Roseville-Folsom, CA
    "Providence, RI": "39300",       # Providence-Warwick, RI-MA
    "Trenton, NJ": "45940",          # Trenton-Princeton, NJ
    "Burlington, VT": "15540",       # Burlington-South Burlington, VT
    "Charleston, WV": "16620",       # Charleston, WV
    "Sioux Falls, SD": "43620",      # Sioux Falls, SD
    "Memphis, TN": "32820",          # Memphis, TN-MS-AR
    "Worcester, MA": "49340",        # Worcester, MA-CT
    "Anchorage, AK": "11260",        # Anchorage, AK
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print("BEA Regional Price Parities ETL")
    print("=" * 60)

    # 1. Download and parse MSA-level RPP
    print("\n[1/4] Downloading MARPP.zip (metro-level RPP)...")
    try:
        marpp_zf = _download_zip(MARPP_URL)
        print(f"  OK: {MARPP_URL}")
    except Exception as e:
        print(f"  FAILED: {e}")
        marpp_zf = None

    # 2. Download and parse state-level RPP
    print("\n[2/4] Downloading SARPP.zip (state-level RPP)...")
    try:
        sarpp_zf = _download_zip(SARPP_URL)
        print(f"  OK: {SARPP_URL}")
    except Exception as e:
        print(f"  FAILED: {e}")
        sarpp_zf = None

    # 3. Parse data
    msa_rpp: dict[str, dict[str, float]] = {}
    state_rpp: dict[str, dict[str, float]] = {}

    if marpp_zf:
        print("\n[3/4] Parsing metro-level RPP CSV...")
        msa_rpp = _extract_rpp(marpp_zf, MARPP_CSV)
        print(f"  Parsed {len(msa_rpp)} MSA entries")

    if sarpp_zf:
        print("  Parsing state-level RPP CSV...")
        state_rpp = _extract_rpp(sarpp_zf, SARPP_CSV)
        print(f"  Parsed {len(state_rpp)} state entries")

    # 4. Match our 59 metros
    print("\n[4/4] Matching 59 metros to BEA RPP data...")
    locations_path = PROCESSED / "relocation" / "locations.json"
    if not locations_path.exists():
        locations_path = Path("sources/processed/relocation/locations.json")

    with open(locations_path) as f:
        locations = json.load(f)

    output_data: list[dict] = []
    matched_msa = 0
    matched_state = 0
    unmatched = 0

    for loc in locations:
        metro_name = loc["name"]  # e.g. "Memphis, TN"
        state_abbr = loc["state"]
        loc_id = loc["id"]

        matched_fips = None
        matched_name = None
        level = "state"  # default

        # Try override mapping first
        if metro_name in METRO_TO_MSA_OVERRIDE:
            fips = METRO_TO_MSA_OVERRIDE[metro_name]
            if fips in msa_rpp:
                matched_fips = fips
                matched_name = msa_rpp[fips].get("_geo_name", metro_name)
                level = "msa"
                matched_msa += 1
            else:
                pass  # fall through to fuzzy match

        # Try fuzzy match
        if not matched_fips:
            fips, geo_name = _match_metro_to_msa(metro_name, msa_rpp)
            if fips:
                matched_fips = fips
                matched_name = geo_name
                level = "msa"
                matched_msa += 1

        # Fall back to state-level
        if not matched_fips:
            # State FIPS: map state abbreviation to FIPS
            state_fips_map = {
                "AL": "01000", "AK": "02000", "AZ": "04000", "AR": "05000",
                "CA": "06000", "CO": "08000", "CT": "09000", "DE": "10000",
                "DC": "11000", "FL": "12000", "GA": "13000", "HI": "15000",
                "ID": "16000", "IL": "17000", "IN": "18000", "IA": "19000",
                "KS": "20000", "KY": "21000", "LA": "22000", "ME": "23000",
                "MD": "24000", "MA": "25000", "MI": "26000", "MN": "27000",
                "MS": "28000", "MO": "29000", "MT": "30000", "NE": "31000",
                "NV": "32000", "NH": "33000", "NJ": "34000", "NM": "35000",
                "NY": "36000", "NC": "37000", "ND": "38000", "OH": "39000",
                "OK": "40000", "OR": "41000", "PA": "42000", "RI": "44000",
                "SC": "45000", "SD": "46000", "TN": "47000", "TX": "48000",
                "UT": "49000", "VT": "50000", "VA": "51000", "WA": "53000",
                "WV": "54000", "WI": "55000", "WY": "56000",
            }
            state_fips = state_fips_map.get(state_abbr)
            if state_fips and state_fips in state_rpp:
                matched_fips = state_fips
                matched_name = f"{metro_name} (state-level)"
                level = "state"
                matched_state += 1
            else:
                unmatched += 1
                print(f"  WARNING: No RPP data for {metro_name} (state={state_abbr})")
                continue

        # Extract RPP values
        rpp_source = msa_rpp if level == "msa" else state_rpp
        fields = rpp_source.get(matched_fips, {})

        entry: dict = {
            "geo": matched_name,
            "geo_code": matched_fips,
            "loc_id": loc_id,
            "level": level,
            "year": int(YEAR),
        }

        for line_code, field_name in LINE_CODES.items():
            val = fields.get(line_code, None)
            entry[field_name] = round(val, 1) if val is not None else None

        # Check if we got the "all items" RPP
        if entry.get("rpp_all_items") is None:
            print(f"  WARNING: No RPP all-items for {metro_name}")
            unmatched += 1
            continue

        output_data.append(entry)

    # Sort by RPP (highest cost first)
    output_data.sort(key=lambda x: x.get("rpp_all_items") or 0, reverse=True)

    # Build output
    metadata = {
        "source": "BEA Regional Price Parities",
        "source_url": "https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area",
        "data_urls": [MARPP_URL, SARPP_URL],
        "year": int(YEAR),
        "us_average": 100.0,
        "unit": "Index (US = 100)",
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "line_codes": {
            "1": "All items",
            "2": "Goods",
            "3": "Services: Housing (rent)",
            "5": "Services: Other",
        },
    }

    result = {
        "metadata": metadata,
        "data": output_data,
    }

    # Write output
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"RESULTS")
    print(f"{'='*60}")
    print(f"  Total metros in dataset: {len(locations)}")
    print(f"  Matched at MSA level:    {matched_msa}")
    print(f"  Matched at state level:  {matched_state}")
    print(f"  Unmatched:               {unmatched}")
    print(f"  Output entries:          {len(output_data)}")
    print(f"  Output file:             {OUTPUT}")

    # Summary: top 5 highest and lowest cost of living
    print(f"\n{'='*60}")
    print(f"TOP 5 — HIGHEST COST OF LIVING (RPP All Items, {YEAR})")
    print(f"{'='*60}")
    for entry in output_data[:5]:
        geo = entry["geo"]
        rpp = entry.get("rpp_all_items", "N/A")
        lvl = entry["level"]
        print(f"  {rpp:>7.1f}  {geo}  [{lvl}]")

    print(f"\n{'='*60}")
    print(f"TOP 5 — LOWEST COST OF LIVING (RPP All Items, {YEAR})")
    print(f"{'='*60}")
    for entry in output_data[-5:]:
        geo = entry["geo"]
        rpp = entry.get("rpp_all_items", "N/A")
        lvl = entry["level"]
        print(f"  {rpp:>7.1f}  {geo}  [{lvl}]")

    print(f"\nDone. Output: {OUTPUT}")


if __name__ == "__main__":
    main()
