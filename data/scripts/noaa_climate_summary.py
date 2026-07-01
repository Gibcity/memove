"""Build a per-metro climate summary from NOAA 1991-2020 monthly normals.

For each metro, computes:
- Annual avg max/min/avg temp
- # days/year max temp > 90F (MLY-TMAX-AVGNDS-GRTH090 sum)
- # days/year max temp > 100F
- # days/year min temp < 32F (freeze days)
- Total annual precipitation
- Total annual snowfall
- "Sunny day" proxy: 365 - precip_days - snow_days
  (precip_days from MLY-PRCP-AVGNDS-GE001HI, snow_days from MLY-SNOW-AVGNDS-GE001TI)
- Heating/cooling degree days annual totals
- The actual MLY-TMAX-AVGNDS-GRTH090 is the *wife's* criterion: "no higher than 90 degrees"
  ("90% of time <= 75" can't be computed from monthly normals — would need daily data)

Outputs: sources/processed/noaa_climate_summary.json
"""
import csv
import io
import json
from pathlib import Path

NORMALS_DIR = Path("/home/mongo/projects/us-relocation-2026/sources/raw/noaa")
OUT_PATH = Path("/home/mongo/projects/us-relocation-2026/sources/processed/noaa_climate_summary.json")

# Columns we want from monthly normals
WANTED_COLS = {
    "MLY-TAVG-NORMAL": "temp_avg",
    "MLY-TMAX-NORMAL": "temp_max_avg",
    "MLY-TMIN-NORMAL": "temp_min_avg",
    "MLY-TMAX-AVGNDS-GRTH090": "days_max_gt_90F",
    "MLY-TMAX-AVGNDS-GRTH100": "days_max_gt_100F",
    "MLY-TMIN-AVGNDS-LSTH032": "days_min_lt_32F",
    "MLY-PRCP-NORMAL": "precip_in",
    "MLY-PRCP-AVGNDS-GE001HI": "precip_days",
    "MLY-SNOW-NORMAL": "snow_in",
    "MLY-SNOW-AVGNDS-GE001TI": "snow_days",
    "MLY-HTDD-NORMAL": "hdd",
    "MLY-CLDD-NORMAL": "cldd",
}


def parse_station_csv(path: Path) -> dict:
    """Parse one station's monthly normals CSV and return a summary."""
    if not path.exists():
        return None
    text = path.read_text()
    reader = csv.DictReader(io.StringIO(text))
    months = {}
    for row in reader:
        m = row.get("month", "").zfill(2)
        if not m:
            continue
        d = {}
        for col, alias in WANTED_COLS.items():
            v = row.get(col, "")
            if v is None or v.strip() in ("", "T"):
                continue
            try:
                d[alias] = float(v.strip())
            except ValueError:
                pass
        months[m] = d
    if not months:
        return None
    # Annual aggregations
    out = {"monthly": months}
    # Sums / means across 12 months
    for col, alias in [
        ("days_max_gt_90F", "annual_days_max_gt_90F"),
        ("days_max_gt_100F", "annual_days_max_gt_100F"),
        ("days_min_lt_32F", "annual_days_min_lt_32F"),
        ("precip_in", "annual_precip_in"),
        ("precip_days", "annual_precip_days"),
        ("snow_in", "annual_snow_in"),
        ("snow_days", "annual_snow_days"),
        ("hdd", "annual_hdd"),
        ("cldd", "annual_cldd"),
    ]:
        vals = [months[m][col] for m in months if col in months.get(m, {})]
        if vals:
            out[alias] = round(sum(vals), 2)

    # Annual means
    for col, alias in [
        ("temp_avg", "annual_temp_avg"),
        ("temp_max_avg", "annual_temp_max_avg"),
        ("temp_min_avg", "annual_temp_min_avg"),
    ]:
        vals = [months[m][col] for m in months if col in months.get(m, {})]
        if vals:
            out[alias] = round(sum(vals) / len(vals), 1)

    # Hottest-month + coldest-month
    max_temp_vals = [(m, months[m].get("temp_max_avg")) for m in months]
    max_temp_vals = [(m, v) for m, v in max_temp_vals if v is not None]
    if max_temp_vals:
        hottest = max(max_temp_vals, key=lambda x: x[1])
        coldest = min(max_temp_vals, key=lambda x: x[1])
        out["hottest_month"] = {"month": hottest[0], "temp_max_avg": hottest[1]}
        out["coldest_month"] = {"month": coldest[0], "temp_max_avg": coldest[1]}

    # "Sunny day" proxy
    precip_days = out.get("annual_precip_days")
    snow_days = out.get("annual_snow_days")
    if precip_days is not None:
        # Clear days: not precip AND not snow-day (approximate)
        snow = snow_days or 0
        # Snow days already included in precip days for many stations; conservative: max of the two
        covered_days = max(precip_days, snow + (precip_days - snow) if snow else precip_days)
        out["sunny_day_proxy"] = round(365 - precip_days, 0)  # simpler: just 365 - precip days

    # Wife's criterion: # days/yr with max > 90F
    # "no higher than 90 degrees" → wants <30 days/yr > 90F roughly
    return out


