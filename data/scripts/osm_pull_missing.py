"""Phase 2: Pull OSM Overpass data for missing metros — rate-limit friendly version.

Target: top 10 challengers to Memphis + top 25 metros missing data.
Uses longer delays between queries and metros to avoid 429 errors.
"""

import json
import ssl
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT_DIR = Path("/home/mongo/projects/us-relocation-2026/sources/raw/osm")
OUT_DIR.mkdir(parents=True, exist_ok=True)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
SEARCH_RADIUS_KM = 35

# Metros to pull: only those that are actually missing files
# Check file existence before each query
TARGETS = [
    # Top 10 challengers
    ("Sioux Falls SD",     43.5446, -96.7311,  True,  True),
    ("Cheyenne WY",        41.1400, -104.8202, True,  True),  # recreation missing, stores succeeded
    ("San Antonio TX",     29.4241, -98.4936,  True,  True),
    ("Pittsburgh PA",      40.4406, -79.9959,  True,  True),
    ("Oklahoma City OK",   35.4676, -97.5164,  True,  True),
    ("Fargo ND",           46.8772, -96.7898,  True,  True),
    ("Greenville SC",      34.8526, -82.3940,  True,  True),
    ("Birmingham AL",      33.5186, -86.8104,  True,  False),  # recreation exists
    ("Jacksonville FL",    30.3322, -81.6557,  True,  False),  # recreation exists
    # Top 25 missing
    ("Omaha NE",           41.2565, -95.9345,  True,  True),
    ("Las Vegas NV",       36.1699, -115.1398, True,  True),
    ("Jackson MS",         32.2988, -90.1848,  True,  True),
    ("Charlotte NC",       35.2271, -80.8431,  True,  True),
    ("Sacramento CA",      38.5816, -121.4944, True,  False),  # recreation exists
]

# Brand queries
BRAND_QUERIES = {
    "Costco":       '["name"~"Costco|costco",i]',
    "Target":       '["name"~"^Target$",i]',
    "Aldi":         '["name"~"^ALDI$|^Aldi$",i]',
    "Trader Joes":  '["name"~"Trader Joe",i]',
}

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def safe_name(city):
    return city.replace(" ", "_").lower()


def stores_path(city):
    return OUT_DIR / f"{safe_name(city)}_stores.json"


def recreation_path(city):
    return OUT_DIR / f"{safe_name(city)}_recreation.json"


def do_overpass_query(q, timeout_sec=120, max_retries=3):
    """POST query to Overpass API with exponential backoff on 429."""
    data = urllib.parse.urlencode({"data": q}).encode("utf-8")
    last_error = None

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                OVERPASS_URL, data=data,
                headers={"User-Agent": "us-relocation-2026-osm/1.0"},
            )
            with urllib.request.urlopen(req, timeout=timeout_sec, context=ctx) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 90 * (attempt + 1)
                print(f"      429 rate-limited, waiting {wait}s...", flush=True)
                time.sleep(wait)
                last_error = e
            else:
                raise
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"      Error: {e}, retrying in 30s...", flush=True)
                time.sleep(30)
                last_error = e
            else:
                raise
    raise last_error or Exception("Max retries exceeded")


def query_stores(lat, lon):
    """Query Overpass for all 4 brand store chains within radius."""
    radius_m = SEARCH_RADIUS_KM * 1000
    bbox = f"(around:{radius_m},{lat},{lon})"
    filters = "\n  ".join(
        f'node["shop"]{bbox}{filt};\n  way["shop"]{bbox}{filt};'
        for filt in BRAND_QUERIES.values()
    )
    q = f"""[out:json][timeout:60];
(
  {filters}
);
out tags center;"""
    return do_overpass_query(q, timeout_sec=120)


def query_recreation(lat, lon):
    """Query Overpass for parks, trails, water, restaurants within radius."""
    radius_m = SEARCH_RADIUS_KM * 1000
    bbox = f"(around:{radius_m},{lat},{lon})"
    subqueries = f"""  node["leisure"="park"]{bbox};
  way["leisure"="park"]{bbox};
  node["leisure"="dog_park"]{bbox};
  way["leisure"="dog_park"]{bbox};
  node["route"="hiking"]{bbox};
  way["route"="hiking"]{bbox};
  node["highway"="path"]{bbox};
  way["highway"="path"]{bbox};
  node["natural"="water"]{bbox};
  way["natural"="water"]{bbox};
  node["water"="lake"]{bbox};
  way["water"="lake"]{bbox};
  node["waterway"="river"]{bbox};
  way["waterway"="river"]{bbox};
  node["waterway"~"stream|canal"]{bbox};
  way["waterway"~"stream|canal"]{bbox};
  node["amenity"="restaurant"]{bbox};
  way["amenity"="restaurant"]{bbox};"""
    q = f"""[out:json][timeout:90];
(
  {subqueries}
);
out tags center;"""
    return do_overpass_query(q, timeout_sec=180)


