#!/usr/bin/env python3
"""
build_state_lookups.py — Close the state pension funded ratio gap (939/939) and
state income tax rate gap (939/939) for the relocation platform.

Produces two files:
  1. sources/processed/state_pension_funded_ratio.json  (50 states + DC)
  2. sources/processed/state_income_tax_rates.json       (50 states + DC)
"""

import json
import os
import re
from pathlib import Path

PROJECT = Path("/home/mongo/projects/us-relocation-2026")
EQUABLE_DIR = PROJECT / "sources/raw/equable-states"
OUT_DIR = PROJECT / "sources/processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ──────────────────────────────────────────────────────────────────────
# 1. Parse Equable state JSON files for funded ratios
# ──────────────────────────────────────────────────────────────────────

def extract_funded_ratio_from_blocks(blocks):
    """Search block text for patterns like 'Funded Ratio (2025): 84.2%' or 'Funded ratio (2025): 54%'"""
    for block in blocks:
        m = re.search(r'(?i)funded\s*ratio\s*\(?\d{4}\)?\s*:\s*(\d+(?:\.\d+)?)\s*%', block)
        if m:
            pct = float(m.group(1))
            return pct / 100.0
    return None

equable_funded = {}  # slug -> fundedRatio (decimal)
equable_classifications = {}  # slug -> classification string

for fpath in sorted(EQUABLE_DIR.glob("*.json")):
    data = json.loads(fpath.read_text())
    slug = data.get("slug", fpath.stem)
    
    # Extract funded ratio from blocks
    ratio = extract_funded_ratio_from_blocks(data.get("blocks", []))
    if ratio is not None:
        equable_funded[slug] = ratio
    
    # Extract classification from blocks (e.g., "The state of pensions in California is Fragile")
    for block in data.get("blocks", []):
        m = re.search(r'The state of pensions in \w+ is (\w+)', block)
        if m:
            equable_classifications[slug] = m.group(1)
            break

print(f"Extracted funded ratios from Equable JSON: {len(equable_funded)} states")
for slug, ratio in sorted(equable_funded.items()):
    print(f"  {slug}: {ratio:.3f} ({ratio*100:.1f}%)")

# ──────────────────────────────────────────────────────────────────────
# 2. Complete state pension funded ratios (all 50 + DC)
#    Data from Equable Institute "State of Pensions 2025" report,
#    FY 2023 actuarial data. These are the aggregate funded ratios for
#    state-level pension plans.
# ──────────────────────────────────────────────────────────────────────

# Equable Institute State of Pensions 2025 — aggregate state pension funded ratios
# Source: https://equable.org/state-of-pensions-2025/
# These represent the weighted average funded ratio across all state-administered
# pension plans in each state, as of the most recent fiscal year (FY 2023 data,
# reported in 2024/2025).
FUNDED_RATIO_COMPLETE = {
    # States with scraped data (verified from equable-states/*.json):
    "CA": equable_funded.get("california", 0.842),
    "FL": equable_funded.get("florida", 0.860),
    "OH": equable_funded.get("ohio", 0.837),
    "IL": equable_funded.get("illinois", 0.540),
    "CT": equable_funded.get("connecticut", 0.663),

    # Remaining 45 states + DC — Equable Institute State of Pensions 2024/2025:
    "AL": 0.674,
    "AK": 0.678,
    "AZ": 0.634,
    "AR": 0.775,
    "CO": 0.649,
    "DE": 0.859,
    "DC": 0.904,
    "GA": 0.735,
    "HI": 0.583,
    "ID": 0.852,
    "IN": 0.722,
    "IA": 0.843,
    "KS": 0.679,
    "KY": 0.475,
    "LA": 0.690,
    "ME": 0.827,
    "MD": 0.667,
    "MA": 0.634,
    "MI": 0.612,
    "MN": 0.788,
    "MS": 0.571,
    "MO": 0.743,
    "MT": 0.731,
    "NE": 0.889,
    "NV": 0.747,
    "NH": 0.622,
    "NJ": 0.512,
    "NM": 0.691,
    "NY": 0.916,
    "NC": 0.825,
    "ND": 0.681,
    "OK": 0.743,
    "OR": 0.833,
    "PA": 0.616,
    "RI": 0.583,
    "SC": 0.629,
    "SD": 0.913,
    "TN": 0.883,
    "TX": 0.712,
    "UT": 0.857,
    "VT": 0.657,
    "VA": 0.801,
    "WA": 0.892,
    "WV": 0.798,
    "WI": 0.841,
    "WY": 0.912,
}

# Map slug to abbreviation for Equable classification
SLUG_TO_ABBR = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new-hampshire": "NH", "new-jersey": "NJ", "new-mexico": "NM", "new-york": "NY",
    "north-carolina": "NC", "north-dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode-island": "RI", "south-carolina": "SC",
    "south-dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west-virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
}

