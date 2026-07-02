# Marcus Beta-Test Re-Run — Phoenix→Raleigh, Schools & Safety

**Tester persona:** Marcus, 38, teacher, married to RN. HHI $72K. Two kids (8, 11). #1 priority: schools + safety.
**Date:** 2026-06-30 (rerun)
**Stack under test:** memove relocation app, Nest server :3001, React client :5173.
**Scope of this re-run:** verify the three claimed fixes from the "what just landed" brief — LLM client, population filter, score movement. Then recheck the six original defects.

---

## TL;DR

- **(1) LLM client → MiniMax-M3:** ✅ Connects, returns text. ~750 ms per call, model emits a `<think>` block followed by the answer.
- **(2) Population filter (search):** ✅ Works. `GET /api/relocation/locations?minPopulation=500000` returns 111/939 metros and drops Midland (175K), Odessa (162K), and other small oil/ag towns. `population` is in the list payload.
- **(2) Population filter (score):** ❌ **Silently dropped.** `POST /api/relocation/score { minPopulation: 500000 }` returns the same 939 locations and the same top-5 (Pecos TX, Evanston WY, Lamesa TX, Levelland TX, Pampa TX) as the unfiltered call. See "Defect S1" below.
- **(3) Score rankings shifted:** **No, because of (2).** The top of the leaderboard is still small Texas towns under 25K population. The "score rankings shifted" claim does not hold on the score endpoint. It does hold on the search endpoint (population is now a usable cut).

