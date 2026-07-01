#!/usr/bin/env python3
"""
pull_healthcare_cms.py — CMS Hospital Compare overall ratings → CBSA quality score.

Source: CMS Provider Data Catalog "Hospital General Information" dataset,
Socrata-style datastore at:
  https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0

Free, public, paginated, no API key. ~5,432 hospitals total. We pull the
overall rating (1-5 stars; "Not Available" for critical-access / specialty
hospitals) and aggregate per CBSA by joining (state, county) on the existing
cbsa_county_crosswalk.json.

Aggregation:
  hospital_quality_score = mean(hospital_overall_rating) per CBSA
  hospital_count_rated = count of rated hospitals in CBSA

Output: sources/processed/relocation/healthcare_quality.json
  Schema:
    {"metadata": {...},
     "healthcare_quality": {"<cbsa_code>": {
         "hospital_quality_score": float (1-5, None if no rated hospitals),
         "hospital_count_rated": int,
         "hospital_count_total": int,   # rated + "Not Available"
     }}}
"""
from __future__ import annotations

import json
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path("/home/mongo/projects/us-relocation-2026")
CROSSWALK_PATH = ROOT / "sources/processed/cbsa_county_crosswalk.json"
OUT_PATH = ROOT / "sources/processed/relocation/healthcare_quality.json"

API_BASE = "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0"
PAGE_SIZE = 1000  # CMS datastore caps limit at 1000

STATE_ABBR_TO_NAME = {
    "AL": "alabama", "AK": "alaska", "AZ": "arizona", "AR": "arkansas",
    "CA": "california", "CO": "colorado", "CT": "connecticut", "DE": "delaware",
    "DC": "district of columbia", "FL": "florida", "GA": "georgia", "HI": "hawaii",
    "ID": "idaho", "IL": "illinois", "IN": "indiana", "IA": "iowa", "KS": "kansas",
    "KY": "kentucky", "LA": "louisiana", "ME": "maine", "MD": "maryland",
    "MA": "massachusetts", "MI": "michigan", "MN": "minnesota", "MS": "mississippi",
    "MO": "missouri", "MT": "montana", "NE": "nebraska", "NV": "nevada",
    "NH": "new hampshire", "NJ": "new jersey", "NM": "new mexico", "NY": "new york",
    "NC": "north carolina", "ND": "north dakota", "OH": "ohio", "OK": "oklahoma",
    "OR": "oregon", "PA": "pennsylvania", "RI": "rhode island", "SC": "south carolina",
    "SD": "south dakota", "TN": "tennessee", "TX": "texas", "UT": "utah",
    "VT": "vermont", "VA": "virginia", "WA": "washington", "WV": "west virginia",
    "WI": "wisconsin", "WY": "wyoming", "PR": "puerto rico",
}


def normalize_county(name: str) -> str:
    """Lowercase, strip suffixes (county/parish/borough/city), drop punctuation."""
    n = unicodedata.normalize("NFKD", (name or "").strip().lower())
    n = "".join(ch for ch in n.encode("ascii", "ignore").decode("ascii") if ch.isalnum())
    for suf in ("county", "parish", "borough", "city", "municipio", "censusarea"):
        if n.endswith(suf):
            n = n[: -len(suf)]
            break
    return n


def normalize_state(state: str) -> str:
    s = (state or "").strip()
    if len(s) == 2 and s.upper() in STATE_ABBR_TO_NAME:
        return STATE_ABBR_TO_NAME[s.upper()]
    return s.lower()


def build_county_to_cbsa() -> dict[tuple[str, str], set[str]]:
    cw = json.loads(CROSSWALK_PATH.read_text())["crosswalk"]
    lookup: dict[tuple[str, str], set[str]] = defaultdict(set)
    for cbsa_code, info in cw.items():
        for county in info.get("counties", []):
            key = (normalize_state(county.get("state", "")),
                   normalize_county(county.get("county", "")))
            if key[0] and key[1]:
                lookup[key].add(cbsa_code)
    return lookup


