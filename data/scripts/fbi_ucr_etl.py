#!/usr/bin/env python3
"""
FBI UCR Crime Data ETL Script
==============================
Pulls violent and property crime rates (per 100k) for as many geographic
areas as possible, using public web sources (Wikipedia tables of FBI UCR data).

Data sources:
  1. Wikipedia "United States cities by crime rate"
     → City-level 2022 violent + property crime rates per 100K (~200 cities)
  2. Wikipedia "United States cities by crime rate (100,000–250,000)"
     → Additional 2022 city-level data (~231 cities)
  3. Wikipedia "List of U.S. states and territories by violent crime rate"
     → State-level violent crime rates by year (2018–2024) for YoY trend

Mapping strategy:
  - Direct city-name match to our 59 metros
  - Manual overrides for alternate city names
  - Fallback: state-level average computed from available cities

Output: sources/processed/crime_fbi_ucr.json
Schema version: crime.v2
"""

import json
import re
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/crime_fbi_ucr.json"

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


# ── Helper: fetch URL ─────────────────────────────────────────────────
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


# ── HTML table parser ──────────────────────────────────────────────────
def clean_cell(text: str) -> str:
    """Strip HTML tags, non-breaking spaces, and footnote markers."""
    s = re.sub(r"<[^>]+>", "", text)
    s = s.replace("&#160;", "").replace("\u00a0", "")
    s = re.sub(r"\[.*?\]", "", s)  # remove [1], [a], etc.
    return s.strip()


def parse_num(text: str) -> float | None:
    """Parse a string like '1,234.56' into float."""
    try:
        return float(text.replace(",", "").strip())
    except (ValueError, AttributeError):
        return None


def extract_wiki_tables(html: str) -> list[list[list[str]]]:
    """Extract all tables from HTML as list of tables, each = list of rows, each = list of cells."""
    tables = []
    # Find <table>...</table> blocks
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


# ── Parse city-level crime table ──────────────────────────────────────
def parse_city_crime_table(table: list[list[str]]) -> list[dict]:
    """
    Parse Wikipedia city crime table with column layout:
    State | City | Population | Total | Murder | Rape | Robbery | AggAssault |
    ViolentTotal | Arson | Burglary | Larceny | MVTheft | PropertyTotal
    
    Returns list of dicts with keys: state, city, violent_rate_per_100k, property_rate_per_100k
    """
    results = []
    for row in table:
        if len(row) < 14:
            continue
        # Skip header rows (contain 'State' or 'Yearly Crime Rates')
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
            # Clean state name
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


# ── Fetch all city-level crime data ───────────────────────────────────
def fetch_all_city_data() -> list[dict]:
    """Fetch and parse crime data from both Wikipedia city pages."""
    all_cities = []

    for url in [WIKI_CITIES_URL, WIKI_CITIES_100K_URL]:
        print(f"  Fetching: {url}")
        try:
            html = fetch_url(url)
            tables = extract_wiki_tables(html)
            # The main data table is the largest one with 14+ columns
            for tbl in tables:
                if len(tbl) > 50:  # data tables have many rows
                    parsed = parse_city_crime_table(tbl)
                    if parsed:
                        all_cities.extend(parsed)
                        print(f"    Parsed {len(parsed)} cities from this table")
                        break
        except Exception as e:
            print(f"    ERROR: {e}")

    # Deduplicate by city+state
    seen = set()
    unique = []
    for c in all_cities:
        key = (c["city"].lower(), c["state"])
        if key not in seen:
            seen.add(key)
            unique.append(c)

    print(f"  Total unique cities: {len(unique)}")
    return unique


# ── Fetch state-level violent crime trends ────────────────────────────
def fetch_state_violent_trends() -> dict[str, dict[str, float]]:
    """
    Returns {state_abbr: {"2018": rate, ..., "2024": rate}}
    from Wikipedia 'List of U.S. states ... by violent crime rate' (Table 1).
    """
    print(f"  Fetching: {WIKI_STATE_VIOLENT_URL}")
    html = fetch_url(WIKI_STATE_VIOLENT_URL)
    tables = extract_wiki_tables(html)

    # Find the table with year columns (2018, 2019, ...)
    state_yearly = {}
    for tbl in tables:
        if len(tbl) < 10:
            continue
        header = tbl[0]
        # Check if header has year columns
        years = []
        for cell in header[1:]:
            val = parse_num(cell)
            if val is not None and 2018 <= val <= 2025:
                years.append(str(int(val)))
        if len(years) < 3:
            continue

        # Parse data rows
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


