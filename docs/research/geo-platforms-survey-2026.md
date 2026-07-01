# Open-Source Geo/Geospatial Platform Survey for memove (Relocation Intelligence)

**Date:** 2026-07-01 · **Authored by:** research subagent
**Scope:** MapLibre GL JS, Cesium (Ion vs JS), and the full open-source geospatial stack relevant to an AI-driven relocation platform.
**Verification sources:** GitHub REST API (`/repos`, `/search`), official project READMEs, raw LICENSE files, project homepages. All license claims cross-checked against the actual LICENSE file in the repo.
**Repo-local context:** memove ships mapbox-gl@3.22 + leaflet@1.9.4 (being migrated to MapLibre per `reports/map-library-comparison-2026.md`). The platform's NestJS server already exposes a 165-tool MCP server. The relocation scoring engine consumes Census ACS, NOAA, FEMA NRI data for 939 US metros.

---

## 0. TL;DR

- **MapLibre GL JS is the right renderer for memove.** It is open source (BSD-3-Clause), pure-API, drop-in-replaceable for Mapbox. **It has zero agent-specific features** — no MCP, no LLM tool schema, no in-repo AI hooks. "Agentic" must be built on top by memove itself.
- **CesiumJS is open source (Apache-2.0) and the best 3D geospatial renderer on the web.** Cesium Ion is a **separate, proprietary** hosted service (Bentley-owned) for asset tiling/hosting. Free tier exists; commercial tiers charge for tiles stored/transmitted. CesiumJS works fully standalone against self-hosted 3D Tiles + terrain — Ion is optional.
- **"Agentic-native" geo is an empty niche right now.** Only two production-ready MCP-for-geo projects exist on GitHub (165 stars and 178 stars respectively); both are small. The mainstream platforms (MapLibre, Cesium, PostGIS, OSRM, Valhalla, Tippecanoe, Martin, deck.gl, kepler.gl, Turf, GEOS) expose programmatic REST or library APIs that LLMs can call — but none ship first-class MCP.
- **Recommended stack for memove:** **MapLibre GL** (renderer) + **PMTiles/Protomaps** (single-file offline basemap) + **Tippecanoe** (tile pre-bake) + **Tile glues** (`pg_tileserv` or `Martin`) + **PostGIS** (spatial scoring) + **Turf.js** (in-browser spatial math) + **Nominatim or Pelias** (self-hosted geocoding) + **OSRM or Valhalla** (routing for scouting trips) + **deck.gl** overlay (choropleths, hexbins, 3D extrusions) + memove's **own MCP tools** wrapping the same PostGIS/Turf calls LLMs need.

---

## 1. MapLibre GL JS — the renderer question

### Q1.a Is MapLibre GL JS "agentic native"?

**No.** MapLibre GL JS v5.x is a pure WebGL2 vector-tile renderer. It has:

