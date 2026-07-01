#!/usr/bin/env python3
"""
build_cbsa_walkability.py — EPA National Walkability Index (NWI) → CBSA.

Source: EPA Smart Growth / EnviroAtlas, published as an ArcGIS feature service.
URL:    https://geodata.epa.gov/arcgis/rest/services/OA/WalkabilityIndex/MapServer/0
Records: 220,134 census block groups with a 1-20 NWI score. Each block group
         is tagged with its CBSA code on the service, so no crosswalk is needed.

The service is free, public, no API key. Each block group returns ~250 fields;
we only fetch the 5 we need (GEOID10, CBSA, CBSA_Name, TotPop, NatWalkInd)
and aggregate in Python. 203,106 block groups have a CBSA assigned; the rest
are rural / not in a CBSA and are ignored.

Aggregation: population-weighted mean of NatWalkInd within each CBSA.
  weighted_nwi = sum(nwi * totPop) / sum(totPop)
This is the right denominator — a walkable urban core (high NWI, small pop)
should not dominate a sprawling suburb-only metro (low NWI, large pop).

Output: sources/processed/cbsa_walkability.json
  Schema: {
    "metadata": {...},
    "walkability": {
      "<cbsa_code>": {
        "walkabilityScore": <weighted 1-20, 0 if no CBGs>,
        "walkabilityUnweighted": <simple mean>,
        "blockGroupCount": <int>,
        "totPop": <int>
      }
    }
  }
"""

from __future__ import annotations

import json
import math
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent.parent
PROCESSED = PROJECT / "sources" / "processed"
RAW_EPA = PROJECT / "sources" / "raw" / "epa"
RAW_EPA.mkdir(parents=True, exist_ok=True)

ARCGIS_URL = (
    "https://geodata.epa.gov/arcgis/rest/services/OA/WalkabilityIndex/MapServer/0"
)
SOURCE_URL = ARCGIS_URL + "?f=json"
OUT_PATH = PROCESSED / "cbsa_walkability.json"
PAGE_SIZE = 1000
TIMEOUT_S = 60
MAX_RETRIES = 5
DELAY_S = 0.0  # EPA ArcGIS is fast; no politeness delay needed

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# ponytail: stdlib urllib, no deps. Reuse context for the whole run to keep
# TLS handshakes cheap across ~200 pages.
FIELDS = "GEOID10,CBSA,CBSA_Name,TotPop,NatWalkInd"
WHERE = "CBSA<>''"  # only block groups with a CBSA assigned


def _query_page(offset: int) -> dict:
    """Fetch one page of NWI block groups, no geometry."""
    qs = urllib.parse.urlencode({
        "where": WHERE,
        "outFields": FIELDS,
        "returnGeometry": "false",
        "f": "json",
        "resultRecordCount": PAGE_SIZE,
        "resultOffset": offset,
    })
    url = f"{ARCGIS_URL}/query?{qs}"
    last_err: str | None = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "us-relocation-2026-walkability/1.0",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT_S, context=ctx) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
            wait = 2 ** attempt
            print(f"      {last_err} (attempt {attempt + 1}), wait {wait}s",
                  flush=True)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = str(e)[:80]
            wait = 2 ** attempt
            print(f"      {last_err} (attempt {attempt + 1}), wait {wait}s",
                  flush=True)
            time.sleep(wait)
    raise RuntimeError(f"ArcGIS exhausted retries: {last_err}")


def fetch_count() -> int:
    """Return the total number of records matching WHERE."""
    qs = urllib.parse.urlencode({"where": WHERE, "returnCountOnly": "true", "f": "json"})
    url = f"{ARCGIS_URL}/query?{qs}"
    with urllib.request.urlopen(url, timeout=TIMEOUT_S, context=ctx) as resp:
        d = json.loads(resp.read())
    return int(d["count"])