def process_stores(city, lat, lon):
    """Pull and save store brand data."""
    print(f"  Stores query...", end=" ", flush=True)
    t0 = time.time()
    try:
        data = query_stores(lat, lon)
    except Exception as e:
        print(f"ERR: {e}")
        return None, {"error": str(e)}

    by_brand = {b: 0 for b in BRAND_QUERIES}
    for e in data.get("elements", []):
        name = (e.get("tags") or {}).get("name", "")
        nl = name.lower()
        if "costco" in nl:
            by_brand["Costco"] += 1
        elif nl == "target":
            by_brand["Target"] += 1
        elif nl in ("aldi", "aldi grocery store"):
            by_brand["Aldi"] += 1
        elif "trader joe" in nl:
            by_brand["Trader Joes"] += 1

    sp = stores_path(city)
    sp.write_text(json.dumps({
        "center": [lat, lon],
        "radius_km": SEARCH_RADIUS_KM,
        "total_elements": len(data.get("elements", [])),
        "by_brand_counts": by_brand,
    }, indent=2))

    counts_str = " ".join(f"{k}={v}" for k, v in by_brand.items())
    dt = time.time() - t0
    print(f"OK ({dt:.1f}s) — {counts_str}")
    return by_brand, None


def categorize_element(elem):
    tags = elem.get("tags") or {}
    if tags.get("leisure") == "dog_park": return "dog_park"
    if tags.get("leisure") == "park": return "park"
    if tags.get("route") == "hiking" or tags.get("highway") == "path": return "trail"
    if tags.get("natural") == "water" or tags.get("water") == "lake": return "water_lake"
    if tags.get("waterway") in ("river", "stream", "canal"): return "water_river"
    if tags.get("amenity") == "restaurant": return "restaurant"
    return None


def process_recreation(city, lat, lon):
    """Pull and save recreation/nature data."""
    print(f"  Recreation query...", end=" ", flush=True)
    t0 = time.time()
    try:
        data = query_recreation(lat, lon)
    except Exception as e:
        print(f"ERR: {e}")
        return None, {"error": str(e)}

    counts = {"park": 0, "dog_park": 0, "trail": 0, "water_lake": 0, "water_river": 0, "restaurant": 0}
    for e in data.get("elements", []):
        cat = categorize_element(e)
        if cat:
            counts[cat] += 1

    rp = recreation_path(city)
    rp.write_text(json.dumps({
        "center": [lat, lon],
        "radius_km": SEARCH_RADIUS_KM,
        "total_elements": len(data.get("elements", [])),
        "counts": counts,
    }, indent=2))

    dt = time.time() - t0
    print(f"OK ({dt:.1f}s) — parks={counts['park']} dog={counts['dog_park']} trails={counts['trail']} "
          f"water_l={counts['water_lake']} water_r={counts['water_river']} rest={counts['restaurant']}")
    return counts, None


def main():
    start_time = time.time()
    deadline = start_time + 15 * 60

    # Filter: only pull if file doesn't already exist
    to_pull = []
    for city, lat, lon, need_stores, need_rec in TARGETS:
        actual_need_stores = need_stores and not stores_path(city).exists()
        actual_need_rec = need_rec and not recreation_path(city).exists()
        if actual_need_stores or actual_need_rec:
            to_pull.append((city, lat, lon, actual_need_stores, actual_need_rec))
        else:
            print(f"SKIP {city}: already has all files")

    if not to_pull:
        print("All metros already have data. Nothing to pull.")
        return

    total = len(to_pull)
    total_queries = sum(1 for _, _, _, ns, nr in to_pull if ns) + sum(1 for _, _, _, ns, nr in to_pull if nr)
    print(f"=== OSM Pull v2: {total} metros, {total_queries} queries ===")
    print(f"Time-box: 15 minutes. Sleep: 15s between metros, 5s between store+rec queries.\n")

    completed = 0
    failed = 0

    for i, (city, lat, lon, need_stores, need_rec) in enumerate(to_pull):
        elapsed = time.time() - start_time
        if time.time() > deadline:
            print(f"\n⏰ TIME-BOX EXCEEDED at {elapsed:.0f}s.")
            failed += len(to_pull) - i
            break

        print(f"[{i+1}/{total}] {city} ({lat:.3f},{lon:.3f}) — {elapsed:.0f}s elapsed")

        try:
            if need_stores:
                process_stores(city, lat, lon)
                time.sleep(5)  # small gap between two queries for same metro

            if need_rec:
                process_recreation(city, lat, lon)

            completed += 1
        except Exception as e:
            print(f"  ⚠ FAILED: {e}")
            failed += 1

        # Sleep between metros
        if i < total - 1 and time.time() < deadline:
            wait = min(15, deadline - time.time())
            if wait > 0:
                print(f"  Sleeping {wait:.0f}s...")
                time.sleep(wait)

    elapsed = time.time() - start_time
    print(f"\n=== DONE: {completed} completed, {failed} failed ===")
    print(f"Total time: {elapsed:.0f}s ({elapsed/60:.1f}m)")


if __name__ == "__main__":
    main()
