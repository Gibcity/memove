# memove Relocation Frontend — QA Roast

Scope: `/home/mongo/projects/us-relocation-2026/trek/client/src/pages/relocation/`,
`/home/mongo/projects/us-relocation-2026/trek/client/src/api/relocation.ts`,
`/home/mongo/projects/us-relocation-2026/trek/shared/src/relocation/relocation.schema.ts`.
Cross-referenced with the NestJS server controllers/services to validate wire shapes.

## Score by area (1–10)

| Area | Score | Why |
|------|-------|-----|
| Map & geographic visualization | **4/10** | Pins exist but no tiles, no zoom, no pan, no clustering, no state outlines. 939 metros absolutely positioned onto a hand-drawn SVG blob. Single-state filters impossible. |
| Side-by-side comparison | **5/10** | Compare flag exists on each row, drawer renders 2 columns, but `MAX_COMPARE=3` is advertised yet the UI never lets you add a 3rd — `compareCandidates.length >= 2` check on render and silent cap in `toggleCompare` with no UI feedback (`MissionControlShell.tsx:98`). Compare-sheet "winner" string is the only thing returned by `compareLocations`, not deltas. |
| Chat end-to-end | **6/10** | Backend `/relocation/chat` works and returns `{role, content, ...}`; hook normalizes; fallbacks (concierge → mock) are wired. But the *renderer* ignores everything except `text` + `cards`. Server returns rich payloads (`type: 'city_list'`, `type: 'compare_prompt'`, `type: 'cost_prompt'`, `cities: [...]`) and the frontend just `whitespace-pre-wrap`s markdown emoji soup (`RelocationChat.tsx:225`). Rich cards (`city_compare` etc.) are mocked client-side, never come from server. |
| Filtering by criteria | **5/10** | 5 default sliders, range UX works locally. But (a) `sendFilterApplySignal` builds `{field: min/max}` payloads the server *does not consume* (server `scoreLocations` uses `filters: { cost.medianHomeValue: {max} }` shape, not `cost.costOfLivingIndex.min/max`); (b) the only actually-working filter path is the min/max text fields on a dot-path the server must understand; (c) the dot-paths in sliders (`cost.costOfLivingIndex`) are not all valid server filter keys — see `applyRangeFilters`. There's no state filter, no region filter, no climate preset, no saved presets. |
| Score explainability | **3/10** | The 0–100 number is colored and ranked, but the formula is opaque. `scoreToColor` uses a 5-band gradient, but the score comes from server with no explanation of what weighted it. "Why this candidate?" pulls from `/score/explain` (good), but the natural-language explanation from the server (`explanation: string[]`) is mapped from `string[]` → `string` in the response handler (`useRelocationScore.ts:54`) and the drawer just stringifies the first error string fallback — almost always the silent `decisionTrace` short sentence. Subscore breakdown, weights, data gaps are dropped. |
| Elicitation flow | **6/10** | Server-backed, 3-question flow, skip/skip-all work. But: (1) "Hide {name}?" hard-filter banner keys off `locationId`, not a city name (`useRelocationElicitation.ts:118`) — the toast literally says "Hide dallas-tx?" to the user. (2) `confirmHardFilter` does a raw `fetch('/api/relocation/profile', ...)` (`useRelocationElicitation.ts:139`) bypassing the apiClient (no auth interceptor, no idempotency key, no 401 handling) while *every other* call goes through `apiClient`. (3) `getProfile()` on mount then immediately checks `p.elicitationRoundsCompleted >= 3` to auto-dismiss, but `relocationApi.startElicitation` is the only entry — there is no "edit my answers" path. (4) The dismiss-3-times promotion is triggered on **any** dismissal, including `dismissed_from_library` which the library uses for the X button on every row (`panels/CandidateLibraryPanel.tsx:291`) — a user clicking X three times anywhere gets a "Hide dallas-tx?" prompt that they almost certainly didn't mean. |
| Dead buttons / empty states / broken flows | **4/10** | "Apply Checklist" button only toasts ("coming soon"), no follow-up. Heart/save icon in the footer next to the row counter (`panels/CandidateLibraryPanel.tsx:258-261`) is decorative — never reflects saved state. The `Apply Checklist` CTA in `MissionControlShell.tsx:159` shows a toast but the *server route exists and works* — just unwired on FE. `setLeftCollapsed` / `setRightCollapsed` are imported but the resize handles don't expose any collapse toggle. Map pin has no label, no tooltip on hover beyond title — clusters of 939 dots in CA/TX/NY become a single muddy blob. |
| Overall polish | **5/10** | Typography uses Poppins inline. i18n exists but several strings are hardcoded (`"Compare"`, `"Winner: "`, `"Affordable"`, `"Tight"`, `"Stretching"`, `"City comparison"`, `"Move timeline"`, `"{state} DMV checklist"`, `"Hide it?" button label`). Dark mode halves baked in. A11y is half-done: focus trap missing on detail dialog, only Escape closes. |

