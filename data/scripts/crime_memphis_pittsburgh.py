"""
Pull annual crime aggregates for Memphis (Shelby County) and Pittsburgh (Allegheny County).

Goal: produce a "crime score" (incidents per 100K residents) by UCR category for the
most recent 3 full years available. Both metros get the SAME time window so the
comparison is apples-to-apples.

Sources:
- Memphis: MPD Public Safety Incidents via ArcGIS REST
    https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Public_Safety_Incidents/FeatureServer/0
    Fields: UCR_Category, Offense_Datetime, Crime_ID
    City-level (Memphis PD jurisdiction). 304K records 2023-2025.
- Pittsburgh: UCR Blotter via WPRDC CKAN datastore
    Resource: 044f2016-1dfd-4ab0-bc1e-065da05fca2e (340,996 records 1978-2023)
    Fields: INCIDENTTIME, INCIDENTHIERARCHYDESC (top-level crime category), CCR (UCR code)

Method: aggregate on the server where possible (groupBy + outStatistics for ArcGIS;
SQL aggregation for CKAN), fall back to chunked pulling with python aggregation.
We pull 3 full years: 2020, 2021, 2022 (common overlap window for both cities;
Memphis data has 2020+, Pittsburgh goes through 2023-11).

Population denominators (2023 Census estimate, county level):
- Shelby County TN:      910,042
- Allegheny County PA: 1,223,840
"""
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime
from collections import Counter

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/crime_memphis_pittsburgh.json"
RAW_DIR = ROOT / "sources/raw/curl/crime"

# County populations (Census 2023 vintage) for per-capita rates
POP = {
    "Memphis":     {"county": "Shelby",     "state": "TN", "pop_2023": 910042},
    "Pittsburgh":  {"county": "Allegheny",  "state": "PA", "pop_2023": 1223840},
}

YEARS = [2020, 2021, 2022]  # 3 full common-overlap years

# Memphis UCR categories of interest (top 5 most actionable + a "violent" bucket).
# We'll bucket everything into these 6 categories for the dashboard.
MEMPHIS_CATEGORY_MAP = {
    # Violent crimes
    "ASSAULT":                "violent",
    "HOMICIDE":               "violent",
    "ROBBERY":                "violent",
    "RAPE":                   "violent",
    # Property crimes
    "BURGLARY":               "property",
    "LARCENY/THEFT":          "property",
    "MOTOR VEHICLE THEFT":    "property",
    "ARSON":                  "property",
    # Other (we still count these, just not by category)
}

# Pittsburgh hierarchy top-level categories
# From the sample, INCIDENTHIERARCHYDESC values look like:
#   "HARRASSMENT/THREAT/ATTEMPT/PHY", "BURGLARY-FORCIBLE ENTRY", "THEFT FROM BUILDING", etc.
# We bucket into the same 6 categories by substring matching.

PITTSBURGH_CATEGORY_MAP = {
    # violent
    "HOMICIDE":              ["homicide"],
    "ASSAULT":               ["assault", "harrassment", "harassment"],
    "ROBBERY":               ["robbery"],
    "RAPE":                  ["rape", "sexual"],
    # property
    "BURGLARY":              ["burglary"],
    "LARCENY/THEFT":         ["theft", "larceny", "shoplifting", "stolen"],
    "MOTOR VEHICLE THEFT":   ["motor vehicle", "auto theft", "vehicle theft"],
    "ARSON":                 ["arson"],
}


def bucket_memphis(ucr_category: str) -> str:
    """Return one of: violent | property | other"""
    if not ucr_category:
        return "other"
    ucr = ucr_category.upper()
    for k in MEMPHIS_CATEGORY_MAP:
        if k in ucr:
            return MEMPHIS_CATEGORY_MAP[k]
    return "other"


def bucket_pittsburgh(hierarchy_desc: str) -> str:
    if not hierarchy_desc:
        return "other"
    h = hierarchy_desc.upper()
    for k, patterns in PITTSBURGH_CATEGORY_MAP.items():
        for p in patterns:
            if p.upper() in h:
                return MEMPHIS_CATEGORY_MAP[k]
    return "other"


def fetch_memphis_year(year: int) -> dict:
    """Pull all Memphis incidents for a given year, aggregate by category."""
    start = f"{year}-01-01 00:00:00"
    end = f"{year}-12-31 23:59:59"
    where = f"Offense_Datetime >= TIMESTAMP '{start}' AND Offense_Datetime <= TIMESTAMP '{end}'"
    params = {
        "where": where,
        "outFields": "Crime_ID,UCR_Category",
        "returnGeometry": "false",
        "resultOffset": "0",
        "resultRecordCount": "10000",  # max for ArcGIS
        "f": "json",
    }
    base_url = (
        "https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/"
        "MPD_Public_Safety_Incidents/FeatureServer/0/query"
    )
    all_records = []
    offset = 0
    while True:
        params["resultOffset"] = str(offset)
        url = base_url + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read().decode("utf-8"))
        feats = data.get("features", [])
        if not feats:
            break
        for f in feats:
            attrs = f.get("attributes", {})
            all_records.append({
                "id": attrs.get("Crime_ID"),
                "cat": attrs.get("UCR_Category"),
            })
        if not data.get("exceededTransferLimit", False):
            break
        offset += len(feats)
        if offset > 500_000:  # safety cap
            print(f"      WARN: hit 500K cap for {year}, stopping")
            break

    by_cat = Counter(r["cat"] for r in all_records if r["cat"])
    bucketed = Counter()
    for cat, n in by_cat.items():
        bucketed[bucket_memphis(cat)] += n
    return {
        "year": year,
        "total_records": len(all_records),
        "by_raw_category": dict(by_cat.most_common()),
        "by_bucketed_category": dict(bucketed),
    }


