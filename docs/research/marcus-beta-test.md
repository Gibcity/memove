# Marcus Beta-Test Report — Phoenix→Raleigh Move, Schools & Safety

**Tester persona:** Marcus, 38, teacher, married to RN. HHI $72K. Two kids (8, 11). #1 priority: schools + safety.
**Date:** 2026-06-30
**Stack under test:** memove relocation app, Nest server :3001, React client :5173.

---

## 1. Login & session
- `POST /api/auth/demo-login` → 200, JWT issued. Working.

## 2. Elicitation (the "what matters to you" intake)
**Endpoint:** `POST /api/relocation/profile/elicitation/start` (NOT `/answer` — wrong path in the brief).
Exact 3 questions, source `relocation.service.ts:481`:

| # | Question | Asks about schools/safety? |
|---|---|---|
| Q1 | "How important is the cost of living…" | No |
| Q2 | "What climate best suits you?" | No |
| Q3 | "What's a non-negotiable for your new home?" → options include `safety` (low crime) and `schools_healthcare` (one combined option) | **Barely.** Schools are grouped with healthcare; not asked about independently. No question targets children, school district quality, or class size. |

**Marcus's verdict on Q3:** I'd pick `schools_healthcare` because it's the closest, but the option conflates two needs and includes healthcare I didn't ask about. There's no "good school district" option on its own.

## 3. Raleigh lookup

- **`GET /api/relocation/locations`** returns 939 metros, top-level keys = `id, name, state, lat, lng, cost, crime, climate, fiscal`. **No `education` in the list payload.**
- **Raleigh ID:** `raleigh-cary-nc`
- **Crime (list view):** `violentCrimeRatePer100k = 488.85`, `propertyCrimeRatePer100k = 2819.18`, `yearOverYearTrend = -0.0723`
- **Education:** Not present in list view at all.

## 4. Raleigh detail (`GET /api/relocation/locations/raleigh-cary-nc`)

**Education field is populated but two-faced:**
```json
"education": {
  "publicSchoolRatingAvg": 8.2,
  "studentTeacherRatio": 0
}
```

- ✅ `publicSchoolRatingAvg = 8.2` (real-ish, looks plausible on a 10-scale).
- 🚨 **`studentTeacherRatio` is literally `0`** — not null, not "N/A", not a float. Marcus reads "0:1" and assumes the data is broken. This is a real data bug, not a styling issue.

**Crime fields both populated:** violent `488.85/100k`, property `2819.18/100k`, YoY trend `-0.0723` (improving).
**Also returned (parent-relevant):** healthcare access `3.1/100`, 7 hospitals within 10mi, broadband 81.58% @ ≥100Mbps. No school-district boundaries, no per-school index, no district name, no GreatSchools/NCES link.

## 5. Compare Raleigh vs Phoenix

- **Wrong verb in brief:** `GET /api/relocation/compare?ids=…` returns `Cannot GET /api/relocation/compare?ids=…`. Real route is **`POST /api/relocation/compare`** with JSON body `{ "locationIds": […] }`. (Controller line 204.)
- Once corrected: works. Returns `{ locations: […], winner: "Phoenix-Mesa-Chandler, AZ" }`. Per-side `diffs: []` (empty list — no per-metric highlight).
- **`education` is included in the compare payload** (both sides), but `diffs` is empty so the UI gets nothing to render. The detailed values are there; the highlighting isn't.
- Winner selection picked Phoenix; Marcus is going to want to know *why* — no per-metric narrative on the winner.

## 6. `CandidateDetailSheet.tsx` — what Marcus actually sees

The "key metrics" grid (lines 262–307) renders exactly 8 cells:

| Metric | Field | School/safety coverage? |
|---|---|---|
| Cost of Living | cost.costOfLivingIndex | – |
| Median Home | cost.medianHomeValue | – |
| Median Rent | cost.medianRent | – |
| Hot Days (≥90°F) | climate.daysMaxGt90FAnnual | – |
| **Violent Crime** | crime.violentCrimeRatePer100k | ⚠️ Partial — one number, no property crime, no trend, no state-vs-national context |
| Broadband % | broadband.pctHouseholdsWith100MbpsPlus | – |
| Healthcare Access | healthcare.healthcareAccessScore | – |
| State Income Tax | cost.stateIncomeTaxRate | – |