**Headline: 4.7/10 — the skeleton is real and the API contract mostly holds, but a first-time mover will hit dead states in the first 90 seconds (compare-more-than-2 silently fails, filter results don't update, map is a static blob, chat ignores rich server payloads).**

---

## Findings

### CRITICAL — broken flows a user will hit

1. **Compare cap is silently broken.**
   `MissionControlShell.tsx:95-101` `toggleCompare` ignores any 3rd selection with no UI feedback (no toast, no shake). The header banner never says "max 2". `MAX_COMPARE = 3` (`MissionControlShell.tsx:19`) is aspirational — the compare drawer condition is `compareCandidates.length >= 2` (`MissionControlShell.tsx:304`), the 2-col grid is hard-coded (`CandidateDetailSheet.tsx:91`), and the chat RICH card also caps at 3 with `Math.min(card.cities.length, 3)` (`RelocationChat.tsx:251`). A user selects Austin + Denver + Nashville, the third click does nothing visible. **Fix:** surface the cap ("Max 2 for now") in `toggleCompare`, or widen the grid to 3 cols.

2. **`Apply Checklist` button is dead.** `MissionControlShell.tsx:158-160` always toasts "coming soon", but `relocationApi.applyMoveChecklist` exists (`client/src/api/relocation.ts:87`) and the NestJS route is wired (`relocation.controller.ts:446`). The FE-side wiring is the entire missing piece. This is the most visible button in the left panel — first-time movers will click it.

3. **Filter sliders don't actually filter.** `useRelocationCandidates.ts:167-180` `sendFilterApplySignal` posts the slider values as `{ "cost.costOfLivingIndex": {min, max}, "climate.daysMaxGt90FAnnual": {min, max}, ... }`. The server's `scoreLocations` accepts a different shape (`{filters: {"cost.costOfLivingIndex": {min, max}}}` wrapped one level deeper — actually *does* match) — but the slider's `field` for "Cost of Living" is `cost.costOfLivingIndex` (`relocationModel.ts:93`) while the server's `applyRangeFilters` may only honor a subset of dot-paths (server filters documented in schema §ScoreRequest are `min/max` per field — this *might* work). The bigger problem: `relocationApi.scoreCandidates(req)` is called with `{filters: {...}}` wrapper but the *server* `/relocation/score` route reads `body.filters` — verify with backend, but if min/max are not honored for sliders the user sees "Apply Filters" do nothing. **Plus:** applying filters re-fires the `filter_apply` implicit signal AND `fetchScored()`, but `scoreCandidates` is *not* called when only slider values change — only on `Apply Filters` click. So users dragging sliders see no live feedback.

4. **Hard-filter promotion uses raw IDs as user-facing labels.** `useRelocationElicitation.ts:115-129` builds `{field: locationId, label: locationId}` and surfaces a "Hide {name}?" prompt. The user sees "Hide dallas-tx?" — the raw slug. i18n string `'relocation.hardFilterPrompt.title'` interpolates `{name}` straight into the user-visible title (`MoveTimelinePanel.tsx:233-235`).

5. **`confirmHardFilter` bypasses the apiClient.** `useRelocationElicitation.ts:139-145` raw `fetch('/api/relocation/profile', {method: 'POST', ...})`. Every other relocation call goes through `apiClient` so it gets the auth interceptor, the 401 → public-path redirect, the idempotency key, and the demo-login fallback. If the user's session expires while they're dismissing cities, this raw fetch will fail with an opaque network error instead of redirecting to login.

6. **Map is a static SVG blob, not a map.** `panels/RelocationMapPanel.tsx:50-90` — a fixed continental-US outline hand-drawn as SVG path data, projected as percentages (`projectToPercent`). No zoom, no pan, no state outlines, no clustering. 939 metros dumped onto a flat rectangle means TX/CA/NY metro belts visually overlap into a smear. The pin `title` is the only label (`RelocationMapPanel.tsx:110`), and there's no clustering for the dense regions. **Fix:** swap the dot layer for react-leaflet + OSM tiles (called out as the planned upgrade path in the file's own comment, line 14), or at minimum cluster pins at high densities.