# ── Compute state-level property crime averages ───────────────────────
def compute_state_property_rates(cities: list[dict]) -> dict[str, float]:
    """
    Compute population-weighted state-level property crime rate from city data.
    Since we don't have city populations in the parsed data (they're rates per 100K already),
    we use simple average of city rates within each state.
    """
    state_rates = defaultdict(list)
    for c in cities:
        state_rates[c["state"]].append(c["property_rate_per_100k"])

    result = {}
    for st, rates in state_rates.items():
        result[st] = round(sum(rates) / len(rates), 1)
    return result


# ── Metro-to-city mapping ─────────────────────────────────────────────
def build_metro_mapping(metros: list[dict], cities: list[dict]) -> dict:
    """
    Map each metro to the best available city crime data.
    Returns {metro_id: {violent_rate, property_rate, year, city_matched}}
    """
    # Index cities by (city_lower, state)
    city_index = defaultdict(list)
    for c in cities:
        city_index[(c["city"].lower(), c["state"])].append(c)

    # Also index by just city name (across states)
    city_by_name = defaultdict(list)
    for c in cities:
        city_by_name[c["city"].lower()].append(c)

    # Manual overrides for city names that differ from metro names
    MANUAL_MAP = {
        "boise-city-id": "Boise",
        "urban-honolulu-hi": "Honolulu",
        "washington-dc": "Washington",
        "st-louis-mo": "St. Louis",
        "kansas-city-mo": "Kansas City",
        "colorado-springs-co": "Colorado Springs",
        "salt-lake-city-ut": "Salt Lake City",
        "grand-rapids-mi": "Grand Rapids",
        "oklahoma-city-ok": "Oklahoma City",
        "little-rock-ar": "Little Rock",
        "sioux-falls-sd": "Sioux Falls",
        "san-antonio-tx": "San Antonio",
        "des-moines-ia": "Des Moines",
        "las-vegas-nv": "Las Vegas",
        "new-orleans-la": "New Orleans",
        "portland-me": "Portland",
        "portland-or": "Portland",
    }

    mapping = {}
    for metro in metros:
        metro_id = metro["id"]
        metro_name = metro["name"]  # e.g., "Memphis, TN"
        state = metro["state"]
        city_name = metro_name.split(",")[0].strip()

        # Try manual override first
        lookup_name = MANUAL_MAP.get(metro_id, city_name).lower()

        # Try exact match on (city, state)
        matches = city_index.get((lookup_name, state), [])
        if not matches:
            # Try without state
            matches = city_by_name.get(lookup_name, [])
        if not matches:
            # Try partial match (e.g., "Bend" might not be in the data)
            for c in cities:
                if lookup_name in c["city"].lower() and c["state"] == state:
                    matches = [c]
                    break
        if not matches:
            # Try city name contains metro name
            for c in cities:
                if c["city"].lower().startswith(lookup_name[:5]) and c["state"] == state:
                    matches = [c]
                    break

        if matches:
            # Take the first (or only) match
            best = matches[0]
            mapping[metro_id] = {
                "violent_rate_per_100k": best["violent_rate_per_100k"],
                "property_rate_per_100k": best["property_rate_per_100k"],
                "year": 2022,
                "city_matched": best["city"],
                "source": "wikipedia_city_table",
            }
        else:
            mapping[metro_id] = None  # Will fall back to state average

    return mapping


# ── Compute year-over-year trend ──────────────────────────────────────
def compute_yoy_trend(state_yearly: dict[str, dict[str, float]],
                      state: str) -> float | None:
    """
    Compute year-over-year trend (-1 to 1).
    Uses linear regression slope over 2018-2024, normalized.
    Positive = crime increasing, negative = decreasing.
    """
    yearly = state_yearly.get(state)
    if not yearly or len(yearly) < 2:
        return None

    # Get the most recent 3 years
    sorted_years = sorted(yearly.keys())
    recent_years = sorted_years[-3:]
    recent_rates = [yearly[y] for y in recent_years if y in yearly]

    if len(recent_rates) < 3:
        return None

    # Simple trend: (last - first) / first, clamped to [-1, 1]
    first, last = recent_rates[0], recent_rates[-1]
    if first == 0:
        return 0.0
    
    trend = (last - first) / first
    # Normalize: typical state YoY changes are ±10%
    # Clamp between -1 and 1
    return round(max(-1.0, min(1.0, trend)), 4)