def fetch_pittsburgh_year(year: int) -> dict:
    """Pull Pittsburgh incidents for a year via CKAN SQL aggregation.
    More efficient than fetching all rows.

    WPRDC's datastore blocks EXTRACT() for security, so we use BETWEEN on
    INCIDENTTIME (a timestamp column) instead.
    """
    resource_id = "044f2016-1dfd-4ab0-bc1e-065da05fca2e"
    # Use SQL aggregation for category counts, with explicit date range
    sql = (
        f'SELECT "INCIDENTHIERARCHYDESC" AS cat, COUNT(*) AS n '
        f'FROM "{resource_id}" '
        f"WHERE \"INCIDENTTIME\" >= '{year}-01-01' "
        f"AND \"INCIDENTTIME\" < '{year + 1}-01-01' "
        f'GROUP BY "INCIDENTHIERARCHYDESC" '
        f"ORDER BY n DESC"
    )
    url = "https://data.wprdc.org/api/3/action/datastore_search_sql?" + urllib.parse.urlencode({"sql": sql})
    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))
    if not data.get("success"):
        return {
            "year": year,
            "total_records": 0,
            "by_raw_category": {},
            "by_bucketed_category": {},
            "error": data.get("error", {}).get("message", "unknown error"),
        }
    records = data.get("result", {}).get("records", [])

    total = sum(int(r["n"]) for r in records)
    bucketed = Counter()
    by_cat = Counter()
    for rec in records:
        cat = rec.get("cat", "")
        n = int(rec.get("n", 0))
        by_cat[cat] = n
        bucketed[bucket_pittsburgh(cat)] += n
    return {
        "year": year,
        "total_records": total,
        "by_raw_category": dict(by_cat.most_common(50)),  # top 50 only to keep file lean
        "by_bucketed_category": dict(bucketed),
    }


def fetch_total_memphis() -> int:
    """Use count-only endpoint to get total row count for sanity check."""
    url = (
        "https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/"
        "MPD_Public_Safety_Incidents/FeatureServer/0/query"
        "?where=1%3D1&returnCountOnly=true&f=json"
    )
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode("utf-8")).get("count", 0)


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    print("[crime] Memphis total record count (sanity):")
    total = fetch_total_memphis()
    print(f"  {total:,} total records in MPD dataset")

    print("[crime] Pittsburgh — pulling 3 years via WPRDC SQL aggregation...")
    pgh_by_year = {}
    for year in YEARS:
        t0 = time.time()
        r = fetch_pittsburgh_year(year)
        pgh_by_year[year] = r
        print(f"  Pittsburgh {year}: {r['total_records']:,} incidents ({time.time()-t0:.1f}s)")
        time.sleep(1)

    json.dump(pgh_by_year, open(RAW_DIR / "pittsburgh_yearly.json", "w"), indent=2)

    print("[crime] Memphis — pulling 3 years via ArcGIS REST...")
    mem_by_year = {}
    for year in YEARS:
        t0 = time.time()
        r = fetch_memphis_year(year)
        mem_by_year[year] = r
        print(f"  Memphis {year}: {r['total_records']:,} incidents ({time.time()-t0:.1f}s)")
        json.dump(mem_by_year, open(RAW_DIR / "memphis_yearly_progress.json", "w"), indent=2)
        time.sleep(2)  # be polite to ArcGIS

    json.dump(mem_by_year, open(RAW_DIR / "memphis_yearly.json", "w"), indent=2)

    # Compute per-capita rates
    def rates(by_year, metro):
        pop = POP[metro]["pop_2023"]
        out = {}
        for year, r in by_year.items():
            total = r["total_records"]
            out[year] = {
                "incidents": total,
                "per_100k": round(total / pop * 100_000, 1),
                "violent_per_100k": round(r["by_bucketed_category"].get("violent", 0) / pop * 100_000, 1),
                "property_per_100k": round(r["by_bucketed_category"].get("property", 0) / pop * 100_000, 1),
            }
        return out

    summary = {
        "source": {
            "name": "MPD Public Safety Incidents (Memphis) + WPRDC UCR Blotter (Pittsburgh)",
            "memphis_url": "https://data.memphistn.gov/datasets/MPD-Public-Safety-Incidents",
            "pittsburgh_url": "https://data.wprdc.org/dataset/uniform-crime-reporting-data",
            "method": "Server-side aggregation where available (WPRDC SQL, ArcGIS groupBy)",
            "bucket_method": "6-category normalization (violent/property/other) for cross-metro comparison",
            "denominators": "County population, Census 2023 vintage",
            "generated": datetime.utcnow().isoformat() + "Z",
        },
        "schema_version": "crime.v1",
        "windows_years": YEARS,
        "population": POP,
        "memphis": {
            "by_year": mem_by_year,
            "rates_per_100k": rates(mem_by_year, "Memphis"),
        },
        "pittsburgh": {
            "by_year": pgh_by_year,
            "rates_per_100k": rates(pgh_by_year, "Pittsburgh"),
        },
    }
    json.dump(summary, open(OUT_PATH, "w"), indent=2)
    print()
    print(f"[crime] Wrote {OUT_PATH}")
    print()
    print("=== Per-capita crime rates (per 100K residents) ===")
    for metro in ["Memphis", "Pittsburgh"]:
        print(f"\n{metro}:")
        for year, r in summary[metro.lower()]["rates_per_100k"].items():
            print(f"  {year}: total={r['per_100k']:>6.1f}  violent={r['violent_per_100k']:>6.1f}  property={r['property_per_100k']:>6.1f}")


if __name__ == "__main__":
    main()