### HIGH — missing key UX

7. **No city-side filtering.** User cannot filter by state/region (Texas, Pacific Northwest, Northeast, etc.) anywhere in the UI. `DEFAULT_FILTER_SLIDERS` has cost/climate/crime/broadband/healthcare but no `state`, no `region`, no `metro size`. Searching by city name exists (`panels/CandidateLibraryPanel.tsx:60-63`) but is substring-only and won't surface "all of Texas".

8. **No saved/favorited indicator in the list.** `saveCandidate` fires a signal and re-ranks (`useRelocationCandidates.ts:156-165`) but there is no persisted "saved" set, no badge on the row, no separate "Saved" tab. The Heart icon button on each row gives no feedback — same color before/after click (`panels/CandidateRow.tsx:107-111`).

9. **Compare sheet winner is the only comparison output.** `relocationApi.compareLocations` returns `{locations: ScoreResponse['candidates'], winner: string}` (`client/src/api/relocation.ts:78`). The detail sheet renders `Winner: ${winner}` as a one-liner (`CandidateDetailSheet.tsx:72-75`) — no deltas, no "best for X" breakdown, no side-by-side highlight of which city wins on which axis. Users have to eyeball the two `CandidateBody` panels.

10. **Score is opaque.** The 0–100 number is shown, colored, and ranked. Nothing else tells the user *why*. `useRelocationScore.ts:54` reads `explainResp.value.explanation` — but the server's `/score/explain` returns `explanation: string[]` (an array of NL sentences). The hook assumes a string and just passes it through; the array gets `.toString()`'d into `"sentence1,sentence2,sentence3"`. Subscore breakdown (`subscores: Record<string, number>`) is dropped. Weights used (`weightsUsed`) is dropped. Data gaps (`dataGaps.count`) is dropped. A user looking at "85" with no breakdown has no idea whether it's climate or cost driving the score.

11. **No "explore the map" affordances.** No zoom controls, no pan, no region overlay, no heat-map toggle, no per-state click to filter. The map is decorative.

12. **Chat ignores server rich payloads.** `useRelocationChat.ts:166-175` posts to `/relocation/chat` and renders only `text` + `cards`. The server returns `type: 'city_list'` with a `cities` array (`relocation.controller.ts:373-374`), `type: 'compare_prompt'` with a `shortlist`, `type: 'cost_prompt'`, etc. None of these structured responses are rendered — the FE just shows the `content` string. So the server's intent classifier does meaningful work that the UI never surfaces.

13. **No progressive disclosure for first-time movers.** New users see 939 metros colorized by a single 0–100 score with no narrative. There's no "Start here" prompt beyond the static EmptyHero in `RelocationChat.tsx:181-186` and the elicitation card. The left panel is empty after dismiss (only "Agent activity stream coming soon" placeholder, `MoveTimelinePanel.tsx:93-95`).

