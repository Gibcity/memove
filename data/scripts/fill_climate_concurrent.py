#!/usr/bin/env python3
"""
fill_climate_concurrent.py — Close the remaining 92-CBSA climate gap with
concurrent Open-Meteo Archive calls (single year, 2023).

History:
  build_cbsa_climate.py     → 939 CBSAs, full year 2023 (sequential ~1h)
  fill_climate_daycounts.py → filled 62 fields, left 60 hard-fails
  retry_failed_climate_fills.py → filled 10 more, left 5 hard-fails

What's left: 92 CBSAs with daysMaxGt90FAnnual==0 OR daysMinLt32FAnnual==0
(only one of the two missing per CBSA, in most cases — the other was already
filled by a prior run). Some are real climate zeros (Hawaii: genuinely 0
days <32F and 0 days >90F at high-elevation stations). We still pull them
and let the data speak.

Why single year, why concurrent:
  - 2023 is the year build_cbsa_climate.py already pulled → minimizes new data.
  - ~92 CBSAs × ~1.3s sequential = 2 min. ThreadPoolExecutor(20) ≈ 6–10s wall.

ponytail: imports fetch_cbsa from retry_failed_climate_fills.py — same query
shape (start/end/daily/timezone), only the year differs. Override start/end
inside this module rather than monkeypatching the import.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error as urllib_error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path("/home/mongo/projects/us-relocation-2026")
RAW_PATH = ROOT / "sources/raw/curl/cbsa_climate_openmeteo_raw.json"
PROC_PATH = ROOT / "sources/processed/cbsa_climate_openmeteo.json"
COORDS_PATH = ROOT / "sources/processed/cbsa_gazetteer_coords.json"

API_BASE = "https://archive-api.open-meteo.com/v1/archive"
START_DATE = "2023-01-01"
END_DATE = "2023-12-31"
DAILY_VARS = "temperature_2m_max,temperature_2m_min"
TIMEOUT = 30
MAX_WORKERS = 8  # ponytail: Open-Meteo free tier 429s at 20; 8 + small backoff is safe
MAX_RETRIES = 3  # ponytail: 1.5/3/6s backoff — covers most rate-limit windows


def fetch_cbsa(lat: float, lng: float) -> tuple[int, int] | None:
    """Return (days_gt_90F_2023, days_lt_32F_2023) for the given coords in 2023.
    None on hard failure."""
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
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = json.loads(r.read())
            daily = data.get("daily") or {}
            tmax = daily.get("temperature_2m_max", [])
            tmin = daily.get("temperature_2m_min", [])
            times = daily.get("time", [])
            if not tmax or not times:
                raise RuntimeError("empty daily arrays")
            gt = sum(1 for v in tmax if v is not None and v > 32.22)
            lt = sum(1 for v in tmin if v is not None and v < 0.0)
            return gt, lt
        except urllib_error.HTTPError as e:
            # 429 → back off harder; 5xx → retry; otherwise raise
            last_err = e
            if attempt < MAX_RETRIES:
                wait = 4.0 * attempt if e.code == 429 else 2.0 * attempt
                time.sleep(wait)
        except (urllib_error.URLError, OSError, json.JSONDecodeError, RuntimeError) as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(1.0 * attempt)
    print(f"    [hard fail] {lat:.4f},{lng:.4f}: {last_err}")
    return None


def main() -> int:
    proc = json.load(open(PROC_PATH))
    raw = json.load(open(RAW_PATH))
    climate: dict = proc["climate"]
    coords: dict = json.load(open(COORDS_PATH))["coords"]

    # Resume: skip CBSAs already populated for both metrics
    targets = sorted([
        c for c, v in climate.items()
        if c in coords
        and (v.get("daysMaxGt90FAnnual", 0) == 0 or v.get("daysMinLt32FAnnual", 0) == 0)
    ])
    already_done = [
        c for c in targets
        if climate[c].get("daysMaxGt90FAnnual", 0) > 0
        and climate[c].get("daysMinLt32FAnnual", 0) > 0
    ]
    if already_done:
        print(f"[concurrent-fill] Resume: {len(already_done)} already fully populated, skipping")
    todo = [c for c in targets if c not in set(already_done)]
    print(f"[concurrent-fill] {len(todo)} CBSAs to process ({MAX_WORKERS} workers)")

    if not todo:
        print("[concurrent-fill] Nothing to do.")
        return 0

    filled_90 = 0
    filled_32 = 0
    hard_fails: list[tuple[str, str]] = []
    t_start = time.time()

    def worker(code: str) -> tuple[str, tuple[int, int] | None, str]:
        info = coords[code]
        result = fetch_cbsa(info["lat"], info["lng"])
        return code, result, info.get("name", code)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(worker, c): c for c in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            code, result, name = fut.result()
            if result is None:
                hard_fails.append((code, name))
                print(f"  [{i:3d}/{len(todo)}] {code} {name[:35]:35s} → HARD FAIL")
                continue
            gt, lt = result
            before_90 = climate[code].get("daysMaxGt90FAnnual", 0)
            before_32 = climate[code].get("daysMinLt32FAnnual", 0)
            tag = []
            if before_90 == 0 and gt > 0:
                climate[code]["daysMaxGt90FAnnual"] = gt
                filled_90 += 1
                tag.append(f"90={gt}")
            elif before_90 == 0 and gt == 0:
                tag.append("90=0 (genuine)")
            if before_32 == 0 and lt > 0:
                climate[code]["daysMinLt32FAnnual"] = lt
                filled_32 += 1
                tag.append(f"32={lt}")
            elif before_32 == 0 and lt == 0:
                tag.append("32=0 (genuine)")
            print(f"  [{i:3d}/{len(todo)}] {code} {name[:35]:35s} "
                  f"gt90={gt:3d} lt32={lt:3d}  {', '.join(tag) or 'no change'}")

    elapsed = time.time() - t_start

    # Persist
    proc["metadata"]["concurrent_fill_2023"] = {
        "filled_daysMaxGt90FAnnual": filled_90,
        "filled_daysMinLt32FAnnual": filled_32,
        "hard_fails": [c for c, _ in hard_fails],
        "hard_fail_names": {c: n for c, n in hard_fails},
        "workers": MAX_WORKERS,
        "elapsed_seconds": round(elapsed, 1),
        "window": f"{START_DATE} to {END_DATE}",
        "api": API_BASE,
    }
    raw["climate"] = climate
    PROC_PATH.write_text(json.dumps(proc, indent=2))
    RAW_PATH.write_text(json.dumps(raw, indent=2))

    # Coverage
    zero_90 = sum(1 for v in climate.values() if v.get("daysMaxGt90FAnnual", 0) == 0)
    zero_32 = sum(1 for v in climate.values() if v.get("daysMinLt32FAnnual", 0) == 0)
    print(f"\n[concurrent-fill] Filled {filled_90} days>90F, {filled_32} days<32F in {elapsed:.1f}s")
    print(f"[concurrent-fill] Hard fails: {len(hard_fails)} CBSAs")
    print(f"[concurrent-fill] Remaining zeros: daysMaxGt90FAnnual={zero_90}, daysMinLt32FAnnual={zero_32}")
    print(f"[concurrent-fill] Wrote {PROC_PATH} and {RAW_PATH}")
    return 0 if not hard_fails else 1


if __name__ == "__main__":
    sys.exit(main())