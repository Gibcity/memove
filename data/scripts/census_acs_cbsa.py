"""
Pull Census ACS 5-Year (2022) data for ALL US CBSAs (metro + micro areas)
in a single API call. Covers 12 ACS tables for relocation scoring.

Source: U.S. Census Bureau, American Community Survey 5-Year Estimates (2022 vintage).
Geography: All Core-Based Statistical Areas (metropolitan + micropolitan).
Key loaded from /home/mongo/projects/us-relocation-2026/.env.census (chmod 600).

ACS Tables pulled:
  B01003_001E   Total population
  B25064_001E   Median gross rent (dollars)
  B25077_001E   Median home value (dollars)
  B23025_002E   Labor force (population 16+)
  B23025_005E   Unemployed (population 16+)
  B19013_001E   Median household income (dollars)
  B01002_001E   Median age (years)
  B15003_022E   Bachelor's degree (population 25+)
  B15003_001E   Total population 25+ (education denominator)
  B08013_001E   Aggregate travel time to work (minutes)
  B08303_001E   Total workers 16+ (travel time universe; denominator for mean)
  B08301_010E   Public transit commuters
  B08301_001E   Total commuters (transportation denominator)

NOTE: B08303_001E is NOT mean travel time — it is a count of workers.
The mean is computed as B08013_001E / B08303_001E.

Derived fields:
  unemployment_rate_pct   = B23025_005E / B23025_002E * 100
  pct_college_educated     = B15003_022E / B15003_001E * 100
  mean_travel_time_minutes = B08013_001E / B08303_001E
  pct_public_transit       = B08301_010E / B08301_001E * 100
"""

import json
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/census_acs_cbsa.json"
ENV_FILE = ROOT / ".env.census"

# Columns in the order they appear in the 'get' parameter
# (determines response column order)
ACS_COLUMNS = [
    "NAME",            # CBSA name
    "B01003_001E",     # Total population
    "B25064_001E",     # Median gross rent
    "B25077_001E",     # Median home value
    "B23025_002E",     # Labor force (16+)
    "B23025_005E",     # Unemployed (16+)
    "B19013_001E",     # Median household income
    "B01002_001E",     # Median age
    "B15003_022E",     # Bachelor's degree (25+)
    "B15003_001E",     # Total population 25+
    "B08013_001E",     # Aggregate travel time to work (minutes)
    "B08303_001E",     # Total workers 16+ (travel time universe)
    "B08301_010E",     # Public transit commuters
    "B08301_001E",     # Total commuters
]

# Table descriptions for metadata
TABLE_LIST = [
    {"variable": "B01003_001E", "label": "Total population"},
    {"variable": "B25064_001E", "label": "Median gross rent (dollars)"},
    {"variable": "B25077_001E", "label": "Median home value (dollars)"},
    {"variable": "B23025_002E", "label": "Labor force (population 16+)"},
    {"variable": "B23025_005E", "label": "Unemployed (population 16+)"},
    {"variable": "B19013_001E", "label": "Median household income (dollars)"},
    {"variable": "B01002_001E", "label": "Median age (years)"},
    {"variable": "B15003_022E", "label": "Bachelor's degree (population 25+)"},
    {"variable": "B15003_001E", "label": "Total population 25+ (education denominator)"},
    {"variable": "B08013_001E", "label": "Aggregate travel time to work (minutes)"},
    {"variable": "B08303_001E", "label": "Total workers 16+ (travel time universe)"},
    {"variable": "B08301_010E", "label": "Public transit commuters"},
    {"variable": "B08301_001E", "label": "Total commuters (transportation denominator)"},
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


def safe_float(val):
    """Convert a Census value to float, returning None for null/empty/suppressed."""
    if val is None or val == "" or val == "null":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def compute_rate(numerator, denominator):
    """Compute percentage: (numerator / denominator) * 100, or None if invalid."""
    if numerator is None or denominator is None or denominator == 0:
        return None
    return round(numerator / denominator * 100, 2)


def fetch_all_cbsas(key: str) -> dict:
    """
    Single API call: pull all 12 ACS tables for every CBSA (metro + micro).
    Returns parsed records.
    """
    get_str = ",".join(ACS_COLUMNS)
    # Geography: all metropolitan and micropolitan statistical areas
    geo_value = "metropolitan statistical area/micropolitan statistical area:*"

    # Build URL manually to preserve :* wildcard (urlencode encodes * as %2A)
    base = "https://api.census.gov/data/2022/acs/acs5"
    params = {
        "get": get_str,
        "for": geo_value,
        "key": key,
    }
    # urlencode handles spaces→+ and /→%2F correctly; but *→%2A which Census rejects.
    # So we manually replace %2A back to * after encoding.
    qs = urllib.parse.urlencode(params, safe="").replace("%2A", "*")
    # Also restore %2F back to / for the geo path (some Census endpoints need literal /)
    qs = qs.replace("%2F", "/")
    url = f"{base}?{qs}"

    print(f"[census-cbsa] Fetching: {base}?get={get_str[:80]}...")
    print(f"[census-cbsa] Geography: metropolitan+micropolitan statistical areas (all CBSAs)")

    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))

    # Census API returns: [[header_row], [data_row1], [data_row2], ...]
    if not isinstance(data, list) or len(data) < 2:
        raise RuntimeError(f"Unexpected API response format: {type(data)}")

    header = data[0]
    rows = data[1:]

    print(f"[census-cbsa] API returned {len(header)} columns, {len(rows)} rows")
    print(f"[census-cbsa] Header: {header[:5]}... + geography cols at end")

    # Verify expected columns are present
    expected_cols = ACS_COLUMNS + ["metropolitan statistical area/micropolitan statistical area"]
    for col in ACS_COLUMNS:
        if col not in header:
            print(f"[census-cbsa] WARNING: expected column {col} not in response header")

    # Find the CBSA code column index (last column in the response)
    geo_col = header[-1]  # typically "metropolitan statistical area/micropolitan statistical area"

    return {"header": header, "rows": rows, "geo_col": geo_col}


