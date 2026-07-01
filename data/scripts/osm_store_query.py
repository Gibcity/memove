"""Query OpenStreetMap Overpass API for Costco/Target/Aldi/Trader Joe's
within a 30-minute drive-time isochrone around each candidate metro centroid.

The Overpass API is free, no key needed, returns OSM data as JSON. We pull
all named brand stores and compute haversine distance from each metro center.

Drive-time isochrone would require a routing engine (OSRM); for v1 we use
30-km / 19-mile straight-line radius as a proxy (avg 30-min drive at 38 km/h).

Outputs: sources/processed/osm_store_access.json
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
PROC = Path("/home/mongo/projects/us-relocation-2026/sources/processed/osm_store_access.json")

# Approximate metro centroids (lat, lon)
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

# Brand queries (OSM has no "brand:costco" operator, but has 'name' filter)
# We use a generous name match per chain, then post-filter
BRAND_QUERIES = {
    "Costco":       '["name"~"Costco|costco",i]',
    "Target":       '["name"~"^Target$",i]',
    "Aldi":         '["name"~"^ALDI$|^Aldi$",i]',
    "Trader Joes":  '["name"~"Trader Joe",i]',
}

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
SEARCH_RADIUS_KM = 35  # ~22mi straight-line, generous proxy for 30-min drive
EARTH_KM = 6371.0

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def haversine_km(lat1, lon1, lat2, lon2):
    """Haversine distance in km between two (lat,lon) points."""
    p1 = math.radians(lat1); p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return EARTH_KM * c


def query_overpass(lat, lon, radius_km=35, max_retries=3):
    """Query Overpass ONCE for all 4 brand filters within radius_km.

    Combines all brand filters into a single Overpass QL request for speed.
    Returns dict {brand_name: [elements]}.
    """
    radius_m = radius_km * 1000
    bbox = f"(around:{radius_m},{lat},{lon})"
    # Build union of all brand filters in one request
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
                OVERPASS_URL,
                data=data,
                headers={"User-Agent": "us-relocation-2026-osm/1.0"},
            )
            with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
                result = json.loads(resp.read())
            break  # success
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                wait = 30 * (attempt + 1)
                print(f"  [429 rate-limited, retrying in {wait}s]")
                time.sleep(wait)
            else:
                raise
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(15)
            else:
                raise

    # Split elements by which brand they match
    by_brand = {b: [] for b in BRAND_QUERIES}
    for e in result.get("elements", []):
        name = (e.get("tags") or {}).get("name", "")
        for brand in BRAND_QUERIES:
            # Match by name (case-insensitive substring)
            if brand == "Costco" and "costco" in name.lower():
                by_brand[brand].append(e); break
            if brand == "Target" and name.lower() == "target":
                by_brand[brand].append(e); break
            if brand == "Aldi" and name.lower() in ("aldi", "aldi grocery store"):
                by_brand[brand].append(e); break
            if brand == "Trader Joes" and "trader joe" in name.lower():
                by_brand[brand].append(e); break
    return by_brand


def process_metro(city, center):
    lat0, lon0 = center
    print(f"\n=== {city} ({lat0:.3f},{lon0:.3f}) ===")
    result = {"center": center, "brands": {}}
    try:
        by_brand = query_overpass(lat0, lon0, SEARCH_RADIUS_KM)
    except Exception as e:
        print(f"  Overpass ERR: {e}")
        for b in BRAND_QUERIES:
            result["brands"][b] = {"error": str(e), "count": 0, "stores": [], "closest_km": None}
        return result

    # Save raw merged response
    raw_path = OUT_DIR / f"{city.replace(' ', '_').lower()}_all_brands.json"
    raw_path.write_text(json.dumps({"by_brand_counts": {b: len(by_brand[b]) for b in by_brand}}, indent=2))

    for brand in BRAND_QUERIES:
        elements = by_brand[brand]
        stores = []
        closest = None
        for e in elements:
            if e.get("type") == "node":
                elat = e.get("lat"); elon = e.get("lon")
            elif e.get("type") == "way" and "center" in e:
                elat = e["center"].get("lat"); elon = e["center"].get("lon")
            else:
                continue
            if elat is None or elon is None:
                continue
            d = haversine_km(lat0, lon0, elat, elon)
            if d > SEARCH_RADIUS_KM:
                continue
            tags = e.get("tags", {})
            stores.append({
                "name": tags.get("name", ""),
                "lat": elat,
                "lon": elon,
                "distance_km": round(d, 2),
                "addr": tags.get("addr:full", "") or ", ".join(filter(None, [
                    tags.get("addr:housenumber", ""),
                    tags.get("addr:street", ""),
                    tags.get("addr:city", ""),
                ])),
            })
            if closest is None or d < closest:
                closest = d
        stores.sort(key=lambda x: x["distance_km"])
        result["brands"][brand] = {
            "count": len(stores),
            "closest_km": round(closest, 2) if closest else None,
            "stores": stores[:10],
        }
        print(f"  {brand:12s}: {len(stores):>2} stores  closest={round(closest,1) if closest else '?':>5}km")
    return result


def main():
    out = {
        "source": {
            "name": "OpenStreetMap Overpass API — chain store proximity",
            "url": OVERPASS_URL,
            "pulled_at": "2026-06-18T21:00:00Z",
            "retrieval_method": "curl via urllib (POST to Overpass)",
            "search_radius_km": SEARCH_RADIUS_KM,
            "notes": (
                "30km/19mi is a generous straight-line proxy for a 30-minute drive. "
                "Real drive-time isochrone would need OSRM. "
                "Aldi/Trader Joe's name matching is loose; verify before trusting."
            ),
        },
        "schema_version": "us-reloc-2026.v1",
        "metros": {},
    }
    for city, center in METROS.items():
        out["metros"][city] = process_metro(city, center)
        time.sleep(15)  # polite to Overpass between metros (it rate-limits ~4 concurrent)
    PROC.parent.mkdir(parents=True, exist_ok=True)
    PROC.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {PROC}")

    # Summary table
    print("\n=== Summary: store counts within 35km (closest km) ===")
    print(f"{'Metro':25s}  {'Costco':>15s}  {'Target':>15s}  {'Aldi':>15s}  {'TJ':>15s}")
    for city in METROS:
        m = out["metros"][city]["brands"]
        row = [f"{m[b]['count']:>3} ({(str(round(m[b]['closest_km'],1))+'km') if m[b]['closest_km'] else 'N/A':>8})" for b in ["Costco","Target","Aldi","Trader Joes"]]
        print(f"{city:25s}  {row[0]:>15s}  {row[1]:>15s}  {row[2]:>15s}  {row[3]:>15s}")


if __name__ == "__main__":
    main()
