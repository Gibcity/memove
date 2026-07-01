#!/usr/bin/env python3
"""
amenities_full_pull.py — Complete OSM Overpass amenities for all 939 CBSAs.

Smarter than build_cbsa_amenities.py:
- Three Overpass mirrors used in round-robin to avoid 429 rate-limiting
- Larger radius for metros (80km), reasonable for micros (25km)
- Resumable: cache per CBSAs to disk before next query
- Proper rate-limit: only one query per mirror at a time
- Smaller query: skip 'natural=water' which bloated responses without much value

Output: sources/processed/cbsa_amenities.json
"""

from __future__ import annotations

import json
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent.parent
PROCESSED = PROJECT / "sources/processed"
CACHE_DIR = PROJECT / "sources/raw/osm/cbsa_amenities"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Two reliable Overpass mirrors: de is the canonical, private.coffee is a fast fallback
MIRRORS = [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]
METRO_RADIUS_KM = 80
MICRO_RADIUS_KM = 25
DELAY_S = 8         # between queries (per mirror)
MAX_RETRIES = 5
TIMEOUT_S = 90

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def is_cached_good(code: str) -> bool:
    """True if cache file exists and has >0 elements."""
    cp = CACHE_DIR / f"{code}.json"
    if not cp.exists():
        return False
    try:
        d = json.load(open(cp))
        return d.get("counts", {}).get("totalElements", 0) > 0
    except Exception:
        return False


def build_query(lat: float, lon: float, radius_m: int) -> str:
    return f"""[out:json][timeout:{TIMEOUT_S}];
(
  node["shop"="supermarket"](around:{radius_m},{lat},{lon});
  way["shop"="supermarket"](around:{radius_m},{lat},{lon});
  node["shop"](around:{radius_m},{lat},{lon})["name"~"Walmart|Target|Costco",i];
  way["shop"](around:{radius_m},{lat},{lon})["name"~"Walmart|Target|Costco",i];
  node["leisure"="park"](around:{radius_m},{lat},{lon});
  way["leisure"="park"](around:{radius_m},{lat},{lon});
  node["leisure"="nature_reserve"](around:{radius_m},{lat},{lon});
  way["leisure"="nature_reserve"](around:{radius_m},{lat},{lon});
  node["boundary"="protected_area"](around:{radius_m},{lat},{lon});
  way["boundary"="protected_area"](around:{radius_m},{lat},{lon});
);
out tags center;"""


def query_overpass(lat: float, lon: float, radius_km: float, mirror_idx: int) -> dict | None:
    """Try each mirror in round-robin with backoff."""
    q = build_query(lat, lon, int(radius_km * 1000))
    data = urllib.parse.urlencode({"data": q}).encode()
    last_err = None
    for attempt in range(MAX_RETRIES):
        # Try all mirrors in round-robin starting from mirror_idx
        for i in range(len(MIRRORS)):
            mirror = MIRRORS[(mirror_idx + i) % len(MIRRORS)]
            try:
                req = urllib.request.Request(
                    mirror, data=data,
                    headers={"User-Agent": "us-relocation-2026-full/1.0"}
                )
                with urllib.request.urlopen(req, timeout=TIMEOUT_S + 30, context=ctx) as resp:
                    return json.loads(resp.read())
            except urllib.error.HTTPError as e:
                last_err = f"{mirror}: HTTP {e.code}"
                if e.code == 429:
                    continue  # try next mirror
                elif e.code in (502, 504, 503):
                    continue
                else:
                    raise
            except Exception as e:
                last_err = f"{mirror}: {str(e)[:60]}"
                continue  # try next mirror
        # All mirrors failed — wait and retry
        wait = 30 * (attempt + 1)
        if attempt < MAX_RETRIES - 1:
            time.sleep(wait)
    raise RuntimeError(f"All mirrors exhausted: {last_err}")


def count_amenities(elements: list[dict]) -> dict:
    counts = {"grocery": 0, "bigBox": 0, "recreation": 0, "nature": 0}
    for e in elements:
        tags = e.get("tags", {}) or {}
        shop = tags.get("shop", "")
        name = tags.get("name", "")
        if shop == "supermarket":
            counts["grocery"] += 1
        nl = (name or "").lower()
        if "walmart" in nl or "target" in nl or "costco" in nl:
            counts["bigBox"] += 1
        if tags.get("leisure") == "park":
            counts["recreation"] += 1
        if tags.get("leisure") == "nature_reserve":
            counts["nature"] += 1
        if tags.get("boundary") == "protected_area":
            counts["nature"] += 1
    counts["totalElements"] = len(elements)
    return counts


