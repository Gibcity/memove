"""
Pull OSM Overpass data for ALL new 50-state metros (stores + recreation).

Queries Overpass API for:
1. Store access: Costco, Target, Aldi, Trader Joe's within 35km radius
2. Recreation/nature: parks, trails, water, restaurants within 35km radius

Saves raw results per metro:
- <metro>_stores.json  (brand store counts)
- <metro>_recreation.json (nature/food element counts)

Rate limits: 8s between metros, 30s retry on 429.
Time-box: 20 minutes max.
"""
import json
import math
import ssl
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT_DIR = Path("/home/mongo/projects/us-relocation-2026/sources/raw/osm")
OUT_DIR.mkdir(parents=True, exist_ok=True)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
SEARCH_RADIUS_KM = 35
EARTH_KM = 6371.0

# All NEW metros (not in Phase 1) + Cincinnati store retry
NEW_METROS = {
    # AK
    "Anchorage AK":       (61.2181, -149.9003),
    # AL
    "Birmingham AL":      (33.5186, -86.8104),
    # AR
    "Little Rock AR":     (34.7465, -92.2896),
    # AZ
    "Tucson AZ":          (32.2226, -110.9747),
    # CA
    "Sacramento CA":      (38.5816, -121.4944),
    # CT
    "Hartford CT":        (41.7658, -72.6734),
    # DC
    "Washington DC":      (38.9072, -77.0369),
    # DE
    "Dover DE":           (39.1582, -75.5244),
    # FL
    "Jacksonville FL":    (30.3322, -81.6557),
    # GA
    "Atlanta GA":         (33.7490, -84.3880),
    # HI
    "Urban Honolulu HI":  (21.3069, -157.8583),
    # IA
    "Des Moines IA":      (41.5868, -93.6250),
    # IL
    "Chicago IL":         (41.8781, -87.6298),
    # KS
    "Wichita KS":         (37.6872, -97.3301),
    # MA
    "Worcester MA":       (42.2626, -71.8023),
    # MD
    "Baltimore MD":       (39.2904, -76.6122),
    # ME
    "Portland ME":        (43.6591, -70.2568),
    # MS
    "Jackson MS":         (32.2988, -90.1848),
    # NC
    "Charlotte NC":       (35.2271, -80.8431),
    # ND
    "Fargo ND":           (46.8772, -96.7898),
    # NE
    "Omaha NE":           (41.2565, -95.9345),
    # NH
    "Manchester NH":      (42.9956, -71.4548),
    # NJ
    "Trenton NJ":         (40.2206, -74.7597),
    # NM
    "Albuquerque NM":     (35.0853, -106.6056),
    # NV
    "Las Vegas NV":       (36.1699, -115.1398),
    # NY
    "Rochester NY":       (43.1566, -77.6088),
    # OK
    "Oklahoma City OK":   (35.4676, -97.5164),
    # RI
    "Providence RI":      (41.8240, -71.4128),
    # SC
    "Greenville SC":      (34.8526, -82.3940),
    # SD
    "Sioux Falls SD":     (43.5446, -96.7311),
    # UT
    "Salt Lake City UT":  (40.7608, -111.8910),
    # VA
    "Richmond VA":        (37.5407, -77.4360),
    # VT
    "Burlington VT":      (44.4759, -73.2121),
    # WV
    "Charleston WV":      (38.3498, -81.6326),
    # WY
    "Cheyenne WY":        (41.1400, -104.8202),
}

# Also retry Cincinnati stores (missing from Phase 1)
PHASE1_RETRY = {
    "Cincinnati": (39.1031, -84.5120),
}

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


def haversine_km(lat1, lon1, lat2, lon2):
    p1 = math.radians(lat1); p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return EARTH_KM * 2 * math.asin(math.sqrt(a))


