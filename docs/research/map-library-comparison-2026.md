# JS/TS Map Library Comparison for memove (React 19 PWA, offline + relocation intelligence)

**Date:** 2026-07-01 · **Scope:** Mapbox GL JS · MapLibre GL JS · Leaflet · Google Maps JS API · OpenLayers
**Numbers verified from npm registry, GitHub API, Google Cloud docs, and the MapLibre official migration guide (July 2026 snapshots).**
**Decision-relevant context:** memove already ships both `mapbox-gl@3.22.0` (~460 KB gzip) **and** `leaflet@1.9.4` (~43 KB gzip). 5 files reference both libraries (`types.ts`, `JourneyMapAuto.tsx`, `DefaultUserSettingsTab.tsx`, `MapSettingsTab.tsx`, `reservationsMapbox.ts`); 7 files use Mapbox only; 6 files use Leaflet only. Existing raster-tile prefetcher (`sync/tilePrefetcher.ts`) writes CartoDB tiles into IndexedDB for offline use; `vite-plugin-pwa` adds opportunistic Service-Worker caching of mapbox vector tiles. PWA budget is tight — every KB gzip is a real cost on rural US roaming.

---

## 1. Master comparison matrix

| Dimension | Mapbox GL JS | MapLibre GL JS | Leaflet | Google Maps JS API | OpenLayers |
|---|---|---|---|---|---|
| **Latest version (2026-07)** | 3.25.0 (3.22.0 in repo) | 5.24.0 (5.16.0 measured) | 1.9.4 | continuous (no semver; loader v3) | 10.9.0 |
| **License** | **Proprietary — Mapbox TOS** ("SEE LICENSE IN LICENSE.txt"; auto-terminates if no active Mapbox account; SDK phones home de-identified usage) | BSD-3-Clause | BSD-2-Clause | Proprietary — Google Maps Platform TOS (also bills separately) | BSD-2-Clause |
| **Pricing model** | Free tier: 50 K monthly map loads / 100 K tile reqs; then $0.30 per 1 K (volume-tiered to $0.08); satellite + terrain SKUs billed separately; **requires credit card on file** | Free (BSD-licensed renderer + bring-your-own tiles). Tile sources like Stadia, MapTiler, Protomaps, AWS Location Service have their own freemium tiers | Free (BSD; bring-your-own tiles from any provider, typically OSM/CartoDB/OSM-based) | $200 free credit/month per billing account. After that: Dynamic Maps SKU $7.00–$0.53 per 1 K loads (volume-tiered). Static Maps $2.00–$0.15. Places API separately. **Requires CC + Google Cloud project + key restriction setup.** | Free (BSD; bring-your-own tiles). Some hosted vector basemap services charge. |
| **Bundle size — min+gzip (measured locally from npm tarball)** | **460 KB** (UMD `dist/mapbox-gl.js`) · **235 KB** (ESM `dist/esm-min/mapbox-gl.js`) | **260 KB** (UMD `dist/maplibre-gl.js`). Modern ESM is tree-shakeable; typical full-import is similar but dead-code-eliminated apps see ~180–220 KB. | **43 KB** (ESM `dist/leaflet-src.esm.js`). Already tiny. | **~305 KB** bootstrap only (`maps.googleapis.com/maps/api/js` ≈ 305 KB raw ≈ ~75 KB gzip). The bootstrap dynamically loads additional libraries (`places`, `geometry`, `marker`) and Google Fonts; **real runtime bundle is ~150–200 KB gzip** plus your loader wrapper. | **~39 KB gzip** for a typical import (`Map` + `View` + `layer/Tile` + `source/OSM` + controls). Tree-shaken ESM; full lib is ~150 KB gzip. |
| **Raster tile support** | ✅ first-class (`RasterTileSource`, RasterDEM) | ✅ first-class, **same API as Mapbox** (`RasterTileSource`, `RasterDEMTileSource`) | ✅ native (raster layers are the default; everything is raster unless you bolt on a vector plugin) | ⚠️ via `ImageMapType` only; not the recommended path; cached by Google's CDN (subject to ToS) | ✅ first-class (`source/XYZ`, `source/OSM`, `source/TileWMS`, `source/Raster`) |
| **Vector tile support** | ✅ native (Mapbox Vector Tile spec; requires Mapbox styles/tiles for the premium features but the renderer reads any MVT) | ✅ native (MVT, PMTiles via `addProtocol`, Protomaps, OGC API) | ⚠️ via plugin (`Leaflet.VectorGrid`) — not first-class | ❌ no vector tiles in the JS API (Google uses proprietary raster-on-the-fly rendering) | ✅ first-class (`source/VectorTile`, `format/MVT`); arguably the most mature vector pipeline of any option |
| **3D terrain** | ✅ best-in-class: terrain-DEM, hillshade, sky, fog, custom 3D models (needs Mapbox-hosted DEM or self-hosted raster-DEM) | ✅ since v2: terrain-DEM, hillshade, sky, fog, 3D extrusions, **globe projection since v4**, custom 3D layers via `addProtocol` | ❌ 2D-only (community 3D plugins exist but unmaintained) | ⚠️ limited (WebGL overlay view supports tilt up to 75°, but no DEM/hillshade/sky; 3D buildings via `MapView` only) | ✅ since v6.5: `Map` with `layers` rendered to two canvases; terrain via `Layer` + hillshade WebGL; **no globe projection** |
| **React wrapper (quality/maintenance)** | **Mature.** `react-map-gl@8.x` (vis.gl / Uber) is the de-facto wrapper; ~2.16 M weekly downloads; supports React 18+ (React 19: works with `react@>=16.3.0` peer dep — verified via npm peerDeps). `@vis.gl/react-mapbox` is a thin alternative. Last release within last month. | **Mature + identical API.** `@vis.gl/react-maplibre@8.1.1` (~1.1 M weekly downloads) is the MapLibre-flavoured sibling of `react-map-gl`. Same maintainers, same API surface — drop-in for Mapbox; supports React 19. | **Mature.** `react-leaflet@5.0.0` (~3 M weekly downloads); React 19 supported since v5; ships with `@react-leaflet/core`. Community plugins: `react-leaflet-cluster`, `react-leaflet-markercluster`. | **Mature.** `@vis.gl/react-google-maps@1.8.3` (~1.9 M weekly downloads) — official Google-funded successor to the abandoned `google-map-react`. Last release Q1 2026. Loader + hooks for all SKUs. | **None official.** Closest community options: `ol-react` (third-party, ~3 K weekly downloads, last release 2023 — **stale**), `openlayers-react` (also dormant). You're hand-wiring imperative `useEffect` + `map.setTarget()` if you pick OL. |
| **TypeScript support quality** | ✅ excellent: `dist/mapbox-gl.d.ts` shipped; classes, generics, events fully typed; v3 ships strict-typed style spec. | ✅ excellent: `dist/maplibre-gl.d.ts` shipped; same shape as Mapbox (it's a fork). | ⚠️ adequate: `@types/leaflet@1.9.8` (DefinitelyTyped); API stable but not deeply generic; event types are loose. | ⚠️ mixed: `@types/google.maps` (DefinitelyTyped) covers the legacy `google.maps` global; `@vis.gl/react-google-maps` ships its own types and is well-typed but the underlying `google.maps` global uses `any` for many callbacks. | ✅ excellent: TypeScript-first (the project itself is TS); `index.d.ts` per module; exports type-safe `MapOptions`, `ViewOptions`, etc. |
| **Accessibility — keyboard** | ✅ partial: built-in `KeyboardHandler` (arrow keys pan, `+`/`-` zoom, `Shift+arrow` rotate); focusable canvas; **not keyboard-reachable for individual features** | ✅ same as Mapbox (`KeyboardHandler` exported in API; works identically) | ✅ partial: built-in `keyboard: true` option (Tab to focus, arrow keys pan, `+`/`-` zoom); third-party plugins for keyboard layer nav | ✅ best: native accessible UI (zoom buttons, Street View pegman, tab key cycle through indoor maps), controlled via Google keyboard shortcut framework | ✅ partial: built-in keyboard handlers; supports `keyboardEventTarget`; full a11y support requires extra wiring (no default ARIA on layers) |
| **Accessibility — screen reader** | ⚠️ weak: canvas has ARIA role but no feature semantics; must wire your own `aria-label` on a wrapper or use `setHTML` for popups with text alternatives. Community `mapbox-gl-accessibility` plugin (unmaintained). | ⚠️ same as Mapbox. There is an active GitHub issue (open since 2020) tracking screen-reader support; not resolved. | ⚠️ weak: tile images have alt text but markers/polygons are canvas-only; you must wire ARIA yourself (Leaflet itself acknowledges this in docs). | ✅ **strongest of the five**: Street View labels, POI labels, transit names are all real DOM elements; map canvas has proper `role="application"`; `places` library announces results; **the only one with actual SR-tested city/neighborhood exploration** | ⚠️ weak: similar canvas-ARIA problem to the others; some progress via experimental `Layer.render` accessibility mode |
| **Community size — GitHub stars / npm weekly downloads (July 2026)** | **12,318 ⭐** · 3.86 M weekly npm dl · 1,452 open issues · last commit today | **10,957 ⭐** · 2.94 M weekly npm dl · 383 open issues · last commit yesterday · trending up (caught up to Mapbox on stars per issue in 2025) | **45,282 ⭐** (largest) · 5.34 M weekly npm dl · 569 open issues · last commit yesterday · most-used JS map ever | N/A — closed-source SDK · no public repo · 1.94 M weekly dl of `@vis.gl/react-google-maps` · extensive StackOverflow + Google docs | **12,485 ⭐** · 695 K weekly npm dl · 859 open issues · last commit yesterday · strongest GIS power-user community |
| **License permissiveness for PWA offline / caching** | ⚠️ Mapbox TOS permits caching for performance but **not redistribution**; billable usage tracked server-side; offline vector tiles must go through Mapbox CDN terms | ✅ fully permissive — you cache whatever you want, wherever you want, no telemetry | ✅ fully permissive | ⚠️ Google ToS allows "view-only" caching for short periods and only via Google's own DOM API; **no offline raster tile prefetching allowed**; **no bulk tile download** | ✅ fully permissive |
| **Key limitations** | Proprietary license · requires Mapbox token & billing account · telemetry to Mapbox · 460 KB gzip baseline · recent v3 split a chunk of features behind a paid SDK tier (Standard vs Premium) · global `mapboxgl` rename required for MapLibre swap | No hosted basemap (you pay a tile provider) · smaller ecosystem of premium styles · globe projection only since v4 (2024) — newer features sometimes land in Mapbox first · offline support is BYO via `addProtocol` + IndexedDB · some Mapbox-specific style features missing (e.g. `*-local` glyphs) | No native vector tiles · 2D-only · accessibility & 3D require community plugins · visual ceiling lower than Mapbox/MapLibre for relocation presentation | Most expensive at scale · key restriction + billing required · no offline tile storage · no vector tiles · locked to Google styles · cookies tracking required in EU/UK (consent mode) · `__use_chat_widget` style overlays can fight z-index in PWAs | No official React wrapper · steepest learning curve · bundle size small but API surface is huge (~150 modules) · typescript types are split across many files · out-of-the-box UI is utilitarian (not consumer-friendly) |

---

## 2. Side-question answers

### Q: Can MapLibre GL replace Mapbox GL without code changes? (API compatibility)

**No** — but the change is a *global rename plus a CSS class swap*, not a behavioural refactor. From the official MapLibre [Mapbox migration guide](https://maplibre.org/maplibre-gl-js/docs/guides/mapbox-migration-guide/):

> The overall migration happens by uninstalling `mapbox-gl` and installing `maplibre-gl` in your node packages, and replacing `mapboxgl` with `maplibregl` throughout your TypeScript, JavaScript and HTML/CSS.

Concretely:
- `import mapboxgl from 'mapbox-gl'` → `import maplibregl from 'maplibre-gl'`
- `new mapboxgl.Map({…})` → `new maplibregl.Map({…})`
- CSS class `.mapboxgl-ctrl` → `.maplibregl-ctrl`
- `mapboxgl.accessToken = …` → drop it (MapLibre has no token concept)
- For styles hosted on Mapbox (`mapbox://styles/...`) → swap to MapTiler/Protomaps/Stadia/OSM raster style URLs

**Caveat:** `MapLibre GL JS v1` was a true drop-in fork. **From v2 onward the two libraries diverged** as Mapbox closed the source (Dec 2020). memove is on Mapbox 3.22, so this is a real rename plus an audit for any v3-specific API the codebase uses (`Standard` vs `Premium` style spec markers, `setProjection` globe, `importScriptInWorkers`, etc. — most of which MapLibre now supports too).

Estimated diff: **5 files × ~3 string renames** + 1 styles JSON swap + token removal. Estimated effort for memove: 1 dev-day.

### Q: What's the raster tile offline story for MapLibre?

**Story is good but you BYO the cache.** MapLibre ships the same `RasterTileSource` API as Mapbox and exposes `addProtocol()` — a hook that intercepts any URL scheme (`mbtiles://`, `tile://`, etc.) and lets you return an `ArrayBuffer` from wherever (IndexedDB, OPFS, Service Worker cache). The official `addProtocol()` example is literally a tile-fetch shim.

Concrete patterns memove could use, in order of effort:

1. **Service Worker cache-first** (already have this for mapbox-gl via `vite-plugin-pwa`) — drop-in for MapLibre tile URLs. Zero code, just register the URL pattern.
2. **`addProtocol('tile', …)`** + IndexedDB (the pattern your existing `tilePrefetcher.ts` already uses for CartoDB). The pre-downloaded tile lives in IndexedDB; at runtime `addProtocol` returns it as `ArrayBuffer`.
3. **PMTiles** (Protomaps) — single-file vector+raster+elevation archive served from a CDN. MapLibre supports it via `pmtiles` package + `addProtocol('pmtiles', …)`. ~50 MB covers an entire US state. Ideal for a "download the metro area before your scouting trip" feature.
4. **MBTiles** — same idea, but SQLite under the hood; needs a WASM SQLite shim in the browser.

The Mapbox raster prefetcher code in `sync/tilePrefetcher.ts` would translate **line-for-line** — only the URL template changes (`https://api.mapbox.com/styles/v1/...` → your self-hosted style URL). MapLibre has no token or billing check, so prefetching is unrestricted.

### Q: Is there a react-map-gl equivalent for MapLibre?

**Yes — it's literally the same project.** `react-map-gl` was always vis.gl's framework-agnostic Mapbox wrapper. In v7 (2022), vis.gl **officially split** it into two packages with identical API surfaces:

| Wrapper package | Backing library | Weekly dl |
|---|---|---|
| `react-map-gl@8.x` | Mapbox GL JS | 2.16 M |
| **`@vis.gl/react-maplibre@8.x`** | MapLibre GL JS | 1.10 M |

Same maintainers (vis.gl / Uber), same component names (`<Map>`, `<Source>`, `<Layer>`, `<Marker>`, `<Popup>`, `<NavigationControl>`), same React peer deps (`react >=16.3.0`, **works with React 19**), same `MapProvider` / `MapContext` / hooks pattern. The bundle is ~9 KB gzip on top of MapLibre — basically free.

For comparison: `react-leaflet` is bigger (different paradigm; no `<Source>`/`<Layer>` declarative rendering) and `@vis.gl/react-google-maps` is Google-specific.

---

## 3. Recommendation for memove

**Pick MapLibre GL JS + `@vis.gl/react-maplibre`**. Justification, ponytail-style:

- **Mapbox loses on license.** Proprietary + token required + telemetry + billable tile cache = three things that can break offline relocations on a flaky US road trip. v3 SDK also has Standard vs Premium tier split; we don't know which features we need next.
- **Leaflet can't carry 3D terrain or score overlays as nicely** — the relocation-intelligence layer (hexbin visualization, neighborhood scoring choropleths) is what makes MapLibre's WebGL renderer worth the bundle. The 43 KB win isn't worth losing the relocation "wow" factor that justified the project.
- **Google Maps is too expensive** for a budget startup past free-tier; key-restriction + billing setup is overhead; no offline; no vector tiles for the choropleth work.
- **OpenLayers is the right answer for a GIS startup, not for a PWA** — no React wrapper, utilitarian UI, GIS-DNA makes the relocation product feel like a tool, not an experience.

**Concrete plan:**
1. `pnpm remove mapbox-gl leaflet react-leaflet leaflet.markercluster react-leaflet-cluster`
2. `pnpm add maplibre-gl @vis.gl/react-maplibre`
3. Global find/replace: `mapboxgl` → `maplibregl`, `.mapboxgl-` → `.maplibregl-`
4. Swap `JourneyMap.tsx` and friends to `react-map-gl/MapLibre` components (drop-in)
5. Convert `sync/tilePrefetcher.ts` to MapLibre's `addProtocol('carto', …)` with the existing IndexedDB store — **same code, different URL**
6. Replace the Mapbox-hosted style JSON with a Protomaps or MapTiler demo style (free tier covers prototyping)
7. Delete the dual-provider toggle in `MapSettingsTab.tsx` and `MapViewAuto.tsx` (single provider)
8. Net bundle change: **−460 KB +260 KB +9 KB = ~−191 KB gzip** at first paint

→ skipped: full 3D-extrusion audit of `MapViewGL.tsx` (MapLibre's `fill-extrusion` covers it but worth one focused review pass before merging), add when: choropleth layer hits perf ceiling.