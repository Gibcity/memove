#!/usr/bin/env python3
"""
build_cbsa_amenities.py — OSM Overpass amenities for all 939 CBSAs.

Queries Overpass API ONCE per CBSA with a combined query covering:
  1. Grocery stores  (shop=supermarket)
  2. Big-box stores  (name~Costco|Target|Walmart)
  3. Recreation areas (leisure=park)
  4. Nature areas     (leisure=nature_reserve | boundary=protected_area)

Caches raw responses in sources/raw/osm/cbsa_amenities/<cbsa_code>.json
so partial runs can resume.  Rate-limit: 1 request per 5 s (Overpass
will 429 aggressively below ~3-4 s).

Output: sources/processed/cbsa_amenities.json
  { "amenities": { "<cbsa_code>": { ...amenityProfileSchema... } } }

Usage:
    source /home/mongo/projects/us-relocation-2026/.venv/bin/activate
    python3 sources/scripts/build_cbsa_amenities.py
"""

from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent.parent  # us-relocation-2026/
PROCESSED = PROJECT / "sources" / "processed"
RAW_OSM = PROJECT / "sources" / "raw" / "osm"
CACHE_DIR = RAW_OSM / "cbsa_amenities"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
METRO_RADIUS_KM = 60   # metros are large; 20km misses most of Seattle/Boston/etc.
MICRO_RADIUS_KM = 25   # micros are smaller; 25km is plenty
DELAY_S = 12            # between CBSAs (Overpass rate-limits at ~10s/query)
MAX_RETRIES = 5

# ── SSL context (same pattern as existing scripts) ──────────────────────
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


# ── helpers ─────────────────────────────────────────────────────────────

def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def _safe_float(v) -> float:
    if v is None or (isinstance(v, str) and v.strip() == ""):
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def build_population_map(cbsa_data: dict) -> dict[str, int]:
    """Return {cbsa_code: total_population} from census_acs_cbsa.json."""
    pop: dict[str, int] = {}
    for c in cbsa_data.get("cbsas", []):
        code = c.get("cbsa_code", "")
        if not code:
            continue
        metrics = c.get("metrics", {})
        pop[code] = int(_safe_float(metrics.get("total_population")))
    return pop


# ── Overpass query ──────────────────────────────────────────────────────

def build_combined_query(lat: float, lon: float, radius_km: float) -> str:
    """Return a single Overpass QL query that fetches all 4 categories.

    Uses the ``nwr`` shorthand (node/way/relation) to keep the query
    compact — fewer clauses = less chance of server-side timeout.
    """
    radius_m = int(radius_km * 1000)
    return f"""[out:json][timeout:90];
(
  nwr["shop"="supermarket"](around:{radius_m},{lat},{lon});
  nwr["shop"](around:{radius_m},{lat},{lon})["name"~"Walmart|Target|Costco",i];
  nwr["leisure"="park"](around:{radius_m},{lat},{lon});
  nwr["leisure"="nature_reserve"](around:{radius_m},{lat},{lon});
  nwr["boundary"="protected_area"](around:{radius_m},{lat},{lon});
);
out tags center;"""


def query_overpass(lat: float, lon: float, radius_km: float) -> dict | None:
    """POST a combined query to Overpass with retry + backoff."""
    q = build_combined_query(lat, lon, radius_km)
    data = urllib.parse.urlencode({"data": q}).encode("utf-8")

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                OVERPASS_URL,
                data=data,
                headers={"User-Agent": "us-relocation-2026-osm/1.0"},
            )
            with urllib.request.urlopen(req, timeout=180, context=ctx) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            code = getattr(e, "code", 0)
            if code in (429, 502, 503, 504) and attempt < MAX_RETRIES - 1:
                wait = 60 * (attempt + 1)
                print(f"      HTTP {code}, waiting {wait}s...", flush=True)
                time.sleep(wait)
            else:
                raise
        except (OSError, TimeoutError) as e:
            if attempt < MAX_RETRIES - 1:
                print(f"      Network error: {e}, retrying in 30s...", flush=True)
                time.sleep(30)
            else:
                raise
        except Exception:
            if attempt < MAX_RETRIES - 1:
                time.sleep(30)
            else:
                raise
    return None


# ── Category counting ───────────────────────────────────────────────────

def _name_matches_bigbox(name: str) -> bool:
    """Check whether an element name matches Walmart/Target/Costco."""
    nl = name.lower()
    return ("walmart" in nl or "target" in nl or "costco" in nl)


