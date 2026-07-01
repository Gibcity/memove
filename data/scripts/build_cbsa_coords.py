#!/usr/bin/env python3
"""
Build CBSA Gazetteer coordinates file.

Downloads the Census Bureau Gazetteer CBSA national file and extracts
latitude/longitude coordinates for all Core-Based Statistical Areas.

Uses the 2021 Gazetteer (pre-2023 redefinition) to match the 2022 ACS vintage
CBSA definitions (939 CBSAs). The 2025 Gazetteer uses post-2023 definitions
(935 CBSAs) which don't align.

Output: sources/processed/cbsa_gazetteer_coords.json
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

GAZ_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2021_Gazetteer/2021_Gaz_cbsa_national.zip"
GAZ_ZIP = os.path.join(PROJECT_ROOT, "sources", "raw", "census", "cbsa_gazetteer_2021.zip")
GAZ_TXT = os.path.join(PROJECT_ROOT, "sources", "raw", "census", "2021_Gaz_cbsa_national.txt")
ACS_JSON = os.path.join(PROJECT_ROOT, "sources", "processed", "census_acs_cbsa.json")
OUTPUT_JSON = os.path.join(PROJECT_ROOT, "sources", "processed", "cbsa_gazetteer_coords.json")


def download_gazetteer():
    """Download the Gazetteer zip if not already present."""
    if os.path.exists(GAZ_TXT):
        print(f"Gazetteer text file already exists: {GAZ_TXT}")
        return

    os.makedirs(os.path.dirname(GAZ_ZIP), exist_ok=True)

    import subprocess
    print(f"Downloading {GAZ_URL} ...")
    result = subprocess.run(
        ["curl", "-sL", "--connect-timeout", "30", "-o", GAZ_ZIP, GAZ_URL],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Download failed: {result.stderr}")
        sys.exit(1)

    print(f"Unzipping {GAZ_ZIP} ...")
    result = subprocess.run(
        ["unzip", "-o", GAZ_ZIP, "-d", os.path.dirname(GAZ_ZIP)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Unzip failed: {result.stderr}")
        sys.exit(1)

    print("Download and unzip complete.")


def parse_gazetteer():
    """
    Parse the Gazetteer text file.

    The 2021 Gazetteer is tab-separated with columns:
    CSAFP, GEOID, NAME, CBSA_TYPE, ALAND, AWATER, ALAND_SQMI, AWATER_SQMI, INTPTLAT, INTPTLONG

    Some rows omit the CSAFP column (no leading tab), so we detect the GEOID
    field by looking for a 5-digit numeric code.
    """
    coords = {}

    with open(GAZ_TXT, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Skip header
    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue

        parts = line.split('\t')

        # Find the 5-digit CBSA code
        geoid = None
        name = None
        for i, p in enumerate(parts):
            if re.match(r'^\d{5}$', p):
                geoid = p
                # Name is the next field after GEOID
                if i + 1 < len(parts):
                    name = parts[i + 1]
                break

        if geoid is None:
            print(f"WARNING: No 5-digit code found in: {parts[:5]}")
            continue

        lat = parts[-2]
        lng = parts[-1]

        try:
            coords[geoid] = {
                "lat": float(lat),
                "lng": float(lng),
                "name": name or "Unknown"
            }
        except ValueError:
            print(f"WARNING: Invalid lat/lng for {geoid}: lat={lat!r}, lng={lng!r}")
            continue

    return coords


def load_acs_cbsa_codes():
    """Load the list of CBSA codes from the ACS data."""
    with open(ACS_JSON, 'r') as f:
        data = json.load(f)

    codes = {}
    for cbsa in data['cbsas']:
        codes[cbsa['cbsa_code']] = cbsa['name']

    return codes


def verify(coords, acs_codes):
    """Run all verification checks."""
    print("\n=== VERIFICATION ===")

    # 1. Check all ACS codes have coordinates
    missing = set(acs_codes.keys()) - set(coords.keys())
    print(f"\n1. ACS codes matched: {len(acs_codes) - len(missing)} / {len(acs_codes)}")
    if missing:
        print(f"   MISSING ({len(missing)}):")
        for code in sorted(missing)[:20]:
            print(f"     {code}: {acs_codes[code]}")
        if len(missing) > 20:
            print(f"     ... and {len(missing) - 20} more")

    # Extra in Gazetteer
    extra = set(coords.keys()) - set(acs_codes.keys())
    if extra:
        print(f"   Extra in Gazetteer (not in ACS): {len(extra)}")

    # 2. Spot-check well-known CBSAs
    print("\n2. Spot checks:")
    spot_checks = {
        "31080": ("Los Angeles", 34.05, -118.24),
        "16980": ("Chicago", 41.88, -87.63),
        "46520": ("Honolulu", 21.3, -157.86),
    }
    for code, (name, exp_lat, exp_lng) in spot_checks.items():
        if code in coords:
            c = coords[code]
            lat_ok = abs(c['lat'] - exp_lat) < 1.0
            lng_ok = abs(c['lng'] - exp_lng) < 1.0
            status = "✓" if (lat_ok and lng_ok) else "✗"
            print(f"   {status} {name} ({code}): lat={c['lat']}, lng={c['lng']} "
                  f"(expected ~{exp_lat}, ~{exp_lng})")
        else:
            print(f"   ✗ {name} ({code}): NOT FOUND")

    # 3. US bounds check
    print("\n3. US bounds check:")
    out_of_bounds = []
    for code, c in coords.items():
        if code not in acs_codes:
            continue
        lat, lng = c['lat'], c['lng']
        if lat < 19 or lat > 72 or lng < -180 or lng > -65:
            out_of_bounds.append((code, lat, lng, c['name']))

    if out_of_bounds:
        print(f"   OUT OF BOUNDS ({len(out_of_bounds)}):")
        for code, lat, lng, name in out_of_bounds[:20]:
            print(f"     {code}: {name} lat={lat}, lng={lng}")
    else:
        print("   All coordinates within US bounds [19, 72] × [-180, -65] ✓")

    # 4. Zero values check
    print("\n4. Zero values check:")
    zeros = []
    for code, c in coords.items():
        if code not in acs_codes:
            continue
        if c['lat'] == 0.0 or c['lng'] == 0.0:
            zeros.append((code, c['lat'], c['lng'], c['name']))

    if zeros:
        print(f"   ZERO VALUES ({len(zeros)}):")
        for code, lat, lng, name in zeros:
            print(f"     {code}: {name} lat={lat}, lng={lng}")
    else:
        print("   No zero values ✓")


def main():
    download_gazetteer()
    coords = parse_gazetteer()
    acs_codes = load_acs_cbsa_codes()

    print(f"\nParsed {len(coords)} CBSA coordinates from Gazetteer")
    print(f"ACS data has {len(acs_codes)} CBSAs")

    # Filter to only ACS codes
    matched = {}
    for code in sorted(acs_codes.keys()):
        if code in coords:
            matched[code] = coords[code]
        else:
            print(f"WARNING: No Gazetteer coordinates for {code}: {acs_codes[code]}")

    # Build output
    output = {
        "metadata": {
            "source": "census_gazetteer_2021",
            "downloaded_at": datetime.now(timezone.utc).isoformat(),
            "source_url": GAZ_URL,
            "cbsa_count": len(matched),
            "note": "Uses 2021 Gazetteer (pre-2023 CBSA redefinition) to match 2022 ACS vintage definitions"
        },
        "coords": {code: matched[code] for code in sorted(matched.keys())}
    }

    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\nOutput written to: {OUTPUT_JSON}")

    # Verify
    verify(coords, acs_codes)


if __name__ == "__main__":
    main()
