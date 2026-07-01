#!/usr/bin/env python3
"""Backfill `population` on relocation/locations.json from census_acs_cbsa.json.

Matching: strip " Metro Area"/" Micro Area" from the CBSA name, take the city
before the first comma and the *primary* state (first code in a hyphenated
list — locations.json lists multi-state CBSAs once, keyed on their primary
state, e.g. "Dallas-Fort Worth-Arlington, TX" for the TX portion of the
"Dallas-Fort Worth-Arlington, TX Metro Area" CBSA).

Runs over 939 CBSAs → 939 locations. Reports match rate and overwrites
sources/processed/relocation/locations.json in place.

Usage:
    python3 sources/scripts/backfill_population.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

PROCESSED = Path(__file__).resolve().parent.parent / "processed"
LOCATIONS_PATH = PROCESSED / "relocation" / "locations.json"
CENSUS_PATH = PROCESSED / "census_acs_cbsa.json"

_STATE_RE = re.compile(r"^[A-Z]{2}(?:-[A-Z]{2})*$")
_SUFFIX_RE = re.compile(r"\s+(Metro|Micro)\s+Area$")


def cbsa_key(name: str) -> tuple[str, str] | None:
    n = _SUFFIX_RE.sub("", name).strip()
    if "," not in n:
        return None
    city, _, state_part = n.rpartition(",")
    state_part = state_part.strip()
    if not _STATE_RE.match(state_part):
        return None
    return (city.strip().lower(), state_part.split("-")[0])


def loc_key(name: str, state: str) -> tuple[str, str]:
    return (name.split(",")[0].strip().lower(), state.upper())


def main() -> None:
    census = json.load(open(CENSUS_PATH))["cbsas"]
    locations = json.load(open(LOCATIONS_PATH))

    cbsa_by_key = {k: c for c in census if (k := cbsa_key(c["name"]))}
    loc_by_key = {loc_key(l["name"], l["state"]): l for l in locations}

    matched = 0
    unmatched_cbsa: list[str] = []
    for c in census:
        k = cbsa_key(c["name"])
        if k is None or k not in loc_by_key:
            unmatched_cbsa.append(c["name"])
            continue
        loc_by_key[k]["population"] = int(c["metrics"]["total_population"])
        matched += 1

    for l in locations:
        l.setdefault("population", 0)

    with open(LOCATIONS_PATH, "w") as f:
        json.dump(locations, f, indent=2, ensure_ascii=False)

    print(f"matched {matched}/{len(census)} CBSAs to locations")
    print(f"locations total: {len(locations)}")
    print(f"unmatched CBSAs: {len(unmatched_cbsa)}")
    if unmatched_cbsa:
        print("first 10 unmatched:")
        for u in unmatched_cbsa[:10]:
            print(f"  {u}")
    sample = next((l for l in locations if l.get("population", 0) > 0), None)
    if sample:
        print(f"sample populated: {sample['name']} → {sample['population']:,}")


if __name__ == "__main__":
    main()