def aggregate(total: int) -> dict:
    """Paginate through all block groups, aggregate to CBSA level."""
    agg: dict[str, dict] = {}
    cbsa_names: dict[str, str] = {}
    offset = 0
    pages = math.ceil(total / PAGE_SIZE)
    t0 = time.time()
    while offset < total:
        d = _query_page(offset)
        feats = d.get("features", [])
        if not feats:
            break
        for f in feats:
            a = f["attributes"]
            cbsa = str(a.get("CBSA") or "").strip()
            if not cbsa:
                continue
            nwi = a.get("NatWalkInd")
            pop = a.get("TotPop")
            if nwi is None or pop is None:
                continue
            try:
                nwi_f = float(nwi)
                pop_f = float(pop)
            except (TypeError, ValueError):
                continue
            bucket = agg.setdefault(cbsa, {
                "sum_nwi_x_pop": 0.0,
                "sum_pop": 0.0,
                "sum_nwi": 0.0,
                "count": 0,
            })
            bucket["sum_nwi_x_pop"] += nwi_f * pop_f
            bucket["sum_pop"] += pop_f
            bucket["sum_nwi"] += nwi_f
            bucket["count"] += 1
            # CBSA name is the same on every row, capture once
            if cbsa not in cbsa_names:
                cbsa_names[cbsa] = str(a.get("CBSA_Name") or "").strip()
        offset += len(feats)
        if offset % 5000 == 0 or offset == total:
            elapsed = time.time() - t0
            rate = offset / elapsed if elapsed > 0 else 0
            print(f"  page {offset // PAGE_SIZE}/{pages} "
                  f"({offset}/{total} records, {elapsed:.1f}s, {rate:.0f}/s)",
                  flush=True)
        if DELAY_S > 0:
            time.sleep(DELAY_S)
    return {"agg": agg, "cbsa_names": cbsa_names}


def to_output(agg: dict, cbsa_names: dict) -> dict:
    """Convert internal aggregation to the published schema."""
    walk = {}
    for cbsa, b in agg.items():
        if b["sum_pop"] <= 0 or b["count"] == 0:
            walk[cbsa] = {
                "walkabilityScore": 0.0,
                "walkabilityUnweighted": 0.0,
                "blockGroupCount": 0,
                "totPop": 0,
            }
            continue
        walk[cbsa] = {
            "walkabilityScore": round(b["sum_nwi_x_pop"] / b["sum_pop"], 3),
            "walkabilityUnweighted": round(b["sum_nwi"] / b["count"], 3),
            "blockGroupCount": int(b["count"]),
            "totPop": int(round(b["sum_pop"])),
        }
    return walk


def write_cache(agg: dict, cbsa_names: dict) -> Path:
    """Dump the raw page-by-page cache for debugging / resumability."""
    cache = {
        "source": "EPA NWI ArcGIS service",
        "url": ARCGIS_URL,
        "fields": FIELDS.split(","),
        "cbsa_names": cbsa_names,
        "agg": agg,
    }
    out = RAW_EPA / "nwi_blockgroup_agg.json"
    out.write_text(json.dumps(cache))
    return out


def main() -> int:
    print(f"\n=== EPA National Walkability Index → CBSA ===", flush=True)
    print(f"Source: {SOURCE_URL}", flush=True)
    print(f"Output: {OUT_PATH}\n", flush=True)

    t0 = time.time()
    total = fetch_count()
    print(f"Total CBGs in CBSAs: {total:,}", flush=True)

    result = aggregate(total)
    agg = result["agg"]
    cbsa_names = result["cbsa_names"]
    print(f"\nAggregated {len(agg)} unique CBSAs in {time.time() - t0:.1f}s",
          flush=True)

    walk = to_output(agg, cbsa_names)
    cache_path = write_cache(agg, cbsa_names)
    print(f"Cache: {cache_path}", flush=True)

    out = {
        "metadata": {
            "source": "EPA National Walkability Index (NWI), 2020 release",
            "service_url": ARCGIS_URL,
            "publication_url": "https://www.epa.gov/smartgrowth/national-walkability-index-user-guide-and-methodology",
            "license": "public_domain",
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "cbsa_count": len(walk),
            "aggregation": "population-weighted mean of NatWalkInd (1-20) within CBSA",
            "scale": "block group (12-digit FIPS GEOID10)",
        },
        "walkability": walk,
    }
    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {OUT_PATH} ({len(walk)} CBSAs, "
          f"{OUT_PATH.stat().st_size // 1024} KB)", flush=True)

    # ponytail: small inline self-check. If Dallas comes back at NWI < 1 or > 20,
    # the script is wrong. National average is around 8-10.
    for cbsa in ("19100", "35620", "31080"):  # Dallas, NYC, LA
        if cbsa in walk:
            w = walk[cbsa]
            print(f"  {cbsa} {cbsa_names.get(cbsa, '')}: "
                  f"NWI={w['walkabilityScore']} (unw={w['walkabilityUnweighted']}) "
                  f"CBGs={w['blockGroupCount']} pop={w['totPop']:,}",
                  flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
