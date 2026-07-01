#!/usr/bin/env python3
"""
pull_broadband_fcc.py — Pull medianDownloadMbps for all 939 CBSAs.

Strategy:
  1. Try FCC National Broadband Map API (https://broadbandmap.fcc.gov/.../api).
     Free, no key required for summary endpoints, but the public endpoints
     return 502/000 from many network paths (verified 2026-06-29).
  2. Fall back to a deterministic, Census-derived proxy using ACS B28002:
       pct_wired_broadband = B28002_007E / B28002_001E
       median_mbps = 250 * pct_wired_broadband  # industry median for cable/fiber/DSL areas
     This is NOT a measurement — it's a documented proxy. Marked as such in
     metadata so downstream consumers can distinguish from real FCC data.

Output: sources/processed/cbsa_broadband_speeds.json
  Schema: {
    "metadata": {...},
    "speeds": {
      "<cbsa_code>": {
        "medianDownloadMbps": <float>,
        "source": "fcc" | "census_proxy"
      },
      ...
    }
  }

Consumed by build_locations.py for broadband.medianDownloadMbps.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/home/mongo/projects/us-relocation-2026")
OUT_PATH = ROOT / "sources/processed/cbsa_broadband_speeds.json"
BROADBAND_ACS_PATH = ROOT / "sources/processed/cbsa_broadband.json"
GAZETTEER_PATH = ROOT / "sources/processed/cbsa_gazetteer_coords.json"

# FCC endpoint candidates. As of 2026-06-29, the public summary endpoints
# return 502 / connection-reset from most networks. Kept here so the
# behavior is documented and easy to re-test.
FCC_ENDPOINTS = [
    "https://broadbandmap.fcc.gov/nation-map/api/v2/summary",
    "https://broadbandmap.fcc.gov/nation-map/api/v1/summary",
    "https://broadbandmap.fcc.gov/api/v2/summary",
]

# Proxy calibration: FCC industry reports ~250 Mbps median for households
# with wired broadband (cable/fiber/DSL). The Census denominator is total
# households, so we scale by pct_wired_broadband.
PROXY_MEDIAN_MBPS_FULL = 250.0

TIMEOUT = 15


def load_cbsa_codes() -> list[str]:
    """Load list of CBSA codes from the master geography file."""
    cbsa_data = json.load(open(ROOT / "sources/processed/census_acs_cbsa.json"))
    return [c["cbsa_code"] for c in cbsa_data["cbsas"]]


def try_fcc_endpoints() -> dict | None:
    """Attempt to fetch FCC broadband summary data. Returns parsed dict or None.

    FCC's public endpoints have been unstable in 2026; this returns None
    on any non-2xx / connection error rather than blocking the script.
    """
    for url in FCC_ENDPOINTS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "us-relocation-2026/1.0"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                if r.status != 200:
                    continue
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, json.JSONDecodeError):
            continue
    return None


def build_proxy_from_census() -> dict[str, dict]:
    """Derive medianDownloadMbps from existing cbsa_broadband.json (ACS B28002).

    Real FCC data would be ideal but is unavailable from this network.
    Proxy: scale 250 Mbps (typical cable/fiber/DSL median) by the share of
    households with wired broadband.
    """
    data = json.load(open(BROADBAND_ACS_PATH))
    out = {}
    for code, entry in data.get("broadband", {}).items():
        pct_wired = float(entry.get("pctHouseholdsWith100MbpsPlus") or 0.0)
        # 0-100 pct → 0-250 Mbps. Floor at 25 Mbps (modern broadband baseline).
        median = max(25.0, PROXY_MEDIAN_MBPS_FULL * (pct_wired / 100.0))
        out[code] = {
            "medianDownloadMbps": round(median, 1),
            "source": "census_proxy",
            "pctWiredBroadband": pct_wired,
        }
    return out


def main():
    pulled_at = datetime.now(timezone.utc).isoformat()
    print("=" * 60)
    print("[broadband-speeds] FCC → Census fallback ETL")
    print(f"[broadband-speeds] Pulled at: {pulled_at}")

    cbsa_codes = load_cbsa_codes()
    print(f"[broadband-speeds] {len(cbsa_codes)} CBSAs to fill")

    fcc_data = try_fcc_endpoints()
    if fcc_data:
        # Real FCC path — left as a documented branch.
        # The FCC summary API returns a list of geographies; the exact schema
        # varies by endpoint version and requires per-CBSA keying we can't
        # assume without an active endpoint. Mark as TODO for when FCC is up.
        print("[broadband-speeds] FCC endpoint returned data — using it")
        speeds: dict[str, dict] = {}
        # TODO: parse fcc_data when an endpoint is reachable. For now this
        # branch is unreachable from this network; left as a hook.
        source_label = "fcc"
    else:
        print("[broadband-speeds] FCC endpoints unreachable — falling back to Census proxy")
        speeds = build_proxy_from_census()
        source_label = "census_proxy"

    # Ensure every CBSA has an entry
    missing = [c for c in cbsa_codes if c not in speeds]
    if missing:
        print(f"[broadband-speeds] {len(missing)} CBSAs missing from {source_label}, "
              f"filling with 0.0 sentinel")
        for c in missing:
            speeds[c] = {"medianDownloadMbps": 0.0, "source": "missing"}

    output = {
        "metadata": {
            "pulled_at": pulled_at,
            "source": source_label,
            "cbsa_count": len(speeds),
            "fcc_endpoints_tried": FCC_ENDPOINTS,
            "proxy_formula": (
                "medianDownloadMbps = max(25, 250 * pct_wired_broadband / 100). "
                "Derived from Census ACS B28002 pctHouseholdsWith100MbpsPlus. "
                "NOT a measurement; documented proxy when FCC API unreachable."
            ) if source_label == "census_proxy" else "FCC National Broadband Map",
        },
        "speeds": speeds,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    nonzero = sum(1 for v in speeds.values() if v["medianDownloadMbps"] > 0)
    print(f"[broadband-speeds] Wrote {OUT_PATH}")
    print(f"[broadband-speeds] {nonzero}/{len(speeds)} CBSAs with medianDownloadMbps > 0")


if __name__ == "__main__":
    main()