def fetch_all_hospitals() -> list[dict]:
    """Paginate the CMS datastore endpoint. ~5,432 rows / 5000 = 2 pages."""
    out: list[dict] = []
    offset = 0
    while True:
        url = f"{API_BASE}?limit={PAGE_SIZE}&offset={offset}"
        print(f"  GET offset={offset}", flush=True)
        r = requests.get(url, timeout=60,
                         headers={"User-Agent": "us-relocation-2026/1.0",
                                  "Accept": "application/json"})
        r.raise_for_status()
        data = r.json()
        rows = data.get("results", [])
        out.extend(rows)
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(0.2)
    print(f"  fetched {len(out):,} hospital records", flush=True)
    return out


def aggregate(hospitals: list[dict], county_to_cbsa) -> dict[str, dict]:
    """Mean of hospital_overall_rating per CBSA."""
    sums: dict[str, float] = defaultdict(float)
    counts_rated: dict[str, int] = defaultdict(int)
    counts_total: dict[str, int] = defaultdict(int)
    unmatched = 0
    for h in hospitals:
        state = h.get("state", "")
        county = h.get("countyparish", "")
        key = (normalize_state(state), normalize_county(county))
        cbsas = county_to_cbsa.get(key)
        if not cbsas:
            unmatched += 1
            continue
        rating_raw = (h.get("hospital_overall_rating") or "").strip()
        try:
            rating = float(rating_raw)
        except ValueError:
            rating = None
        for cbsa in cbsas:
            counts_total[cbsa] += 1
            if rating is not None:
                sums[cbsa] += rating
                counts_rated[cbsa] += 1
    print(f"  unmatched (state, county not in crosswalk): {unmatched}",
          flush=True)
    out: dict[str, dict] = {}
    for cbsa in counts_total:
        n_rated = counts_rated[cbsa]
        out[cbsa] = {
            "hospital_quality_score": round(sums[cbsa] / n_rated, 2) if n_rated else None,
            "hospital_count_rated": n_rated,
            "hospital_count_total": counts_total[cbsa],
        }
    return out


def main() -> int:
    pulled_at = datetime.now(timezone.utc).isoformat()
    print("=" * 60, flush=True)
    print("[cms] CMS Hospital Compare overall ratings → CBSA", flush=True)
    print("=" * 60, flush=True)

    county_to_cbsa = build_county_to_cbsa()
    print(f"[cms] crosswalk lookup: {len(county_to_cbsa):,} (state, county) keys",
          flush=True)

    t0 = time.time()
    hospitals = fetch_all_hospitals()
    print(f"[cms] {len(hospitals):,} hospitals in {time.time() - t0:.1f}s",
          flush=True)

    t0 = time.time()
    by_cbsa = aggregate(hospitals, county_to_cbsa)
    print(f"[cms] aggregated {len(by_cbsa):,} CBSAs in {time.time() - t0:.1f}s",
          flush=True)

    rated = sum(1 for r in by_cbsa.values() if r["hospital_quality_score"] is not None)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps({
        "metadata": {
            "source": "CMS Provider Data Catalog — Hospital General Information",
            "source_url": API_BASE,
            "dataset_id": "xubh-q36u",
            "publication": "https://data.cms.gov/provider-data/dataset/xubh-q36u",
            "fields": {
                "hospital_overall_rating": "CMS 1-5 star overall quality rating; 'Not Available' for critical-access/specialty",
            },
            "join_keys": "(state, county_normalized) -> CBSA via cbsa_county_crosswalk.json",
            "aggregation": "CBSA quality_score = mean(hospital_overall_rating); counts split by rated vs total",
            "generated_at": pulled_at,
            "cbsa_count": len(by_cbsa),
            "cbsas_with_rating": rated,
        },
        "healthcare_quality": by_cbsa,
    }, indent=2))
    print(f"\n[cms] wrote {OUT_PATH} ({len(by_cbsa)} CBSAs, "
          f"{OUT_PATH.stat().st_size // 1024} KB)", flush=True)
    print(f"[cms] {rated} CBSAs have at least one rated hospital", flush=True)

    # Self-check
    for cbsa, name in [("19100", "Dallas"), ("35620", "NYC"),
                       ("31080", "LA"), ("26420", "Houston"),
                       ("16980", "Chicago"), ("47900", "DC")]:
        r = by_cbsa.get(cbsa, {})
        print(f"  {cbsa} {name}: score={r.get('hospital_quality_score')} "
              f"rated={r.get('hospital_count_rated')} "
              f"total={r.get('hospital_count_total')}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())