def count_amenities(elements: list[dict]) -> dict:
    """Parse OSM elements into the 4 schema categories.

    Deduplication rule: an element can be both a supermarket AND a big-box
    store (e.g. Walmart Supercenter).  That is intentional — we count it in
    both categories because the schema wants separate grocery density and
    big-box presence metrics.
    """
    grocery = 0
    big_box = 0
    recreation = 0
    nature = 0

    for e in elements:
        tags = e.get("tags") or {}

        # Grocery: shop=supermarket
        if tags.get("shop") == "supermarket":
            grocery += 1

        # Big box: shop=* and name matches
        if "shop" in tags and _name_matches_bigbox(tags.get("name", "")):
            big_box += 1

        # Recreation: leisure=park
        if tags.get("leisure") == "park":
            recreation += 1

        # Nature: leisure=nature_reserve OR boundary=protected_area
        if tags.get("leisure") == "nature_reserve" or tags.get("boundary") == "protected_area":
            nature += 1

    return {
        "grocery": grocery,
        "bigBox": big_box,
        "recreation": recreation,
        "nature": nature,
        "totalElements": len(elements),
    }


def process_cbsa(cbsa_code: str, lat: float, lon: float, population: int,
                 radius_km: float) -> dict:
    """Query Overpass for one CBSA and return amenity profile (or error)."""
    cache_path = CACHE_DIR / f"{cbsa_code}.json"

    # ── Return cached result if available ────────────────────────────
    if cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text())
            counts = cached.get("counts", {})
            pop = cached.get("population", population)
            grocery_density = counts.get("grocery", 0) / (pop / 10000) if pop > 0 else 0.0
            return {
                "groceryStoreDensityPerCapita": round(grocery_density, 4),
                "bigBoxStoreCount": counts.get("bigBox", 0),
                "recreationAreaCount": counts.get("recreation", 0),
                "natureAreaCount": counts.get("nature", 0),
                "_cached": True,
            }
        except Exception:
            pass  # corrupt cache → re-query

    # ── Query Overpass ───────────────────────────────────────────────
    raw = None
    err_msg = ""
    try:
        raw = query_overpass(lat, lon, radius_km)
    except Exception as exc:
        err_msg = str(exc)[:200]

    if raw is None:
        if not err_msg:
            err_msg = "max retries exhausted (Overpass returned no data)"
        print(f"    ERR: {err_msg}")
        cache_path.write_text(json.dumps({
            "cbsa_code": cbsa_code, "center": [lat, lon],
            "radius_km": radius_km, "population": population,
            "error": err_msg,
        }))
        return {
            "groceryStoreDensityPerCapita": 0.0,
            "bigBoxStoreCount": 0,
            "recreationAreaCount": 0,
            "natureAreaCount": 0,
            "_error": err_msg,
        }

    elements = raw.get("elements", [])
    counts = count_amenities(elements)

    # ── Cache raw result ─────────────────────────────────────────────
    cache_path.write_text(json.dumps({
        "cbsa_code": cbsa_code,
        "center": [lat, lon],
        "radius_km": radius_km,
        "population": population,
        "counts": counts,
        "pulled_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }))

    # ── Compute derived metrics ──────────────────────────────────────
    grocery_density = counts["grocery"] / (population / 10000) if population > 0 else 0.0

    return {
        "groceryStoreDensityPerCapita": round(grocery_density, 4),
        "bigBoxStoreCount": counts["bigBox"],
        "recreationAreaCount": counts["recreation"],
        "natureAreaCount": counts["nature"],
    }


# ── Main ────────────────────────────────────────────────────────────────

def main():
    start_time = time.time()

    # ── Load coordinates ─────────────────────────────────────────────
    print("Loading CBSA Gazetteer coordinates...")
    gaz = load_json(PROCESSED / "cbsa_gazetteer_coords.json")
    coords_by_cbsa = gaz.get("coords", {})
    print(f"  {len(coords_by_cbsa)} CBSA coordinates")

    # ── Load population ──────────────────────────────────────────────
    print("Loading Census ACS population data...")
    acs = load_json(PROCESSED / "census_acs_cbsa.json")
    pop_map = build_population_map(acs)
    print(f"  {len(pop_map)} CBSA populations")

    # ── Determine which CBSAs need pulling ───────────────────────────
    all_codes = sorted(coords_by_cbsa.keys())
    todo = []
    already_cached = 0
    for code in all_codes:
        cache_path = CACHE_DIR / f"{code}.json"
        if cache_path.exists():
            already_cached += 1
        else:
            todo.append(code)

    total = len(all_codes)
    print(f"\n  {already_cached}/{total} CBSAs already cached")
    print(f"  {len(todo)} CBSAs need Overpass queries")
    if len(todo) > 0:
        est_min = len(todo) * DELAY_S / 60
        print(f"  Estimated time: ~{est_min:.0f} min at {DELAY_S}s delay")

    # ── Pull new data ────────────────────────────────────────────────
    if todo:
        print(f"\n=== Pulling OSM amenities for {len(todo)} CBSAs ===")
        for i, code in enumerate(todo):
            coord = coords_by_cbsa.get(code)
            if not coord:
                print(f"[{i+1}/{len(todo)}] SKIP {code}: no coordinates")
                continue

            lat = float(coord["lat"])
            lon = float(coord["lng"])
            pop = pop_map.get(code, 10000)  # default 10k to avoid div-by-zero
            name = coord.get("name", code)

            elapsed = time.time() - start_time
            eta = ""
            if i > 0:
                rate = elapsed / i
                remaining = rate * (len(todo) - i)
                eta = f" ETA {remaining/60:.0f}m"

            print(f"[{i+1}/{len(todo)}] {code} {name} ({lat:.3f},{lon:.3f}) "
                  f"pop={pop}{eta}", flush=True)

            # Choose radius by CBSA type: metros span 30-80km; micros <25km
            is_metro = "Metro Area" in name
            radius = METRO_RADIUS_KM if is_metro else MICRO_RADIUS_KM
            result = process_cbsa(code, lat, lon, pop, radius)

            if "_error" in result:
                g = "ERR"
                b = "ERR"
                r = "ERR"
                n = "ERR"
            else:
                g = f"{result['groceryStoreDensityPerCapita']:.2f}"
                b = str(result['bigBoxStoreCount'])
                r = str(result['recreationAreaCount'])
                n = str(result['natureAreaCount'])
            print(f"    grocery/10k={g}  bigBox={b}  rec={r}  nature={n}", flush=True)

            # Progress save every 50 CBSAs (safety net)
            if (i + 1) % 50 == 0:
                _save_aggregate(coords_by_cbsa, pop_map)
                print(f"    [autosave at {i+1}/{len(todo)}]", flush=True)

            # Rate limit
            if i < len(todo) - 1:
                time.sleep(DELAY_S)

    # ── Final aggregate output ───────────────────────────────────────
    _save_aggregate(coords_by_cbsa, pop_map)
    elapsed = time.time() - start_time
    print(f"\n=== DONE in {elapsed/60:.1f} min ===")


def _save_aggregate(coords_by_cbsa: dict, pop_map: dict):
    """Rebuild and write cbsa_amenities.json from cached files."""
    amenities: dict[str, dict] = {}
    cached_count = 0
    error_count = 0

    for code in sorted(coords_by_cbsa.keys()):
        cache_path = CACHE_DIR / f"{code}.json"
        if not cache_path.exists():
            amenities[code] = {
                "groceryStoreDensityPerCapita": 0.0,
                "bigBoxStoreCount": 0,
                "recreationAreaCount": 0,
                "natureAreaCount": 0,
                "_error": "no cache file (not yet pulled)",
            }
            continue

        try:
            cached = json.loads(cache_path.read_text())
        except Exception:
            amenities[code] = {
                "groceryStoreDensityPerCapita": 0.0,
                "bigBoxStoreCount": 0,
                "recreationAreaCount": 0,
                "natureAreaCount": 0,
                "_error": "corrupt cache file",
            }
            error_count += 1
            continue

        if "error" in cached:
            amenities[code] = {
                "groceryStoreDensityPerCapita": 0.0,
                "bigBoxStoreCount": 0,
                "recreationAreaCount": 0,
                "natureAreaCount": 0,
                "_error": cached["error"],
            }
            error_count += 1
            continue

        counts = cached.get("counts", {})
        pop = cached.get("population", pop_map.get(code, 10000))
        grocery_density = counts.get("grocery", 0) / (pop / 10000) if pop > 0 else 0.0

        amenities[code] = {
            "groceryStoreDensityPerCapita": round(grocery_density, 4),
            "bigBoxStoreCount": counts.get("bigBox", 0),
            "recreationAreaCount": counts.get("recreation", 0),
            "natureAreaCount": counts.get("nature", 0),
        }
        cached_count += 1

    out = {
        "metadata": {
            "source": "OpenStreetMap Overpass API",
            "url": OVERPASS_URL,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "radius_km": f"{METRO_RADIUS_KM}m/{MICRO_RADIUS_KM}u",
            "cbsa_count": len(coords_by_cbsa),
            "cached_cbsas": cached_count,
            "error_cbsas": error_count,
            "coverage_pct": round(cached_count / len(coords_by_cbsa) * 100, 1) if coords_by_cbsa else 0,
        },
        "amenities": amenities,
    }

    out_path = PROCESSED / "cbsa_amenities.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"  Wrote {out_path} ({cached_count} cached, {error_count} errors, "
          f"{len(amenities)} total)", flush=True)


if __name__ == "__main__":
    main()