def parse_cbsa_row(header, row, geo_col):
    """Parse a single CBSA data row into structured dict."""
    rec = dict(zip(header, row))

    # CBSA code from geography column
    cbsa_code = rec.get(geo_col)
    name = rec.get("NAME", "")

    # Parse raw values
    total_pop = safe_int(rec.get("B01003_001E"))
    median_rent = safe_int(rec.get("B25064_001E"))
    median_home = safe_int(rec.get("B25077_001E"))
    labor_force = safe_int(rec.get("B23025_002E"))
    unemployed = safe_int(rec.get("B23025_005E"))
    median_income = safe_int(rec.get("B19013_001E"))
    median_age = safe_float(rec.get("B01002_001E"))
    bachelors = safe_int(rec.get("B15003_022E"))
    pop_25plus = safe_int(rec.get("B15003_001E"))
    agg_travel_time = safe_int(rec.get("B08013_001E"))
    total_workers = safe_int(rec.get("B08303_001E"))
    transit_commuters = safe_int(rec.get("B08301_010E"))
    total_commuters = safe_int(rec.get("B08301_001E"))

    # Derived fields
    unemployment_rate = compute_rate(unemployed, labor_force)
    pct_college = compute_rate(bachelors, pop_25plus)
    # Mean travel time = aggregate minutes / total workers
    mean_travel_time = None
    if agg_travel_time is not None and total_workers is not None and total_workers > 0:
        mean_travel_time = round(agg_travel_time / total_workers, 1)
    pct_transit = compute_rate(transit_commuters, total_commuters)

    metrics = {
        "total_population": total_pop,
        "median_gross_rent": median_rent,
        "median_home_value": median_home,
        "labor_force": labor_force,
        "unemployed": unemployed,
        "unemployment_rate_pct": unemployment_rate,
        "median_household_income": median_income,
        "median_age": median_age,
        "bachelors_degree_holders": bachelors,
        "population_25_plus": pop_25plus,
        "pct_college_educated": pct_college,
        "aggregate_travel_time_minutes": agg_travel_time,
        "total_workers_16plus": total_workers,
        "mean_travel_time_minutes": mean_travel_time,
        "public_transit_commuters": transit_commuters,
        "total_commuters": total_commuters,
        "pct_public_transit": pct_transit,
    }

    return {
        "cbsa_code": cbsa_code,
        "name": name,
        "metrics": metrics,
    }


