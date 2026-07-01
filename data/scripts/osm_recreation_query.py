"""Phase C extension: OSM Overpass queries for parks, trails, water, restaurants.

Adds to the existing store_access data:
- leisure=park, leisure=dog_park, route=hiking, highway=path (trail density)
- natural=water, water=lake, waterway=river (water access)
- amenity=restaurant (food diversity proxy)

Also retries Cincinnati (timed out in the original pull).

Output: sources/processed/osm_nature_food_access.json
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
PROC = Path("/home/mongo/projects/us-relocation-2026/sources/processed/osm_nature_food_access.json")
STORE_ACCESS = Path("/home/mongo/projects/us-relocation-2026/sources/processed/osm_store_access.json")

# Metro centroids — same as in osm_store_query.py
METROS = {
    "Memphis":         (35.1495, -90.0490),
    "Nashville":       (36.1627, -86.7816),
    "Louisville":      (38.2527, -85.7585),
    "St. Louis":       (38.6270, -90.1994),
    "Kansas City":     (39.0997, -94.5786),
    "Indianapolis":    (39.7684, -86.1581),
    "Columbus":        (39.9612, -82.9988),
    "Cincinnati":      (39.1031, -84.5120),
    "Pittsburgh":      (40.4406, -79.9959),
    "Dallas":          (32.7767, -96.7970),
    "Houston":         (29.7604, -95.3698),
    "San Antonio":     (29.4241, -98.4936),
    "Austin":          (30.2672, -97.7431),
    "Denver":          (39.7392, -104.9903),
    "Colorado Springs":(38.8339, -104.8214),
    "Boise City":      (43.6150, -116.2023),
    "Spokane":         (47.6588, -117.4260),
    "Bend":            (44.0582, -121.3153),
    "Bozeman":         (45.6770, -111.0429),
    "Grand Rapids":    (42.9634, -85.6681),
    "Rochester":       (44.0121, -92.4802),
    "Minneapolis":     (44.9778, -93.2650),
    "Appleton":        (44.2619, -88.4154),
    "Madison":         (43.0731, -89.4012),
    "Kalamazoo":       (42.2917, -85.5872),
}

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
RADIUS_KM = 35  # same as retail
EARTH_KM = 6371.0

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def haversine_km(lat1, lon1, lat2, lon2):
    p1 = math.radians(lat1); p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1); dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return EARTH_KM * 2 * math.asin(math.sqrt(a))


# Combined query — all nature/food features in ONE Overpass call per metro.
# Filter by element type and tag presence to keep query fast.
def query_overpass(lat, lon, max_retries=3):
    radius_m = RADIUS_KM * 1000
    bbox = f"(around:{radius_m},{lat},{lon})"

    # Sub-queries: each pulls elements with relevant tags
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

  // Restaurants (food diversity proxy)
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
            req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": "us-relocation-2026-osm/1.0"})
            with urllib.request.urlopen(req, timeout=180, context=ctx) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                wait = 60 * (attempt + 1)
                print(f"  [429 rate-limited, retrying in {wait}s]")
                time.sleep(wait)
            else:
                raise
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(30)
            else:
                raise


def categorize_element(elem):
    """Return one of {park, dog_park, trail, water, restaurant} for an element."""
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


def get_center(elem):
    if elem.get("type") == "node":
        return elem.get("lat"), elem.get("lon")
    if elem.get("type") == "way" and "center" in elem:
        c = elem["center"]
        return c.get("lat"), c.get("lon")
    return None, None


def process_metro(city, center):
    lat0, lon0 = center
    print(f"\n=== {city} ===")
    try:
        data = query_overpass(lat0, lon0)
    except Exception as e:
        print(f"  ERR: {e}")
        return {"error": str(e)}

    raw_path = OUT_DIR / f"{city.replace(' ', '_').lower()}_nature_food.json"
    raw_path.write_text(json.dumps({"element_count": len(data.get("elements", []))}, indent=2))

    counts = {"park": 0, "dog_park": 0, "trail": 0, "water_lake": 0, "water_river": 0, "restaurant": 0}
    for e in data.get("elements", []):
        cat = categorize_element(e)
        if cat:
            counts[cat] += 1

    # Hiking/water gate (Q4.1): at least 1 trail AND at least 1 water feature within 35km
    hiking_water_pass = (counts["trail"] >= 1 and (counts["water_lake"] + counts["water_river"]) >= 1)

    print(f"  parks={counts['park']}, dog_parks={counts['dog_park']}, trails={counts['trail']}, "
          f"water_lake={counts['water_lake']}, water_river={counts['water_river']}, "
          f"restaurants={counts['restaurant']}, hike/water_pass={hiking_water_pass}")
    return {
        "center": center,
        "counts": counts,
        "hiking_water_pass": hiking_water_pass,
        "total_elements": len(data.get("elements", [])),
    }


def main():
    out = {
        "source": {
            "name": "OpenStreetMap Overpass — parks, trails, water, restaurants",
            "url": OVERPASS_URL,
            "pulled_at": "2026-06-19T01:30:00Z",
            "retrieval_method": "curl POST to Overpass",
            "search_radius_km": RADIUS_KM,
            "notes": "Combined query for all nature/food features per metro. Same proxy as retail (35km straight-line).",
        },
        "schema_version": "us-reloc-2026.v1",
        "metros": {},
    }

    # First, retry Cincinnati (timed out in original pull) plus run all 24 survivors
    targets = list(METROS.items())
    for i, (city, center) in enumerate(targets):
        out["metros"][city] = process_metro(city, center)
        # Sleep between metros to avoid 429
        if i < len(targets) - 1:
            time.sleep(15)

    PROC.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {PROC}")

    # Summary table
    print("\n=== Summary: hiking/water gate + counts ===")
    print(f"{'Metro':25s}  {'park':>6s}  {'dog':>6s}  {'trail':>6s}  {'water':>6s}  {'rest':>6s}  {'pass':>5s}")
    for city, _ in targets:
        m = out["metros"][city]
        if "counts" in m:
            c = m["counts"]
            print(f"{city:25s}  {c['park']:>6d}  {c['dog_park']:>6d}  {c['trail']:>6d}  "
                  f"{c['water_lake']+c['water_river']:>6d}  {c['restaurant']:>6d}  "
                  f"{'Y' if m['hiking_water_pass'] else 'N':>5s}")
        else:
            print(f"{city:25s}  ERROR: {m.get('error', '?')}")


if __name__ == "__main__":
    main()
