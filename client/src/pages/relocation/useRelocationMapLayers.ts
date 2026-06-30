/**
 * Relocation map data layer hook.
 *
 * Loads US states GeoJSON once on mount, aggregates the visible
 * candidates to a per-state score, and exposes the 5-band hex color
 * ramp from the design spec (§1). No leaflet imports here — the
 * presentational `<StateChoroplethLayer>` consumes this hook and
 * handles imperative `map.addLayer` / `map.removeLayer` on zoomend.
 *
 * Ponytail: separate the data hook from the leaflet glue so the hook
 * stays unit-testable and re-usable (e.g. for a future stat panel
 * that wants `getStateScore` without the map). The hook doesn't
 * depend on react-leaflet.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CandidateView } from './relocationModel'

// Ponytail: PublicaMundi/MappingAPI us-states.json — ~89 KB, already
// filtered to 50 states + DC + PR (we drop PR). Upstream of the
// Natural Earth 184 KB admin-1 file, no client-side filter pass
// needed. License: Public Domain (US Census shapefile derivative).
// Upgrade path: if we ever need county polygons, swap to the
// Natural Earth file (~3 MB) and filter to US FIPS at load.
const STATES_GEOJSON_URL =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'

// Spec §1 — 5-band hex ramp. Shared with the pin layer in
// RelocationMapPanel so a 78-pin on a 78-state reads as one signal.
// Keep in sync with `useRelocationMapLayers.ts` callers; do NOT
// diverge without updating §1 of docs/design/relocation-map-viz.md.
export const STATE_SCORE_BANDS: ReadonlyArray<{
  readonly min: number
  readonly hex: string
}> = [
  { min: 80, hex: '#22c55e' }, // excellent
  { min: 60, hex: '#84cc16' }, // strong
  { min: 40, hex: '#eab308' }, // mixed
  { min: 20, hex: '#d97706' }, // weak
  { min: 0, hex: '#b91c1c' }, // poor
] as const

export const NO_DATA_HEX = '#94a3b8' // slate-400 — states with no visible metros

/** Map a 0-100 score to the spec hex band. Score < 0 → poor; > 100 → excellent. */
export function colorForScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return NO_DATA_HEX
  for (const band of STATE_SCORE_BANDS) {
    if (score >= band.min) return band.hex
  }
  return STATE_SCORE_BANDS[STATE_SCORE_BANDS.length - 1].hex
}

// Ponytail: USPS code lookup from the state's full name. PublicaMundi's
// GeoJSON stores `properties.name` only, not USPS. ~50 entries, hand
// maintained — adding a 51st is one line. Alternative would be to
// fetch a separate code→name JSON, but that's two round-trips for
// 50 rows; not worth the cache complexity.
const USPS_BY_STATE_NAME: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
  California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI',
  Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME',
  Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE',
  Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
  'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX',
  Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
}

/** Loose GeoJSON typing — react-leaflet accepts the same shape. */
export interface StateFeature {
  type: 'Feature'
  properties: { name: string; density?: number }
  geometry: GeoJSON.Geometry
}
export interface StateFeatureCollection {
  type: 'FeatureCollection'
  features: StateFeature[]
}

export interface UseRelocationMapLayersResult {
  /** Filtered to 50 states + DC, Puerto Rico dropped. `null` while loading. */
  stateGeo: StateFeatureCollection | null
  /** Mean score of visible candidates per USPS code; null if no metros in that state. */
  getStateScore: (usps: string) => number | null
  /** Spec §1 hex ramp — same function used to style pins and choropleth. */
  colorForScore: (score: number | null | undefined) => string
  /** True on first fetch; stays true on error (rendering proceeds with stateGeo=null). */
  geoLoading: boolean
}

export function useRelocationMapLayers(
  candidates: readonly CandidateView[],
): UseRelocationMapLayersResult {
  const [stateGeo, setStateGeo] = useState<StateFeatureCollection | null>(null)
  const [geoLoading, setGeoLoading] = useState(true)
  // Ponytail: ref so a remount doesn't refetch — the GeoJSON is
  // immutable for the session lifetime (50 states don't change).
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    let cancelled = false
    fetch(STATES_GEOJSON_URL)
      .then(r => {
        if (!r.ok) throw new Error(`states GeoJSON HTTP ${r.status}`)
        return r.json() as Promise<StateFeatureCollection>
      })
      .then(fc => {
        if (cancelled) return
        // Drop Puerto Rico (US-state scope per relocation data set).
        const filtered: StateFeatureCollection = {
          type: 'FeatureCollection',
          features: fc.features.filter(
            f => f.properties?.name !== 'Puerto Rico',
          ),
        }
        setStateGeo(filtered)
      })
      .catch(err => {
        // ponytail: silent fail — the choropleth just won't render.
        // The pin layer is the primary visualization; the choropleth
        // is decorative at zoom ≤ 6. Log so devs see it in console.
        // eslint-disable-next-line no-console
        console.warn('[relocation-map] states GeoJSON load failed:', err)
      })
      .finally(() => {
        if (!cancelled) setGeoLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Aggregate visible candidates → mean score per USPS. Recomputed
  // only when the candidate set identity changes (the parent filters
  // by id, so a deep-equality memo on the array works fine here).
  const scoreByUsps = useMemo(() => {
    const sums = new Map<string, { total: number; count: number }>()
    for (const c of candidates) {
      const usps = c.location.state?.toUpperCase()
      if (!usps) continue
      const acc = sums.get(usps)
      if (acc) {
        acc.total += c.score
        acc.count += 1
      } else {
        sums.set(usps, { total: c.score, count: 1 })
      }
    }
    const out = new Map<string, number>()
    for (const [usps, { total, count }] of sums) {
      out.set(usps, total / count)
    }
    return out
  }, [candidates])

  const getStateScore = useMemo(
    () => (usps: string) => scoreByUsps.get(usps.toUpperCase()) ?? null,
    [scoreByUsps],
  )

  return {
    stateGeo,
    getStateScore,
    colorForScore,
    geoLoading,
  }
}

/** Helper exported for the presentational layer's `onEachFeature` tooltip. */
export function uspsFromFeatureName(name: string): string | null {
  return USPS_BY_STATE_NAME[name] ?? null
}