def main():
    key = load_key()
    pulled_at = datetime.now(timezone.utc).isoformat()

    print("=" * 60)
    print("[census-cbsa] Census ACS CBSA ETL — 2022 ACS 5-Year")
    print(f"[census-cbsa] Pulled at: {pulled_at}")
    print(f"[census-cbsa] Output: {OUT_PATH}")

    # Fetch all CBSAs in one call
    raw = fetch_all_cbsas(key)
    header = raw["header"]
    rows = raw["rows"]
    geo_col = raw["geo_col"]

    # Parse every row
    cbsas = []
    parse_errors = 0
    for i, row in enumerate(rows):
        try:
            cbsa = parse_cbsa_row(header, row, geo_col)
            cbsas.append(cbsa)
        except Exception as e:
            parse_errors += 1
            print(f"[census-cbsa] Parse error row {i}: {e}")

    print(f"\n[census-cbsa] Parsed {len(cbsas)} CBSAs ({parse_errors} parse errors)")

    # Build output
    output = {
        "metadata": {
            "source": "U.S. Census Bureau, American Community Survey 5-Year Estimates (2022)",
            "url": "https://api.census.gov/data/2022/acs/acs5",
            "pulled_at": pulled_at,
            "vintage": "2022 ACS 5-year",
            "geography": "All U.S. Core-Based Statistical Areas (metropolitan + micropolitan)",
            "table_list": TABLE_LIST,
            "derived_fields": {
                "unemployment_rate_pct": "B23025_005E / B23025_002E * 100",
                "pct_college_educated": "B15003_022E / B15003_001E * 100",
                "mean_travel_time_minutes": "B08013_001E / B08303_001E (aggregate travel time ÷ total workers)",
                "pct_public_transit": "B08301_010E / B08301_001E * 100",
            },
        },
        "cbsas": cbsas,
    }

    # Write
    json.dump(output, open(OUT_PATH, "w"), indent=2)
    print(f"[census-cbsa] Wrote {OUT_PATH} ({len(cbsas)} CBSAs)")

    # --- Validation / Summary ---
    print("\n" + "=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)

    # Count non-null for each field
    field_keys = [
        "total_population", "median_gross_rent", "median_home_value",
        "unemployment_rate_pct", "median_household_income", "median_age",
        "pct_college_educated", "mean_travel_time_minutes", "pct_public_transit",
    ]
    field_labels = {
        "total_population": "Total population",
        "median_gross_rent": "Median gross rent",
        "median_home_value": "Median home value",
        "unemployment_rate_pct": "Unemployment rate",
        "median_household_income": "Median household income",
        "median_age": "Median age",
        "pct_college_educated": "% College educated",
        "mean_travel_time_minutes": "Mean travel time",
        "pct_public_transit": "% Public transit",
    }

    total = len(cbsas)
    counts = {}
    for key in field_keys:
        count = sum(1 for c in cbsas if c["metrics"].get(key) is not None)
        counts[key] = count
        label = field_labels.get(key, key)
        pct = count / total * 100 if total else 0
        print(f"  {label:30s}: {count:5d} / {total} ({pct:.1f}%)")

    print()

    # Top 5 by population
    ranked = sorted(cbsas, key=lambda c: c["metrics"].get("total_population") or 0, reverse=True)
    print("Top 5 CBSAs by population:")
    for i, c in enumerate(ranked[:5], 1):
        pop = c["metrics"].get("total_population")
        pop_str = f"{pop:,}" if pop else "N/A"
        print(f"  {i}. {c['name'][:50]:50s}  Pop: {pop_str:>10s}  (CBSA {c['cbsa_code']})")

    print("\nBottom 5 CBSAs by population (smallest):")
    for i, c in enumerate(ranked[-5:], 1):
        pop = c["metrics"].get("total_population")
        pop_str = f"{pop:,}" if pop else "N/A"
        print(f"  {i}. {c['name'][:50]:50s}  Pop: {pop_str:>10s}  (CBSA {c['cbsa_code']})")

    # Spot-check: New York
    ny = next((c for c in cbsas if c.get("cbsa_code") == "35620"), None)
    if ny:
        print(f"\nSpot Check — New York-Newark-Jersey City, NY-NJ-PA (CBSA 35620):")
        for key, val in ny["metrics"].items():
            print(f"  {key}: {val}")

    print(f"\n[census-cbsa] Done.")


if __name__ == "__main__":
    main()
