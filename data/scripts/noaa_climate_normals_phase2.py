"""Pull NOAA Climate Normals (1991-2020) + daily summaries for Phase 2 metro stations.

Same pattern as noaa_climate_normals.py but for the 35 additional metros.

Station IDs verified against https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/

Outputs:
  sources/raw/noaa/<station_id>_monthly.csv   (monthly normals)
  sources/raw/noaa/<station_id>_daily_2023.csv (daily summaries)
"""

import csv
import io
import json
import urllib.request
import ssl
import sys
from pathlib import Path

OUT_DIR = Path("/home/mongo/projects/us-relocation-2026/sources/raw/noaa")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Phase 2 metros with verified NOAA USW station IDs
# Dover DE -> USW00013781 WILMINGTON NEW CASTLE CO AP (nearest major DE station)
METROS = {
    "Anchorage":        ("AK", "USW00026451"),  # Ted Stevens Anchorage Intl
    "Birmingham":       ("AL", "USW00013876"),  # Birmingham Intl
    "Little Rock":      ("AR", "USW00013963"),  # Little Rock Adams Field
    "Tucson":           ("AZ", "USW00023160"),  # Tucson Intl
    "Sacramento":       ("CA", "USW00023232"),  # Sacramento Executive AP
    "Hartford":         ("CT", "USW00014740"),  # Bradley Intl
    "Washington DC":    ("DC", "USW00013743"),  # Reagan National
    "Dover":            ("DE", "USW00013781"),  # Wilmington New Castle Co AP (closest)
    "Jacksonville":     ("FL", "USW00013889"),  # Jacksonville Intl
    "Atlanta":          ("GA", "USW00013874"),  # Hartsfield-Jackson
    "Urban Honolulu":   ("HI", "USW00022521"),  # Honolulu Intl
    "Des Moines":       ("IA", "USW00014933"),  # Des Moines Intl
    "Chicago":          ("IL", "USW00094846"),  # Chicago O'Hare
    "Wichita":          ("KS", "USW00003928"),  # Wichita Mid-Continent
    "Worcester":        ("MA", "USW00094746"),  # Worcester Rgnl AP
    "Baltimore":        ("MD", "USW00093721"),  # Baltimore-Washington Intl
    "Portland ME":      ("ME", "USW00014764"),  # Portland Intl Jetport
    "Jackson":          ("MS", "USW00003940"),  # Jackson Intl
    "Charlotte":        ("NC", "USW00013881"),  # Charlotte/Douglas Intl
    "Fargo":            ("ND", "USW00014914"),  # Hector Intl
    "Omaha":            ("NE", "USW00014942"),  # Eppley Airfield
    "Manchester":       ("NH", "USW00014710"),  # Manchester-Boston Rgnl
    "Trenton":          ("NJ", "USW00014792"),  # Trenton Mercer Co AP
    "Albuquerque":      ("NM", "USW00023050"),  # Albuquerque Intl Sunport
    "Las Vegas":        ("NV", "USW00023169"),  # Las Vegas McCarran AP
    "Rochester NY":     ("NY", "USW00014768"),  # Greater Rochester Intl
    "Oklahoma City":    ("OK", "USW00013967"),  # Will Rogers World
    "Providence":       ("RI", "USW00014765"),  # TF Green
    "Greenville":       ("SC", "USW00003870"),  # Greenville-Spartanburg (Greer)
    "Sioux Falls":      ("SD", "USW00014944"),  # Sioux Falls Joe Foss
    "Salt Lake City":   ("UT", "USW00024127"),  # Salt Lake City Intl
    "Richmond":         ("VA", "USW00013740"),  # Richmond Intl
    "Burlington":       ("VT", "USW00014742"),  # Burlington Intl
    "Charleston":       ("WV", "USW00013866"),  # Charleston Yeager
    "Cheyenne":         ("WY", "USW00024018"),  # Cheyenne Rgnl
}

NORMALS_BASE = (
    "https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/"
)
DAILY_BASE = "https://www.ncei.noaa.gov/access/services/data/v1"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def fetch_monthly_normals(station_id: str) -> dict | None:
    """Pull 1991-2020 monthly normals for one station."""
    url = f"{NORMALS_BASE}{station_id}.csv"
    out_path = OUT_DIR / f"{station_id}_monthly.csv"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "curl/8.0"})
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            data = resp.read().decode("utf-8", errors="replace")
        out_path.write_text(data)
        return parse_monthly_csv(data)
    except Exception as e:
        print(f"  [monthly] {station_id}: ERROR {type(e).__name__}: {e}")
        return None


def parse_monthly_csv(text: str) -> dict:
    """Parse monthly normals CSV. Returns dict of {month: {attribute: value}}."""
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return {}
    out = {}
    for row in rows:
        month = row.get("month", "")
        if not month:
            continue
        d = {}
        for k, v in row.items():
            if k in ("month", "STATION", "NAME", "LATITUDE", "LONGITUDE", "ELEVATION"):
                continue
            try:
                d[k] = float(v) if v and v not in ("", "T") else None
            except (ValueError, TypeError):
                d[k] = v if v else None
        out[month] = d
    return out


