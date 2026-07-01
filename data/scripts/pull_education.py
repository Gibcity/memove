#!/usr/bin/env python3
"""
pull_education.py — Pull Census ACS S1501 educational attainment for all 939 CBSAs.

Source: U.S. Census Bureau, ACS 5-Year Subject Table S1501
("Educational Attainment, 2018-2022"), CBSA-level.

Variables:
  S1501_C01_006E: Population 25 years and over (denominator)
  S1501_C01_014E: Population 25+ with high school graduate or higher (count)
  S1501_C01_015E: Population 25+ with Bachelor's degree or higher (count)

The schema fields (`publicSchoolRatingAvg`, `studentTeacherRatio`) require
GreatSchools (partnership) and NCES CCD respectively; both are outside this
free pipeline. Output stores raw attainment data and best-effort estimates
for the schema fields:

  - studentTeacherRatio: Not available from ACS. Leave unset (None → 0.0
    in build_locations output, gap is documented).
  - publicSchoolRatingAvg: Derived as a coarse 1-10 score from
    % bachelor's+ attainment: rating = round(bach_pct / 10, 1), clamped 1-10.
    DOCUMENTED PROXY, not a real school rating.

Output: sources/processed/cbsa_education.json
  Schema: {
    "metadata": {...},
    "education": {
      "<cbsa_code>": {
        "pctBachelorOrHigher": <float>,
        "pctHighSchoolOrHigher": <float>,
        "population25plus": <int>,
        "publicSchoolRatingAvg": <float>,  # proxy
        "studentTeacherRatio": 0.0         # not available
      }
    }
  }
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/cbsa_education.json"
ENV_FILE = ROOT / ".env.census"

# ACS subject table variables for educational attainment, pop 25+
ACS_COLUMNS = [
    "NAME",
    "S1501_C01_006E",   # Population 25+
    "S1501_C01_014E",   # HS grad or higher
    "S1501_C01_015E",   # Bachelor's or higher
]
GEO_VALUE = "metropolitan statistical area/micropolitan statistical area:*"


def load_key() -> str:
    if not ENV_FILE.exists():
        raise RuntimeError(f"Census API key not found at {ENV_FILE}")
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith("CENSUS_API_KEY="):
            return line.split("=", 1)[1]
    raise RuntimeError("CENSUS_API_KEY not set in env file")


def safe_int(val):
    if val is None or val in ("", "null", "-888888888", "-999999999"):
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def derive_school_rating(pct_bach: float) -> float:
    """Coarse 1-10 school-quality proxy from % bachelor's+ attainment.

    60%+ → 10, 20% → 2. Linear clamp. Documented proxy, NOT a real rating.
    """
    if pct_bach <= 0:
        return 0.0
    score = pct_bach / 6.0  # 60% → 10.0
    return round(min(10.0, max(0.0, score)), 1)


def fetch_s1501(key: str) -> list[dict]:
    """Single API call: pull S1501 for all CBSAs."""
    params = {
        "get": ",".join(ACS_COLUMNS),
        "for": GEO_VALUE,
        "key": key,
    }
    qs = urllib.parse.urlencode(params, safe="").replace("%2A", "*")
    qs = qs.replace("%2F", "/")
    url = f"https://api.census.gov/data/2022/acs/acs5/subject?{qs}"
    print(f"[education] GET {url[:120]}...")
    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))
    if not isinstance(data, list) or len(data) < 2:
        raise RuntimeError(f"Unexpected API response: {type(data)}")
    header = data[0]
    return [dict(zip(header, row)) for row in data[1:]]


def main():
    key = load_key()
    pulled_at = datetime.now(timezone.utc).isoformat()
    print("=" * 60)
    print("[education] Census ACS S1501 — Educational Attainment ETL")
    print(f"[education] Pulled at: {pulled_at}")

    rows = fetch_s1501(key)
    print(f"[education] Got {len(rows)} CBSAs")

    education: dict[str, dict] = {}
    parse_errors = 0
    for rec in rows:
        try:
            code = rec.get("metropolitan statistical area/micropolitan statistical area", "")
            if not code:
                continue
            pop25 = safe_int(rec.get("S1501_C01_006E"))
            hs = safe_int(rec.get("S1501_C01_014E"))
            bach = safe_int(rec.get("S1501_C01_015E"))

            pct_hs = round(hs / pop25 * 100, 1) if (pop25 and hs is not None) else 0.0
            pct_bach = round(bach / pop25 * 100, 1) if (pop25 and bach is not None) else 0.0

            education[code] = {
                "name": rec.get("NAME", ""),
                "population25plus": pop25,
                "pctHighSchoolOrHigher": pct_hs,
                "pctBachelorOrHigher": pct_bach,
                # Schema field mappings — best-effort, documented:
                "publicSchoolRatingAvg": derive_school_rating(pct_bach),
                # ponytail: studentTeacherRatio intentionally omitted.
                # ACS S1501 doesn't carry it; NCES CCD requires a paid
                # pull. Writing 0.0 made every metro look like a broken
                # feed ("0:1") — skip the field instead. Re-add when the
                # NCES source is wired in.
            }
        except Exception as e:
            parse_errors += 1
            print(f"[education] Parse error: {e}")

    output = {
        "metadata": {
            "source": "U.S. Census Bureau, ACS 5-Year Subject Table S1501",
            "url": "https://api.census.gov/data/2022/acs/acs5/subject",
            "vintage": "2022 ACS 5-year",
            "geography": "All U.S. CBSAs",
            "variables_used": {
                "S1501_C01_006E": "Population 25 years and over",
                "S1501_C01_014E": "Population 25+ with HS graduate or higher",
                "S1501_C01_015E": "Population 25+ with Bachelor's or higher",
            },
            "derived_fields": {
                "publicSchoolRatingAvg": "PROXY: clamp(pctBachelorOrHigher / 6.0, 0, 10). NOT a real rating.",
                "studentTeacherRatio": "Not available from free ACS — requires NCES CCD.",
            },
            "pulled_at": pulled_at,
            "parse_errors": parse_errors,
        },
        "education": education,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    nonzero = sum(1 for v in education.values() if v["pctBachelorOrHigher"] > 0)
    print(f"[education] Wrote {OUT_PATH}")
    print(f"[education] {nonzero}/{len(education)} CBSAs with % bachelor's+ > 0")


if __name__ == "__main__":
    main()