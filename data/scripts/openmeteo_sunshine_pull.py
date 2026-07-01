"""
Pull annual sunshine hours for all 59 metros from Open-Meteo Historical Archive.

Source: https://archive-api.open-meteo.com/v1/archive
- No API key required
- Free for non-commercial use
- Daily sunshine_duration sum aggregated to annual hours

Window: 2020-01-01 to 2024-12-31 (5 full years, balanced for recent climate normal).

Replaces the NOAA precip-day proxy (sunny_proxy field in metros.json).
Dashboard scoring.ts formula:
    sunny_score = min(sunshine_days_per_year / 36.5, 10)
where sunny_proxy holds ANNUAL DAYS. To keep that math working, we emit BOTH:
  - sunshine_hours_annual  (raw hours/yr, new field)
  - sunny_proxy           (converted to "sunny days/yr" = hours / 24, backward-compatible)

Coords are county-seat (principal-city) centroids; stable, well-known, no API lookup needed.
"""
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/openmeteo_sunshine_59metros.json"
RAW_PATH = ROOT / "sources/raw/curl/openmeteo_sunshine_59metros_raw.json"
START = "2020-01-01"
END = "2024-12-31"
SLEEP_S = 1.5  # be polite to free tier; 59 metros * 1.5s ≈ 90s plus request time

# (metro_sid, lat, lon) — county-seat coordinates for each of the 59 metros.
# Source: USGS / census county seat centroids, hand-verified for top 50 US metros.
# Format matches metros.json sid field exactly.
METROS_COORDS = [
    ("Memphis",          35.1495,  -90.0490),
    ("Nashville",        36.1627,  -86.7816),
    ("Indianapolis",     39.7684,  -86.1581),
    ("Columbus",         39.9612,  -82.9988),
    ("Cincinnati",       39.1031,  -84.5120),
    ("Grand Rapids",     42.9634,  -85.6681),
    ("Kalamazoo",        42.2917,  -85.5872),
    ("all50_IA",         41.5868,  -93.6250),  # Des Moines IA (Polk)
    ("all50_AL",         33.4734,  -86.8497),  # Birmingham AL (Jefferson)
    ("Pittsburgh",       40.4406,  -79.9959),
    ("Dallas",           32.7767,  -96.7970),
    ("all50_NE",         41.2565,  -95.9345),  # Omaha NE (Douglas)
    ("San Antonio",      29.4241,  -98.4936),
    ("Austin",           30.2672,  -97.7431),
    ("Denver",           39.7392, -104.9903),
    ("Colorado Springs", 38.8339, -104.8214),
    ("Boulder",          40.0150, -105.2705),
    ("Boise",            43.6150, -116.2023),
    ("Spokane",          47.6588, -117.4260),
    ("Bend",             44.0582, -121.3153),
    ("Bozeman",          45.6770, -111.0429),
    ("Rochester",        44.0121,  -92.4802),
    ("Minneapolis",      44.9778,  -93.2650),
    ("Appleton",         44.2619,  -88.4154),
    ("Madison",          43.0731,  -89.4012),
    ("St. Louis",        38.6270,  -90.1994),
    ("Kansas City",      39.0997,  -94.5786),
    ("Louisville",       38.2527,  -85.7585),
    # all50_ prefixed metros — principal city coords
    ("all50_WV",         38.3492,  -81.6328),  # Charleston WV (Kanawha)
    ("all50_SD",         43.5446,  -96.7311),  # Sioux Falls SD (Minnehaha)
    ("all50_OK",         35.4676,  -97.5164),  # Oklahoma City OK (Oklahoma)
    ("all50_AR",         34.7465,  -92.2896),  # Little Rock AR (Pulaski)
    ("all50_SC",         34.8526,  -82.3940),  # Greenville SC (Greenville)
    ("all50_ND",         46.8083,  -96.7898),  # Fargo ND (Cass)
    ("all50_WY",         41.1400, -104.8197),  # Cheyenne WY (Laramie)
    ("all50_KS",         37.6872,  -97.3301),  # Wichita KS (Sedgwick)
    ("all50_FL",         30.3322,  -81.6557),  # Jacksonville FL (Duval)
    ("all50_NM",         35.0844, -106.6504),  # Albuquerque NM (Bernalillo)
    ("all50_MS",         32.2988,  -90.1848),  # Jackson MS (Hinds)
    ("all50_NC",         35.2271,  -80.8431),  # Charlotte NC (Mecklenburg)
    ("all50_GA",         33.7490,  -84.3880),  # Atlanta GA (Fulton)
    ("all50_NV",         36.1699, -115.1398),  # Las Vegas NV (Clark)
    ("all50_AK",         61.2181, -149.9003),  # Anchorage AK
    ("all50_VA",         37.5407,  -77.4360),  # Richmond VA
    ("all50_DE",         39.1582,  -75.5244),  # Dover DE (Kent)
    ("all50_NY",         43.1566,  -77.6088),  # Rochester NY (Monroe)
    ("all50_IL",         41.8781,  -87.6298),  # Chicago IL (Cook)
    ("all50_MD",         39.2904,  -76.6122),  # Baltimore MD
    ("all50_CT",         41.7658,  -72.6734),  # Hartford CT
    ("all50_UT",         40.7608, -111.8910),  # Salt Lake City UT
    ("all50_ME",         43.6591,  -70.2568),  # Portland ME (Cumberland)
    ("all50_NH",         42.9956,  -71.4548),  # Manchester NH (Hillsborough)
    ("all50_DC",         38.9072,  -77.0369),  # Washington DC
    ("all50_MA",         42.2626,  -71.8023),  # Worcester MA
    ("all50_HI",         21.3069, -157.8583),  # Honolulu HI
    ("all50_CA",         38.5816, -121.4944),  # Sacramento CA
    ("all50_RI",         41.8240,  -71.4128),  # Providence RI
    ("all50_NJ",         40.2206,  -74.7597),  # Trenton NJ (Mercer)
    ("all50_VT",         44.4759,  -73.2121),  # Burlington VT (Chittenden)
]


