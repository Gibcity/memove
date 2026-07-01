#!/usr/bin/env python3
"""
build_cbsa_crime.py — expand FBI UCR crime coverage to all 939 CBSAs.

Strategy:
  1. Fetch ~315 city-level violent+property crime rates per 100K from
     Wikipedia tables (same source as fbi_ucr_etl.py).
  2. Fetch state-level violent crime rates 2018–2024 for YoY trend.
  3. Match every CBSA's primary city/state to the Wikipedia city data.
     Metro CBSAs get priority; micro CBSAs fall back to state averages.
  4. Output cbsa_crime.json keyed by CBSA code, following the schema:
       {"metadata": {...}, "crime": {"10180": {"violentCrimeRatePer100k": ...}}}

Resumable: existing entries in cbsa_crime.json are preserved and skipped.

Output: sources/processed/cbsa_crime.json
"""

import json
import re
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/home/mongo/projects/us-relocation-2026")
PROCESSED = ROOT / "sources" / "processed"
CBSA_PATH = PROCESSED / "census_acs_cbsa.json"
OUT_PATH = PROCESSED / "cbsa_crime.json"

# ── Wikipedia URLs ────────────────────────────────────────────────────
WIKI_CITIES_URL = (
    "https://en.wikipedia.org/wiki/United_States_cities_by_crime_rate"
)
WIKI_CITIES_100K_URL = (
    "https://en.wikipedia.org/wiki/"
    "United_States_cities_by_crime_rate_(100,000%E2%80%93250,000)"
)
WIKI_STATE_VIOLENT_URL = (
    "https://en.wikipedia.org/wiki/"
    "List_of_U.S._states_and_territories_by_violent_crime_rate"
)

USER_AGENT = "us-relocation-2026/1.0 (research project; contact@example.com)"

# ── US state names to abbreviations ──────────────────────────────────
STATE_NAME_TO_ABBR = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI",
    "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME",
    "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE",
    "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
    "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
    "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
    "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}