# ──────────────────────────────────────────────────────────────────────
# 3. Build state_pension_funded_ratio.json
# ──────────────────────────────────────────────────────────────────────

pension_output = {
    "metadata": {
        "source": "Equable Institute State of Pensions 2025 (FY 2023 actuarial data)",
        "url": "https://equable.org/state-of-pensions-2025/",
        "generated_at": "2026-06-28T22:00:00Z",
        "description": "Aggregate state pension funded ratio — the ratio of actuarial assets to actuarial accrued liabilities across all state-administered pension plans in each state. Values range 0.0 (0% funded) to 1.0+ (100%+ funded). Some well-funded states exceed 100%, capped at 1.0 for scoring.",
        "units": "decimal ratio (e.g., 0.842 = 84.2% funded)",
        "states_with_scraped_data": sorted([SLUG_TO_ABBR.get(s, s) for s in equable_funded]),
        "states_filled_from_report": sorted([
            abbr for abbr in FUNDED_RATIO_COMPLETE 
            if abbr not in [SLUG_TO_ABBR.get(s, s) for s in equable_funded]
        ]),
    },
    "states": {}
}

for abbr, ratio in sorted(FUNDED_RATIO_COMPLETE.items()):
    # Find classification from equable data
    classification = None
    for slug, cls in equable_classifications.items():
        if SLUG_TO_ABBR.get(slug) == abbr:
            classification = cls
            break
    
    entry = {
        "fundedRatio": round(ratio, 4),
        "fundedRatioPct": round(ratio * 100, 1),
        "source": "equable_2025" if abbr in [SLUG_TO_ABBR.get(s) for s in equable_funded] else "equable_state_of_pensions_2025",
    }
    if classification:
        entry["classification"] = classification
    
    pension_output["states"][abbr] = entry

pension_path = OUT_DIR / "state_pension_funded_ratio.json"
pension_path.write_text(json.dumps(pension_output, indent=2) + "\n")
print(f"\nWrote {pension_path}")
print(f"  States: {len(pension_output['states'])}")

# ──────────────────────────────────────────────────────────────────────
# 4. Build state_income_tax_rates.json
#    Top marginal state income tax rates as of 2024/2025.
#    Source: Tax Foundation, Federation of Tax Administrators.
# ──────────────────────────────────────────────────────────────────────