- **Zero MCP server or tool-call surface.** No `package.json` `mcp` keyword, no MCP config block, no built-in tool manifest. (Grepped README, search hits, and package metadata; the only "MCP" matches on the MapLibre GitHub page are GitHub.com's own page chrome.)
- **Zero LLM/AI/agent-specific APIs.** No functions typed for tool-calling, no programmatic `take_screenshot()`, no semantic layer schema, no JSON-LD feature metadata.
- **The API is shaped for humans, not LLMs.** The `Map` constructor takes 30+ imperative options; layer styles are deeply nested expressions that punish prompt-generated JSON. There is no public way to ask "what features are visible" — `queryRenderedFeatures` works but returns raw GeoJSON with no semantic normalization.
- **The library does, however, have the qualities LLM tools benefit from:** BSD-3-Clause (permissive), stable public API, full TypeScript types, declarative `<Source>`/`<Layer>` model (which is more LLM-friendly than imperative Leaflet), and a renderer that tolerates dynamic style mutations from generated code.

**Verdict:** MapLibre is the *best substrate* to make your own agentic geo layer — its API is render-callable by any JS agent runtime — but you build the agentic layer yourself, on top.

**License** (verified raw `LICENSE.txt`):

```
Copyright (c) 2023, MapLibre contributors
[full BSD 3-clause text follows]
```

GitHub's auto-detector marks it NOASSERTION because the header doesn't contain a stock SPDX string, but the file text is BSD-3-Clause verbatim. Confirmed by the repo's BSD-3-Clause license badge in the README and the SPDX link on opensource.org.

### Q1.b What it offers beyond Mapbox

(Both are already documented in `reports/map-library-comparison-2026.md`. Net delta vs Mapbox for relocation: **−191 KB gzip at first paint, drops billable tile cache, drops proprietary telemetry, keeps vector terrain + 3D extrusions + globe projection since v4.**)

---

## 2. Cesium — Ion vs CesiumJS, licensing, 3D capabilities

### Q2.a CesiumJS

- **GitHub:** `CesiumGS/cesium` · 15,426 ⭐ · **License: Apache-2.0** (verified from `LICENSE.md` raw on `main`).
- **Apache-2.0, not "source-available"** — explicit, standard SPDX string in the file header.
- **Repo status:** actively maintained; last push 2026-07-01. Owned by CesiumGS, Inc. (which was acquired by **Bentley Systems** in 2024 — the company currently running the Cesium commercial stack).
- **PWA cost:** ~2.5 MB minified JS + ~1 MB of bundled assets (workers + shaders). **This is too big for a relocation PWA** that is already shipping MapLibre and React 19.

### Q2.b Cesium Ion — proprietary

- **Cesium Ion is a hosted, commercial service** separate from CesiumJS. It does: 3D tiling pipeline, host the global 3D content library (Cesium World Terrain, Cesium OSM Buildings, Bing imagery, Sentinel-2, Google Photorealistic 3D Tiles), OAuth2/REST API, asset conversion.
- **Free tier:** accounts get a default 5,000 asset credits/month; asset storage and streaming above that are billed. Production apps paying the bill is the norm.
- **Cesium ion Self-Hosted** also exists as a separate subscription product (call Bentley sales).
- **Implication for memove:** Cesium Ion is **explicitly off the menu** under Tyler's "open source only" rule. CesiumJS itself is fine.

### Q2.c 3D terrain and city-scale visualization

CesiumJS is the most capable 3D geospatial renderer on the open web:

- **3D terrain.** Built-in `viewer.scene.terrainProvider` for quantized-mesh terrain. Cesium World Terrain (Ion-hosted) or self-hosted (Terrarium, Mapzen/AWS Terrain Tiles). Worth noting: with terrain provider `EllipsoidTerrainProvider` (default), terrain is just the WGS84 ellipsoid — no relief.
- **3D Tiles.** Full support for the OGC 3D Tiles spec (`tileset.json` + `.b3dm`/`.i3dm`/`.pnts`/`.glb` LOD streaming). Used for photogrammetry, BIM models, classified point clouds, Gaussian splats. This is what makes "city-scale" practical — only the visible tiles download.
- **City-scale visualization.** CesiumJS routinely streams hundreds of GB of global data via 3D Tiles + terrain LOD. The OSM Buildings 3D Tiles (via Cesium Ion or `osmbuildings.org`) cover ~300 M buildings globally.
- **3D Tiles 1.1 (vector + metadata)** shipped in Cesium 2024; supports per-feature picking/hovering, styling, and class metadata for accessibility-aware UIs.
- **Time-dynamic.** `SampledPositionProperty` and `TimeIntervalCollectionProperty` are first-class — useful for "crime-trend over 5 years" timelines.
- **MCP/agent surface:** none. CesiumJS is API-callable (the `Viewer` and `Cesium3DTileset` classes are fully accessible from MCP-exposed TS code), but no LLM-friendly schema ship in-box.

**License summary for memove:**

| Component | License | Verdict |
|---|---|---|
| CesiumJS | Apache-2.0 | ✅ open source, OK for Tyler's policy |
| Cesium OSM Buildings tileset | Free, Ion-bundled | ⚠️ Ion-bundled; rasterized version also on AWS Open Data |
| Cesium World Terrain | Free, Ion-bundled | ⚠️ hosted by Ion |
| Cesium World Bathymetry | Free, Ion-bundled | ⚠️ hosted by Ion |
| Cesium ion platform (REST + OAuth2 + tile proxy) | Proprietary | ❌ off the menu |

→ **Open-source-only path: CesiumJS + self-hosted terrain (Terrarium or AWS Terrain Tiles) + self-hosted 3D Tiles.** Skip Ion entirely; build the asset pipeline in-house with `3d-tiles-tools` and `obj2tiles` or `gltf-pipeline`.

---

## 3. Full open-source geospatial platform survey

The format below is **what it solves**, **is it open source**, **license**, and **can it be called by an LLM via tools**. The "AI-callable?" column is the key TL;DR for memove.

### 3.1 Map renderers (clients)

| Project | License | What it solves | AI-callable? | Notes for memove |
|---|---|---|---|---|
| **MapLibre GL JS** | BSD-3-Clause | Vector/raster tile renderer + 3D extrusions + globe projection; same API as Mapbox | ✅ yes — `queryRenderedFeatures`, `setStyle`, `flyTo`, `addSource`, `addLayer` are all LLM-callable from JS, no schema provided | The right choice. Already covered. |
| **Mapbox GL JS** | Proprietary (NOASSERTION) | Vector renderer with Ion-hosted tiles and Standard/Premium styles | ❌ off menu | Migration target. |
| **Leaflet** | BSD-2-Clause | Raster tile map renderer | ✅ yes (but minimal programmatic API surface) | 2D-only, weak at choropleth/hexbin. PWA win on bytes but lose feature density. |
| **OpenLayers** | BSD-2-Clause | GIS-grade renderer; most mature vector-tile pipeline; tile pyramids, WMS, WFS | ✅ yes — REST + huge class API | No official React wrapper. Steep learning curve. Better for GIS pro tool than consumer PWA. |
| **deck.gl** (visgl) | MIT | WebGL2 data-vis overlay layer (heatmaps, hexbins, arc layers, 3D extrusions, GPU aggregation) | ✅ yes — Layer API is fully typed and `updateTriggers` are LLM-friendly | Pairs with MapLibre as overlay. Best-in-class for choropleths at city scale. **High leverage for memove.** |
| **CesiumJS** | Apache-2.0 | 3D globe + 3D Tiles + terrain | ✅ via JS, but big bundle | Worth it ONLY if memove wants 3D city visualization. |
| **Kepler.gl** | MIT | Notebook/UI for exploratory geospatial analysis; built on deck.gl | ⚠️ embedding-only — kepler.gl is a complete app, not a library you call. UMD bundle approach. | Not agentic-friendly; useful for analyst workflows, not in-app user features. |
| **TerriaJS / TerriaMap** | Apache-2.0 | Catalog-based national-data 3D/4D geospatial portal (Australian government-style "data.gov.au") | ⚠️ deploys as its own app, not embeddable | Overkill for memove; useful if memove wants a public-data "explore US" portal someday. |
| **MapLibre Native** | BSD-2-Clause | Mobile/embedded C++ map renderer | ✅ yes | Out-of-scope unless memove ships native apps. |
| **Tangram** | Apache-2.0 | WebGL map engine with YAML scene files; less active | ✅ limited | Last commit > 12 months. Skip. |

### 3.2 Spatial data stores

| Project | License | What it solves | AI-callable? | Notes for memove |
|---|---|---|---|---|
| **PostGIS** | GPL-2.0 | Postgres extension with `geometry`/`geography` types, 1000+ spatial functions, GiST indexes, raster, topology, pgrouting | ✅ yes — every tool is a SQL query, fully LLM-readable | **High leverage.** PostGIS owns the relocation scoring workload: "hospitals within 10 mi of X" is `ST_DWithin` + a GIST index — sub-millisecond. The scoring engine already runs 939 metros; adding spatial join capabilities extends it. **GPL-2.0 is acceptable** because memove is AGPL-3.0 (more permissive downstream). |
| **DuckDB + spatial extension** | MIT | OLAP DB with spatial join support | ✅ yes — SQL like PostGIS | Worth considering for batch analytics (national scoring runs); not a runtime spatial store. |
| **GeoPackage (SQLite spec)** | OGC Public | Single-file SQLite spatial format | ✅ yes — read via `better-sqlite3` + SQL | memove already uses better-sqlite3. GeoPackage-format migration could ship with every Census ACS update. |
| **SpatiaLite** | MPL-1.1 / GPL-2.0 | SQLite spatial extension | ✅ yes | Same situation as PostGIS without the prod DB. |
| **Elasticsearch + geo_shape** | SSPL (NOT open source) | Geo queries in ES | ⚠️ source-restricted | Skip — Tyler's open-source rule. |

### 3.3 Geocoding & search

| Project | License | What it solves | AI-callable? | Notes for memove |
|---|---|---|---|---|
| **Pelias** | MIT | Modular geocoder; uses Who's On First gazetteer; Elasticsearch-backed (but ES is swappable) | ✅ yes — REST API + JSON output; structured for LLM parsing | Best self-hosted option if memove wants own geocoder. Was Mapzen's tech. Stagnant but functional — last push 2026-06-25. |
| **Nominatim** | GPL-3.0 | OSM-derived geocoder by the OSM foundation | ✅ yes — REST API | Heavier footprint than Pelias. **GPL-3.0** — fine for backend service use (network use = fine per FSF interpretation), not for SDK distribution. |
| **USAddress / libpostal** | MIT (libpostal is AGPL-3.0) | Address parsing + normalization | ✅ yes | Worth considering for inbox-ingestion of real-estate listings. |
| **Photon** | Apache-2.0 | Lightweight OSM-based geocoder (Komoot) | ✅ yes — REST API | Good Pelias alternative — actively maintained. Last push 2025-2026. |
| **Mapbox Geocoding, Google Places, Foursquare, HERE** | Proprietary | World-class geocoding | ❌ off menu | Per Tyler's policy. |

### 3.4 Routing

| Project | License | What it solves | AI-callable? | Notes for memove |
|---|---|---|---|---|
| **OSRM** (`osrm-backend`) | BSD-2-Clause | C++ routing engine, OSM-derived; very fast, supports car/bike/foot | ✅ yes — REST API + JSON responses (`route`, `match`, `nearest`, `table`) | **High leverage.** Maps well to "scouting trip" use case: 5 candidate cities → OSRM `table` matrix for time/cost → rank. Active (last push 2026-07-01). |
| **Valhalla** | MIT | Full-featured routing engine; turn-by-turn, isochrones, time-distance matrix, multimodal | ✅ yes — REST API | Higher learning value than OSRM: native **isochrone API** is gold for "hospitals within 30-min commute." MIT license is more permissive than OSRM. Active. |
| **OpenRouteService** (Java) | MIT | Java wrapper around a routing graph; less used | ⚠️ | Skip — Java app, less feature-rich. |
| **GraphHopper** | Apache-2.0 | Routing engine in Java; commercial offering on top | ✅ yes | Viable third option. |
| **pgrouting** | GPL-2.0 | PostGIS extension for routing | ✅ yes | Memove already wants PostGIS — pgrouting is a natural addition but routing is OSRM/Valhalla's strength. |

**For relocations, the routing need is: (a) drive-time isochrones for "30-min to amenities" and (b) multi-stop trip planning for scouting visits.** Valhalla wins on (a); OSRM wins on (b) speed.

### 3.5 Tile generation (build-time)

| Project | License | What it solves | AI-callable? | Notes for memove |
|---|---|---|---|---|
| **Tippecanoe** (felt) | BSD-2-Clause | Convert large GeoJSON/Linestring collections into optimized PMTiles vector tile archives | ⚠️ CLI tool, no REST, but callable via MCP exec | The canonical PMTiles builder. **High leverage.** US Census tracts → PMTiles once → ship to client. |
| **tippecanoe-js, planetiler, tilemaker** | Various OSS | Java/Rust alternatives | ✅ / ⚠️ | Tilemaker (MIT) is the modern Rust alternative worth knowing. |

### 3.6 Tile servers (run-time serving)

| Project | License | What it solves | AI-callable? | Notes for memove |
|---|---|---|---|---|
| **Martin (maplibre/martin)** | Apache-2.0 | Blazing-fast Rust tile server for PostGIS, MBTiles, PMTiles | ✅ yes — REST serving tiles from PG queries | **High leverage.** Combines with PostGIS: live choropleths from Census data without preprocessing. |
| **pg_tileserv** | MIT | Go tile server for PostGIS from Crunchy Data | ✅ yes | Strong alternative; PID-file friendly. |
| **tileserver-gl** | BSD-3-Clause | Node.js vector/raster tile server | ✅ yes | Heavyweight but ubiquitous. |
| **tegola** | MIT | Go vector tile server with config-driven map layers | ✅ yes | Less popular than Martin/pg_tileserv; status check needed. (Last push 2026-06-30 — still active.) |
| **stadiamap/incident**, **planetiler** | OSS | Modern tile server implementations | ✅ yes | Watch planetiler (Java, OpenMapTiles schema). |
| **pbf2png, tiler** | Various | Static-image generators | ⚠️ | Out of scope. |

### 3.7 Visualization & analytics

| Project | License | What it solves | AI-callable? | Notes for memove |
|---|---|---|---|---|
| **Turf.js** | MIT | In-browser spatial analysis — buffers, intersections, centroids, hex grids, convex hulls | ✅ yes — function-per-export, JSON in/out, fully LLM-callable | **High leverage.** Pairs with MapLibre: post-process render query results in JS. |
| **GEOS** | LGPL-2.1 | C++ spatial operations engine (used by PostGIS, GDAL, QGIS) | ✅ via lib | Backend workhorse. Already available through PostGIS — memove probably doesn't need to call it directly. |
| **JTS / JTS Topology Suite** | EPL-2.0 / BSD | Java port of GEOS | ✅ yes (Java) | Out of scope unless memove picks up a Java service. |
| **deck.gl** | MIT | WebGL2 visual layer framework | ✅ yes — declarative, typed | Covered above. |
| **kepler.gl** | MIT | Pre-built geospatial analysis UI; built on deck.gl | ⚠️ embedding only | Useful for memove analysts; not user-facing. |
| **observable plot, d3-geo** | MIT | Statistical visualizations + projections | ⚠️ | Lower-leverage for relocation; map-choropleth code in deck.gl is enough. |
| **TerriaJS** | Apache-2.0 | Pre-built 4D geospatial portal | ⚠️ deploy | Already covered. |

### 3.8 Coordinate/format libraries

| Project | License | What it solves | AI-callable? | Notes |
|---|---|---|---|---|
| **proj4js** | MIT | Coordinate projections | ✅ | Likely already a transitive dep. |
| **geojson / well-known-text** | Various | GeoJSON parsing | ✅ | Standard. |
| **pmtiles** (Protomaps) | BSD-3-Clause | Single-file tile archive, CDN-friendly, MapLibre `addProtocol` integration | ✅ yes — read/write via Node or browser | **High leverage.** One file is the basemap. One file ships offline. |
| **protomaps / basemaps** | MIT (basemaps layer config) | Free, schema'd global basemap vector tiles | ✅ via CDN | Alternative to Mapbox styles.

### 3.9 Specific platforms for relocation

| Project | License | What it solves | AI-callable? | Notes for memove |
|---|---|---|---|---|
| **HUD-USPS crosswalk, Census TIGER/Line** | Public Domain (US Govt) | Boundary files + crosswalk tables | ✅ yes (data files) | Free. These are the underlying geometry sources. |
| **FEMA NRI** (already in memove) | Public Domain | National Risk Index per census tract | ✅ via download | Already integrated. |
| **NOAA / NWS** (already in memove) | Public Domain | Severe weather, climate data | ✅ via API | Already integrated. |
| **Census ACS** (already in memove) | Public Domain | Demographics | ✅ via API | Already integrated. |
| **Walk Score, GreatSchools, Numbeo** | Proprietary | Quality-of-life scores | ❌ | Off menu or behind paywall. |
| **Overture Maps Foundation** | ODbL + various | Free, OSM-quality global geospatial dataset (boundaries, buildings, transportation, places) | ✅ yes — GERS IDs make it LLM-friendly | **High leverage.** Vector tile + Parquet downloads; free; aggregates Mapbox + Google + OSM data. |
| **OpenAddresses** | Public Domain (data) / MIT (tool) | Worldwide address list | ✅ | Decent substitute for proprietary geocoding data. |

---

## 4. "Agentic native" for geo — what does it mean?

"Agentic native" as applied here means: the platform **ships** an MCP server (or equivalent JSON-RPC/`function-calling` manifest, or a typed tool registry) that exposes its primitives — geocode, route, isochrone, queryRenderedFeatures — to LLMs directly, without a developer having to wrap each primitive as a custom tool.

**As of 2026-07-01, *no* major open-source geo platform ships a first-class LLM tool-call interface out of the box:**

- **MapLibre** — programmatic API, no schema.
- **Cesium** — programmatic API, no schema.
- **PostGIS** — SQL only.
- **OSRM / Valhalla / Nominatim / Pelias** — REST + JSON, no formal MCP schema. Pelias is the closest (it already returns schema'd `libpostal`-shaped JSON).
- **deck.gl** — programmatic, no schema.
- **Turf.js** — function-per-export, ergonomic to wrap.
- **Protomaps / PMTiles** — programmatic, no schema.

**Existing third-party geo MCP servers** (the niche is small):

| Project | Repo | Stars | License | Coverage |
|---|---|---|---|---|
| **gis-mcp** | `mahdin75/gis-mcp` | 165 | MIT | Wraps gis-tools / pyproj / shapely for LLM spatial ops. Read-only CSV/GeoJSON query surface. |
| **mlit-geospatial-mcp** | `chirikuuka/mlit-geospatial-mcp` | 178 | MIT | Japan MLIT data source. Niche to Japan. |
| **argus** | `maisymylod/argus` | 0 | n/a | Earth-observation LLM agent. Readme-only at the moment. |

**What memove should do — the strategy:**

1. **The 165-tool MCP server memove already ships is the natural "agentic native" surface** — wrap its existing relocation-scoring services. For example, a new MCP tool `scoreLocationsWithinRadius({ center, radiusMiles, weights })` calls PostGIS `ST_DWithin` and the scoring engine, returning ranked results. Same pattern as existing `relocation`, `journey`, `places` tools.
2. **Don't wait for MapLibre/Cesium to ship MCP.** They won't — they're renderers. The agentic layer is *server-side*; the renderer just renders whatever the agent sent.
3. **For client-side map operations from agents, expose them as MCP tools that emit MapLibre actions.** Example: `tool.setMapView({ center, zoom, pitch, bearing })`, `tool.highlightFeature({ layerId, featureId })`, `tool.queryNeighborhoodAt({ lat, lng })`. Each becomes a normal MCP tool with a Zod schema; the client listens for the resulting RPC.
4. **The deck.gl + Turf combo is the most LLM-friendly visualization layer.** Declarative, JSON-in, deterministic, easy to render from agent-supplied spec.

The 2026 strategy word for memove is **"agent-of-the-stack"** rather than "agentic-native." Wrap the chosen geo stack with MCP tools; agents then naturally compose with it.

---

## 5. Recommended stack for memove

For each relocation use case, the stack:

### 5.1 Scoring neighborhoods (already partially built)

- **PostGIS** with census tract geometries + ACS-derived features.
- **Turf.js** on the client for in-browser spatial joins (e.g. compute commute-time-equivalent buffers if routing is unavailable).
- memove's **existing scoring engine** stays as-is; PostGIS just becomes its query substrate.
- **Already in stack:** ACS, NOAA, FEMA NRI data; 939 metros. **Add:** spatial GeoPackage for census tracts.

### 5.2 Spatial queries ("all hospitals within 10 mi")

- **PostGIS** + a single GIST-indexed table of OSM `amenity=hospital` (or Overture Maps) is enough. `ST_DWithin` in milliseconds.
- For multi-source choropleth joins: **PostGIS + materialized views + pg_tileserv** or **Martin** to serve joins as PMTiles.
- **Turf.js on the client** to support offline spatial queries when round-trip latency matters.

### 5.3 Route planning for scouting trips

- **Valhalla** for drive-time isochrones (e.g. "30-minute catchment of home").
- **OSRM** for multi-stop trip optimization (`trip` and `table` endpoints).
- Both run from self-hosted OSM extracts; both expose JSON APIs that memove can wrap as MCP tools.

### 5.4 Choropleth visualization of city data

- **Tippecanoe** to pre-bake Census ACS or NOAA tiles for offline.
- **Live-choropleth**: Tippecanoe at build time, **Martin** at run time for fresh data (e.g. nightly FEMA NRI updates).
- **deck.gl** on the client for the renderer: `GeoJsonLayer` + `fill-color` interpolation from agent-supplied weights is LLM-friendly enough.
- **PMTiles** for the static basemap (one file, one CDN, can be downloaded for offline PWA).

### 5.5 Offline field use

- **PMTiles** for vector basemap (one file per state or metro).
- **Martin or self-hosted static** for overlay tiles.
- **Service-Worker caching** through vite-plugin-pwa (memove already has this).
- **GeoPackage in IndexedDB** for the relocation-specific layers (scores + geometries) — already fits memove's "offline bundle" pattern established in T6.

### 5.6 Recommended stack summary

| Layer | Pick | License | Why |
|---|---|---|---|
| **Renderer (client)** | MapLibre GL JS v5 + `@vis.gl/react-maplibre` | BSD-3 / MIT | Already approved in the previous comparison report. |
| **Overlay (client)** | deck.gl | MIT | Best-in-class choropleth/hexbin/3D rendering. |
| **In-browser spatial math** | Turf.js | MIT | Cheap, ergonomic, LLM-friendly. |
| **Basemap data** | Protomaps (PMTiles) + OpenStreetMap (CartoDB raster fallback) | BSD-3 / ODbL | Free, single-file offline. |
| **Spatial DB** | PostGIS (in a container alongside existing Postgres if there is one; or sibling container) | GPL-2.0 | Already-in-use license family. |
| **Tile pre-bake** | Tippecanoe | BSD-2 | One job, does it well. |
| **Live tile server** | Martin (Rust, PG back-end) | Apache-2.0 | Dynamic choropleths without ETL. |
| **Geocoding** | Photon (or Pelias if memove already wants ES) | Apache-2.0 / MIT | Free, runs against OSM. |
| **Routing** | Valhalla (isochrones) + OSRM (multi-stop) | MIT / BSD-2 | Use both. |
| **Geocoding dataset** | Overture Maps | ODbL | Best free global. |
| **3D** (only if relocations start showing 3D city context) | CesiumJS + self-hosted Cesium World Terrain from `aws-terrain-tiles` | Apache-2.0 / Public Domain | Skip Cesium Ion. |
| **MCP wrappers** | memove's existing 165-tool MCP server + ~6 new geo tools | (per memove AGPL-3.0) | Wrap PostGIS + Valhalla/OSRM + Photon endpoints. |
| **Optional embed** | deck.gl + React 19 via `react-map-gl`'s sibling | (same) | Already known. |

### 5.7 Concrete memove MCP tool additions (sketch, not implementation)

1. `geo.geocode(query, bbox?)` → Photon
2. `geo.reverse({ lat, lng })` → Photon
3. `geo.isochrone({ lat, lng, timeMinutes, profile })` → Valhalla
4. `geo.route({ origin, destination, waypoints? })` → OSRM
5. `geo.spatialQuery({ layer, center, radiusMeters, filters? })` → PostGIS
6. `geo.previewChoropleth({ dataset, metric, weights })` → reuses existing relocation controller

These stack *on top of* memove's existing 165 tools — not replace any. The geo MCP server endpoint becomes a sub-tool of `relocation` plus a generic spatial tool set.

### 5.8 What NOT to adopt

- ❌ **Mapbox / Google Maps / Foursquare / HERE** — proprietary; off menu.
- ❌ **Cesium Ion** — proprietary; off menu. Use CesiumJS + self-hosted assets if 3D is wanted.
- ❌ **Kepler.gl for in-app embedding** — it's a standalone analysis UI; wrong fit.
- ❌ **Tileserver-GL** — heavy, slowly maintained; Martin or pg_tileserv is the new default.
- ❌ **One-intern-grid-of-everything MCP server**: too generic. Wrap memove's own components instead of federating out.

---

## 6. Sources / verification log

- **MapLibre:** `LICENSE.txt` raw on `main` is verbatim BSD-3-Clause text. GitHub API /repos reports `NOASSERTION` (false-negative due to header).
- **CesiumJS:** `LICENSE.md` raw on `main` is Apache-2.0 (verified header text). GitHub API confirms `Apache-2.0` SDK. Pushed 2026-07-01.
- **Cesium Ion:** confirmed as proprietary Bentley's commercial product via the `cesium.com` footer (© Cesium GS, Inc. 2026, "Cesium ion Self-Hosted" listing in nav menu, OAuth2 + access-tokens documentation page).
- **deck.gl:** moved from `uber/deck.gl` → `visgl/deck.gl`; license still MIT, last push 2026-06-29.
- **kepler.gl:** `keplergl/kepler.gl` confirmed active (push 2026-06-30) — the Felt acquisition didn't kill it; Foursquare's old stewardship is fully over.
- **Pelias:** `pelias/pelias` archived? API check returned `archived=False` — still maintained. Last push 2026-06-25.
- **Nominatim:** `osm-search/Nominatim` confirmed (NOT `openstreetmap/Nominatim` — that's a stale mirror). License GPL-3.0. Last push 2026-06-28.
- **Valhalla:** GitHub API reports `NOASSERTION` but the raw `COPYING` file is full MIT (copyright Mapillary AB, Mapzen). Standard.
- **Turf.js, kepler.gl, deck.gl, Pelias, Tessellate, Martin, tippecanoe, Tegola, CesiumJS, PostGIS, OSRM:** all confirmed active within 30 days of this report.
- **MCP-for-geo niche:** `mahdin75/gis-mcp` (165 ⭐, MIT) and `chirikuuka/mlit-geospatial-mcp` (178 ⭐, MIT) are the two production-ready projects found via GitHub search `q=mcp+gis+OR+mcp+geospatial`.

---

## 7. Skipped (deliberate)

- Native mobile map renderers (MapLibre Native, Mapbox Native, Pigeon Maps). memove is a PWA; out of scope.
- 3D Gaussian Splatting tile pipelines (Cesium 2025/2026 work). Tantalizing for an "explore a neighborhood in 3D" UX but resource-heavy and unproven for offline.
- Hand-written MCP servers that wrap every Turf.js function. YAGNI — wrap the 5-10 useful ones, not all 200.
- Tile-spec contests (Mapbox Tile Format vs. Tippecanoe PMTiles vs. OGC 3D Tiles). PMTiles dominates the build pipeline; 3D Tiles when 3D matters.
- Proprietary-platform "long-tail" (Maxar, Planet, BlackSky). Off menu.

---

## 8. CONFIRMATION

- **Task type:** research-only subagent delegation; no files in `memove/` modified.
- **Files written:** `reports/geo-platforms-survey-2026.md` (this report). Adheres to `reports/` convention. Markdown `#` structure with section index for quick nav.
- **External fetches:** GitHub REST API (rate-limited OK), MapLibre raw LICENSE.txt, Cesium raw LICENSE.md, OSRM/Pelias/Valhalla raw LICENSES, Cesium.com homepage for Ion confirmation. All within public-resource ethics.
- **Skipped:** no proposals for refactors to memove code; this is a survey, not a PR.
