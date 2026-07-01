#!/usr/bin/env python3
"""
pull_education_nces.py — Augment cbsa_education.json with NCES CCD student-teacher ratios.

Source: Urban Institute Education Data Portal mirror of NCES CCD
"Public School District Universe" — the same data NCES publishes, but
served as a free, paginated, no-API-key JSON API.

Endpoint:
  https://educationdata.urban.org/api/v1/school-districts/ccd/directory/<year>/

Fields used:
  leaid, lea_name, cbsa, enrollment, teachers_total_fte

Aggregation to CBSA:
  Enrollment-weighted mean student-teacher ratio. Districts with zero
  enrollment or zero FTE are dropped (they're closed / non-operational
  and would otherwise tank the ratio). The result is a CBSA-level
  students-per-teacher ratio — i.e. what NCES itself reports at the
  district level, averaged up.

  ratio_CBSA = sum(enroll_d) / sum(teachers_total_fte_d)   for d in CBSA

District-level cbsa is taken straight from the feed (NCES pre-joins
district → county → CBSA via Census delineation files). Districts with
cbsa == -2 (not in any metro/micro area) are skipped.

Output: extends sources/processed/cbsa_education.json with
  studentTeacherRatio (float) on each CBSA entry.

Usage:
  python3 sources/scripts/pull_education_nces.py
  python3 sources/scripts/build_locations.py   # re-emit locations.json
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/home/mongo/projects/us-relocation-2026")
EDU_PATH = ROOT / "sources/processed/cbsa_education.json"

YEAR = 2022  # NCES CCD SY 2021-22 — most recent stable in the portal
PAGE_SIZE = 10_000
BASE = f"https://educationdata.urban.org/api/v1/school-districts/ccd/directory/{YEAR}/"
HEADERS = {"User-Agent": "us-relocation-2026/1.0"}


def fetch_page(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_all_districts() -> list[dict]:
    """Paginate through every CCD LEA record."""
    out: list[dict] = []
    url = f"{BASE}?limit={PAGE_SIZE}"
    page = 0
    while url:
        page += 1
        data = fetch_page(url)
        out.extend(data["results"])
        nxt = data.get("next")
        if not nxt:
            break
        # next URL has its own page= param; normalize to PAGE_SIZE each time.
        parsed = urllib.parse.urlparse(nxt)
        qs = urllib.parse.parse_qs(parsed.query)
        qs["limit"] = [str(PAGE_SIZE)]
        url = urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(qs, doseq=True)))
        time.sleep(0.05)  # be polite
    print(f"[nces] fetched {len(out)} LEA records across {page} pages")
    return out


def aggregate_to_cbsa(districts: list[dict]) -> dict[str, dict]:
    """CBSA → {enrollment, teachers_total_fte, district_count, leaid_list (sample)}."""
    bucket: dict[str, dict] = defaultdict(
        lambda: {"enrollment": 0, "teachers_total_fte": 0.0, "district_count": 0, "_names_sample": []}
    )
    skipped_no_cbsa = skipped_no_data = 0
    for d in districts:
        cbsa = d.get("cbsa")
        if cbsa is None or cbsa == -2:
            skipped_no_cbsa += 1
            continue
        enr = d.get("enrollment")
        fte = d.get("teachers_total_fte")
        if not enr or not fte:
            skipped_no_data += 1
            continue
        # CBSA field is an int but key as string everywhere else.
        key = str(cbsa)
        b = bucket[key]
        b["enrollment"] += int(enr)
        b["teachers_total_fte"] += float(fte)
        b["district_count"] += 1
        if len(b["_names_sample"]) < 3:
            b["_names_sample"].append(d.get("lea_name", "?"))
    print(f"[nces] skipped {skipped_no_cbsa} (no CBSA), {skipped_no_data} (no enroll/FTE)")

    out: dict[str, dict] = {}
    for cbsa, b in bucket.items():
        if b["teachers_total_fte"] <= 0:
            continue
        ratio = round(b["enrollment"] / b["teachers_total_fte"], 1)
        out[cbsa] = {
            "studentTeacherRatio": ratio,
            "_source": {
                "nces_year": YEAR,
                "district_count": b["district_count"],
                "total_enrollment": b["enrollment"],
                "total_teachers_fte": b["teachers_total_fte"],
                "sample_districts": b["_names_sample"],
            },
        }
    return out


def main() -> None:
    pulled_at = datetime.now(timezone.utc).isoformat()
    print("=" * 60)
    print("[nces] Urban Institute / NCES CCD district directory pull")
    print(f"[nces] year={YEAR}  page_size={PAGE_SIZE}")

    districts = fetch_all_districts()
    cbsa_ratios = aggregate_to_cbsa(districts)
    print(f"[nces] {len(cbsa_ratios)} CBSAs got a real student-teacher ratio")

    # Merge into existing cbsa_education.json
    edu = json.loads(EDU_PATH.read_text())
    edu_edu = edu.get("education", {})
    matched = added = 0
    for cbsa, info in cbsa_ratios.items():
        if cbsa in edu_edu:
            edu_edu[cbsa]["studentTeacherRatio"] = info["studentTeacherRatio"]
            matched += 1
        else:
            edu_edu[cbsa] = {"studentTeacherRatio": info["studentTeacherRatio"]}
            added += 1

    # Update metadata block.
    meta = edu.setdefault("metadata", {})
    meta["nces_ccd"] = {
        "source": "Urban Institute Education Data Portal mirror of NCES CCD district directory",
        "endpoint": BASE,
        "year": YEAR,
        "pulled_at": pulled_at,
        "cbsas_with_ratio": len(cbsa_ratios),
        "matched_existing_education_records": matched,
        "added_new_records": added,
        "aggregation": "enrollment-weighted: ratio = sum(enrollment) / sum(teachers_total_fte)",
        "skipped_districts": {
            "no_cbsa": "cbsa == -2 (not in any CBSA) — rural / territorial districts",
            "no_enrollment_or_fte": "closed or non-operational districts",
        },
    }
    # Promote derived_fields note — studentTeacherRatio is no longer missing.
    df = meta.get("derived_fields", {})
    df["studentTeacherRatio"] = "NCES CCD, enrollment-weighted CBSA average, SY 2021-22"
    meta["derived_fields"] = df
    meta["last_merged_at"] = pulled_at

    EDU_PATH.write_text(json.dumps(edu, indent=2))
    print(f"[nces] wrote {EDU_PATH}")
    print(f"[nces] matched {matched}, added {added} CBSA education entries")

    # Sanity: national-ish stat
    total_enr = sum(v["_source"]["total_enrollment"] for v in cbsa_ratios.values())
    total_fte = sum(v["_source"]["total_teachers_fte"] for v in cbsa_ratios.values())
    nat_ratio = round(total_enr / total_fte, 2) if total_fte else None
    print(f"[nces] CBSA-coverage totals: enrollment={total_enr:,} fte={total_fte:,.0f} -> {nat_ratio} students/teacher (national avg reference)")


if __name__ == "__main__":
    main()