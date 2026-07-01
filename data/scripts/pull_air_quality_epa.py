#!/usr/bin/env python3
"""
pull_air_quality_epa.py — EPA Air Quality System (AQS) daily data → CBSA annual means.

Source: EPA AQS pre-aggregated daily files at
  https://aqs.epa.gov/aqsweb/airdata/daily_<param>_<year>.zip
  - 88101 = PM2.5 (FRM/FEM), ug/m3
  - 44201 = Ozone, ppm

These are public, no API key, ~4-10 MB/year. We pull three years (2021-2023)
to smooth out single-year weather effects, then aggregate to CBSA annual
means by joining monitor-day rows to counties via (state_fips, county_fips)
and then counties to CBSAs via the existing cbsa_county_crosswalk.json.

Aggregation:
  For each CBSA, compute the mean of per-monitor-site annual means.
  ("Site Num" is in the daily file as part of the (State, County, Site, POC)
   tuple — one physical site can have multiple POCs.) We take one row per
   (State, County, Site, POC, date) which is what the file already is, then
   first collapse to per-(site,poc) annual means, then mean those within
   each CBSA. This avoids one busy site over-weighting a CBSA.

Output: sources/processed/relocation/air_quality.json
  Schema:
    {"metadata": {...},
     "air_quality": {"<cbsa_code>": {"pm25_annual_mean": float,
                                     "ozone_annual_mean": float,
                                     "pm25_monitor_count": int,
                                     "ozone_monitor_count": int,
                                     "years_covered": [int, ...]}}}
"""
from __future__ import annotations

import csv
import io
import json
import sys
import time
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path("/home/mongo/projects/us-relocation-2026")
CROSSWALK_PATH = ROOT / "sources/processed/cbsa_county_crosswalk.json"
OUT_PATH = ROOT / "sources/processed/relocation/air_quality.json"

YEARS = [2021, 2022, 2023]
PM25_PARAM = "88101"   # ug/m3
OZONE_PARAM = "44201"  # ppm
PARAMS = [
    ("pm25", PM25_PARAM),
    ("ozone", OZONE_PARAM),
]
BASE = "https://aqs.epa.gov/aqsweb/airdata"

# ponytail: stdlib csv+zipfile streaming; ~40MB compressed → ~1GB in CSV, never
# held in memory. requests gives us iter_content chunked download.

# Build fips(5-digit) → set(cbsa_code) once from the crosswalk.
def build_fips_to_cbsa() -> dict[str, set[str]]:
    cw = json.loads(CROSSWALK_PATH.read_text())["crosswalk"]
    fips_map: dict[str, set[str]] = defaultdict(set)
    for cbsa_code, info in cw.items():
        for county in info.get("counties", []):
            fips = county.get("stcofips", "")
            if fips:
                fips_map[fips].add(cbsa_code)
    return fips_map


def stream_daily(param: str, year: int, fips_to_cbsa: dict[str, set[str]]):
    """
    Stream EPA daily_<param>_<year>.zip. Yield rows already grouped by
    (state_fips, county_fips, site_num, poc) → list of (date, arithmetic_mean).
    Uses minimal memory; ignores rows with no arithmetic_mean.

    Note: EPA uses leading-zero "01" for state, "003" for county. We join
    them to 5-digit FIPS like "01003" matching the crosswalk.
    """
    url = f"{BASE}/daily_{param}_{year}.zip"
    print(f"  GET {url}", flush=True)
    with requests.get(url, stream=True, timeout=180,
                      headers={"User-Agent": "us-relocation-2026/1.0"}) as r:
        r.raise_for_status()
        buf = io.BytesIO()
        for chunk in r.iter_content(chunk_size=1 << 20):
            buf.write(chunk)
    buf.seek(0)
    with zipfile.ZipFile(buf) as z:
        csv_name = next(n for n in z.namelist() if n.endswith(".csv"))
        with z.open(csv_name) as fh:
            text = io.TextIOWrapper(fh, encoding="utf-8", errors="replace")
            reader = csv.DictReader(text)
            # Group by site+poc across the stream.
            site_buf: dict[tuple, list[float]] = defaultdict(list)
            site_meta: dict[tuple, dict] = {}
            site_cbsas: dict[tuple, set[str]] = {}
            rows = 0
            for row in reader:
                rows += 1
                try:
                    mean = float(row.get("Arithmetic Mean") or "")
                    obs_pct = float(row.get("Observation Percent") or "0")
                except ValueError:
                    continue
                if obs_pct < 75:
                    # ponytail: <75% obs coverage = partial day; skip so a
                    # single half-recorded day doesn't bias the mean.
                    continue
                st = row.get("State Code", "").strip().zfill(2)
                co = row.get("County Code", "").strip().zfill(3)
                fips = st + co
                if fips not in fips_to_cbsa:
                    continue
                site = row.get("Site Num", "").strip()
                poc = row.get("POC", "").strip()
                key = (fips, site, poc)
                site_buf[key].append(mean)
                site_meta[key] = {"fips": fips, "site": site, "poc": poc}
                site_cbsas.setdefault(key, set()).update(fips_to_cbsa[fips])
                if rows % 200000 == 0:
                    print(f"    {year} {param}: {rows:,} rows scanned, "
                          f"{len(site_buf):,} sites buffered", flush=True)
            # Flush remaining
            for key, vals in site_buf.items():
                if not vals:
                    continue
                yield {
                    "key": key,
                    "fips": site_meta[key]["fips"],
                    "site_count": len(vals),
                    "annual_mean": sum(vals) / len(vals),
                    "cbsas": site_cbsas[key],
                }
            print(f"    {year} {param}: {rows:,} rows total, "
                  f"{len(site_buf):,} sites kept", flush=True)