# ── Manual overrides: CBSA code → city name to look up ──────────────
# For CBSAs whose primary city name in the CBSA title doesn't match
# the Wikipedia city table entry exactly.
CBSA_CITY_OVERRIDES = {
    "10740": "Albuquerque",        # Albuquerque, NM Metro Area
    "12060": "Atlanta",            # Atlanta-Sandy Springs-Alpharetta, GA
    "12420": "Austin",             # Austin-Round Rock-San Marcos, TX
    "12580": "Baltimore",          # Baltimore-Columbia-Towson, MD
    "13820": "Birmingham",         # Birmingham, AL Metro Area
    "14260": "Boise City",         # Boise City, ID Metro Area → "Boise" in wiki
    "14460": "Boston",             # Boston-Cambridge-Newton, MA-NH
    "14860": "Bridgeport",         # Bridgeport-Stamford-Danbury, CT → maybe Stamford?
    "15380": "Buffalo",            # Buffalo-Cheektowaga, NY
    "16740": "Charlotte",          # Charlotte-Concord-Gastonia, NC-SC
    "16980": "Chicago",            # Chicago-Naperville-Elgin, IL-IN
    "17140": "Cincinnati",         # Cincinnati, OH-KY-IN
    "17460": "Cleveland",          # Cleveland, OH Metro Area
    "17820": "Colorado Springs",   # Colorado Springs, CO Metro Area
    "17980": "Columbus",           # Columbus, GA-AL → not OH!
    "18140": "Columbus",           # Columbus, OH Metro Area
    "19100": "Dallas",             # Dallas-Fort Worth-Arlington, TX
    "19740": "Denver",             # Denver-Aurora-Centennial, CO
    "19780": "Des Moines",         # Des Moines-West Des Moines, IA
    "19820": "Detroit",            # Detroit-Warren-Dearborn, MI
    "21340": "El Paso",            # El Paso, TX Metro Area
    "22220": "Fayetteville",       # Fayetteville-Springdale-Rogers, AR
    "23420": "Fresno",             # Fresno, CA Metro Area
    "24340": "Grand Rapids",       # Grand Rapids-Wyoming-Kentwood, MI
    "24860": "Greenville",         # Greenville-Anderson-Greer, SC
    "25420": "Harrisburg",         # Harrisburg-Carlisle, PA
    "25540": "Hartford",           # Hartford-West Hartford-East Hartford, CT
    "26420": "Houston",            # Houston-Pasadena-The Woodlands, TX
    "26900": "Indianapolis",       # Indianapolis-Carmel-Greenwood, IN
    "27260": "Jacksonville",       # Jacksonville, FL Metro Area
    "28140": "Kansas City",        # Kansas City, MO-KS
    "28940": "Knoxville",          # Knoxville, TN Metro Area
    "29820": "Las Vegas",          # Las Vegas-Henderson-North Las Vegas, NV
    "30780": "Little Rock",        # Little Rock-North Little Rock-Conway, AR
    "31080": "Los Angeles",        # Los Angeles-Long Beach-Anaheim, CA
    "31140": "Louisville",         # Louisville/Jefferson County, KY-IN
    "32820": "Memphis",            # Memphis, TN-MS-AR
    "33100": "Miami",              # Miami-Fort Lauderdale-West Palm Beach, FL
    "33340": "Milwaukee",          # Milwaukee-Waukesha, WI
    "33460": "Minneapolis",        # Minneapolis-St. Paul-Bloomington, MN-WI
    "34980": "Nashville",          # Nashville-Davidson–Murfreesboro–Franklin, TN
    "35380": "New Orleans",        # New Orleans-Metairie, LA
    "35620": "New York",           # New York-Newark-Jersey City, NY-NJ
    "36420": "Oklahoma City",      # Oklahoma City, OK Metro Area
    "36740": "Orlando",            # Orlando-Kissimmee-Sanford, FL
    "37980": "Philadelphia",       # Philadelphia-Camden-Wilmington, PA-NJ-DE-MD
    "38060": "Phoenix",            # Phoenix-Mesa-Chandler, AZ
    "38300": "Pittsburgh",         # Pittsburgh, PA Metro Area
    "38900": "Portland",           # Portland-Vancouver-Hillsboro, OR-WA
    "39300": "Providence",         # Providence-Warwick, RI-MA
    "39580": "Raleigh",            # Raleigh-Cary, NC
    "40060": "Richmond",           # Richmond, VA Metro Area
    "40140": "Riverside",          # Riverside-San Bernardino-Ontario, CA
    "40380": "Rochester",          # Rochester, NY Metro Area
    "40900": "Sacramento",         # Sacramento-Roseville-Folsom, CA
    "41180": "St. Louis",          # St. Louis, MO-IL
    "41620": "Salt Lake City",     # Salt Lake City-Murray, UT
    "41700": "San Antonio",        # San Antonio-New Braunfels, TX
    "41740": "San Diego",          # San Diego-Chula Vista-Carlsbad, CA
    "41860": "San Francisco",      # San Francisco-Oakland-Fremont, CA
    "41940": "San Jose",           # San Jose-Sunnyvale-Santa Clara, CA
    "42660": "Seattle",            # Seattle-Tacoma-Bellevue, WA
    "43620": "Sioux Falls",        # Sioux Falls, SD Metro Area
    "44060": "Spokane",            # Spokane-Spokane Valley, WA
    "45300": "Tampa",              # Tampa-St. Petersburg-Clearwater, FL
    "45780": "Toledo",             # Toledo, OH Metro Area
    "46060": "Tucson",             # Tucson, AZ Metro Area
    "46140": "Tulsa",              # Tulsa, OK Metro Area
    "46520": "Urban Honolulu",     # Urban Honolulu, HI Metro Area → "Honolulu"
    "47260": "Virginia Beach",     # Virginia Beach-Chesapeake-Norfolk, VA-NC
    "47900": "Washington",         # Washington-Arlington-Alexandria, DC-VA-MD-WV
    "48620": "Wichita",            # Wichita, KS Metro Area
    "49340": "Worcester",          # Worcester, MA Metro Area
}


# ── Helpers ──────────────────────────────────────────────────────────

