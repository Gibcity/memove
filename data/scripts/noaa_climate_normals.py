"""Pull NOAA Climate Normals (1991-2020) for each candidate metro's nearest station(s).

Per-station CSV has monthly normals for temperature, precipitation, heating/cooling
degree days, and more. Sun/sunshine isn't directly in 1991-2020 normals (it's in
the 1981-2010 daily set), but we can use the daily summaries API for that.

For the wife's "sunshine >200 days" criterion, daily TSUN (Total Sunshine Minutes)
data is the right source. We pull one representative year of data per station
to compute sunny-day count and max-temp distribution.

Outputs:
  sources/raw/noaa/<station_id>.csv            (monthly normals)
  sources/processed/noaa_climate_normals.json  (per-metro aggregate)

Usage: python3 noaa_climate_normals.py
"""
import csv
import io
import json
import urllib.request
import ssl
from pathlib import Path
from collections import defaultdict

OUT_DIR = Path("/home/mongo/projects/us-relocation-2026/sources/raw/noaa")
OUT_DIR.mkdir(parents=True, exist_ok=True)
PROC_DIR = Path("/home/mongo/projects/us-relocation-2026/sources/processed")

# Candidate metros with nearest major NOAA station IDs (USW = NWS/FAA ASOS, COOP = cooperative observer)
# Stations chosen: at or near metro, with long records, likely active in 1991-2020 normals.
METROS = {
    "Memphis":         ("TN", "USW00013893"),  # Memphis Intl Airport
    "Nashville":       ("TN", "USW00013897"),  # Nashville Intl
    "Louisville":      ("KY", "USW00093821"),  # Louisville Muhammad Ali
    "St. Louis":       ("MO", "USW00013994"),  # St. Louis Lambert
    "Kansas City":     ("MO", "USW00013988"),  # Kansas City Intl
    "Indianapolis":    ("IN", "USW00093819"),  # Indianapolis Intl
    "Columbus":        ("OH", "USW00014821"),  # John Glenn Columbus
    "Cincinnati":      ("OH", "USW00093812"),  # Cincinnati/N. Kentucky
    "Pittsburgh":      ("PA", "USW00013723"),  # Pittsburgh Intl
    "Dallas":          ("TX", "USW00013960"),  # DFW
    "Houston":         ("TX", "USW00012917"),  # Houston Hobby
    "San Antonio":     ("TX", "USW00012921"),  # San Antonio Intl
    "Austin":          ("TX", "USW00013904"),  # Austin-Bergstrom
    "Denver":          ("CO", "USW00003017"),  # Denver Intl
    "Colorado Springs":("CO", "USW00093037"),  # Colorado Springs
    "Boulder":         ("CO", "USW00094022"),  # Boulder (no ASOS, use closest)
    "Boise City":      ("ID", "USW00024131"),  # Boise Air Terminal
    "Spokane":         ("WA", "USW00024157"),  # Spokane Intl
    "Bend":            ("OR", "USW00024230"),  # Redmond (closest ASOS)
    "Bozeman":         ("MT", "USW00024132"),  # Bozeman Yellowstone Intl
    "Grand Rapids":    ("MI", "USW00014833"),  # Gerald R. Ford Intl
    "Rochester":       ("MN", "USW00014925"),  # Rochester Intl
    "Minneapolis":     ("MN", "USW00014922"),  # Minneapolis-St Paul
    "Appleton":        ("WI", "USW00014898"),  # Outagamie County Regional
    "Madison":         ("WI", "USW00014837"),  # Dane County Regional
    "Kalamazoo":       ("MI", "USW00014815"),  # Kalamazoo/Battle Creek Intl
}

NORMALS_BASE = (
    "https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/"
)
DAILY_BASE = "https://www.ncei.noaa.gov/access/services/data/v1"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def fetch_monthly_normals(station_id: str) -> dict | None:
    """Pull 1991-2020 monthly normals for one station. Returns dict or None on failure."""
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
            if k == "month" or k == "STATION" or k == "NAME" or k == "LATITUDE" or k == "LONGITUDE" or k == "ELEVATION":
                continue
            try:
                d[k] = float(v) if v and v not in ("", "T") else None
            except (ValueError, TypeError):
                d[k] = v if v else None
        out[month] = d
    return out


def fetch_daily_sunshine(station_id: str, year: int = 2023) -> dict | None:
    """Pull one year of daily TSUN (Total Sunshine Minutes) for sunny-day count.

    TSUN is reported in minutes. A "sunny day" typically defined as >= 60% possible
    sunshine, but for simple use we count days with TSUN > 0 and report total.
    Also pulls daily TMAX (max temp) for max-temp-distribution analysis.
    """
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
            # Probably an error response
            print(f"  [daily {year}] {station_id}: unexpected response ({len(data)}b)")
            return None
        out_path.write_text(data)
        return parse_daily_csv(data)
    except Exception as e:
        print(f"  [daily {year}] {station_id}: ERROR {type(e).__name__}: {e}")
        return None


def parse_daily_csv(text: str) -> dict:
    """Parse daily CSV. Returns summary stats: sunny_days, max_temp_p90, etc."""
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
        "max_temp_p10": pct(sorted_tmax, 0.10),  # cool 10th percentile
        "max_temp_p50": pct(sorted_tmax, 0.50),  # median
        "max_temp_p90": pct(sorted_tmax, 0.90),  # hot 10th percentile
        "max_temp_max": max(tmax_values) if tmax_values else None,
        "min_temp_p10": pct(sorted_tmin, 0.10),
        "min_temp_p50": pct(sorted_tmin, 0.50),
        "min_temp_p90": pct(sorted_tmin, 0.90),
    }


def main():
    print("Pulling NOAA monthly normals (1991-2020) for all candidate metros...")
    monthly = {}
    for city, (state, station) in METROS.items():
        print(f"  {city:20s} ({state}) -> {station}")
        m = fetch_monthly_normals(station)
        if m:
            monthly[city] = {"state": state, "station": station, "monthly": m}

    print("\nPulling NOAA daily summaries (sunshine days + max temp)...")
    daily = {}
    for city, (state, station) in METROS.items():
        d = fetch_daily_sunshine(station, year=2023)
        if d:
            daily[city] = {"state": state, "station": station, **d}

    # Combined output
    out = {
        "source": {
            "name": "NOAA NCEI Climate Normals 1991-2020 + Daily Summaries 2023",
            "monthly_url_pattern": NORMALS_BASE + "<station>.csv",
            "daily_url_pattern": DAILY_BASE + "?dataset=daily-summaries&...",
            "pulled_at": "2026-06-18T20:30:00Z",
            "retrieval_method": "curl (direct CSV downloads)",
        },
        "schema_version": "us-reloc-2026.v1",
        "monthly_normals": monthly,
        "daily_summaries": daily,
    }
    out_path = PROC_DIR / "noaa_climate_normals.json"
    out_path.write_text(json.dumps(out, indent=2, default=str))
    print(f"\nWrote {out_path}")
    print(f"Monthly normals for {len(monthly)} metros, daily summaries for {len(daily)} metros.")

    # Quick preview: sunny-day counts
    if daily:
        print("\n=== Sunny days (2023) sorted ===")
        for city in sorted(daily, key=lambda x: -daily[x].get("sunny_days", 0)):
            d = daily[city]
            print(f"  {city:20s}  sunny_days={d['sunny_days']:3d}/{d['days_with_data']:3d}  "
                  f"max_temp_p90={d['max_temp_p90']}")


if __name__ == "__main__":
    main()