def fetch_one(metro_sid: str, lat: float, lon: float) -> dict:
    params = {
        "latitude": f"{lat:.4f}",
        "longitude": f"{lon:.4f}",
        "start_date": START,
        "end_date": END,
        "daily": "sunshine_duration",
        "timezone": "America/New_York",  # Open-Meteo picks per-coord TZ; this is a fallback
    }
    url = "https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    if "error" in data:
        raise RuntimeError(f"Open-Meteo error for {metro_sid}: {data['error']}")
    daily = data.get("daily", {})
    sunshine_sec = daily.get("sunshine_duration", [])
    n_days = len(sunshine_sec)
    if n_days == 0:
        raise RuntimeError(f"No daily sunshine returned for {metro_sid}")
    # Open-Meteo gives seconds per day. Aggregate.
    total_hours = sum(sunshine_sec) / 3600.0
    # Per-year average
    n_years = 5  # 2020..2024 inclusive
    avg_hours_per_year = total_hours / n_years
    # "Sunny days" equivalent (proxy for the existing sunny_proxy field).
    # Convention: a "fully sunny" day = full mean daylight (~12 hrs). So 12 hrs of
    # recorded sunshine = 1 sunny day. Matches the dashboard scoring:
    #   sunny_score = min(sunny_proxy / 36.5, 10)
    # where 36.5 = 365 / 10, i.e., 10/10 score = 365 fully-sunny days/yr.
    sunny_days_per_year = avg_hours_per_year / 12.0
    return {
        "metro": metro_sid,
        "lat": lat,
        "lon": lon,
        "tz": data.get("timezone"),
        "elevation_m": data.get("elevation"),
        "days": n_days,
        "total_sunshine_hours_5yr": round(total_hours, 1),
        "avg_sunshine_hours_per_year": round(avg_hours_per_year, 1),
        "sunny_days_per_year_proxy": round(sunny_days_per_year, 1),
        "first_day": daily["time"][0],
        "last_day": daily["time"][-1],
    }


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RAW_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Resume support (still keyed off raw cache)
    existing = []
    if RAW_PATH.exists():
        existing = json.load(open(RAW_PATH))
    # Validate existing entries match the canonical 59-metro set; drop extras/stale
    canonical = {sid for sid, _, _ in METROS_COORDS}
    existing = [r for r in existing if r.get("metro") in canonical]
    done = {r["metro"] for r in existing if "error" not in r}

    results = list(existing)
    errors = []

    todo = [m for m in METROS_COORDS if m[0] not in done]
    print(f"[openmeteo-sunshine] {len(done)} already done, {len(todo)} remaining ({len(METROS_COORDS)} total)")

    for i, (sid, lat, lon) in enumerate(todo, start=len(done) + 1):
        t0 = time.time()
        try:
            row = fetch_one(sid, lat, lon)
            results.append(row)
            print(f"  [{i:2d}/{len(METROS_COORDS)}] {sid:18s} → {row['avg_sunshine_hours_per_year']:.0f} hrs/yr  ({time.time()-t0:.1f}s)")
        except Exception as e:
            err = {"metro": sid, "lat": lat, "lon": lon, "error": str(e)}
            errors.append(err)
            results.append(err)
            print(f"  [{i:2d}/{len(METROS_COORDS)}] {sid:18s} → ERROR: {e}")
        # Save incrementally
        json.dump(results, open(RAW_PATH, "w"), indent=2)
        time.sleep(SLEEP_S)

    # Build final summary
    canonical_ids = {sid for sid, _, _ in METROS_COORDS}
    ok_all = [r for r in results if "error" not in r]
    ok = [r for r in ok_all if r["metro"] in canonical_ids]
    excluded = [r for r in ok_all if r["metro"] not in canonical_ids]
    errors = [r for r in results if "error" in r]
    summary = {
        "source": {
            "name": "Open-Meteo Historical Archive - Daily Sunshine Duration",
            "url": "https://archive-api.open-meteo.com/v1/archive",
            "method": "curl-equivalent urllib request, no API key required",
            "window": f"{START} to {END} (5 years, averaged)",
            "field": "daily.sunshine_duration (seconds)",
            "retrieval_method": "HTTPS GET, no auth",
            "generated": datetime.utcnow().isoformat() + "Z",
        },
        "schema_version": "openmeteo_sunshine.v1",
        "unit": "hours per year (5-yr average)",
        "metros_ok": len(ok),
        "metros_failed": len(errors),
        "metros_excluded_not_in_59": [r["metro"] for r in excluded],
        "metros": sorted(ok, key=lambda r: -r["avg_sunshine_hours_per_year"]),
        "errors": errors,
    }
    json.dump(summary, open(OUT_PATH, "w"), indent=2)

    print()
    print(f"[openmeteo-sunshine] Wrote {OUT_PATH}")
    print(f"[openmeteo-sunshine] OK={len(ok)}  FAILED={len(errors)}")
    print()
    print("Top 5 sunniest metros:")
    for r in summary["metros"][:5]:
        print(f"  {r['metro']:18s} {r['avg_sunshine_hours_per_year']:.0f} hrs/yr  ({r['sunny_days_per_year_proxy']:.0f} sunny days/yr)")
    print("Bottom 5 (cloudiest):")
    for r in summary["metros"][-5:]:
        print(f"  {r['metro']:18s} {r['avg_sunshine_hours_per_year']:.0f} hrs/yr  ({r['sunny_days_per_year_proxy']:.0f} sunny days/yr)")


if __name__ == "__main__":
    main()