def fetch_url(url: str, timeout: int = 30, retries: int = 3) -> str:
    """Fetch a URL and return decoded text."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8")
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    return ""


def clean_cell(text: str) -> str:
    """Strip HTML tags, non-breaking spaces, and footnote markers."""
    # Remove footnote superscripts BEFORE stripping all HTML tags
    s = re.sub(r"<sup[^>]*>.*?</sup>", "", text)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&#160;", "").replace("\u00a0", "")
    s = re.sub(r"\[.*?\]", "", s)
    return s.strip()


def parse_num(text: str) -> float | None:
    """Parse '1,234.56' → float."""
    try:
        return float(text.replace(",", "").strip())
    except (ValueError, AttributeError):
        return None


def extract_wiki_tables(html: str) -> list[list[list[str]]]:
    """Extract all tables from HTML as list of tables, each = list of rows."""
    tables = []
    table_blocks = re.findall(r"<table[^>]*>(.*?)</table>", html, re.DOTALL)
    for tbl_html in table_blocks:
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbl_html, re.DOTALL)
        parsed_rows = []
        for row_html in rows:
            cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, re.DOTALL)
            parsed_rows.append([clean_cell(c) for c in cells])
        if parsed_rows:
            tables.append(parsed_rows)
    return tables


def parse_city_crime_table(table: list[list[str]]) -> list[dict]:
    """
    Parse Wikipedia city crime table.
    Columns: State | City | Population | Total | Murder | Rape | Robbery |
             AggAssault | ViolentTotal | Arson | Burglary | Larceny |
             MVTheft | PropertyTotal
    Returns list of {state, city, violent_rate_per_100k, property_rate_per_100k}
    """
    results = []
    for row in table:
        if len(row) < 14:
            continue
        if row[0].lower() in ("state", "") and "city" in row[1].lower():
            continue
        if "yearly crime rates" in " ".join(row).lower():
            continue
        if "murder" in row[0].lower() or "total" == row[0].lower():
            continue

        state_full = row[0]
        city = row[1]
        violent_rate = parse_num(row[8])   # Violent crime total column
        property_rate = parse_num(row[13])  # Property crime total column

        if violent_rate is not None and property_rate is not None and city:
            state_full = re.sub(r"\d", "", state_full).strip()
            state_abbr = STATE_NAME_TO_ABBR.get(state_full, state_full)
            results.append({
                "state": state_abbr,
                "state_full": state_full,
                "city": city,
                "violent_rate_per_100k": violent_rate,
                "property_rate_per_100k": property_rate,
            })
    return results


def fetch_all_city_data() -> list[dict]:
    """Fetch and parse crime data from both Wikipedia city pages."""
    all_cities = []

    for url in [WIKI_CITIES_URL, WIKI_CITIES_100K_URL]:
        print(f"  Fetching: {url}")
        try:
            html = fetch_url(url)
            tables = extract_wiki_tables(html)
            for tbl in tables:
                if len(tbl) > 50:
                    parsed = parse_city_crime_table(tbl)
                    if parsed:
                        all_cities.extend(parsed)
                        print(f"    Parsed {len(parsed)} cities from this table")
                        break
        except Exception as e:
            print(f"    ERROR: {e}")

    # Deduplicate by (city, state)
    seen = set()
    unique = []
    for c in all_cities:
        key = (c["city"].lower(), c["state"])
        if key not in seen:
            seen.add(key)
            unique.append(c)

    print(f"  Total unique cities: {len(unique)}")
    return unique


def fetch_state_violent_trends() -> dict[str, dict[str, float]]:
    """
    Returns {state_abbr: {"2018": rate, ..., "2024": rate}}
    from Wikipedia 'List of U.S. states ... by violent crime rate'.
    """
    print(f"  Fetching: {WIKI_STATE_VIOLENT_URL}")
    html = fetch_url(WIKI_STATE_VIOLENT_URL)
    tables = extract_wiki_tables(html)

    state_yearly = {}
    for tbl in tables:
        if len(tbl) < 10:
            continue
        header = tbl[0]
        years = []
        for cell in header[1:]:
            val = parse_num(cell)
            if val is not None and 2018 <= val <= 2025:
                years.append(str(int(val)))
        if len(years) < 3:
            continue

        for row in tbl[1:]:
            if len(row) < 2:
                continue
            state_full = row[0]
            if state_full.lower() in ("united states", "location", ""):
                continue
            state_abbr = STATE_NAME_TO_ABBR.get(state_full)
            if not state_abbr:
                continue

            rates = {}
            for i, yr in enumerate(years):
                if i + 1 < len(row):
                    val = parse_num(row[i + 1])
                    if val is not None:
                        rates[yr] = val
            if rates:
                state_yearly[state_abbr] = rates

    print(f"  States with yearly trends: {len(state_yearly)}")
    return state_yearly


def compute_yoy_trend(state_yearly: dict[str, dict[str, float]],
                      state: str) -> float | None:
    """
    Compute year-over-year trend (-1 to 1).
    Uses change over 3 most recent years normalized.
    """
    yearly = state_yearly.get(state)
    if not yearly or len(yearly) < 2:
        return None

    sorted_years = sorted(yearly.keys())
    recent_years = sorted_years[-3:]
    recent_rates = [yearly[y] for y in recent_years if y in yearly]

    if len(recent_rates) < 3:
        return None

    first, last = recent_rates[0], recent_rates[-1]
    if first == 0:
        return 0.0

    trend = (last - first) / first
    return round(max(-1.0, min(1.0, trend)), 4)


# ── CBSA name parsing ────────────────────────────────────────────────

def extract_state(cbsa_name: str) -> str:
    """Extract primary state abbreviation from a CBSA name."""
    m = re.search(r",\s*([A-Z]{2})", cbsa_name)
    return m.group(1) if m else ""


def extract_primary_city(cbsa_name: str) -> str:
    """Extract the primary city name from a CBSA name."""
    city_part = cbsa_name.split(",")[0].strip()
    # If multi-city (hyphenated), take only the first one for matching
    return city_part


# ── City matching ────────────────────────────────────────────────────

def build_city_index(cities: list[dict]) -> dict:
    """Build lookup indices from parsed city data."""
    # (city_lower, state) → entry
    by_city_state = {}
    for c in cities:
        key = (c["city"].lower(), c["state"])
        by_city_state[key] = c

    # city_lower → list of entries (across all states)
    by_city = defaultdict(list)
    for c in cities:
        by_city[c["city"].lower()].append(c)

    return {"by_city_state": by_city_state, "by_city": by_city}


def match_cbsa_to_city(cbsa_code: str, cbsa_name: str, city_index: dict,
                       state_yearly: dict, cities: list[dict]) -> dict | None:
    """
    Try to find city-level crime data for a CBSA.
    Returns crime dict or None if no match.
    """
    state = extract_state(cbsa_name)
    primary = extract_primary_city(cbsa_name).lower()

    by_city_state = city_index["by_city_state"]
    by_city = city_index["by_city"]

    # 1. Check manual overrides
    if cbsa_code in CBSA_CITY_OVERRIDES:
        override_city = CBSA_CITY_OVERRIDES[cbsa_code].lower()
        # Try exact match with state
        match = by_city_state.get((override_city, state))
        if match:
            return match
        # Try without state
        entries = by_city.get(override_city, [])
        if entries:
            return entries[0]

    # 2. Exact match on (primary, state)
    match = by_city_state.get((primary, state))
    if match:
        return match

    # 3. Match on first word of primary + state
    first_word = primary.split("-")[0].split()[0].lower()
    match = by_city_state.get((first_word, state))
    if match:
        return match

    # 4. Partial match within same state (only for single-city CBSA names,
    #    NOT for hyphenated multi-city names like "Atlanta-Sandy Springs-Alpharetta"
    #    where partial match would pick up a suburb instead of the primary city).
    if "-" not in primary:
        for (city_lower, st), entry in by_city_state.items():
            if st != state:
                continue
            if city_lower in primary or primary in city_lower:
                return entry

    # 5. For hyphenated CBSA names, try each segment individually
    #    but only the FIRST segment gets same-state match priority.
    if "-" in primary:
        parts = primary.split("-")
        # Try first segment (primary city) with same state
        first_part = parts[0].strip().lower()
        if len(first_part) >= 3:
            match = by_city_state.get((first_part, state))
            if match:
                return match
            # Partial match for first segment in same state
            for (city_lower, st), entry in by_city_state.items():
                if st != state:
                    continue
                if city_lower in first_part or first_part in city_lower:
                    return entry
        # Try other segments (suburbs) ONLY as last resort
        for part in parts[1:]:
            part = part.strip().lower()
            if len(part) < 3:
                continue
            match = by_city_state.get((part, state))
            if match:
                return match

    return None


def compute_state_averages(cities: list[dict]) -> dict[str, dict]:
    """
    Compute state-level average violent and property crime rates
    from available city data.
    Returns {state_abbr: {"violent_rate": float, "property_rate": float}}
    """
    state_rates: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: {"violent": [], "property": []}
    )
    for c in cities:
        st = c["state"]
        state_rates[st]["violent"].append(c["violent_rate_per_100k"])
        state_rates[st]["property"].append(c["property_rate_per_100k"])

    result = {}
    for st, rates in state_rates.items():
        v = rates["violent"]
        p = rates["property"]
        result[st] = {
            "violent_rate": round(sum(v) / len(v), 1) if v else None,
            "property_rate": round(sum(p) / len(p), 1) if p else None,
        }
    return result


def compute_national_averages(cities: list[dict]) -> dict:
    """Compute national average as last-resort fallback."""
    v_rates = [c["violent_rate_per_100k"] for c in cities]
    p_rates = [c["property_rate_per_100k"] for c in cities]
    return {
        "violent_rate": round(sum(v_rates) / len(v_rates), 1),
        "property_rate": round(sum(p_rates) / len(p_rates), 1),
    }


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("build_cbsa_crime.py — Expand FBI UCR to all 939 CBSAs")
    print("=" * 60)

    # ── Load CBSA master ──────────────────────────────────────────────
    print("\n[0] Loading CBSA master geography...")
    with open(CBSA_PATH) as f:
        cbsa_data = json.load(f)
    cbsas = cbsa_data["cbsas"]
    print(f"  {len(cbsas)} CBSAs loaded")

    # Count metro vs micro
    n_metro = sum(1 for c in cbsas if "Metro Area" in c["name"])
    n_micro = sum(1 for c in cbsas if "Micro Area" in c["name"])
    print(f"  Metro areas: {n_metro}, Micro areas: {n_micro}")

    # ── Check resumability ────────────────────────────────────────────
    existing: dict[str, dict] = {}
    if OUT_PATH.exists():
        with open(OUT_PATH) as f:
            existing_data = json.load(f)
        existing = existing_data.get("crime", {})
        print(f"\n  Resuming: {len(existing)} CBSAs already have crime data")
    else:
        print("\n  Starting fresh (no existing cbsa_crime.json)")

    # ── Fetch Wikipedia data ──────────────────────────────────────────
    print("\n[1/4] Fetching city-level crime data from Wikipedia...")
    cities = fetch_all_city_data()
    print(f"  → {len(cities)} unique cities with crime data")

    print("\n[2/4] Fetching state-level violent crime trends...")
    state_yearly = fetch_state_violent_trends()
    print(f"  → {len(state_yearly)} states with yearly trend data")

    # ── Build indices ─────────────────────────────────────────────────
    print("\n[3/4] Building lookup indices...")
    city_index = build_city_index(cities)
    state_avgs = compute_state_averages(cities)
    national_avg = compute_national_averages(cities)

    states_with_cities = set(c["state"] for c in cities)
    print(f"  States with city-level data: {len(states_with_cities)}")
    print(f"  National avg violent rate: {national_avg['violent_rate']:.1f}")
    print(f"  National avg property rate: {national_avg['property_rate']:.1f}")

    # ── Match each CBSA ───────────────────────────────────────────────
    print(f"\n[4/4] Matching {len(cbsas)} CBSAs to crime data...")

    crime_output: dict[str, dict] = dict(existing)  # preserve existing
    matched_direct = 0
    matched_state_fallback = 0
    matched_national_fallback = 0
    matched_existing = 0
    unmatched = 0

    for i, cbsa in enumerate(cbsas):
        code = cbsa["cbsa_code"]
        name = cbsa["name"]
        state = extract_state(name)

        # Skip already filled
        if code in existing:
            matched_existing += 1
            continue

        yoy_trend = compute_yoy_trend(state_yearly, state)

        # Try city-level match
        city_match = match_cbsa_to_city(code, name, city_index,
                                        state_yearly, cities)

        if city_match:
            crime_output[code] = {
                "violentCrimeRatePer100k": city_match["violent_rate_per_100k"],
                "propertyCrimeRatePer100k": city_match["property_rate_per_100k"],
                "yearOverYearTrend": yoy_trend if yoy_trend is not None else 0.0,
                "source": "wikipedia_city_table",
                "match_city": city_match["city"],
                "match_state": city_match["state"],
                "data_year": 2022,
            }
            matched_direct += 1
        else:
            # State-level fallback
            st_avg = state_avgs.get(state)
            if st_avg and st_avg["violent_rate"] is not None:
                crime_output[code] = {
                    "violentCrimeRatePer100k": st_avg["violent_rate"],
                    "propertyCrimeRatePer100k": st_avg["property_rate"],
                    "yearOverYearTrend": yoy_trend if yoy_trend is not None else 0.0,
                    "source": "state_average_estimate",
                    "match_city": None,
                    "match_state": state,
                    "data_year": 2022,
                }
                matched_state_fallback += 1
            else:
                # National average fallback (last resort)
                crime_output[code] = {
                    "violentCrimeRatePer100k": national_avg["violent_rate"],
                    "propertyCrimeRatePer100k": national_avg["property_rate"],
                    "yearOverYearTrend": yoy_trend if yoy_trend is not None else 0.0,
                    "source": "national_average_estimate",
                    "match_city": None,
                    "match_state": state,
                    "data_year": 2022,
                }
                matched_national_fallback += 1

        # Progress
        if (i + 1) % 200 == 0:
            print(f"  Processed {i + 1}/{len(cbsas)}... "
                  f"(direct={matched_direct}, state={matched_state_fallback}, "
                  f"national={matched_national_fallback})")

    # ── Build output ──────────────────────────────────────────────────
    metadata = {
        "source": "FBI Uniform Crime Reporting (UCR) Program via Wikipedia tables",
        "description": (
            "CBSA-level violent and property crime rates per 100,000 residents. "
            "Primary cities matched against Wikipedia tables of FBI UCR 2022 data "
            "(Table 8, offenses known to law enforcement). Unmatched CBSAs use "
            "state-level averages from available city data within that state. "
            "National average used as last-resort fallback. "
            "Year-over-year trends computed from state-level violent crime rates "
            "(2018-2024)."
        ),
        "generated": datetime.now(timezone.utc).isoformat(),
        "urls": [
            WIKI_CITIES_URL,
            WIKI_CITIES_100K_URL,
            WIKI_STATE_VIOLENT_URL,
        ],
        "schema_version": "cbsa_crime.v1",
        "data_year": 2022,
        "trend_years": "2018-2024",
        "cities_parsed": len(cities),
        "states_with_trends": len(state_yearly),
        "total_cbsas": len(cbsas),
        "metro_areas": n_metro,
        "micro_areas": n_micro,
        "matched_direct_city": matched_direct,
        "matched_state_average": matched_state_fallback,
        "matched_national_average": matched_national_fallback,
        "resumed_from_existing": matched_existing,
        "total_covered": len(crime_output),
    }

    output = {
        "metadata": metadata,
        "crime": crime_output,
    }

    # ── Write output ──────────────────────────────────────────────────
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2, sort_keys=False)

    print(f"\n{'=' * 60}")
    print("SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Total CBSAs:               {len(cbsas)}")
    print(f"    Metro areas:             {n_metro}")
    print(f"    Micro areas:             {n_micro}")
    print(f"  Direct city matches:       {matched_direct}")
    print(f"  State average fallback:    {matched_state_fallback}")
    print(f"  National average fallback: {matched_national_fallback}")
    print(f"  Resumed from existing:     {matched_existing}")
    print(f"  ─────────────────────")
    print(f"  Total covered:             {len(crime_output)}")
    print(f"  Missing:                   {len(cbsas) - len(crime_output)}")
    print(f"\n  Output: {OUT_PATH}")

    # Quality check: print some examples
    print(f"\nSAMPLE DIRECT MATCHES (first 5):")
    direct_entries = [
        (code, entry) for code, entry in crime_output.items()
        if entry.get("source") == "wikipedia_city_table"
    ]
    for code, entry in direct_entries[:5]:
        print(f"  {code}: {entry.get('match_city', '?')}, {entry.get('match_state', '?')} "
              f"→ violent={entry['violentCrimeRatePer100k']:.1f} "
              f"property={entry['propertyCrimeRatePer100k']:.1f}")

    print(f"\nSAMPLE STATE FALLBACKS (first 5):")
    state_entries = [
        (code, entry) for code, entry in crime_output.items()
        if entry.get("source") == "state_average_estimate"
    ]
    for code, entry in state_entries[:5]:
        cbsa_name = next((c["name"] for c in cbsas if c["cbsa_code"] == code), "?")
        print(f"  {code}: {cbsa_name} "
              f"→ violent={entry['violentCrimeRatePer100k']:.1f} "
              f"property={entry['propertyCrimeRatePer100k']:.1f}")


if __name__ == "__main__":
    main()