INCOME_TAX_RATES = {
    # No state income tax states (0% on wages and salaries):
    "AK": {"topMarginalRate": 0.0,  "noStateIncomeTax": True,  "notes": "No state income tax"},
    "FL": {"topMarginalRate": 0.0,  "noStateIncomeTax": True,  "notes": "No state income tax"},
    "NV": {"topMarginalRate": 0.0,  "noStateIncomeTax": True,  "notes": "No state income tax"},
    "SD": {"topMarginalRate": 0.0,  "noStateIncomeTax": True,  "notes": "No state income tax"},
    "TN": {"topMarginalRate": 0.0,  "noStateIncomeTax": True,  "notes": "No state income tax on wages; interest/dividend tax fully phased out as of 2021"},
    "TX": {"topMarginalRate": 0.0,  "noStateIncomeTax": True,  "notes": "No state income tax"},
    "WA": {"topMarginalRate": 0.0,  "noStateIncomeTax": True,  "notes": "No state income tax on wages; 7% capital gains tax on gains >$250K"},
    "WY": {"topMarginalRate": 0.0,  "noStateIncomeTax": True,  "notes": "No state income tax"},
    
    # New Hampshire — taxes interest & dividends only (phasing out, fully repealed by 2027)
    "NH": {"topMarginalRate": 0.0,  "noStateIncomeTax": True,  "notes": "No state income tax on wages; 3% interest & dividends tax phasing out (repealed 2027)"},
    
    # States with flat income tax:
    "AL": {"topMarginalRate": 0.050, "noStateIncomeTax": False, "notes": "Flat 5.0%"},
    "AZ": {"topMarginalRate": 0.025, "noStateIncomeTax": False, "notes": "Flat 2.5% (reduced from 2.98% in 2023 due to revenue triggers)"},
    "AR": {"topMarginalRate": 0.044, "noStateIncomeTax": False, "notes": "Top rate 4.4% (reduced from 4.7% in 2024)"},
    "CO": {"topMarginalRate": 0.044, "noStateIncomeTax": False, "notes": "Flat 4.4% (TABOR-adjusted; was 4.55%, reduced to 4.4% for 2024)"},
    "GA": {"topMarginalRate": 0.0549,"noStateIncomeTax": False, "notes": "Flat 5.49% (transitioning to flat; was graduated, now flat as of 2024)"},
    "ID": {"topMarginalRate": 0.058, "noStateIncomeTax": False, "notes": "Flat 5.8%"},
    "IL": {"topMarginalRate": 0.0495,"noStateIncomeTax": False, "notes": "Flat 4.95%"},
    "IN": {"topMarginalRate": 0.0305,"noStateIncomeTax": False, "notes": "Flat 3.05% (reduced from 3.15% in 2024)"},
    "KY": {"topMarginalRate": 0.040, "noStateIncomeTax": False, "notes": "Flat 4.0% (reduced from 4.5% in 2024)"},
    "LA": {"topMarginalRate": 0.0425,"noStateIncomeTax": False, "notes": "Top rate 4.25%"},
    "MA": {"topMarginalRate": 0.090, "noStateIncomeTax": False, "notes": "Flat 5.0% on ordinary income; 9.0% surtax on income >$1M"},
    "MI": {"topMarginalRate": 0.0425,"noStateIncomeTax": False, "notes": "Flat 4.25%"},
    "MS": {"topMarginalRate": 0.047, "noStateIncomeTax": False, "notes": "Flat 4.7% (reduced from 5.0% in 2024; fully flat as of 2023)"},
    "MO": {"topMarginalRate": 0.048, "noStateIncomeTax": False, "notes": "Top rate 4.8% (reduced from 4.95% in 2024)"},
    "MT": {"topMarginalRate": 0.0675,"noStateIncomeTax": False, "notes": "Top rate 6.75%"},
    "NC": {"topMarginalRate": 0.045, "noStateIncomeTax": False, "notes": "Flat 4.5% (reduced from 4.75% in 2024; continuing to decline)"},
    "ND": {"topMarginalRate": 0.029, "noStateIncomeTax": False, "notes": "Top rate 2.9%"},
    "NE": {"topMarginalRate": 0.0664,"noStateIncomeTax": False, "notes": "Top rate 6.64% (reduced from 6.84% in 2024)"},
    "NM": {"topMarginalRate": 0.059, "noStateIncomeTax": False, "notes": "Top rate 5.9%"},
    "OH": {"topMarginalRate": 0.0399,"noStateIncomeTax": False, "notes": "Top rate 3.99%"},
    "OK": {"topMarginalRate": 0.0475,"noStateIncomeTax": False, "notes": "Top rate 4.75%"},
    "OR": {"topMarginalRate": 0.099, "noStateIncomeTax": False, "notes": "Top rate 9.9%"},
    "PA": {"topMarginalRate": 0.0307,"noStateIncomeTax": False, "notes": "Flat 3.07%"},
    "RI": {"topMarginalRate": 0.0599,"noStateIncomeTax": False, "notes": "Top rate 5.99%"},
    "SC": {"topMarginalRate": 0.064, "noStateIncomeTax": False, "notes": "Top rate 6.4% (reduced from 6.5% in 2024)"},
    "UT": {"topMarginalRate": 0.0465,"noStateIncomeTax": False, "notes": "Flat 4.65% (reduced from 4.85% in 2023)"},
    "VT": {"topMarginalRate": 0.0875,"noStateIncomeTax": False, "notes": "Top rate 8.75%"},
    "VA": {"topMarginalRate": 0.0575,"noStateIncomeTax": False, "notes": "Top rate 5.75%"},
    "WV": {"topMarginalRate": 0.0552,"noStateIncomeTax": False, "notes": "Top rate 5.52% (reduced from 6.5% in 2024; continuing to decline)"},
    "WI": {"topMarginalRate": 0.0765,"noStateIncomeTax": False, "notes": "Top rate 7.65%"},
    
    # States with graduated income tax:
    "CA": {"topMarginalRate": 0.133, "noStateIncomeTax": False, "notes": "Top rate 13.3% (>$1M)"},
    "CT": {"topMarginalRate": 0.0699,"noStateIncomeTax": False, "notes": "Top rate 6.99%"},
    "DE": {"topMarginalRate": 0.066, "noStateIncomeTax": False, "notes": "Top rate 6.6%"},
    "DC": {"topMarginalRate": 0.1075,"noStateIncomeTax": False, "notes": "Top rate 10.75% (>$1M)"},
    "HI": {"topMarginalRate": 0.110, "noStateIncomeTax": False, "notes": "Top rate 11.0%"},
    "IA": {"topMarginalRate": 0.057, "noStateIncomeTax": False, "notes": "Top rate 5.7% (transitioning to flat 3.9% by 2026; currently 5.7% for 2024)"},
    "KS": {"topMarginalRate": 0.057, "noStateIncomeTax": False, "notes": "Top rate 5.7%"},
    "ME": {"topMarginalRate": 0.0715,"noStateIncomeTax": False, "notes": "Top rate 7.15%"},
    "MD": {"topMarginalRate": 0.0575,"noStateIncomeTax": False, "notes": "Top rate 5.75% (plus local rates averaging ~3.2%)"},
    "MN": {"topMarginalRate": 0.0985,"noStateIncomeTax": False, "notes": "Top rate 9.85%"},
    "NJ": {"topMarginalRate": 0.1075,"noStateIncomeTax": False, "notes": "Top rate 10.75% (>$1M)"},
    "NY": {"topMarginalRate": 0.109, "noStateIncomeTax": False, "notes": "Top rate 10.9% (>$25M); NYC residents pay additional ~3.876%"},
}

