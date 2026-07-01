"""
Pull Census ACS 5-Year occupation + earnings data for ALL US CBSAs in two calls.
Feeds the relocation career endpoint — replaces stubbed OEUM (BLS.gov is geo-
blocked from WSL, and the public BLS API v2 doesn't expose OEUM/MSA series).

Sources used (single API call each, all CBSAs):
  S2001_C01_002E — median earnings (dollars) for population 16+ w/ earnings
  S2001_C01_013E — median earnings for full-time, year-round workers
  S2001_C01_014E — mean earnings for full-time, year-round workers
  S2401_C01_001E — total civilian employed (16+)
  S2401_C01_002E — Management, business, science, and arts
  S2401_C01_018E — Service
  S2401_C01_026E — Sales and office
  S2401_C01_029E — Natural resources, construction, maintenance
  S2401_C01_033E — Production, transportation, material moving

Output: sources/processed/cbsa_occupation.json
  { metadata, cbsas: [{ cbsa_code, name, occupation: {group: count, pct},
                         earnings: {median, medianFullTimeYearRound, meanFullTimeYearRound} }] }

Key: .env.census (CENSUS_API_KEY=...).
"""
import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/cbsa_occupation.json"
LOCATIONS_PATH = ROOT / "sources/processed/relocation/locations.json"
ACS_CBSA_PATH = ROOT / "sources/processed/census_acs_cbsa.json"
ENV_FILE = ROOT / ".env.census"

EARNINGS_COLS = [
    "NAME",
    "S2001_C01_002E",  # median earnings (all 16+ w/ earnings)
    "S2001_C01_013E",  # median earnings (FT/YR)
    "S2001_C01_014E",  # mean earnings (FT/YR)
]
OCCUPATION_COLS = [
    "NAME",
    "S2401_C01_001E",  # total civilian employed
    "S2401_C01_002E",  # mgmt/biz/sci/arts
    "S2401_C01_018E",  # service
    "S2401_C01_026E",  # sales/office
    "S2401_C01_029E",  # nat res/constr/maint
    "S2401_C01_033E",  # production/trans/mat moving
]

OCCUPATION_GROUPS = {
    "S2401_C01_001E": "totalEmployed",
    "S2401_C01_002E": "managementBusinessScienceArts",
    "S2401_C01_018E": "service",
    "S2401_C01_026E": "salesAndOffice",
    "S2401_C01_029E": "naturalResourcesConstructionMaintenance",
    "S2401_C01_033E": "productionTransportationMaterialMoving",
}


def load_key() -> str:
    if not ENV_FILE.exists():
        raise RuntimeError(f"Census API key not found at {ENV_FILE}")
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith("CENSUS_API_KEY="):
            return line.split("=", 1)[1]
    raise RuntimeError("CENSUS_API_KEY not set in env file")


def safe_int(v):
    if v is None or v == "" or v == "null" or v == "-999999999":
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def fetch_columns(year: int, cols: list[str], key: str) -> tuple[list[str], list[list[str]]]:
    """Single API call: pull all `cols` for every CBSA. Returns (header, rows)."""
    base = f"https://api.census.gov/data/{year}/acs/acs5/subject"
    params = {
        "get": ",".join(cols),
        "for": "metropolitan statistical area/micropolitan statistical area:*",
        "key": key,
    }
    qs = urllib.parse.urlencode(params, safe="").replace("%2A", "*").replace("%2F", "/")
    url = f"{base}?{qs}"
    print(f"[occupation] GET {base}?get={','.join(cols[1:])}&for=...*")
    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))
    if not isinstance(data, list) or len(data) < 2:
        raise RuntimeError(f"Unexpected API response: {type(data)}")
    header, rows = data[0], data[1:]
    print(f"[occupation]   -> {len(rows)} CBSAs, {len(header)} columns")
    return header, rows