def aggregate(fips_to_cbsa) -> dict[str, dict]:
    """
    Aggregate site annual means → CBSA. For each param and year, collapse sites
    to per-CBSA means (simple mean of per-site annual means). Then merge
    multiple years by averaging the per-year per-CBSA means.
    """
    # cbsa → param → year → list[site_means]
    cbsa_param_year: dict[str, dict[str, dict[int, list[float]]]] = \
        defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    site_counts: dict[str, dict[str, dict[int, int]]] = \
        defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

    for param_label, param_code in PARAMS:
        for year in YEARS:
            for site in stream_daily(param_code, year, fips_to_cbsa):
                for cbsa in site["cbsas"]:
                    cbsa_param_year[cbsa][param_label][year].append(
                        site["annual_mean"])
                    site_counts[cbsa][param_label][year] += 1

    # Collapse: cbsa → {pm25_annual_mean, ozone_annual_mean, ...}
    out: dict[str, dict] = {}
    for cbsa, params in cbsa_param_year.items():
        record: dict = {}
        for plabel in ("pm25", "ozone"):
            year_means = []
            total_sites = 0
            for year in YEARS:
                vals = params.get(plabel, {}).get(year, [])
                if not vals:
                    continue
                year_means.append(sum(vals) / len(vals))
                total_sites += site_counts[cbsa][plabel][year]
            if year_means:
                record[f"{plabel}_annual_mean"] = round(
                    sum(year_means) / len(year_means), 3)
                record[f"{plabel}_monitor_count"] = total_sites
            else:
                record[f"{plabel}_annual_mean"] = None
                record[f"{plabel}_monitor_count"] = 0
        record["years_covered"] = YEARS
        out[cbsa] = record

    return out


def main() -> int:
    pulled_at = datetime.now(timezone.utc).isoformat()
    print("=" * 60, flush=True)
    print("[air] EPA AQS daily data → CBSA annual means", flush=True)
    print(f"[air] years={YEARS}  params=PM2.5(88101)+Ozone(44201)", flush=True)
    print("=" * 60, flush=True)

    fips_to_cbsa = build_fips_to_cbsa()
    print(f"[air] crosswalk: {len(fips_to_cbsa)} unique county FIPS, "
          f"{len(set().union(*fips_to_cbsa.values()))} unique CBSAs",
          flush=True)

    t0 = time.time()
    by_cbsa = aggregate(fips_to_cbsa)
    elapsed = time.time() - t0

    # Build output wrapper
    pm25_filled = sum(1 for r in by_cbsa.values() if r["pm25_annual_mean"] is not None)
    ozone_filled = sum(1 for r in by_cbsa.values() if r["ozone_annual_mean"] is not None)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps({
        "metadata": {
            "source": "EPA Air Quality System (AQS) daily data, aggregated to CBSA annual means",
            "source_urls": [
                f"{BASE}/daily_{p}_{y}.zip"
                for y in YEARS for p in (PM25_PARAM, OZONE_PARAM)
            ],
            "publication": "https://www.epa.gov/outdoor-air-quality-data",
            "params": {
                PM25_PARAM: "PM2.5 (FRM/FEM), ug/m3, annual mean of daily means per site",
                OZONE_PARAM: "Ozone, ppm, annual mean of daily max 8-hr means per site",
            },
            "years": YEARS,
            "join_keys": "monitor site (state_fips+county_fips+site_num+poc) -> CBSA via cbsa_county_crosswalk.json",
            "filter": "drop days with observation_percent < 75% (partial coverage)",
            "aggregation": "CBSA mean = mean(per-year per-CBSA means); per-year per-CBSA mean = mean(site annual means)",
            "generated_at": pulled_at,
            "cbsa_count": len(by_cbsa),
            "cbsas_with_pm25": pm25_filled,
            "cbsas_with_ozone": ozone_filled,
            "elapsed_seconds": round(elapsed, 1),
        },
        "air_quality": by_cbsa,
    }, indent=2))

    print(f"\n[air] wrote {OUT_PATH} ({len(by_cbsa)} CBSAs, "
          f"{OUT_PATH.stat().st_size // 1024} KB, {elapsed:.1f}s)", flush=True)
    print(f"[air] PM2.5 filled: {pm25_filled}, Ozone filled: {ozone_filled}",
          flush=True)

    # Self-check: a few reference CBSAs. National PM2.5 mean ~9 ug/m3.
    for cbsa, name in [("19100", "Dallas"), ("35620", "NYC"),
                       ("31080", "LA"), ("26420", "Houston")]:
        r = by_cbsa.get(cbsa, {})
        print(f"  {cbsa} {name}: PM2.5={r.get('pm25_annual_mean')} "
              f"({r.get('pm25_monitor_count')} monitors), "
              f"Ozone={r.get('ozone_annual_mean')} "
              f"({r.get('ozone_monitor_count')} monitors)",
              flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())