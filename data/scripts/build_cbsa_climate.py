#!/usr/bin/env python3
"""
build_cbsa_climate.py — Pull Open-Meteo Archive 2023 daily climate data for all 939 CBSAs.

For each CBSA (using Gazetteer centroid coordinates), fetch full-year 2023 daily data
from the Open-Meteo Archive API and compute annual aggregates:
  - daysMaxGt90FAnnual:  days where tmax > 32.22 °C (90 °F)
  - daysMinLt32FAnnual:  days where tmin <  0.00 °C (32 °F)
  - annualPrecipitationInches: sum(precip_mm) / 25.4
  - sunshineHoursAnnual: sum(sunshine_seconds) / 3600

Open-Meteo Archive: https://archive-api.open-meteo.com/v1/archive
Free tier, no API key. One request per CBSA (full 2023 year).

Rate limiting: ~0.3s between requests + exponential backoff on failure (max 3 retries).
"""

import json
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent  # /home/mongo/projects/us-relocation-2026
COORDS_PATH = ROOT / "sources/processed/cbsa_gazetteer_coords.json"
OUT_PATH = ROOT / "sources/processed/cbsa_climate_openmeteo.json"
RAW_PATH = ROOT / "sources/raw/curl/cbsa_climate_openmeteo_raw.json"

API_BASE = "https://archive-api.open-meteo.com/v1/archive"
START_DATE = "2023-01-01"
END_DATE = "2023-12-31"
DAILY_VARS = "temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration"
SLEEP_BETWEEN = 2.0  # seconds between successful requests (was 0.3, bumped to avoid 429)
MAX_RETRIES = 3
TIMEOUT = 60  # seconds per request


def fetch_cbsa(cbsa_code: str, lat: float, lng: float) -> dict:
    """Fetch 2023 daily data for one CBSA. Returns processed climate dict or raises."""
    params = {
        "latitude": f"{lat:.4f}",
        "longitude": f"{lng:.4f}",
        "start_date": START_DATE,
        "end_date": END_DATE,
        "daily": DAILY_VARS,
        "timezone": "auto",
    }
    url = API_BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})

    daily = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = json.loads(r.read().decode("utf-8"))
            if "error" in data:
                raise RuntimeError(f"API error: {data['error']}")
            daily = data.get("daily", {})
            break
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError, RuntimeError) as e:
            if attempt == MAX_RETRIES:
                raise
            backoff = 2 ** attempt  # 2, 4, 8 seconds
            print(f"    [retry {attempt}/{MAX_RETRIES}] {cbsa_code}: {e} — sleeping {backoff}s")
            time.sleep(backoff)

    if daily is None:
        raise RuntimeError(f"No daily data after {MAX_RETRIES} retries for {cbsa_code}")
    tmax_series = daily.get("temperature_2m_max", [])
    tmin_series = daily.get("temperature_2m_min", [])
    precip_series = daily.get("precipitation_sum", [])
    sun_series = daily.get("sunshine_duration", [])

    if not tmax_series:
        raise RuntimeError(f"No daily data returned for {cbsa_code}")

    # Compute aggregates
    days_gt_90f = sum(1 for v in tmax_series if v is not None and v > 32.22)
    days_lt_32f = sum(1 for v in tmin_series if v is not None and v < 0.0)
    precip_mm = sum(v for v in precip_series if v is not None)
    sunshine_sec = sum(v for v in sun_series if v is not None)

    return {
        "daysMaxGt90FAnnual": days_gt_90f,
        "daysMinLt32FAnnual": days_lt_32f,
        "annualPrecipitationInches": round(precip_mm / 25.4, 1),
        "sunshineHoursAnnual": round(sunshine_sec / 3600.0, 0),  # integer hours
    }