def build_cbsa_name_index(acs_cbsa_path: Path) -> dict[str, str]:
    """name (e.g. 'Aberdeen, SD') -> cbsa_code, derived from the canonical ACS pull."""
    acs = json.loads(acs_cbsa_path.read_text())["cbsas"]
    idx: dict[str, str] = {}
    for rec in acs:
        full = rec["name"]
        for suffix in (" Micro Area", " Metro Area"):
            if full.endswith(suffix):
                idx[full[: -len(suffix)]] = rec["cbsa_code"]
                break
        else:
            idx[full] = rec["cbsa_code"]
    return idx


def main():
    key = load_key()
    pulled_at = datetime.now(timezone.utc).isoformat()
    year = 2022  # ACS 5-year latest available on the API

    print("=" * 60)
    print(f"[occupation] Census ACS occupation/earnings ETL — ACS {year} 5-Year")
    print(f"[occupation] Pulled at: {pulled_at}")

    name_to_code = build_cbsa_name_index(ACS_CBSA_PATH)
    print(f"[occupation] Name index: {len(name_to_code)} CBSAs from {ACS_CBSA_PATH.name}")

    earnings_header, earnings_rows = fetch_columns(year, EARNINGS_COLS, key)
    occ_header, occ_rows = fetch_columns(year, OCCUPATION_COLS, key)

    earnings_by_code: dict[str, dict] = {}
    for row in earnings_rows:
        rec = dict(zip(earnings_header, row))
        geo_col = earnings_header[-1]
        code = rec.get(geo_col)
        earnings_by_code[code] = {
            "medianEarningsUsd": safe_int(rec.get("S2001_C01_002E")),
            "medianEarningsFullTimeYearRoundUsd": safe_int(rec.get("S2001_C01_013E")),
            "meanEarningsFullTimeYearRoundUsd": safe_int(rec.get("S2001_C01_014E")),
        }

    occupation_by_code: dict[str, dict] = {}
    for row in occ_rows:
        rec = dict(zip(occ_header, row))
        geo_col = occ_header[-1]
        code = rec.get(geo_col)
        total = safe_int(rec.get("S2401_C01_001E"))
        groups: dict[str, int | None] = {}
        shares: dict[str, float | None] = {}
        for var, friendly in OCCUPATION_GROUPS.items():
            if friendly == "totalEmployed":
                continue
            count = safe_int(rec.get(var))
            groups[friendly] = count
            shares[friendly] = round((count / total) * 100, 1) if (count is not None and total) else None
        occupation_by_code[code] = {
            "totalEmployed": total,
            "byGroup": groups,
            "pctByGroup": shares,
        }

    # Join + write
    cbsas_out = []
    matched_earnings = 0
    matched_occupation = 0
    for code in sorted(set(earnings_by_code) | set(occupation_by_code), key=lambda x: int(x) if x.isdigit() else 0):
        e = earnings_by_code.get(code, {})
        o = occupation_by_code.get(code, {})
        if e.get("medianEarningsUsd") is not None:
            matched_earnings += 1
        if o.get("totalEmployed") is not None:
            matched_occupation += 1
        cbsas_out.append({
            "cbsa_code": code,
            "earnings": e,
            "occupation": o,
        })

    out = {
        "metadata": {
            "source": "U.S. Census Bureau, ACS 5-Year Subject Tables",
            "vintage": f"{year} ACS 5-Year Estimates",
            "tables": ["S2001 (Earnings in the Past 12 Months)", "S2401 (Occupation by Sex)"],
            "geography": "metropolitan+micropolitan statistical areas (all CBSAs)",
            "pulled_at": pulled_at,
            "license": "public_domain",
            "url": "https://www.census.gov/data/developers/data-sets/acs-5year.html",
        },
        "cbsas": cbsas_out,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"[occupation] Wrote {OUT_PATH}: {len(cbsas_out)} CBSAs "
          f"(earnings for {matched_earnings}, occupation for {matched_occupation})")

    # Coverage report against relocation/locations.json
    locations = json.loads(LOCATIONS_PATH.read_text())
    hits = sum(1 for l in locations if l["name"] in name_to_code
               and name_to_code[l["name"]] in earnings_by_code
               and earnings_by_code[name_to_code[l["name"]]].get("medianEarningsUsd") is not None)
    print(f"[occupation] Coverage: {hits}/{len(locations)} relocation locations have median earnings")


if __name__ == "__main__":
    main()