# ── Main ───────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("FBI UCR Crime Data ETL")
    print("=" * 60)

    # Load the 59 metros
    locations_path = ROOT / "sources/processed/relocation/locations.json"
    with open(locations_path) as f:
        metros = json.load(f)
    print(f"\nLoaded {len(metros)} metros from locations.json")

    # Step 1: Fetch city-level crime data
    print("\n[1/4] Fetching city-level crime data from Wikipedia...")
    cities = fetch_all_city_data()

    # Step 2: Fetch state-level violent crime trends
    print("\n[2/4] Fetching state-level violent crime trends...")
    state_yearly = fetch_state_violent_trends()

    # Step 3: Compute state-level property crime estimates
    print("\n[3/4] Computing state-level property crime estimates...")
    state_property = compute_state_property_rates(cities)
    print(f"  States with property estimates: {len(state_property)}")

    # Build metro mapping
    print("\n[4/4] Mapping metros to crime data...")
    metro_mapping = build_metro_mapping(metros, cities)

    # Build output areas
    areas = []
    matched_count = 0
    state_fallback_count = 0
    missing_count = 0

    for metro in metros:
        metro_id = metro["id"]
        state = metro["state"]
        name = metro["name"]

        match = metro_mapping.get(metro_id)

        if match:
            violent_rate = match["violent_rate_per_100k"]
            property_rate = match["property_rate_per_100k"]
            year = match["year"]
            source = match["source"]
            city_matched = match.get("city_matched", "unknown")
            matched_count += 1
        else:
            # Fall back to state average
            # For violent rate, use 2022 from state_yearly if available
            state_violent_2022 = None
            if state in state_yearly and "2022" in state_yearly[state]:
                state_violent_2022 = state_yearly[state]["2022"]
            
            state_prop = state_property.get(state)

            if state_violent_2022 is not None or state_prop is not None:
                # Use state average (from city data) or state-level rate
                # Compute state violent average from city data
                state_cities = [c for c in cities if c["state"] == state]
                if state_cities:
                    avg_violent = round(
                        sum(c["violent_rate_per_100k"] for c in state_cities) / len(state_cities), 1
                    )
                    avg_property = round(
                        sum(c["property_rate_per_100k"] for c in state_cities) / len(state_cities), 1
                    )
                else:
                    avg_violent = state_violent_2022
                    avg_property = state_prop

                violent_rate = avg_violent
                property_rate = avg_property
                year = 2022
                source = "state_average_estimate"
                city_matched = None
                state_fallback_count += 1
            else:
                missing_count += 1
                continue

        # Compute YoY trend
        yoy_trend = compute_yoy_trend(state_yearly, state)

        areas.append({
            "name": name,
            "state": state,
            "metro_id": metro_id,
            "violent_rate_per_100k": violent_rate,
            "property_rate_per_100k": property_rate,
            "year": year,
            "yoy_trend": yoy_trend,
            "source": source,
            "city_matched": city_matched,
        })

    # Build output
    output = {
        "metadata": {
            "source": "FBI Uniform Crime Reporting (UCR) Program via Wikipedia tables",
            "description": (
                "City-level 2022 violent and property crime rates per 100,000 residents. "
                "State-level year-over-year trends (2018-2024) for violent crime. "
                "Wikipedia city tables source from FBI UCR Table 8 (offenses known to law enforcement)."
            ),
            "generated": datetime.now(timezone.utc).isoformat(),
            "urls": [
                WIKI_CITIES_URL,
                WIKI_CITIES_100K_URL,
                WIKI_STATE_VIOLENT_URL,
            ],
            "schema_version": "crime.v2",
            "data_year": 2022,
            "trend_years": "2018-2024",
            "cities_parsed": len(cities),
            "states_with_trends": len(state_yearly),
        },
        "areas": areas,
    }

    # Write output
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    # Summary
    print(f"\n{'=' * 60}")
    print(f"SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Total metros:            {len(metros)}")
    print(f"  Direct city matches:     {matched_count}")
    print(f"  State-average fallback:  {state_fallback_count}")
    print(f"  Missing (no data):       {missing_count}")
    print(f"  Areas in output:         {len(areas)}")
    print(f"  Cities parsed:           {len(cities)}")
    print(f"  States with trends:      {len(state_yearly)}")

    if areas:
        # Sort by violent crime rate (highest first)
        by_violent = sorted(areas, key=lambda x: x["violent_rate_per_100k"], reverse=True)
        print(f"\n  HIGHEST violent crime rates (per 100K):")
        for a in by_violent[:5]:
            src = "✓" if a["source"] == "wikipedia_city_table" else "~"
            trend = a.get('yoy_trend')
            trend_str = f"{trend:>7.4f}" if trend is not None else "   N/A "
            print(f"    {src} {a['name']:30s} violent={a['violent_rate_per_100k']:>8.1f}  property={a['property_rate_per_100k']:>8.1f}  trend={trend_str}")

        print(f"\n  LOWEST violent crime rates (per 100K):")
        for a in by_violent[-5:]:
            src = "✓" if a["source"] == "wikipedia_city_table" else "~"
            trend = a.get('yoy_trend')
            trend_str = f"{trend:>7.4f}" if trend is not None else "   N/A "
            print(f"    {src} {a['name']:30s} violent={a['violent_rate_per_100k']:>8.1f}  property={a['property_rate_per_100k']:>8.1f}  trend={trend_str}")

    print(f"\n  Output written to: {OUT_PATH}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
