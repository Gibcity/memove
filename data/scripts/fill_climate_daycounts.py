#!/usr/bin/env python3
"""
fill_climate_daycounts.py — Fill zero day-count gaps in climate data with
multi-year Open-Meteo averages (2019-2023).

The single-year 2023 pull in build_cbsa_climate.py returned 0 days >90F for
96 CBSAs and 0 days <32F for 72 CBSAs. Many of these are real mid-latitude
CBSAs that simply had an anomalously cool/warm year. Averaging 5 years
smooths this out and gives a more reliable "normal".

Anchor: only fills when the 2023 value is 0 AND the 5-year avg is > 0.
Doesn't touch already-populated values. Genuinely cold/hot CBSAs (Anchorage
gets ~0 hot days even over 5 years) keep their 0 — that's correct.

Output: updates sources/processed/cbsa_climate_openmeteo.json in place,
        preserving all non-zero entries.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path("/home/mongo/projects/us-relocation-2026")
COORDS_PATH = ROOT / "sources/processed/cbsa_gazetteer_coords.json"
OUT_PATH = ROOT / "raw/curl/cbsa_climate_openmeteo_raw.json"

API_BASE = "https://archive-api.open-meteo.com/v1/archive"
START_DATE = "2019-01-01"
END_DATE = "2023-12-31"
DAILY_VARS = "temperature_2m_max,temperature_2m_min"
SLEEP_BETWEEN = 1.5  # be polite; 5 years of data per request is heavier
TIMEOUT = 90


def fetch_cbsa(lat: float, lng: float) -> tuple[float, float] | None:
    """Fetch 2019-2023 daily tmax/tmin, return (days_gt_90F, days_lt_32F) annual avg.

    Returns None on API failure (caller decides to skip).
    """
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
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"    [api error] {e}")
        return None

    daily = data.get("daily") or {}
    tmax = daily.get("temperature_2m_max", [])
    tmin = daily.get("temperature_2m_min", [])
    times = daily.get("time", [])
    if not tmax or not times:
        return None

    # Per-year counts
    yrs_gt: dict[str, int] = {}
    yrs_lt: dict[str, int] = {}
    for i, t in enumerate(times):
        y = t[:4]
        if i < len(tmax) and tmax[i] is not None and tmax[i] > 32.22:
            yrs_gt[y] = yrs_gt.get(y, 0) + 1
        if i < len(tmin) and tmin[i] is not None and tmin[i] < 0.0:
            yrs_lt[y] = yrs_lt.get(y, 0) + 1

    years = sorted(set(yrs_gt) | set(yrs_lt))
    if not years:
        return None
    avg_gt = sum(yrs_gt.get(y, 0) for y in years) / len(years)
    avg_lt = sum(yrs_lt.get(y, 0) for y in years) / len(years)
    return round(avg_gt, 1), round(avg_lt, 1)


def main():
    coords_data = json.load(open(COORDS_PATH))
    coords = coords_data["coords"]

    clim_data = json.load(open(OUT_PATH))
    climate = clim_data["climate"]

    # Find candidates: 90F or 32F == 0
    need_90 = [(c, v) for c, v in climate.items() if v.get("daysMaxGt90FAnnual", 0) == 0]
    need_32 = [(c, v) for c, v in climate.items() if v.get("daysMinLt32FAnnual", 0) == 0]
    candidates = set(c for c, _ in need_90) | set(c for c, _ in need_32)
    print(f"[climate-fill] {len(need_90)} CBSAs missing days>90F, "
          f"{len(need_32)} missing days<32F, {len(candidates)} unique")

    filled_90 = 0
    filled_32 = 0
    failed: list[str] = []

    for i, code in enumerate(sorted(candidates), 1):
        info = coords.get(code, {})
        if not info:
            print(f"  [{i}/{len(candidates)}] {code}: no coords, skipping")
            failed.append(code)
            continue
        lat, lng = info["lat"], info["lng"]
        name = info.get("name", code)
        t0 = time.time()
        result = fetch_cbsa(lat, lng)
        elapsed = time.time() - t0
        if result is None:
            print(f"  [{i}/{len(candidates)}] {code} {name[:35]:35s} → API FAIL")
            failed.append(code)
            time.sleep(SLEEP_BETWEEN)
            continue
        avg_90, avg_32 = result
        before_90 = climate[code]["daysMaxGt90FAnnual"]
        before_32 = climate[code]["daysMinLt32FAnnual"]
        if before_90 == 0 and avg_90 > 0:
            climate[code]["daysMaxGt90FAnnual"] = avg_90
            filled_90 += 1
        if before_32 == 0 and avg_32 > 0:
            climate[code]["daysMinLt32FAnnual"] = avg_32
            filled_32 += 1
        print(f"  [{i}/{len(candidates)}] {code} {name[:35]:35s} "
              f"avg90={avg_90:5.1f} avg32={avg_32:5.1f} ({elapsed:.1f}s)")
        time.sleep(SLEEP_BETWEEN)

    clim_data["metadata"]["multi_year_fill"] = {
        "filled_daysMaxGt90FAnnual": filled_90,
        "filled_daysMinLt32FAnnual": filled_32,
        "failed": failed,
        "window": f"{START_DATE} to {END_DATE}",
    }
    with open(OUT_PATH, "w") as f:
        json.dump(clim_data, f, indent=2)

    print(f"\n[climate-fill] Done. Filled {filled_90} days>90F, {filled_32} days<32F.")
    print(f"[climate-fill] Failed: {len(failed)} CBSAs (left as 0.0 = genuine zero).")
    print(f"[climate-fill] Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()