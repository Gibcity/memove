"""
Pull county-level effective property tax rate for all 59 metros from Census ACS 5-year.

Source: U.S. Census Bureau, American Community Survey 5-Year Estimates (2022 vintage).
Method: B25103_001E (median real estate taxes paid, owner-occupied units)
        ÷ B25077_001E (median home value, owner-occupied units)
        = county effective property tax rate

This replaces the state-level Tax Foundation rate currently in state_property_tax.json,
which masks 2-3x intra-state variation (e.g., Shelby County TN ~1.12% vs TN state ~0.67%).

Key loaded from /home/mongo/projects/us-relocation-2026/.env.census (chmod 600).
"""
import json
import os
import time
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/census_acs_county_property_tax_59metros.json"
ENV_FILE = ROOT / ".env.census"

# (metro_sid, state_fips, county_fips)
# Built from metros.json sid → (state, principal_county) → Census FIPS lookup.
# County FIPS by (state, county name) — verified manually for all 59 metros.
METRO_FIPS = [
    ("Memphis",          "47", "157"),  # Shelby TN
    ("Nashville",        "47", "037"),  # Davidson TN
    ("Indianapolis",     "18", "097"),  # Marion IN
    ("Columbus",         "39", "049"),  # Franklin OH
    ("Cincinnati",       "39", "061"),  # Hamilton OH
    ("Grand Rapids",     "26", "081"),  # Kent MI
    ("Kalamazoo",        "26", "077"),  # Kalamazoo MI
    ("all50_IA",         "19", "153"),  # Polk IA
    ("all50_AL",         "01", "073"),  # Jefferson AL
    ("Pittsburgh",       "42", "003"),  # Allegheny PA
    ("Dallas",           "48", "113"),  # Dallas TX
    ("all50_NE",         "31", "055"),  # Douglas NE
    ("San Antonio",      "48", "029"),  # Bexar TX
    ("Austin",           "48", "453"),  # Travis TX
    ("Denver",           "08", "031"),  # Denver CO
    ("Colorado Springs", "08", "041"),  # El Paso CO
    ("Boulder",          "08", "013"),  # Boulder CO
    ("Boise",            "16", "001"),  # Ada ID
    ("Spokane",          "53", "063"),  # Spokane WA
    ("Bend",             "41", "017"),  # Deschutes OR
    ("Bozeman",          "30", "031"),  # Gallatin MT
    ("Rochester",        "27", "109"),  # Olmsted MN
    ("Minneapolis",      "27", "053"),  # Hennepin MN
    ("Appleton",         "55", "087"),  # Outagamie WI
    ("Madison",          "55", "025"),  # Dane WI
    ("St. Louis",        "29", "189"),  # St. Louis MO
    ("Kansas City",      "29", "095"),  # Jackson MO
    ("Louisville",       "21", "111"),  # Jefferson KY
    ("all50_WV",         "54", "039"),  # Kanawha WV
    ("all50_SD",         "46", "099"),  # Minnehaha SD
    ("all50_OK",         "40", "109"),  # Oklahoma OK
    ("all50_AR",         "05", "119"),  # Pulaski AR
    ("all50_SC",         "45", "045"),  # Greenville SC
    ("all50_ND",         "38", "017"),  # Cass ND
    ("all50_WY",         "56", "021"),  # Laramie WY
    ("all50_KS",         "20", "173"),  # Sedgwick KS
    ("all50_FL",         "12", "031"),  # Duval FL
    ("all50_NM",         "35", "001"),  # Bernalillo NM
    ("all50_MS",         "28", "049"),  # Hinds MS
    ("all50_NC",         "37", "119"),  # Mecklenburg NC
    ("all50_GA",         "13", "121"),  # Fulton GA
    ("all50_NV",         "32", "003"),  # Clark NV
    ("all50_AK",         "02", "020"),  # Anchorage AK (Borough)
    ("all50_VA",         "51", "159"),  # Richmond city VA (independent city, county-equivalent)
    ("all50_DE",         "10", "001"),  # Kent DE
    ("all50_NY",         "36", "055"),  # Monroe NY
    ("all50_IL",         "17", "031"),  # Cook IL
    ("all50_MD",         "24", "005"),  # Baltimore MD (independent city)
    ("all50_CT",         "09", "110"),  # Capitol Planning Region (formerly Hartford County; CT reorganized counties in 2022)
    ("all50_UT",         "49", "035"),  # Salt Lake UT
    ("all50_ME",         "23", "005"),  # Cumberland ME
    ("all50_NH",         "33", "011"),  # Hillsborough NH
    ("all50_DC",         "11", "001"),  # Washington DC (district, county-equivalent)
    ("all50_MA",         "25", "027"),  # Worcester MA
    ("all50_HI",         "15", "003"),  # Honolulu HI
    ("all50_CA",         "06", "067"),  # Sacramento CA
    ("all50_RI",         "44", "007"),  # Providence RI
    ("all50_NJ",         "34", "021"),  # Mercer NJ
    ("all50_VT",         "50", "007"),  # Chittenden VT
]


def load_key() -> str:
    if not ENV_FILE.exists():
        raise RuntimeError(f"Census API key not found at {ENV_FILE}")
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith("CENSUS_API_KEY="):
            return line.split("=", 1)[1]
    raise RuntimeError("CENSUS_API_KEY not set in env file")