def main():
    # Get station name from each file path
    summaries = {}
    for path in sorted(NORMALS_DIR.glob("*_monthly.csv")):
        station_id = path.stem.replace("_monthly", "")
        s = parse_station_csv(path)
        if s is None:
            continue
        # Pull station name from CSV
        with open(path) as f:
            first_row = next(csv.DictReader(f))
        s["station_name"] = first_row.get("NAME", "").strip()
        s["lat"] = float(first_row.get("LATITUDE", "0").strip() or 0)
        s["lon"] = float(first_row.get("LONGITUDE", "0").strip() or 0)
        s["elevation_ft"] = float(first_row.get("ELEVATION", "0").strip() or 0)
        summaries[station_id] = s

    out = {
        "source": {
            "name": "NOAA NCEI 1991-2020 Climate Normals — Monthly Summaries",
            "url": "https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/",
            "pulled_at": "2026-06-18T20:45:00Z",
            "retrieval_method": "curl (direct CSV per station)",
            "notes": "Sunny days are a proxy (365 - precip_days), not direct measurement. "
                     "Direct sunshine measurement (TSUN) was discontinued at US ASOS stations around 2009.",
        },
        "schema_version": "us-reloc-2026.v1",
        "summaries": summaries,
    }
    OUT_PATH.write_text(json.dumps(out, indent=2, default=str))
    print(f"Wrote {OUT_PATH} ({len(summaries)} stations)")

    # Pretty print sorted by annual_days_max_gt_90F
    print("\n=== Annual # days/yr max temp > 90F (wife's 'no higher than 90F' criterion) ===")
    sorted_by_90 = sorted(
        summaries.items(),
        key=lambda x: x[1].get("annual_days_max_gt_90F", 999)
    )
    for sid, s in sorted_by_90:
        days90 = s.get("annual_days_max_gt_90F", "?")
        days100 = s.get("annual_days_max_gt_100F", "?")
        freeze = s.get("annual_days_min_lt_32F", "?")
        sunny = s.get("sunny_day_proxy", "?")
        print(f"  {s['station_name']:30s}  >90F: {days90:>4}  >100F: {days100:>4}  freeze: {freeze:>4}  sunny_proxy: {sunny:>4}")

    print("\n=== Wife's 'sunny > 200 days' criterion ===")
    print("(proxy = 365 - annual_precip_days, doesn't account for cloudiness without precipitation)")
    for sid, s in sorted_by_90:
        sunny = s.get("sunny_day_proxy", 0)
        precip = s.get("annual_precip_days", "?")
        print(f"  {s['station_name']:30s}  sunny_proxy={sunny:.0f}  precip_days={precip}")


if __name__ == "__main__":
    main()