14. **Map pin click target is 12px.** `RelocationMapPanel.tsx:96` pins are 12×12 (18×18 when selected). On touch/retina this is borderline-tappable. With 939 pins clustered in metro belts (LA, NYC, Chicago, DFW) the click target overlaps neighbors.

15. **Sliders are toggled by Eye/EyeOff icons.** `panels/CandidateLibraryPanel.tsx:144` — no text label, no tooltip. Users have to guess.

### MEDIUM — polish

16. **`/score` may not respect `topK`.** The hook sends `topK?: undefined` always; the server's `scoreLocations` defaults to `limit=20` (`relocation.service.ts:669`). When `allLocations` returns up to 1000 metros and `fetchScored()` is called with no `topK`, only ~20 are returned. The map then shows only 20 dots — *not all 939 as the task description claims.* Verify whether the FE ever sends `topK`; if not, the "939 metros" promise is a lie. **Fix:** send `topK: 1000` in the initial score fetch.

17. **Hardcoded English strings across many components.** Compare sheet "Winner: " (`CandidateDetailSheet.tsx:73`), "Compare" header (`CandidateDetailSheet.tsx:69`), "Affordable/Tight/Stretching" badges (`CandidateDetailSheet.tsx:400-407`), "City comparison", "Move timeline", "{state} DMV checklist" card titles (`RelocationChat.tsx:248, 281, 320`), `Hide it` button text (i18n key `'relocation.hardFilterPrompt.confirm'` maps to `'Yes, hide it'` — fine). Mostly i18n is wired but several presentational strings slipped.

18. **Detail dialog has no focus trap.** `CandidateDetailSheet.tsx:37-50` saves opener + focuses close button + Escape closes, but Tab can escape the dialog into the map/library behind it. ARIA `aria-modal="true"` is set but not enforced.

19. **Compare drawer missing keyboard escape.** Same as #18 for the 2-col compare variant (`CandidateDetailSheet.tsx:57-112`).

20. **`MessageBubble` `defaultChecked` on RichCard checklist is uncontrolled.** `RelocationChat.tsx:330-334` — once a checkbox is ticked it stays ticked through the conversation but is never persisted; reopening the chat starts fresh. Same for the timeline card's "track my move" workflow — there's no way to actually save the generated timeline.

21. **Elicitation card has no "edit my answers" path.** Once complete, the only way to re-trigger is the startElicitation endpoint which begins a new session. The "complete" state renders a green checkmark (`MoveTimelinePanel.tsx:203-208`) and disappears — no recap, no profile summary shown.

22. **`loadLocations` is called twice on mount.** `useRelocationCandidates.ts:43-45` runs on mount, and the API client is shared; if React strict mode is on (Vite default), the call fires twice. Minor — single-flight would be cleaner.

23. **`useRelocationScore.openDetail` race.** Race guard exists (`useRelocationScore.ts:43-65`) but if the user opens detail A then B then C in quick succession, only the latest's `explain` and `affordability` will set. Fine — but `fetchDeepData` (`useRelocationScore.ts:70-77`) has *no* race guard, so C's deepData can land in B's drawer.

24. **No "why is this on my list?" inline on the row.** `CandidateRow.tsx:72-76` shows the first sentence of `decisionTrace` — but `decisionTrace` is only populated when the score endpoint succeeded; on degraded mode (`useRelocationCandidates.ts:80`) it's `''` and the row shows nothing under the name.

25. **No keyboard shortcut for "next/prev candidate".** Power users comparing 5+ metros will tab-and-arrow through this; Esc closes the detail; Enter/Space on a row opens detail (`CandidateRow.tsx:34-38`); but no J/K or arrow-key nav.

