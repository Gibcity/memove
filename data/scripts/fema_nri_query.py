"""Pull FEMA NRI County data from the ArcGIS FeatureServer and aggregate to state level.

Pulls all 3000+ US counties with their composite + per-hazard risk scores.
Saves raw county-level JSON to disk; produces a state-level aggregate JSON.

Usage: python3 fema_nri_query.py
"""
import json
import urllib.request
import ssl
from pathlib import Path
from collections import defaultdict

OUT_DIR = Path("/home/mongo/projects/us-relocation-2026/sources/raw/fema-nri")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# These are the fields we care about. Note: ArcGIS outFields needs the
# exact field name, comma-separated, no quotes.
OUT_FIELDS = ",".join([
    "STATE", "STATEABBRV", "STATEFIPS", "COUNTY", "COUNTYTYPE",
    "COUNTYFIPS", "STCOFIPS", "POPULATION",
    "RISK_SCORE", "RISK_RATNG", "RISK_NPCTL",
    "EAL_SCORE", "EAL_RATNG",
    "CFLD_RISKS", "CFLD_RISKR",
    "HAIL_RISKS", "HAIL_RISKR",
    "HWAV_RISKS", "HWAV_RISKR",
    "HRCN_RISKS", "HRCN_RISKR",
    "RFLD_RISKS", "RFLD_RISKR",
    "TRND_RISKS", "TRND_RISKR",
    "WFIR_RISKS", "WFIR_RISKR",
    "WNTW_RISKS", "WNTW_RISKR",
    "ERQK_RISKS", "ERQK_RISKR",
])

BASE_URL = (
    "https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/"
    "NRI_Counties_Prod_v1181_view/FeatureServer/0/query"
)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch_all():
    """Fetch all counties. The maxRecordCount is 2000, so we need pagination."""
    all_features = []
    offset = 0
    page = 0
    while True:
        params = (
            f"?where=1%3D1"
            f"&outFields={OUT_FIELDS}"
            f"&returnGeometry=false"
            f"&resultOffset={offset}"
            f"&resultRecordCount=2000"
            f"&f=json"
        )
        url = BASE_URL + params
        req = urllib.request.Request(url, headers={"User-Agent": "curl/8.0"})
        with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
            data = json.loads(resp.read())
        features = data.get("features", [])
        if not features:
            break
        all_features.extend(features)
        page += 1
        print(f"  page {page}: {len(features)} features (total so far: {len(all_features)})")
        if not data.get("exceededTransferLimit", False):
            break  # last page
        offset += len(features)
    return all_features

def to_records(features):
    """Convert ArcGIS features to plain dicts (drop geometry)."""
    out = []
    for f in features:
        attrs = f.get("attributes", {})
        out.append(attrs)
    return out