Net: one of the three fixes is real, one is half-done (search works, score doesn't), one (LLM) is solid.

---

## 1. LLM client live test (claim A)

**Method:** `npx tsx` script that imports `memove/server/src/services/llm/client.ts` and calls `complete()` three times. Env loaded from `memove/server/.env` (`LLM_API_KEY`, `LLM_BASE_URL`).

**Result:** 200/200, model resolves to `MiniMax-M3`.

| Prompt | Latency | Returned text |
|---|---|---|
| `Say OK.` | 5149 ms | `<think>…</think>\n\nOK.` |
| `What is 2+2? Answer in one word.` | 756 ms | `<think>…</think>\n\nFour.` |
| `Reply with just the token: HELLO` | 748 ms | `<think>…</think>\n\nHELLO` |

**Verdict:** ✅ **Pass.** The endpoint is reachable, the key is valid, the model returns text.

**Caveat for callers:** the model prepends a `<think>…</think>` reasoning block on simple prompts. If any consumer does exact-string matching (e.g. `expect(text).toBe('OK')`), it will fail. Extract the substring after `</think>` or instruct the model to suppress it. The first call was also ~7x slower (5.1 s vs 0.7 s) — likely a cold-start / first-token penalty; subsequent calls in the same process are snappy.

---

## 2. Population filter (claim B)

### Data backfill

`sources/processed/relocation/locations.json` has `population` on **all 939/939** records. Spot checks:

| Location | State | Population |
|---|---|---|
| Raleigh-Cary | NC | 1,420,825 |
| Phoenix-Mesa-Chandler | AZ | 4,864,209 |
| Tulsa | OK | 1,017,724 |
| Wichita | KS | 646,794 |
| Midland | TX | 174,621 |
| Odessa | TX | 162,300 |

### Search endpoint behavior — ✅ works

`GET /api/relocation/locations?minPopulation=N&limit=2000` (auth required):

| `minPopulation` | Returned | Excludes Midland (175K) / Odessa (162K)? | Excludes Wichita (647K)? | Keeps Raleigh / Phoenix? |
|---:|---:|:---:|:---:|:---:|
| 100,000 | 393 | ❌ (still in) | ✅ | ✅ |
| 250,000 | 194 | ✅ | ✅ | ✅ |
| **500,000** | **111** | **✅** | **✅** | **✅** |
| 1,000,000 | 57 | ✅ | ❌ (now excluded) | ✅ |

The list projection now includes a top-level `population` field per item (confirmed via `?limit=3`). The filter is wired into `searchLocations()` at `relocation.service.ts:610` and into the controller schema at `relocation.controller.ts:73`.

### Score endpoint behavior — ❌ broken

`POST /api/relocation/score { topK, minPopulation }`:

```
$ curl -X POST .../score -d '{"topK":5}'
  rank 1  Pecos, TX          (pop ~13K)   score=77.000
  rank 2  Evanston, WY       (pop ~12K)   score=75.000
  rank 3  Lamesa, TX         (pop ~9K)    score=75.000
  rank 4  Levelland, TX      (pop ~9K)    score=75.000
  rank 5  Pampa, TX          (pop ~17K)   score=75.000

$ curl -X POST .../score -d '{"topK":5,"minPopulation":500000}'
  rank 1  Pecos, TX          score=77.000   ← unchanged
  rank 2  Evanston, WY       score=75.000   ← unchanged
  ... (identical)
```

**Root cause:** `ScoreFilters` (relocation.service.ts:212–231) does not declare a `minPopulation` field, and the `cleanFilters` whitelist at lines 712–722 never copies it through to `scoreLocation()`. The endpoint's `scoreFiltersSchema` *does* accept `minPopulation` (it extends `searchFiltersSchema`), so the request parses fine — but the value is silently dropped before scoring. `scoreLocation()` itself contains the right check at line 292, but it's unreachable from this path.

**Defect S1 (NEW):** `minPopulation` on `POST /api/relocation/score` is a no-op. Either add `minPopulation?: number` to the `ScoreFilters` interface and copy it into `cleanFilters`, or — since the schema already accepts it — one line: `if (filters.minPopulation) cleanFilters['minPopulation'] = filters.minPopulation;` in the `scoreLocations` body. This is the "bug fix = root cause" pattern: one line in the shared service hits all callers.

### Score movement (claim C)

**Has the score leaderboard shifted?** No, on the score endpoint, because of S1 above. The top 5 is still dominated by <25K-pop West Texas / Wyoming towns — the "oil/ag towns polluting results" called out in the brief are unchanged. On the search endpoint, filtering by `minPopulation=500000` does drop them, but the search endpoint is a list view, not a ranking, so "rankings shifted" only really applies to score.

**What the top 20 actually looks like with Marcus-style weights** (`cost=4, safety=5, healthcare=2, climate=1, jobs=1, outdoors=1`):

| rank | location | state | matchScore |
|---:|---|---|---:|
| 1 | Levelland | TX | 81.000 |
| 2 | Plainview | TX | 81.000 |
| 3 | Vernon | TX | 81.000 |
| 4 | Borger | TX | 80.000 |
| 5 | Hereford | TX | 80.000 |
| 6 | Lamesa | TX | 80.000 |
| 7 | Pampa | TX | 80.000 |
| 8 | Pearsall | TX | 80.000 |
| 9 | Pecos | TX | 80.000 |
| 10 | Lexington | NE | 79.000 |

This is unchanged from the previous report. The cap is `passedFilters=939` for both filtered and unfiltered runs.

---

## 3. Original defects — re-check

| # | Defect (original) | Status | Evidence |
|---:|---|---|---|
| 1 | `studentTeacherRatio` returns `0` for Raleigh (data bug) | ❌ **Unchanged** | `GET /api/relocation/locations/raleigh-cary-nc` → `education.studentTeacherRatio: 0`. Still renders as "0:1" to a parent. |
| 2 | `CandidateDetailSheet.tsx` doesn't render `education.*` or `crime.propertyCrimeRatePer100k` | ⚠️ **Partially fixed** | `publicSchoolRatingAvg` (line 319–325) and `studentTeacherRatio` (line 327–330) now render. **`propertyCrimeRatePer100k` still missing** — only `violentCrimeRatePer100k` is on the page. `yearOverYearTrend` still missing. |
| 3 | No school filter slider in `CandidateLibraryPanel` | ❌ **Unchanged** | `DEFAULT_FILTER_SLIDERS` in `relocationModel.ts:90` has cost, climate, crime, broadband, healthcare. No `education.*` slider. |
| 4 | Elicitation Q3 lumps schools + healthcare | ❌ **Unchanged** | (Not re-tested in this rerun; the original 3-question structure at `relocation.service.ts:481` is unchanged.) |
| 5 | `POST /api/relocation/compare` (not GET) | ❌ **Unchanged** | `GET .../compare?ids=…` → 404, `POST .../compare` with `{locationIds: […]}` → 201. |
| 6 | Compare `diffs: []` always empty | ❌ **Unchanged** | Same response, `diffs: []` on both sides, no per-metric highlight. |
| S1 | **`minPopulation` silently dropped on `/api/relocation/score`** | ❌ **New bug introduced by the fix** | See section 2. Filter works on `/api/relocation/locations` only. |

---

## Ratings — through Marcus's eyes (1–10), after rerun

| Dimension | Before | After | Δ | Notes |
|---|---:|---:|---:|---|
| **1. First impression** | 6 | 6 | — | No UI changes in this sprint. |
| **2. Core task — evaluate schools & safety** | 3 | **5** | +2 | I can finally see the school rating in the detail sheet, and the population field is in the list. But the score endpoint still recommends Pecos TX (pop 13K) for a parent of two — so my "ranked candidates" view is still wrong. The "score endpoint ignores minPopulation" issue single-handedly caps this at 5. |
| **3. Data depth for a parent** | 3 | **4** | +1 | School rating shows up now; student-teacher ratio still shows `0` (defect 1 unfixed). Property crime still missing. At least I can narrow to "metro only" via the new `minPopulation` param on the search endpoint. |
| **4. Dead ends / frustration** | 8 (bad) | 6 | -2 | Two real dead ends remain: `GET /compare?ids=` (404) and the score endpoint's silent filter drop. The filter is in the schema, the service handles it, and yet the call still returns the wrong answer — this is the worst kind of bug because it looks like it worked. |
| **5. Emotional journey** | 3 | 4 | +1 | LLM actually works now — that doesn't directly help the parent, but the chat / elicitation flows can lean on real responses. The score pollution by <25K towns is still infuriating. |
| **6. Would I use this again?** | No | **Still No, but closer.** | — | Same blocker as before: the data is mostly there, the UI mostly doesn't surface it, and the one place that does (score) silently ignores my filters. **The score filter fix is one line. The data backfill and search filter are already in. If that line lands, this jumps to "Yes, with caveats."** |

---

## Specific defects to file (updated list)

1. **`POST /api/relocation/score { minPopulation: N }` is a silent no-op** (NEW, blocker). The `ScoreFilters` interface is missing the field and `cleanFilters` doesn't copy it. One-line fix in `scoreLocations`. Highest priority, lowest cost.
2. **`studentTeacherRatio` returns `0` for Raleigh** (original defect 1, still open). Data pipeline issue — likely a Census ACS table-join that didn't bind. Renderable as "—" or "N/A" if the source is genuinely missing.
3. **`CandidateDetailSheet.tsx` still doesn't render `crime.propertyCrimeRatePer100k` or `crime.yearOverYearTrend`** (original defect 2, partially fixed). Add two more `MetricItem` blocks after the violent-crime cell.
4. **No school filter slider in `DEFAULT_FILTER_SLIDERS`** (original defect 3, still open). Same fix as the original report — one entry in the array.
5. **Elicitation Q3 still lumps `schools_healthcare`** (original defect 4, still open). Split into two options.
6. **`POST /api/relocation/compare` (not GET)** (original defect 5, still open). Update the OpenAPI doc / brief to call this out.
7. **Compare `diffs: []` always empty** (original defect 6, still open). The compare payload has the per-side detail; the per-metric diff logic just isn't computing it.

---

## What worked, what didn't (for the parent reading this)

- **Worked:** the LLM client is real. `complete()` returns text from MiniMax-M3 in under a second on a warm call. The search endpoint population filter is real and correct. The data backfill is at 100% (939/939).
- **Didn't work, but should be a one-line fix:** the score endpoint silently drops `minPopulation`. The service function knows what to do with it; the request layer is just throwing it away. This is the difference between "score works for a parent" and "score still recommends Pecos."
- **Still pending (unchanged from last report):** `studentTeacherRatio: 0`, property crime not in detail sheet, no school slider, Q3 still conflates schools + healthcare, `GET /compare` still 404s, compare diffs still empty.

Score movement: **yes, on `/api/relocation/locations` (pop is now a usable cut, returned in the list payload). No, on `/api/relocation/score` (filter silently ignored, top 5 unchanged).** Fix the one line in `scoreLocations`'s `cleanFilters` whitelist and both will agree.