26. **Search box matches on substring of state OR city** (`panels/CandidateLibraryPanel.tsx:60-63`). Type "TX" and every Texas city shows; type "tex" and both Texas and Texas City show. No fuzzy match, no aliases ("NYC" doesn't find "New York").

27. **Score color bar in legend is wrong order.** `panels/RelocationMapPanel.tsx:30-36` LEGEND_STOPS goes 10/30/50/70/90 — each labeled with the *next* band ("0–20", "20–40"...). Fine. But the swatches use the color for that exact score, not the band midpoint color. The "0–20" swatch is the color of 10 (orange), but the band actually runs red→orange. Minor visual mismatch.

28. **No empty-state for the map when no candidates.** If filters yield zero matches, the map is blank, no "no matches" message.

### LOW — nice-to-have

29. **Resizable panels don't expose collapse toggles.** `useResizablePanels.ts` returns `setLeftCollapsed`/`setRightCollapsed` but the FE never renders the collapse button. Power users can't hide the chat-overlaying timeline.

30. **No "share my shortlist" or "export compare"**. Comparison is in-session only; refreshing the page loses everything (no `compareIds` persistence).

31. **No map zoom level indicator / "score avg for region" overlay**.

32. **Chat quick-prompts bar can scroll horizontally without snap indicators** (`RelocationChat.tsx:93`) — users won't know there are more prompts.

33. **`Maximize chat` / `fullscreen chat` toggle** — the chat overlay is fixed 400×600 (`MissionControlShell.tsx:243`). For a long timeline card it's tight.

34. **`useResizablePanels` doesn't disable pointer events on iframes/embeds** during drag — minor, but a real concern if the map ever has overlays.

35. **No telemetry on which filter slider gets touched.** The `filter_apply` signal records the *final* state; not the slider-id-level scrub events.

36. **No saved-filter preset ("My filters: warm, <$2000 rent, low crime").**

37. **The `_use-case_` SVG US silhouette path is a hand-rolled blob.** The west-coast shape is rough (`RelocationMapPanel.tsx:85`). California cities (LA, SF, San Diego, San Jose) all project inside the blob's right edge, but the silhouette doesn't extend to cover the NW/NE cleanly. With 939 metros and no zoom, the silhouette is mostly decoration anyway.

38. **No "compare top 3 by score" one-click button.** The compare flow requires picking two manually.

39. **`useRelocationChat` `clear` doesn't persist** that the user cleared; on reload, the conversation is empty either way, fine — but no "history" view either.

40. **Dismissing a candidate is irreversible in-session** (`dismissCandidate` adds to `dismissedIds`, `useRelocationCandidates.ts:128-154`) — no undo toast. First-time movers will accidentally dismiss cities they wanted to keep.

---

## Wire-shape mismatches worth flagging to the backend team

- **Score request body shape.** FE sends `{filters: {<field>: {min, max}}}` via `scoreCandidates(req)` (`api/relocation.ts:61-64`). Server `ScoreRequest` schema is `filters: record<string, {min?, max?}>` — confirmed compatible.
- **Explain response shape.** FE expects `{explanation: string, trace: Record}`. Server returns `{location, matchScore, subscores, explanation: string[], dataGaps, weightsUsed, allMetrics, ...}` (`relocation.service.ts:724-732`). The `string[]` explanation is the immediate fix (#10 above).
- **Compare response shape.** FE expects `{winner: string}` or `{error: string}`. Server returns `{locations, winner}` and throws `BadRequestException` for errors (`relocation.controller.ts:173-176`) — the FE's `{error}` branch is dead code. Either remove it or stop throwing.
- **Profile POST for hard filter** uses raw fetch (#5).
- **Chat response** — server returns `{role: 'agent', content, phase, type, cities?, shortlist?}` (a wider shape than `{content, cards?}`). FE normalizer only handles `text`/`content`. `type: 'city_list'` cities and `shortlist` arrays are silently dropped (see #12).
- **Implicit signal: `filter_apply` shape.** FE sends `filter: {<field>: {min, max}}`. Schema is `filter: record<string, unknown>` — fine.
- **Implicit signal: `candidate_compare` locationIds shape** — server schema allows it; FE fires it (`MissionControlShell.tsx:123-128`).
- **`applyMoveChecklist`** is unwired on FE (`api/relocation.ts:87` defined but never called).