def query_stores(lat, lon, max_retries=3):
    """Query Overpass for all 4 brand store chains within radius."""
    radius_m = SEARCH_RADIUS_KM * 1000
    bbox = f"(around:{radius_m},{lat},{lon})"
    filters = "\n  ".join(
        f'node["shop"]{bbox}{filt};\n  way["shop"]{bbox}{filt};'
        for filt in BRAND_QUERIES.values()
    )
    q = f"""
[out:json][timeout:60];
(
  {filters}
);
out tags center;
"""
    data = urllib.parse.urlencode({"data": q}).encode("utf-8")
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                OVERPASS_URL, data=data,
                headers={"User-Agent": "us-relocation-2026-osm/1.0"},
            )
            with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
                result = json.loads(resp.read())
            return result
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                wait = 30 * (attempt + 1)
                print(f"    [429 rate-limited, retrying in {wait}s]")
                time.sleep(wait)
            else:
                raise
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(15)
            else:
                raise
    return None


def query_recreation(lat, lon, max_retries=3):
    """Query Overpass for parks, trails, water, restaurants within radius."""
    radius_m = SEARCH_RADIUS_KM * 1000
    bbox = f"(around:{radius_m},{lat},{lon})"
    subqueries = f"""
  // Parks (general + dog parks)
  node["leisure"="park"]{bbox};
  way["leisure"="park"]{bbox};
  node["leisure"="dog_park"]{bbox};
  way["leisure"="dog_park"]{bbox};

  // Trails (hiking routes + foot paths)
  node["route"="hiking"]{bbox};
  way["route"="hiking"]{bbox};
  node["highway"="path"]{bbox};
  way["highway"="path"]{bbox};

  // Water features
  node["natural"="water"]{bbox};
  way["natural"="water"]{bbox};
  node["water"="lake"]{bbox};
  way["water"="lake"]{bbox};
  node["waterway"="river"]{bbox};
  way["waterway"="river"]{bbox};
  node["waterway"~"stream|canal"]{bbox};
  way["waterway"~"stream|canal"]{bbox};

  // Restaurants
  node["amenity"="restaurant"]{bbox};
  way["amenity"="restaurant"]{bbox};
"""
    q = f"""
[out:json][timeout:90];
(
  {subqueries}
);
out tags center;
"""
    data = urllib.parse.urlencode({"data": q}).encode("utf-8")
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                OVERPASS_URL, data=data,
                headers={"User-Agent": "us-relocation-2026-osm/1.0"},
            )
            with urllib.request.urlopen(req, timeout=180, context=ctx) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                wait = 60 * (attempt + 1)
                print(f"    [429 rate-limited, retrying in {wait}s]")
                time.sleep(wait)
            else:
                raise
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(30)
            else:
                raise
    return None


def process_stores(city, lat, lon):
    """Pull store brands, save raw JSON."""
    print(f"  Stores query...")
    try:
        data = query_stores(lat, lon)
    except Exception as e:
        print(f"    ERR: {e}")
        return {"error": str(e)}

    # Count by brand
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

    safe_name = city.replace(" ", "_").lower()
    raw_path = OUT_DIR / f"{safe_name}_stores.json"
    raw_path.write_text(json.dumps({
        "center": [lat, lon],
        "radius_km": SEARCH_RADIUS_KM,
        "total_elements": len(data.get("elements", [])),
        "by_brand_counts": by_brand,
    }, indent=2))

    counts_str = " ".join(f"{k}={v}" for k, v in by_brand.items())
    print(f"    Stores saved: {counts_str}")
    return by_brand


def categorize_element(elem):
    """Return category for a nature/food element."""
    tags = elem.get("tags") or {}
    if tags.get("leisure") == "dog_park":
        return "dog_park"
    if tags.get("leisure") == "park":
        return "park"
    if tags.get("route") == "hiking" or tags.get("highway") == "path":
        return "trail"
    if tags.get("natural") == "water" or tags.get("water") == "lake":
        return "water_lake"
    if tags.get("waterway") in ("river", "stream", "canal"):
        return "water_river"
    if tags.get("amenity") == "restaurant":
        return "restaurant"
    return None