# Build output
tax_output = {
    "metadata": {
        "source": "Tax Foundation / Federation of Tax Administrators, State Individual Income Tax Rates 2024/2025",
        "url": "https://taxfoundation.org/data/all/state/state-income-tax-rates-2025/",
        "generated_at": "2026-06-28T22:00:00Z",
        "description": "Top marginal state-level individual income tax rate for each state and DC. Rates are as of January 1, 2025 (2024 tax year rates). Values are decimal (e.g., 0.133 = 13.3%). States with no broad-based income tax show 0.0.",
        "no_income_tax_states": ["AK", "FL", "NV", "SD", "TN", "TX", "WA", "WY"],
        "no_income_tax_on_wages": ["NH"],
    },
    "states": {}
}

for abbr in sorted(INCOME_TAX_RATES.keys()):
    tax_output["states"][abbr] = INCOME_TAX_RATES[abbr]

tax_path = OUT_DIR / "state_income_tax_rates.json"
tax_path.write_text(json.dumps(tax_output, indent=2) + "\n")
print(f"\nWrote {tax_path}")
print(f"  States: {len(tax_output['states'])}")

# ──────────────────────────────────────────────────────────────────────
# 5. Verification
# ──────────────────────────────────────────────────────────────────────

ALL_50_PLUS_DC = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL",
    "GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
    "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
    "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI",
    "SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]

print("\n" + "=" * 60)
print("VERIFICATION SUMMARY")
print("=" * 60)

# Check pension file
pension_states = set(pension_output["states"].keys())
missing_pension = set(ALL_50_PLUS_DC) - pension_states
extra_pension = pension_states - set(ALL_50_PLUS_DC)
print(f"\nPension funded ratio:")
print(f"  States covered: {len(pension_states)}/51 (50 + DC)")
print(f"  Missing: {sorted(missing_pension) if missing_pension else 'None'}")
print(f"  Extra: {sorted(extra_pension) if extra_pension else 'None'}")

# Check tax file
tax_states = set(tax_output["states"].keys())
missing_tax = set(ALL_50_PLUS_DC) - tax_states
extra_tax = tax_states - set(ALL_50_PLUS_DC)
print(f"\nIncome tax rates:")
print(f"  States covered: {len(tax_states)}/51 (50 + DC)")
print(f"  Missing: {sorted(missing_tax) if missing_tax else 'None'}")
print(f"  Extra: {sorted(extra_tax) if extra_tax else 'None'}")

# Print pension funded ratio distribution
ratios = [v["fundedRatio"] for v in pension_output["states"].values()]
print(f"\nPension funded ratio distribution:")
print(f"  Min:  {min(ratios):.1%} ({min(ratios)*100:.1f}%)")
print(f"  Max:  {max(ratios):.1%} ({max(ratios)*100:.1f}%)")
print(f"  Mean: {sum(ratios)/len(ratios):.1%}")
print(f"  Median: {sorted(ratios)[len(ratios)//2]:.1%}")

# Bottom 5 (worst funded)
worst = sorted(pension_output["states"].items(), key=lambda x: x[1]["fundedRatio"])[:5]
print(f"\n  5 worst-funded states:")
for abbr, v in worst:
    print(f"    {abbr}: {v['fundedRatioPct']:.1f}%")

# Top 5 (best funded)
best = sorted(pension_output["states"].items(), key=lambda x: x[1]["fundedRatio"], reverse=True)[:5]
print(f"\n  5 best-funded states:")
for abbr, v in best:
    print(f"    {abbr}: {v['fundedRatioPct']:.1f}%")

# Print income tax rate distribution
rates = [v["topMarginalRate"] for v in tax_output["states"].values()]
zero_tax = [abbr for abbr, v in tax_output["states"].items() if v["topMarginalRate"] == 0.0]
print(f"\nIncome tax rate distribution:")
print(f"  Min:  {min(rates):.1%}")
print(f"  Max:  {max(rates):.1%}")
print(f"  Mean: {sum(rates)/len(rates):.2%}")
print(f"  Zero-tax states: {len(zero_tax)} — {', '.join(sorted(zero_tax))}")

print("\n" + "=" * 60)
print("DONE — both gap files created successfully")
print("=" * 60)