def main():
    # Load coordinates
    with open(COORDS_PATH) as f:
        coords_data = json.load(f)
    coords = coords_data["coords"]
    total = len(coords)
    print(f"[cbsa-climate] Loaded {total} CBSA coordinates from {COORDS_PATH}")

    # Resume support
    results = {}
    if RAW_PATH.exists():
        with open(RAW_PATH) as f:
            raw = json.load(f)
        results = raw.get("climate", {})
        done = set(results.keys())
        print(f"[cbsa-climate] Resume: {len(done)} already done, {total - len(done)} remaining")
    else:
        done = set()

    todo = [(code, info) for code, info in coords.items() if code not in done]
    failed = {}
    count = len(done)

    for i, (cbsa_code, info) in enumerate(todo, start=len(done) + 1):
        lat = info["lat"]
        lng = info["lng"]
        name = info.get("name", cbsa_code)
        t0 = time.time()
        try:
            row = fetch_cbsa(cbsa_code, lat, lng)
            results[cbsa_code] = row
            elapsed = time.time() - t0
            print(f"  [{i:4d}/{total}] {cbsa_code} {name[:45]:45s} "
                  f">90F={row['daysMaxGt90FAnnual']:3d}  <32F={row['daysMinLt32FAnnual']:3d}  "
                  f"precip={row['annualPrecipitationInches']:5.1f}in  sun={row['sunshineHoursAnnual']:4.0f}h  "
                  f"({elapsed:.1f}s)")
        except Exception as e:
            failed[cbsa_code] = {"name": name, "error": str(e)}
            print(f"  [{i:4d}/{total}] {cbsa_code} {name[:45]:45s} → FAILED: {e}")

        # Save incrementally every 10 CBSAs and on every failure
        if i % 10 == 0 or cbsa_code in failed:
            RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
            snapshot = {
                "climate": results,
                "failed": failed,
                "progress": {"done": i, "total": total},
            }
            with open(RAW_PATH, "w") as f:
                json.dump(snapshot, f, indent=2)

        # Progress summary every 100
        if i % 100 == 0:
            ok_count = i - len(failed)
            print(f"  --- [{i}/{total}] {ok_count} OK, {len(failed)} failed ---")

        if cbsa_code not in failed:
            time.sleep(SLEEP_BETWEEN)

    # Build final output
    ok_count = len(results)
    fail_count = len(failed)
    total_processed = ok_count + fail_count

    print(f"\n[cbsa-climate] Complete: {ok_count}/{total} OK, {fail_count} failed")

    output = {
        "metadata": {
            "source": "open_meteo_archive_2023",
            "downloaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source_url": API_BASE,
            "cbsa_count": total,
            "cbsa_with_data": ok_count,
            "cbsa_failed": fail_count,
            "failed_codes": list(failed.keys()) if failed else [],
            "note": "Full-year 2023 daily data aggregated to annual normals",
        },
        "climate": results,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)
    print(f"[cbsa-climate] Wrote {OUT_PATH}")

    # Also save raw snapshot final
    RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "climate": results,
        "failed": failed,
        "progress": {"done": total_processed, "total": total},
    }
    with open(RAW_PATH, "w") as f:
        json.dump(snapshot, f, indent=2)

    # --- Verification ---
    print("\n=== VERIFICATION ===")

    # 1. Check all 939 have data
    missing = [code for code in coords if code not in results]
    if missing:
        print(f"MISSING CBSAs ({len(missing)}): {missing[:20]}{'...' if len(missing) > 20 else ''}")
    else:
        print(f"Coverage: {ok_count}/{total} CBSAs have climate data (all {total} covered)")

    # 2. Spot-check known locations
    spot_checks = {
        "46520": "Honolulu, HI Metro Area",
        "38060": "Phoenix-Mesa-Chandler, AZ Metro Area",
        "42660": "Seattle-Tacoma-Bellevue, WA Metro Area",
    }
    # Find cold locations: search for high daysMinLt32FAnnual
    coldest = ("", {"daysMinLt32FAnnual": 0, "daysMaxGt90FAnnual": 0, "annualPrecipitationInches": 0, "sunshineHoursAnnual": 0})
    hottest = ("", {"daysMinLt32FAnnual": 0, "daysMaxGt90FAnnual": 0, "annualPrecipitationInches": 0, "sunshineHoursAnnual": 0})
    if results:
        coldest = max(results.items(), key=lambda x: x[1].get("daysMinLt32FAnnual", 0))
        hottest = max(results.items(), key=lambda x: x[1].get("daysMaxGt90FAnnual", 0))

    print("\nSpot checks:")
    for code, desc in spot_checks.items():
        if code in results:
            r = results[code]
            print(f"  {code} ({desc}): >90F={r['daysMaxGt90FAnnual']}, <32F={r['daysMinLt32FAnnual']}, "
                  f"precip={r['annualPrecipitationInches']}in, sun={r['sunshineHoursAnnual']}h")
        else:
            print(f"  {code} ({desc}): NOT FOUND in results (missing or failed)")

    print(f"\n  Coldest CBSA: {coldest[0]} ({coords[coldest[0]]['name']}): <32F={coldest[1]['daysMinLt32FAnnual']}")
    print(f"  Hottest CBSA: {hottest[0]} ({coords[hottest[0]]['name']}): >90F={hottest[1]['daysMaxGt90FAnnual']}")

    # 3. Check for negative values
    neg_vals = []
    for code, r in results.items():
        for key in ["daysMaxGt90FAnnual", "daysMinLt32FAnnual", "annualPrecipitationInches", "sunshineHoursAnnual"]:
            if r.get(key, -1) < 0:
                neg_vals.append((code, key, r[key]))
    if neg_vals:
        print(f"\nWARNING: Negative values found ({len(neg_vals)}): {neg_vals[:10]}")
    else:
        print("\nAll values non-negative ✓")

    # Range sanity
    precips = [r["annualPrecipitationInches"] for r in results.values()]
    suns = [r["sunshineHoursAnnual"] for r in results.values()]
    print(f"Precipitation range: {min(precips):.1f} – {max(precips):.1f} inches")
    print(f"Sunshine range:      {min(suns):.0f} – {max(suns):.0f} hours")

    # 4. Coverage summary
    print(f"\nCoverage: {ok_count}/{total} CBSAs with data")

    if failed:
        print(f"FAILURES ({fail_count}):")
        for code, info in failed.items():
            print(f"  {code} ({info['name']}): {info['error']}")

    return 0 if ok_count == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