def fetch_daily_sunshine(station_id: str, year: int = 2023) -> dict | None:
    """Pull one year of daily TSUN, TMAX, TMIN data."""
    url = (
        f"{DAILY_BASE}?dataset=daily-summaries"
        f"&stations={station_id}"
        f"&dataTypes=TSUN,TMAX,TMIN"
        f"&startDate={year}-01-01"
        f"&endDate={year}-12-31"
        f"&units=standard"
        f"&format=csv"
    )
    out_path = OUT_DIR / f"{station_id}_daily_{year}.csv"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "curl/8.0"})
        with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
            data = resp.read().decode("utf-8", errors="replace")
        if "STATION" not in data[:200]:
            print(f"  [daily {year}] {station_id}: unexpected response ({len(data)}b)")
            return None
        out_path.write_text(data)
        return parse_daily_csv(data)
    except Exception as e:
        print(f"  [daily {year}] {station_id}: ERROR {type(e).__name__}: {e}")
        return None


def parse_daily_csv(text: str) -> dict:
    """Parse daily CSV. Returns summary stats."""
    reader = csv.DictReader(io.StringIO(text))
    rows = [r for r in reader if r.get("STATION")]
    if not rows:
        return {"sunny_days": 0, "max_temp_p90": None, "days_with_data": 0}

    sunny_days = 0
    tmax_values = []
    tmin_values = []
    for r in rows:
        tsun = r.get("TSUN") or ""
        tmax = r.get("TMAX") or ""
        tmin = r.get("TMIN") or ""
        if tsun and tsun.strip().isdigit() and int(tsun) > 0:
            sunny_days += 1
        if tmax.strip():
            try:
                tmax_values.append(float(tmax))
            except ValueError:
                pass
        if tmin.strip():
            try:
                tmin_values.append(float(tmin))
            except ValueError:
                pass

    sorted_tmax = sorted(tmax_values) if tmax_values else []
    sorted_tmin = sorted(tmin_values) if tmin_values else []

    def pct(values, p):
        if not values:
            return None
        idx = max(0, min(len(values) - 1, int(round(p * (len(values) - 1)))))
        return values[idx]

    return {
        "sunny_days": sunny_days,
        "days_with_data": len(rows),
        "max_temp_p10": pct(sorted_tmax, 0.10),
        "max_temp_p50": pct(sorted_tmax, 0.50),
        "max_temp_p90": pct(sorted_tmax, 0.90),
        "max_temp_max": max(tmax_values) if tmax_values else None,
        "min_temp_p10": pct(sorted_tmin, 0.10),
        "min_temp_p50": pct(sorted_tmin, 0.50),
        "min_temp_p90": pct(sorted_tmin, 0.90),
    }


def main():
    print("=" * 60)
    print("PHASE 2: Pulling NOAA monthly normals (1991-2020) for new metros...")
    print("=" * 60)
    monthly = {}
    success_count = 0
    fail_count = 0
    for city, (state, station) in METROS.items():
        print(f"  {city:20s} ({state}) -> {station} ...", end=" ", flush=True)
        m = fetch_monthly_normals(station)
        if m:
            monthly[city] = {"state": state, "station": station, "monthly": m}
            print("OK")
            success_count += 1
        else:
            print("FAILED")
            fail_count += 1

    print(f"\nMonthly normals: {success_count} succeeded, {fail_count} failed")

    print("\n" + "=" * 60)
    print("PHASE 2: Pulling NOAA daily summaries (TSUN + TMAX/TMIN, 2023)...")
    print("=" * 60)
    daily = {}
    daily_success = 0
    daily_fail = 0
    for city, (state, station) in METROS.items():
        print(f"  {city:20s} ({state}) -> {station} ...", end=" ", flush=True)
        d = fetch_daily_sunshine(station, year=2023)
        if d:
            daily[city] = {"state": state, "station": station, **d}
            print(f"OK (sunny_days={d.get('sunny_days', '?')}/{d.get('days_with_data', '?')})")
            daily_success += 1
        else:
            print("FAILED")
            daily_fail += 1

    print(f"\nDaily summaries: {daily_success} succeeded, {daily_fail} failed")

    # Write combined output for phase 2
    proc_dir = Path("/home/mongo/projects/us-relocation-2026/sources/processed")
    proc_dir.mkdir(parents=True, exist_ok=True)
    out = {
        "source": {
            "name": "NOAA NCEI Climate Normals 1991-2020 + Daily Summaries 2023 — Phase 2",
            "monthly_url_pattern": NORMALS_BASE + "<station>.csv",
            "daily_url_pattern": DAILY_BASE + "?dataset=daily-summaries&...",
            "pulled_at": "2026-06-19T18:15:00Z",
            "retrieval_method": "curl (direct CSV downloads)",
        },
        "schema_version": "us-reloc-2026.v1",
        "monthly_normals": monthly,
        "daily_summaries": daily,
    }
    out_path = proc_dir / "noaa_climate_normals_phase2.json"
    out_path.write_text(json.dumps(out, indent=2, default=str))
    print(f"\nWrote {out_path}")

    # Quick preview
    if daily:
        print("\n=== Sunny days (2023) sorted ===")
        for city in sorted(daily, key=lambda x: -daily[x].get("sunny_days", 0)):
            d = daily[city]
            print(f"  {city:20s}  sunny_days={d['sunny_days']:3d}/{d['days_with_data']:3d}  "
                  f"max_temp_p90={d['max_temp_p90']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
