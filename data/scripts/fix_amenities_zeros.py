#!/usr/bin/env python3
"""
fix_amenities_zeros.py — Targeted fix for the 17 metro CBSAs with zero amenities.

The full build_cbsa_amenities.py pull returned zero amenities for some metros
due to small query radius + the Russian mirror. This targeted script only
re-pulls the 17 metros known to have a coverage problem, using:
- Larger radius (80km for metros — they're geographically large)
- Primary mirror overpass-api.de
- Cache-first (skip CBSAs that already have good cached data)

Fills the gap between 99.3% fill rate and the achievable ~99.7%.
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent.parent
PROCESSED = PROJECT / "sources/processed"
CACHE_DIR = PROJECT / "sources/raw/osm/cbsa_amenities"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DELAY_S = 12
TIMEOUT_S = 120
MAX_RETRIES = 4

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


def find_zero_metros() -> list[tuple[str, str, float, float]]:
    """Return [(cbsa_code, name, lat, lon), ...] for metros with zero amenities."""
    amenities = load_json(PROCESSED / "cbsa_amenities.json")["amenities"]
    coords = load_json(PROCESSED / "cbsa_gazetteer_coords.json")["coords"]

    todo = []
    for code, v in amenities.items():
        is_zero = (
            v.get("bigBoxStoreCount", 0) == 0
            and v.get("recreationAreaCount", 0) == 0
            and v.get("natureAreaCount", 0) == 0
            and v.get("groceryStoreDensityPerCapita", 0) == 0
        )
        if not is_zero:
            continue
        c = coords.get(code, {})
        name = c.get("name", "") if isinstance(c, dict) else ""
        if "Metro Area" not in name:
            continue  # micros with zero are acceptable
        lat = _safe_float(c.get("lat"))
        lon = _safe_float(c.get("lng"))
        if lat == 0 or lon == 0:
            continue
        todo.append((code, name, lat, lon))
    return sorted(todo)


def build_combined_query(lat: float, lon: float, radius_m: int) -> str:
    """Single Overpass query covering grocery + big-box + recreation + nature."""
    return f"""[out:json][timeout:{TIMEOUT_S}];