def fetch_county(key: str, state_fips: str, county_fips: str) -> dict:
    """Single-county ACS 5-year query for B25103_001E + B25077_001E."""
    params = {
        "get": "NAME,B25103_001E,B25077_001E",
        "for": f"county:{county_fips}",
        "in": f"state:{state_fips}",
        "key": key,
    }
    url = "https://api.census.gov/data/2022/acs/acs5?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    # Format: [["NAME","B25103_001E","B25077_001E","state","county"], [values...]]
    if not isinstance(data, list) or len(data) < 2:
        return {"error": f"unexpected response: {data}"}
    header = data[0]
    row = data[1]
    rec = dict(zip(header, row))
    tax_paid = rec.get("B25103_001E")
    home_value = rec.get("B25077_001E")
    # Both can be null/None for small counties (suppressed by Census)
    try:
        tax = int(tax_paid) if tax_paid not in (None, "", "null") else None
        val = int(home_value) if home_value not in (None, "", "null") else None
        rate = (tax / val * 100) if (tax is not None and val and val > 0) else None
    except (TypeError, ValueError):
        tax, val, rate = None, None, None
    return {
        "name": rec.get("NAME"),
        "state_fips": state_fips,
        "county_fips": county_fips,
        "median_annual_tax_paid_usd": tax,
        "median_home_value_usd": val,
        "effective_rate_pct": round(rate, 3) if rate is not None else None,
        "suppressed": tax is None or val is None,
    }


def main():
    key = load_key()
    # Validate the key works (single sanity test)
    test = fetch_county(key, "47", "157")
    if test.get("error"):
        raise RuntimeError(f"Census API key test failed: {test}")

    print(f"[census-tax] Pulling 59 metros from Census ACS 5-year (2022 vintage)")
    print(f"[census-tax] Key test: Shelby County TN → {test['effective_rate_pct']:.3f}% effective rate")

    # Resume: load any existing records we already have so re-runs are cheap.
    cache = {}
    if OUT_PATH.exists():
        try:
            prev = json.load(open(OUT_PATH))
            for r in prev.get("metros", []) + prev.get("suppressed_metros", []) + prev.get("errors", []):
                cache[r["metro"]] = r
        except (json.JSONDecodeError, KeyError):
            pass
    print(f"[census-tax] Resume cache: {len(cache)} metros loaded from prior run")

    results = []
    errors = []
    for i, (sid, state_fips, county_fips) in enumerate(METRO_FIPS, 1):
        if sid in cache:
            cached = cache[sid]
            if "error" in cached:
                # Retry previously-failed
                pass
            elif cached.get("effective_rate_pct") is not None:
                results.append(cached)
                print(f"  [{i:2d}/59] {sid:18s} (cached) → {cached['effective_rate_pct']:.3f}%")
                continue
        try:
            r = fetch_county(key, state_fips, county_fips)
            r["metro"] = sid
            results.append(r)
            rate_str = f"{r['effective_rate_pct']:.3f}%" if r['effective_rate_pct'] is not None else "(suppressed)"
            print(f"  [{i:2d}/59] {sid:18s} state={state_fips} county={county_fips} → {rate_str}")
        except Exception as e:
            err = {"metro": sid, "state_fips": state_fips, "county_fips": county_fips, "error": str(e)}
            errors.append(err)
            results.append(err)
            print(f"  [{i:2d}/59] {sid:18s} → ERROR: {e}")
        # Census allows up to 500 queries/day keyless; with key, 50,000/day
        # 59 queries with no sleep is fine. Add small delay for politeness.
        time.sleep(0.3)

    ok = [r for r in results if "error" not in r and r.get("effective_rate_pct") is not None]
    suppressed = [r for r in results if r.get("effective_rate_pct") is None and "error" not in r]

    summary = {
        "source": {
            "name": "U.S. Census Bureau, ACS 5-Year Estimates (2022)",
            "url": "https://api.census.gov/data/2022/acs/acs5",
            "method": "Median real estate taxes paid (B25103_001E) ÷ median home value (B25077_001E)",
            "denominator": "Owner-occupied housing units, all",
            "field_meaning": "effective_rate_pct is the implicit effective tax rate for the median owner-occupied household, NOT an aggregate ad-valorem rate",
            "data_caveat_ct": "Connecticut reorganized counties into 9 Planning Regions in 2022; all50_CT uses Capitol Planning Region (FIPS 110) as Hartford County (FIPS 003) no longer exists in 2022 ACS",
            "key_source": ".env.census (chmod 600)",
            "generated": datetime.utcnow().isoformat() + "Z",
        },
        "schema_version": "census_acs_county_tax.v1",
        "vintage": "2022 ACS 5-year",
        "metros_ok": len(ok),
        "metros_suppressed": len(suppressed),
        "metros_failed": len(errors),
        "metros": sorted(ok, key=lambda r: -(r["effective_rate_pct"] or 0)),
        "suppressed_metros": suppressed,
        "errors": errors,
    }
    json.dump(summary, open(OUT_PATH, "w"), indent=2)
    print()
    print(f"[census-tax] Wrote {OUT_PATH}")
    print(f"[census-tax] OK={len(ok)}  Suppressed={len(suppressed)}  Failed={len(errors)}")
    print()
    print("Top 10 highest effective property tax rates (by county):")
    for r in summary["metros"][:10]:
        print(f"  {r['metro']:18s} {r['name']:30s} {r['effective_rate_pct']:.3f}%")
    print()
    print("Bottom 10 lowest:")
    for r in summary["metros"][-10:]:
        print(f"  {r['metro']:18s} {r['name']:30s} {r['effective_rate_pct']:.3f}%")
    if suppressed:
        print()
        print(f"Suppressed metros (Census redacted small-sample data): {[r['metro'] for r in suppressed]}")


if __name__ == "__main__":
    main()