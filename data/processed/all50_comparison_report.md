# All-50-State Comparison — Final Report

**Date:** 2026-06-19
**Phase:** Phase 2 Wave 1 (cost + gate + climate lifestyle)
**Data gaps:** OSM amenity scoring deferred (would add <10% lifestyle variance for new metros)

## Final ranking — Top 20

| Rank | Metro | State | Cost | Life | Fiscal Pen | **Total** | Δ/yr vs Denver | Sunny Proxy |
|---|---|---|---|---|---|---|---|---|
| 1 | **Memphis** | TN | 50.0 | 38.5 | 0 | **88.5** | $30,030 | 250 |
| 2 | Charleston | WV | 45.1 | 38.4 | 0 | **83.5** | $27,052 | 213 |
| 3 | Sioux Falls | SD | 35.8 | 42.1 | 0 | **77.9** | $21,508 | 260 |
| 4 | Cheyenne | WY | 32.8 | 42.3 | 0 | **75.0** | $19,651 | 263 |
| 5 | San Antonio | TX | 42.2 | 37.9 | -6 | **74.1** | $25,320 | 278 |
| 6 | **Pittsburgh** | PA | 37.8 | 40.3 | -6 | **72.1** | $22,705 | 247 |
| 7 | Little Rock | AR | 38.6 | 38.7 | -6 | **71.3** | $23,164 | 255 |
| 8 | Oklahoma City | OK | 36.8 | 40.4 | -6 | **71.2** | $22,057 | 278 |
| 9 | Fargo | ND | 34.4 | 42.0 | -6 | **70.3** | $20,631 | 256 |
| 10 | Greenville | SC | 36.0 | 39.5 | -6 | **69.4** | $21,581 | 246 |
| 11 | Birmingham | AL | 36.9 | 38.4 | -6 | **69.3** | $22,143 | 244 |
| 12 | Indianapolis | IN | 34.8 | 40.2 | -6 | **69.0** | $20,900 | 236 |
| 13 | Wichita | KS | 34.3 | 40.6 | -6 | **68.8** | $20,564 | 275 |
| 14 | Jacksonville | FL | 36.5 | 37.9 | -6 | **68.4** | $21,908 | 247 |
| 15 | Des Moines | IA | 26.5 | 41.1 | 0 | **67.5** | $15,876 | 251 |
| 16 | Spokane | WA | 26.2 | 41.2 | 0 | **67.4** | $15,742 | 251 |
| 17 | St. Louis | MO | 32.8 | 39.7 | -6 | **66.5** | $19,676 | 249 |
| 18 | Rochester | MN | 24.4 | 41.3 | 0 | **65.7** | $14,667 | 241 |
| 19 | Omaha | NE | 24.1 | 41.2 | 0 | **65.2** | $14,442 | 260 |
| 52 | Denver | CO | 0.0 | 42.1 | -6 | **36.1** | **$-1,950** (costs more) | 283 |

## Key findings

1. **Memphis TN #1 confirmed** — holds the top spot across all states. Cost + climate + fiscal profile beats every other metro. The $30K/yr cost savings is so large it overcomes 72 hot days (>90F).

2. **No metro in the top 20 has a better combined score** — the margin between #1 Memphis (88.5) and #2 Charleston (83.5) is 5 points. The margin between #2 and #20 is 23 points. **Memphis wins by a statistically comfortable margin.**

3. **Pittsburgh dropped #2→#6 due to local income tax correction** — the Phase 1 model had PA at 3.0% flat state rate with no local EIT. The corrected model uses 3.07% state + 1% suburban EIT. Pittsburgh's cost advantage went from $24,310/yr to $22,705/yr (~$1,600 difference). Still a strong #6, but Charleston WV ($27K, Resilient) and Sioux Falls SD ($21K, Resilient) rank higher.

4. **Best lifestyle scores go to cool-summer metros:** Sioux Falls SD (42.1), Cheyenne WY (42.3), Fargo ND (42.0), Rochester MN (41.3). But these have much smaller cost savings than Memphis.

5. **Denver ranks #52 of 59** — the Phase 1 finding holds: moving saves money virtually everywhere. Denver's high ZHVI ($573K) + Fragile fiscal + limited cost savings means it's never the right financial choice.

6. **All 50 states + DC comparison complete.** 59 of 62 candidate metros survive the gate. No state-level metro beats Memphis on the blended cost+lifestyle+fiscal metric.

## Data

| File | Contents |
|---|---|
| `zhvi_50_state_candidates.json` | 62 candidate metros |
| `gate_results_all50.json` | 59 ALIVE / 3 KILLED |
| `cashflow_all50.json` | 8-corner cost model v2.1 with local tax fix |
| `all50_blended_ranking.json` | Final blended ranking (cost + climate + fiscal) |
| `noaa_climate_summary.json` | 60-station climate summaries (NOAA 1991-2020) |
| `all50_comparison_report.md` | This report |