**Missing from the sheet entirely:**
- `education.publicSchoolRatingAvg` (8.2 in payload, never rendered)
- `education.studentTeacherRatio` (0 in payload, never rendered)
- `crime.propertyCrimeRatePer100k` (2819 in payload, never rendered)
- `crime.yearOverYearTrend`
- any school-district name or link
- any safety narrative (national avg, state avg, "vs your hometown")

**Marcus's reaction:** The number I came for (school rating) isn't on the page. The one safety number is naked — I don't know if 488/100k is high, low, or about average, so it's roughly meaningless without context.

## 7. `CandidateLibraryPanel.tsx` — can I filter by school/crime?

**Sort options (line 121–123):** score, rent, name. No crime, no school.
**Filter sliders (from `DEFAULT_FILTER_SLIDERS` in `relocationModel.ts:90`):** cost, climate/hot days, **crime (violent)**, broadband, healthcare. Crime is in; schools are not — no slider for `publicSchoolRatingAvg`, no `studentTeacherRatio` slider.
**Other filters:** free-text search (with NYC/SF/LA/DC aliases), state `<select>`, heart to save, compare-checkbox.

So I can narrow to "low violent crime" but I cannot narrow to "good schools" anywhere in the UI.

---

## Ratings — through Marcus's eyes (1–10)

| Dimension | Score | Notes |
|---|---|---|
| **1. First impression** | **6** | The page loads, the map exists, the panels are tidy. Score ring + grid looks like a real product. But the visible metrics look like a Zillow listing, not a family-move tool. |
| **2. Core task — evaluate schools & safety** | **3** | I can see *one* crime number (violent rate) and *zero* schools in the UI. The headline metric I came to find (school rating) is in the API but never shown. I would have to open DevTools to see it. That's a near-miss on the entire reason I opened the app. |
| **3. Data depth for a parent** | **3** | Crime: violent shown, property hidden, no trend, no peer benchmark. Schools: a numeric rating of 8.2 (good!) but literally no way to see it in the UI, and `studentTeacherRatio: 0` looks like a broken feed. No district name, no school list, no link out. |
| **4. Dead ends / frustration** | **8 (worse=better, this is bad)** | `/compare?ids=` returns 404 (should be POST). `/elicitation/answer` returns 404 (should be `/respond`). Q3's "non-negotiable" forces schools and healthcare into one option. The detail sheet ignores two of the three fields I care most about. The data IS in the backend, the UI just isn't using it. |
| **5. Emotional journey** | **3** | Starts hopeful, ends annoyed. The app has the answers somewhere — I can taste it — but it's hiding them at every layer: weak questions, missing UI cells, a literal `0` that screams "broken feed," compare returning empty diffs. I'd close the tab and go back to GreatSchools. |
| **6. Would I use this again?** | **No.** | The data model clearly intended schools to be a first-class factor — it's in the schema, the elicitation, the compare payload. The frontend just hasn't caught up. One sprint of UI work (render `publicSchoolRatingAvg`, add a school slider, fix the `0` ratio, show both crime rates with national avg) and I could see this becoming genuinely useful for a parent. Right now it would mislead me. |

---

## Specific defects to file

1. **`studentTeacherRatio` returns `0` for Raleigh** — either a feed bug or an un-mapped field. Renders as "0:1" to any parent. Highest priority, lowest cost.
2. **`CandidateDetailSheet.tsx` doesn't render `education.*` or `crime.propertyCrimeRatePer100k` or `crime.yearOverYearTrend`** despite all three being in the payload. ~20 lines of `MetricItem` additions.
3. **`CandidateLibraryPanel.tsx` / `DEFAULT_FILTER_SLIDERS` — no school slider, no education sort.** Add `{ id: 'schools', label: 'Public School Rating', field: 'education.publicSchoolRatingAvg', min: 0, max: 10, step: 0.1, value: [0, 10], enabled: true }`.
4. **Elicitation Q3 option `schools_healthcare` lumps two different priorities** — a parent will pick it and not know the system heard "good schools" the same as a cancer survivor with no doctor for 30 miles.
5. **`POST /api/relocation/compare`** (not GET) — the openapi/brief should call this out. Same for `/respond` vs `/answer`.
6. **Compare `diffs: []`** — selecting a winner without per-metric reasoning wastes the whole point of comparison.

## TL;DR for the parent reading this
The backend already has school rating + violent + property crime for Raleigh (8.2 / 489 / 2819). **The frontend surfaces none of it to the user.** Marcus would assume the app doesn't have that data and leave. One focused UI pass would convert this from "looks promising, can't use" to "actually answers the question."