(
  // 1. Grocery stores
  node["shop"="supermarket"](around:{radius_m},{lat},{lon});
  way["shop"="supermarket"](around:{radius_m},{lat},{lon});

  // 2. Big-box stores (by brand name)
  node["shop"](around:{radius_m},{lat},{lon})["name"~"Walmart|Target|Costco",i];
  way["shop"](around:{radius_m},{lat},{lon})["name"~"Walmart|Target|Costco",i];

  // 3. Recreation — parks
  node["leisure"="park"](around:{radius_m},{lat},{lon});
  way["leisure"="park"](around:{radius_m},{lat},{lon});

  // 4. Nature — reserves + protected areas + water bodies
  node["leisure"="nature_reserve"](around:{radius_m},{lat},{lon});
  way["leisure"="nature_reserve"](around:{radius_m},{lat},{lon});
  node["boundary"="protected_area"](around:{radius_m},{lat},{lon});
  way["boundary"="protected_area"](around:{radius_m},{lat},{lon});
  node["natural"="water"](around:{radius_m},{lat},{lon});
  way["natural"="water"](around:{radius_m},{lat},{lon});
);
out tags center;"""


def query_overpass(lat: float, lon: float, radius_km: float) -> dict | None:
    q = build_combined_query(lat, lon, int(radius_km * 1000))
    data = urllib.parse.urlencode({"data": q}).encode()
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                OVERPASS_URL,
                data=data,
                headers={"User-Agent": "us-relocation-2026-fix/1.0"},
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT_S + 30, context=ctx) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
            if e.code == 429:
                wait = 90 * (attempt + 1)
                print(f"      429, waiting {wait}s...", flush=True)
                time.sleep(wait)
            elif e.code in (502, 504):
                wait = 30 * (attempt + 1)
                print(f"      {last_err}, waiting {wait}s...", flush=True)
                time.sleep(wait)
            else:
                raise
        except Exception as e:
            last_err = str(e)[:80]
            if attempt < MAX_RETRIES - 1:
                wait = 30 * (attempt + 1)
                print(f"      {last_err}, retrying in {wait}s...", flush=True)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError(f"Overpass exhausted: {last_err}")


def count_amenities(elements: list[dict]) -> dict:
    counts = {"grocery": 0, "bigBox": 0, "recreation": 0, "nature": 0}
    for e in elements:
        tags = e.get("tags", {}) or {}
        shop = tags.get("shop", "")
        name = tags.get("name", "")
        if shop == "supermarket":
            counts["grocery"] += 1
        nl = name.lower()
        if "walmart" in nl or "target" in nl or "costco" in nl:
            counts["bigBox"] += 1
        leisure = tags.get("leisure", "")
        if leisure == "park":
            counts["recreation"] += 1
        if leisure == "nature_reserve":
            counts["nature"] += 1
        boundary = tags.get("boundary", "")
        if boundary == "protected_area":
            counts["nature"] += 1
        natural = tags.get("natural", "")
        if natural == "water":
            counts["nature"] += 1
    counts["totalElements"] = len(elements)
    return counts


def process_one(cbsa_code: str, name: str, lat: float, lon: float, radius_km: float) -> dict:
    cache_path = CACHE_DIR / f"{cbsa_code}.json"
    try:
        raw = query_overpass(lat, lon, radius_km)
        if raw is None:
            raise RuntimeError("Overpass returned None")
        counts = count_amenities(raw.get("elements", []) or [])
        cache_path.write_text(json.dumps({
            "cbsa_code": cbsa_code,
            "name": name,
            "cbsa_name": name,
            "center": [lat, lon],
            "radius_km": radius_km,
            "counts": counts,
            "pulled_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "fix_pass": True,
        }))
        return counts
    except Exception as exc:
        err = str(exc)[:200]
        print(f"    ERR: {err}", flush=True)
        cache_path.write_text(json.dumps({
            "cbsa_code": cbsa_code,
            "name": name,
            "error": err,
        }))
        return {"grocery": 0, "bigBox": 0, "recreation": 0, "nature": 0, "error": err}


def rebuild_aggregate():
    """Re-read all caches and rebuild cbsa_amenities.json."""
    amenities = {}
    cached_count = 0
    error_count = 0
    coords = load_json(PROCESSED / "cbsa_gazetteer_coords.json")["coords"]
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
                error_count += 1
            else:
                counts = d.get("counts", {})
                amenities[code] = {
                    "groceryStoreDensityPerCapita": 0.0,
                    "bigBoxStoreCount": counts.get("bigBox", 0),
                    "recreationAreaCount": counts.get("recreation", 0),
                    "natureAreaCount": counts.get("nature", 0),
                }
                cached_count += 1
        except Exception:
            amenities[code] = {
                "groceryStoreDensityPerCapita": 0.0,
                "bigBoxStoreCount": 0,
                "recreationAreaCount": 0,
                "natureAreaCount": 0,
            }

    out = {
        "metadata": {
            "source": "OpenStreetMap Overpass API",
            "url": OVERPASS_URL,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "radius_km": "60metro/25micro (with 80km targeted fix for zero-metros)",
            "cbsa_count": len(coords),
            "cached_cbsas": cached_count,
            "error_cbsas": error_count,
            "coverage_pct": round(cached_count / len(coords) * 100, 1) if coords else 0,
        },
        "amenities": amenities,
    }
    out_path = PROCESSED / "cbsa_amenities.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"  Rebuilt {out_path} ({cached_count} cached, {error_count} errors)",
          flush=True)


def main():
    todo = find_zero_metros()
    print(f"\n=== Targeted fix: {len(todo)} zero metros ===", flush=True)
    if not todo:
        print("Nothing to do — all metros have data.", flush=True)
        return 0

    start = time.time()
    for i, (code, name, lat, lon) in enumerate(todo):
        # Skip if already cached with non-zero data
        cp = CACHE_DIR / f"{code}.json"
        if cp.exists():
            try:
                d = json.load(open(cp))
                if d.get("counts", {}).get("totalElements", 0) > 0:
                    print(f"[{i+1}/{len(todo)}] SKIP {code} (already cached)",
                          flush=True)
                    continue
            except Exception:
                pass

        # 80km radius for these problem metros — they need it
        radius_km = 80
        print(f"[{i+1}/{len(todo)}] {code} {name} ({lat:.3f},{lon:.3f}) "
              f"radius={radius_km}km", flush=True)
        c = process_one(code, name, lat, lon, radius_km)
        g = c.get("grocery", 0)
        b = c.get("bigBox", 0)
        r = c.get("recreation", 0)
        n = c.get("nature", 0)
        print(f"    grocery={g}  bigBox={b}  rec={r}  nature={n}", flush=True)

        if i < len(todo) - 1:
            time.sleep(DELAY_S)

    rebuild_aggregate()
    elapsed = time.time() - start
    print(f"\n=== DONE in {elapsed/60:.1f} min ===", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())