"""Pull OSM Overpass data for remaining 19 missing metros.
NO tcsetattr issues: no flush=True on non-TTY, no input(), simple stderr writes.
"""
import json
import math
import ssl
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT_DIR = Path("/home/mongo/projects/us-relocation-2026/sources/raw/osm")
OUT_DIR.mkdir(parents=True, exist_ok=True)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
SEARCH_RADIUS_KM = 35
EARTH_KM = 6371.0

# Metros needing BOTH stores + recreation
NEEDS_BOTH = [
    ("Cheyenne", "WY", 41.1400, -104.8202),
    ("San Antonio", "TX", 29.4241, -98.4936),
    ("Pittsburgh", "PA", 40.4406, -79.9959),
    ("Oklahoma City", "OK", 35.4676, -97.5164),
    ("Fargo", "ND", 46.8772, -96.7898),
    ("Greenville", "SC", 34.8526, -82.3940),
    ("Omaha", "NE", 41.2565, -95.9345),
    ("Las Vegas", "NV", 36.1699, -115.1398),
    ("Jackson", "MS", 32.2988, -90.1848),
    ("Charlotte", "NC", 35.2271, -80.8431),
    ("Portland", "ME", 43.6591, -70.2568),
    ("Trenton", "NJ", 40.2206, -74.7597),
    ("Albuquerque", "NM", 35.0844, -106.6504),
    ("Manchester", "NH", 42.9956, -71.4548),
    ("Rochester", "NY", 43.1566, -77.6088),
    ("Providence", "RI", 41.8240, -71.4128),
    ("Salt Lake City", "UT", 40.7608, -111.8910),
    ("Richmond", "VA", 37.5407, -77.4360),
    ("Burlington", "VT", 44.4759, -73.2121),
]

# Metros needing stores only
NEEDS_STORES_ONLY = [
    ("Birmingham", "AL", 33.5186, -86.8104),
    ("Sacramento", "CA", 38.5816, -121.4944),
    ("Jacksonville", "FL", 30.3322, -81.6557),
]

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def query_stores(lat, lon):
    radius_m = SEARCH_RADIUS_KM * 1000
    bbox = f"(around:{radius_m},{lat},{lon})"
    filters = "\n  ".join(
        f'node["shop"]{bbox}{filt};\n  way["shop"]{bbox}{filt};'
        for filt in [
            '["name"~"Costco|costco",i]',
            '["name"~"^Target$",i]',
            '["name"~"^ALDI$|^Aldi$",i]',
            '["name"~"Trader Joe",i]',
        ]
    )
    q = f"[out:json][timeout:60];\n(\n  {filters}\n);\nout tags center;"
    data = urllib.parse.urlencode({"data": q}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data,
                                  headers={"User-Agent": "us-reloc-osm/1.0"})
    with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
        return json.loads(resp.read())


def query_recreation(lat, lon):
    radius_m = SEARCH_RADIUS_KM * 1000
    bbox = f"(around:{radius_m},{lat},{lon})"
    subqueries = f"""
  node["leisure"="park"]{bbox};
  way["leisure"="park"]{bbox};
  node["leisure"="dog_park"]{bbox};
  way["leisure"="dog_park"]{bbox};
  node["route"="hiking"]{bbox};
  way["route"="hiking"]{bbox};
  node["highway"="path"]{bbox};
  way["highway"="path"]{bbox};
  node["natural"="water"]{bbox};
  way["natural"="water"]{bbox};
  node["amenity"="restaurant"]{bbox};
  way["amenity"="restaurant"]{bbox};
"""
    q = f"[out:json][timeout:90];\n(\n  {subqueries}\n);\nout tags center;"
    data = urllib.parse.urlencode({"data": q}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data,
                                  headers={"User-Agent": "us-reloc-osm/1.0"})
    with urllib.request.urlopen(req, timeout=180, context=ctx) as resp:
        return json.loads(resp.read())


def pull_one(metro, state, lat, lon, need_stores=True, need_rec=True):
    """Pull and save. Returns (stores_ok, rec_ok)."""
    metro_lower = metro.lower().replace(" ", "_")
    state_lower = state.lower()
    base = OUT_DIR / f"{metro_lower}_{state_lower}"

    stores_ok = False
    rec_ok = False

    if need_stores and not (base.with_name(base.name + "_stores.json")).exists():
        try:
            data = query_stores(lat, lon)
            (base.with_name(base.name + "_stores.json")).write_text(json.dumps(data))
            stores_ok = True
            sys.stderr.write(f"  {metro} stores: {len(data.get('elements',[]))} elements\n")
        except Exception as e:
            sys.stderr.write(f"  {metro} stores FAIL: {e}\n")
            return False, False
        time.sleep(8)  # rate-limit courtesy
    elif (base.with_name(base.name + "_stores.json")).exists():
        stores_ok = True

    if need_rec and not (base.with_name(base.name + "_recreation.json")).exists():
        try:
            data = query_recreation(lat, lon)
            (base.with_name(base.name + "_recreation.json")).write_text(json.dumps(data))
            rec_ok = True
            sys.stderr.write(f"  {metro} rec: {len(data.get('elements',[]))} elements\n")
        except Exception as e:
            sys.stderr.write(f"  {metro} rec FAIL: {e}\n")
            return stores_ok, False
        time.sleep(8)

    return stores_ok, rec_ok


def main():
    total_s, total_r = 0, 0
    fails = []
    print(f"=== Pulling {len(NEEDS_BOTH)} metros (stores + recreation) ===")
    for i, (metro, state, lat, lon) in enumerate(NEEDS_BOTH, 1):
        print(f"[{i}/{len(NEEDS_BOTH)}] {metro} {state}...")
        s, r = pull_one(metro, state, lat, lon, need_stores=True, need_rec=True)
        if s: total_s += 1
        if r: total_r += 1
        if not s or not r:
            fails.append((metro, state, s, r))

    print(f"\n=== Pulling {len(NEEDS_STORES_ONLY)} metros (stores only) ===")
    for i, (metro, state, lat, lon) in enumerate(NEEDS_STORES_ONLY, 1):
        print(f"[{i}/{len(NEEDS_STORES_ONLY)}] {metro} {state}...")
        s, r = pull_one(metro, state, lat, lon, need_stores=True, need_rec=False)
        if s: total_s += 1
        if not s:
            fails.append((metro, state, s, True))

    print(f"\n=== DONE ===")
    print(f"Stores pulled: {total_s}")
    print(f"Recreation pulled: {total_r}")
    if fails:
        print(f"Failures: {fails}")
    else:
        print(f"All clean!")


if __name__ == "__main__":
    main()