def process_recreation(city, lat, lon):
    """Pull recreation/nature features, save raw JSON."""
    print(f"  Recreation query...")
    try:
        data = query_recreation(lat, lon)
    except Exception as e:
        print(f"    ERR: {e}")
        return {"error": str(e)}

    counts = {"park": 0, "dog_park": 0, "trail": 0, "water_lake": 0, "water_river": 0, "restaurant": 0}
    for e in data.get("elements", []):
        cat = categorize_element(e)
        if cat:
            counts[cat] += 1

    safe_name = city.replace(" ", "_").lower()
    raw_path = OUT_DIR / f"{safe_name}_recreation.json"
    raw_path.write_text(json.dumps({
        "center": [lat, lon],
        "radius_km": SEARCH_RADIUS_KM,
        "total_elements": len(data.get("elements", [])),
        "counts": counts,
    }, indent=2))

    print(f"    Recreation saved: parks={counts['park']} dog={counts['dog_park']} "
          f"trails={counts['trail']} water_l={counts['water_lake']} water_r={counts['water_river']} "
          f"rest={counts['restaurant']}")
    return counts


def main():
    start_time = time.time()
    deadline = start_time + 20 * 60  # 20 minute time-box
    
    # Combine all metros: new + phase1 retries
    all_targets = list(NEW_METROS.items())
    # Add Cincinnati stores retry at the end
    retry_targets = list(PHASE1_RETRY.items())
    
    results = {}
    skipped = []
    total = len(all_targets)
    
    print(f"=== OSM Pull: {total} new metros + {len(retry_targets)} retries ===")
    print(f"Time-box: 20 minutes. Rate limit: ~8s between metros.\n")
    
    for i, (city, (lat, lon)) in enumerate(all_targets):
        elapsed = time.time() - start_time
        if time.time() > deadline:
            print(f"\n⏰ TIME-BOX EXCEEDED at {elapsed:.0f}s. Skipping remaining {total - i} metros.")
            for remaining in all_targets[i:]:
                skipped.append(remaining[0])
            break
        
        print(f"[{i+1}/{total}] {city} ({lat:.3f},{lon:.3f}) — {elapsed:.0f}s elapsed")
        try:
            stores = process_stores(city, lat, lon)
            rec = process_recreation(city, lat, lon)
            results[city] = {"stores": stores, "recreation": rec}
        except Exception as e:
            print(f"  ⚠ FAILED: {e}")
            skipped.append(city)
        
        # Sleep between metros (polite to Overpass)
        if i < total - 1 and time.time() < deadline:
            time.sleep(8)
    
    # Retry Cincinnati stores
    if time.time() < deadline and retry_targets:
        for city, (lat, lon) in retry_targets:
            elapsed = time.time() - start_time
            print(f"\n[RETRY] {city} (stores only) — {elapsed:.0f}s elapsed")
            try:
                stores = process_stores(city, lat, lon)
                results[f"{city}_retry"] = {"stores": stores}
            except Exception as e:
                print(f"  ⚠ FAILED: {e}")
                skipped.append(city)
    
    elapsed = time.time() - start_time
    print(f"\n=== DONE: {len(results)} metros pulled, {len(skipped)} skipped/failed ===")
    print(f"Total time: {elapsed:.0f}s ({elapsed/60:.1f}m)")
    
    if skipped:
        print(f"Skipped: {skipped}")
    
    # Save summary
    summary_path = OUT_DIR / "_pull_summary.json"
    summary_path.write_text(json.dumps({
        "pulled_at": f"2026-06-19T{time.strftime('%H:%M:%SZ', time.gmtime())}",
        "metros_pulled": len(results),
        "metros_skipped": skipped,
        "total_time_s": round(elapsed, 1),
    }, indent=2))
    
    return results, skipped

if __name__ == "__main__":
    main()