def aggregate_by_state(records):
    """Aggregate county-level NRI to state level, population-weighted.

    For each state: count of counties, total population, mean RISK_SCORE
    (population-weighted), max RISK_SCORE, count of counties in each RISK_RATNG
    bucket (Very Low / Relatively Low / Relatively Moderate / Relatively High / Very High).

    For per-hazard fields, report the state's max county rating — that's what
    the insurability gate actually cares about (one bad county fails the metro).
    """
    # Bucket weights for RISK_RATNG (FEMA's standard buckets)
    rating_order = ["Very Low", "Relatively Low", "Relatively Moderate", "Relatively High", "Very High"]
    hazard_fields = [
        "WFIR_RISKS", "TRND_RISKS", "RFLD_RISKS", "CFLD_RISKS",
        "HRCN_RISKS", "HAIL_RISKS", "HWAV_RISKS", "WNTW_RISKS",
        "ERQK_RISKS",
    ]
    hazard_rating_fields = [f.replace("_RISKS", "_RISKR") for f in hazard_fields]

    by_state = defaultdict(lambda: {
        "counties": 0,
        "population": 0,
        "risk_score_weighted_num": 0.0,
        "eal_score_weighted_num": 0.0,
        "max_risk_score": 0.0,
        "max_eal_score": 0.0,
        "rating_buckets": defaultdict(int),
        "hazard_max_rating": {hf: "Very Low" for hf in hazard_rating_fields},
        "hazard_max_score": {hf: 0.0 for hf in hazard_fields},
        "counties_in_top_quartile_risk": 0,
    })

    for r in records:
        st = r.get("STATEABBRV") or r.get("STATE") or "??"
        pop = r.get("POPULATION") or 0
        risk = r.get("RISK_SCORE") or 0
        eal = r.get("EAL_SCORE") or 0
        rating = r.get("RISK_RATNG") or "Very Low"
        pct = r.get("RISK_NPCTL") or 0

        s = by_state[st]
        s["counties"] += 1
        s["population"] += pop
        s["risk_score_weighted_num"] += risk * pop
        s["eal_score_weighted_num"] += eal * pop
        s["max_risk_score"] = max(s["max_risk_score"], risk)
        s["max_eal_score"] = max(s["max_eal_score"], eal)
        s["rating_buckets"][rating] += 1
        if pct >= 75:
            s["counties_in_top_quartile_risk"] += 1
        for hf in hazard_fields:
            score = r.get(hf) or 0
            if score > s["hazard_max_score"][hf]:
                s["hazard_max_score"][hf] = score
        for hrf in hazard_rating_fields:
            cur = s["hazard_max_rating"][hrf]
            rk = r.get(hrf) or "Very Low"
            # Higher rank index = worse; use ordering
            if rk in rating_order and cur in rating_order:
                if rating_order.index(rk) > rating_order.index(cur):
                    s["hazard_max_rating"][hrf] = rk

    # Finalize: divide weighted sums, round, convert rating_buckets to dict
    aggregated = {}
    for st, s in by_state.items():
        if s["population"] > 0:
            avg_risk = s["risk_score_weighted_num"] / s["population"]
            avg_eal = s["eal_score_weighted_num"] / s["population"]
        else:
            avg_risk = 0
            avg_eal = 0
        aggregated[st] = {
            "state": st,
            "n_counties": s["counties"],
            "population": s["population"],
            "risk_score_pop_weighted": round(avg_risk, 4),
            "eal_score_pop_weighted": round(avg_eal, 4),
            "max_county_risk_score": round(s["max_risk_score"], 4),
            "max_county_eal_score": round(s["max_eal_score"], 4),
            "counties_in_top_quartile_risk": s["counties_in_top_quartile_risk"],
            "rating_buckets": dict(s["rating_buckets"]),
            "hazard_max_rating": s["hazard_max_rating"],
            "hazard_max_score": {k: round(v, 4) for k, v in s["hazard_max_score"].items()},
        }

    return aggregated

if __name__ == "__main__":
    print("Pulling FEMA NRI county data (this takes ~30s for ~3000 counties)...")
    features = fetch_all()
    print(f"\nTotal counties fetched: {len(features)}")
    records = to_records(features)
    out_raw = OUT_DIR / "nri_counties_raw.json"
    out_raw.write_text(json.dumps(records, indent=2))
    print(f"Wrote {out_raw} ({out_raw.stat().st_size:,} bytes)")

    print("\nAggregating by state...")
    agg = aggregate_by_state(records)
    out_agg = OUT_DIR / "nri_state_aggregate.json"
    out_agg.write_text(json.dumps(agg, indent=2))
    print(f"Wrote {out_agg} ({len(agg)} states)")

    # Quick preview: states sorted by max-county risk score
    print("\n=== Top 10 states by max-county composite risk score ===")
    for st, s in sorted(agg.items(), key=lambda x: -x[1]["max_county_risk_score"])[:10]:
        print(f"  {st:3s}  max_county_risk={s['max_county_risk_score']:7.2f}  "
              f"pop_weighted={s['risk_score_pop_weighted']:7.2f}  "
              f"top_quartile_counties={s['counties_in_top_quartile_risk']}/{s['n_counties']}")
    print("\n=== Bottom 10 states by max-county composite risk score ===")
    for st, s in sorted(agg.items(), key=lambda x: x[1]["max_county_risk_score"])[:10]:
        print(f"  {st:3s}  max_county_risk={s['max_county_risk_score']:7.2f}  "
              f"pop_weighted={s['risk_score_pop_weighted']:7.2f}  "
              f"top_quartile_counties={s['counties_in_top_quartile_risk']}/{s['n_counties']}")