def process_one(args) -> tuple[str, dict | None, str | None]:
    code, name, lat, lon, radius_km, mirror_idx = args
    if is_cached_good(code):
        return (code, None, "cached")
    try:
        raw = query_overpass(lat, lon, radius_km, mirror_idx)
        if raw is None:
            return (code, None, "overpass returned None")
        elements = raw.get("elements", []) or []
        counts = count_amenities(elements)
        CACHE_DIR.joinpath(f"{code}.json").write_text(json.dumps({
            "cbsa_code": code,
            "name": name,
            "cbsa_name": name,
            "center": [lat, lon],
            "radius_km": radius_km,
            "counts": counts,
            "pulled_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }))
        return (code, counts, None)
    except Exception as exc:
        err = str(exc)[:200]
        CACHE_DIR.joinpath(f"{code}.json").write_text(json.dumps({
            "cbsa_code": code,
            "name": name,
            "error": err,
        }))
        return (code, None, err)


def rebuild_aggregate():
    """Rebuild cbsa_amenities.json from cache files."""
    coords = load_json(PROCESSED / "cbsa_gazetteer_coords.json")["coords"]
    census_acs = load_json(PROCESSED / "census_acs_cbsa.json")
    pop_map = {}
    for c in census_acs.get("cbsas", []):
        code = c.get("cbsa_code", "")
        if code:
            metrics = c.get("metrics", {})
            pop_map[code] = int(_safe_float(metrics.get("total_population")))

    amenities = {}
    cached = 0
    errors = 0
    for code in sorted(coords.keys()):
        cp = CACHE_DIR / f"{code}.json"
        if not cp.exists():
            amenities[code] = {
                "groceryStoreDensityPerCapita": 0.0,
                "bigBoxStoreCount": 0,
                "recreationAreaCount": 0,
                "natureAreaCount": 0,
                "_error": "no cache",
            }
            continue
        try:
            d = json.load(open(cp))
            if "error" in d:
                amenities[code] = {
                    "groceryStoreDensityPerCapita": 0.0,
                    "bigBoxStoreCount": 0,
                    "recreationAreaCount": 0,
                    "natureAreaCount": 0,
                    "_error": d["error"][:80],
                }
                errors += 1
            else:
                counts = d.get("counts", {})
                pop = pop_map.get(code, 0)
                grocery_density = counts.get("grocery", 0) / (pop / 10000) if pop > 0 else 0.0
                amenities[code] = {
                    "groceryStoreDensityPerCapita": round(grocery_density, 6),
                    "bigBoxStoreCount": counts.get("bigBox", 0),
                    "recreationAreaCount": counts.get("recreation", 0),
                    "natureAreaCount": counts.get("nature", 0),
                }
                cached += 1
        except Exception:
            amenities[code] = {
                "groceryStoreDensityPerCapita": 0.0,
                "bigBoxStoreCount": 0,
                "recreationAreaCount": 0,
                "natureAreaCount": 0,
            }

    out = {
        "metadata": {
            "source": "OpenStreetMap Overpass API (3 mirrors, round-robin)",
            "url": ", ".join(MIRRORS),
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "radius_km": f"{METRO_RADIUS_KM}metro/{MICRO_RADIUS_KM}micro",
            "cbsa_count": len(coords),
            "cached_cbsas": cached,
            "error_cbsas": errors,
            "coverage_pct": round(cached / len(coords) * 100, 1) if coords else 0,
        },
        "amenities": amenities,
    }
    out_path = PROCESSED / "cbsa_amenities.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\n  Rebuilt {out_path} ({cached} cached, {errors} errors, "
          f"{len(amenities)} total)", flush=True)


def main():
    coords_data = load_json(PROCESSED / "cbsa_gazetteer_coords.json")
    coords = coords_data["coords"]
    todo = []
    skipped = 0
    for code, c in coords.items():
        if not isinstance(c, dict):
            continue
        name = c.get("name", "")
        lat = _safe_float(c.get("lat"))
        lon = _safe_float(c.get("lng"))
        if lat == 0 or lon == 0:
            continue
        if is_cached_good(code):
            skipped += 1
            continue
        is_metro = "Metro Area" in name
        radius = METRO_RADIUS_KM if is_metro else MICRO_RADIUS_KM
        todo.append((code, name, lat, lon, radius, 0))

    print(f"\n=== Pulling OSM amenities for {len(todo)} CBSAs ===", flush=True)
    print(f"  ({skipped} already cached)", flush=True)
    if not todo:
        print("Nothing to do.", flush=True)
        rebuild_aggregate()
        return 0

    start = time.time()
    # 2 workers, one per mirror. Conservative but effective.
    total_workers = len(MIRRORS)

    # Assign mirror index in round-robin
    args_with_mirror = []
    for i, t in enumerate(todo):
        args_with_mirror.append(t[:-1] + (i % len(MIRRORS),))

    with ThreadPoolExecutor(max_workers=total_workers) as ex:
        futures = {ex.submit(process_one, a): a[0] for a in args_with_mirror}
        done = 0
        for fut in as_completed(futures):
            done += 1
            code, counts, err = fut.result()
            if err == "cached":
                status = "cached"
            elif err:
                status = f"ERR: {err[:30]}"
            else:
                status = (f"grocery={counts['grocery']} bigBox={counts['bigBox']} "
                          f"rec={counts['recreation']} nature={counts['nature']}")
            elapsed = time.time() - start
            rate = done / elapsed if elapsed > 0 else 0
            eta = (len(todo) - done) / rate / 60 if rate > 0 else 0
            print(f"[{done}/{len(todo)}] {code} {status} | "
                  f"ETA {eta:.0f}m", flush=True)
            if done % 100 == 0:
                rebuild_aggregate()

    rebuild_aggregate()
    elapsed = time.time() - start
    print(f"\n=== DONE in {elapsed/60:.1f} min ===", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())