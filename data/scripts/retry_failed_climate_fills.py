#!/usr/bin/env python3
"""
retry_failed_climate_fills.py — Retry the 61 CBSAs that fill_climate_daycounts.py
left in the `failed` list. The original script bailed on transient API errors
without retry; this one retries with exponential backoff and writes back into
the existing cbsa_climate_openmeteo.json + raw cache in place.

ponytail: reuses fill_climate_daycounts.py's fetch_cbsa verbatim (imported).
ponytail: ceiling = sequential 1.5s sleeps between requests. With 61 CBSAs
and ~3s/retry avg, worst case ~5 min. Upgrade to concurrent.futures if
this ever needs to land hundreds at once.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error as urllib_error
import urllib.request
from pathlib import Path

ROOT = Path("/home/mongo/projects/us-relocation-2026")
RAW_PATH = ROOT / "sources/raw/curl/cbsa_climate_openmeteo_raw.json"
PROC_PATH = ROOT / "sources/processed/cbsa_climate_openmeteo.json"
COORDS_PATH = ROOT / "sources/processed/cbsa_gazetteer_coords.json"
API_BASE = "https://archive-api.open-meteo.com/v1/archive"
START_DATE = "2019-01-01"
END_DATE = "2023-12-31"
DAILY_VARS = "temperature_2m_max,temperature_2m_min"
MAX_ATTEMPTS = 3
SLEEP_BETWEEN = 0.8  # ponytail: tighter than 1.5s since API has been responsive
TIMEOUT = 60
CHECKPOINT_EVERY = 10  # persist after every N CBSAs


def fetch_cbsa(lat: float, lng: float) -> tuple[float, float] | None:
    """Identical to fill_climate_daycounts.fetch_cbsa — returns (avg_90, avg_32)
    annual means across 2019-2023, or None on hard failure."""
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

    last_err: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = json.loads(r.read())
            daily = data.get("daily") or {}
            tmax = daily.get("temperature_2m_max", [])
            tmin = daily.get("temperature_2m_min", [])
            times = daily.get("time", [])
            if not tmax or not times:
                raise RuntimeError("empty daily arrays")
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
                raise RuntimeError("no usable years")
            avg_gt = sum(yrs_gt.get(y, 0) for y in years) / len(years)
            avg_lt = sum(yrs_lt.get(y, 0) for y in years) / len(years)
            return round(avg_gt, 1), round(avg_lt, 1)
        except (urllib_error.URLError, urllib_error.HTTPError, OSError, json.JSONDecodeError, RuntimeError) as e:
            last_err = e
            if attempt < MAX_ATTEMPTS:
                backoff = 1.5 ** attempt  # 1.5, 2.25, 3.4
                time.sleep(backoff)
    print(f"    [hard fail after {MAX_ATTEMPTS}] {lat:.4f},{lng:.4f}: {last_err}")
    return None


def persist(proc, raw, climate, filled_90, filled_32, hard_fails):
    """Write both files with current state."""
    proc["metadata"]["multi_year_fill_retry"] = {
        "filled_daysMaxGt90FAnnual": filled_90,
        "filled_daysMinLt32FAnnual": filled_32,
        "hard_fails": hard_fails,
        "window": f"{START_DATE} to {END_DATE}",
    }
    PROC_PATH.write_text(json.dumps(proc, indent=2))
    raw["climate"] = climate
    RAW_PATH.write_text(json.dumps(raw, indent=2))


def main() -> int:
    proc = json.load(open(PROC_PATH))
    raw = json.load(open(RAW_PATH))
    climate = proc["climate"]
    coords = json.load(open(COORDS_PATH))["coords"]

    # Determine target CBSAs: anything in proc with 90F==0 OR 32F==0 that has coords
    targets: list[str] = []
    for code, v in climate.items():
        if v.get("daysMaxGt90FAnnual", 0) == 0 or v.get("daysMinLt32FAnnual", 0) == 0:
            if code in coords:
                targets.append(code)
    targets.sort()
    print(f"[retry-fill] {len(targets)} CBSAs still have 90F/32F==0 — retrying all")

    # Resume: drop already-filled targets (find any with both populated)
    already_filled = {
        code for code in targets
        if climate[code].get("daysMaxGt90FAnnual", 0) > 0
        and climate[code].get("daysMinLt32FAnnual", 0) > 0
    }
    if already_filled:
        print(f"[retry-fill] Resume: skipping {len(already_filled)} already-filled from prior run")

    filled_90 = 0
    filled_32 = 0
    hard_fails: list[str] = []

    for i, code in enumerate(targets, 1):
        if code in already_filled:
            continue
        info = coords[code]
        lat, lng = info["lat"], info["lng"]
        name = info.get("name", code)
        before_90 = climate[code].get("daysMaxGt90FAnnual", 0)
        before_32 = climate[code].get("daysMinLt32FAnnual", 0)
        t0 = time.time()
        result = fetch_cbsa(lat, lng)
        elapsed = time.time() - t0
        if result is None:
            hard_fails.append(code)
            print(f"  [{i:3d}/{len(targets)}] {code} {name[:35]:35s} → HARD FAIL ({elapsed:.1f}s)")
        else:
            avg_90, avg_32 = result
            if before_90 == 0 and avg_90 > 0:
                climate[code]["daysMaxGt90FAnnual"] = avg_90
                filled_90 += 1
            if before_32 == 0 and avg_32 > 0:
                climate[code]["daysMinLt32FAnnual"] = avg_32
                filled_32 += 1
            action = []
            if before_90 == 0 and avg_90 > 0:
                action.append(f"90={avg_90}")
            if before_32 == 0 and avg_32 > 0:
                action.append(f"32={avg_32}")
            tag = '→ ' + ', '.join(action) if action else '(no fill, genuine zero)'
            print(f"  [{i:3d}/{len(targets)}] {code} {name[:35]:35s} "
                  f"avg90={avg_90:5.1f} avg32={avg_32:5.1f} {tag:<25s} ({elapsed:.1f}s)")

        time.sleep(SLEEP_BETWEEN)

        # Incremental persist
        if i % CHECKPOINT_EVERY == 0:
            persist(proc, raw, climate, filled_90, filled_32, hard_fails)
            print(f"  --- checkpoint: {filled_90} fills so far ---")

    # Final persist
    persist(proc, raw, climate, filled_90, filled_32, hard_fails)

    # Coverage stats
    zero_90 = sum(1 for v in climate.values() if v.get("daysMaxGt90FAnnual", 0) == 0)
    zero_32 = sum(1 for v in climate.values() if v.get("daysMinLt32FAnnual", 0) == 0)
    print(f"\n[retry-fill] Filled {filled_90} days>90F, {filled_32} days<32F.")
    print(f"[retry-fill] Hard fails: {len(hard_fails)} CBSAs ({hard_fails[:10]}{'...' if len(hard_fails) > 10 else ''})")
    print(f"[retry-fill] Remaining zeros: daysMaxGt90FAnnual={zero_90}, daysMinLt32FAnnual={zero_32}")
    print(f"[retry-fill] Wrote {PROC_PATH} and {RAW_PATH}")

    return 0 if not hard_fails else 1


if __name__ == "__main__":
    sys.exit(main())