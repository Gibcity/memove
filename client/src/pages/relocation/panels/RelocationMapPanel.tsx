/**
 * RelocationMapPanel — US map of candidate cities with score-coloured pins,
 * native Mapbox GL clustering, hover/click popups, state choropleth, and
 * viewport-bounded stat tracking.
 *
 * Replaces the prior react-leaflet + OSM tiles + react-leaflet-cluster stack
 * with Mapbox GL to match the rest of the app (JourneyMapGL / MapViewGL).
 * All three deps from the old stack are unused after this; nothing else in
 * the repo imports them.
 *
 * Implementation notes:
 *  - mapbox-gl native clustering (`cluster: true` on a GeoJSON source) does
 *    the 939-metros-into-metro-buckets work; no supercluster dep needed.
 *  - State choropleth becomes a `fill` layer with a `match` expression over
 *    `properties.name`, scored through the existing `getStateScore(usps)`.
 *  - Popups use Mapbox's HTML popup (same className pattern as JourneyMapGL),
 *    not the previous Leaflet `Tooltip`.
 *  - Bounds tracking fires on `moveend`/`zoomend` and produces a plain
 *    `{south, west, north, east}` shape — ViewportStatPanel reads it
 *    without pulling in Leaflet.
 *  - "No Mapbox access token" fallback is identical to JourneyMapGL's.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useTranslation } from '../../../i18n'
import { useSettingsStore } from '../../../store/settingsStore'
import type { CandidateView } from '../relocationModel'
import {
  useRelocationMapLayers,
  uspsFromFeatureName,
  type StateFeatureCollection,
} from '../useRelocationMapLayers'
import ViewportStatPanel, { type MapBounds } from './ViewportStatPanel'

// Continental US centre + default zoom (covers the lower 48).
const US_CENTER: [number, number] = [-98.35, 39.5]
const US_ZOOM = 3.5
const CLUSTER_RADIUS = 50
const CLUSTER_MAX_ZOOM = 10
const POINT_MIN_ZOOM = CLUSTER_MAX_ZOOM

// Legend colour ramp — same breakpoints as `colorForScore` so the swatches
// line up visually with both pins and the choropleth.
const LEGEND_STOPS: Array<{ score: number; color: string; label: string }> = [
  { score: 10, color: '#b91c1c', label: '0–20' },
  { score: 30, color: '#d97706', label: '20–40' },
  { score: 50, color: '#eab308', label: '40–60' },
  { score: 70, color: '#84cc16', label: '60–80' },
  { score: 90, color: '#22c55e', label: '80–100' },
]

interface Props {
  candidates: CandidateView[]
  selectedId: string | null
  onMarkerClick: (id: string) => void
  /** Optional — fires when a state polygon is clicked. */
  onStateClick?: (usps: string) => void
}

/** Inject the relocation popup card style once per document. */
function ensurePopupStyle() {
  if (document.getElementById('memove-relocation-popup-style')) return
  const s = document.createElement('style')
  s.id = 'memove-relocation-popup-style'
  s.textContent = `
    .mapboxgl-popup.memove-relocation-popup { pointer-events: none; animation: memove-relocation-popup-in 160ms ease-out; }
    .mapboxgl-popup.memove-relocation-popup .mapboxgl-popup-content {
      padding: 8px 12px 9px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(14px) saturate(180%);
      -webkit-backdrop-filter: blur(14px) saturate(180%);
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16), 0 2px 4px rgba(0, 0, 0, 0.05);
      font-family: var(--font-system);
    }
    .mapboxgl-popup.memove-relocation-popup .mapboxgl-popup-tip {
      border-top-color: rgba(255, 255, 255, 0.94);
      border-bottom-color: rgba(255, 255, 255, 0.94);
    }
    .memove-relocation-popup-title { font-size: 12.5px; font-weight: 600; color: #18181B; line-height: 1.25; }
    .memove-relocation-popup-sub { font-size: 11px; color: #71717A; margin-top: 2px; }
    .memove-relocation-popup-dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      vertical-align: middle; margin-right: 5px; border: 1.5px solid #fff;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.12);
    }
    @keyframes memove-relocation-popup-in { from { opacity: 0; } to { opacity: 1; } }
  `
  document.head.appendChild(s)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildCityPopupHtml(name: string, score: number, color: string): string {
  const safeName = escapeHtml(name)
  return `
    <div class="memove-relocation-popup-title">
      <span class="memove-relocation-popup-dot" style="background:${color}"></span>${safeName}
    </div>
    <div class="memove-relocation-popup-sub">Score ${Math.round(score)}</div>
  `
}

function buildClusterPopupHtml(count: number): string {
  return `
    <div class="memove-relocation-popup-title">${count} metros</div>
    <div class="memove-relocation-popup-sub">Click to zoom in</div>
  `
}

/** Stable feature id from candidate.location.id. */
function featureId(locId: string): string | number {
  // Mapbox feature ids must be number or string. Hash the slug to a
  // 31-bit int so very long ids stay safely numeric; collisions across
  // 939 metros are improbable.
  let h = 5381
  for (let i = 0; i < locId.length; i++) h = ((h << 5) + h + locId.charCodeAt(i)) | 0
  return h
}

/** No-op popup used as the click target for unclustered points. */
const POINT_POPUP_OPTS: mapboxgl.PopupOptions = {
  closeButton: false,
  closeOnClick: false,
  closeOnMove: false,
  anchor: 'bottom',
  offset: 14,
  className: 'memove-relocation-popup',
  maxWidth: '260px',
}

export default function RelocationMapPanel({
  candidates,
  selectedId,
  onMarkerClick,
  onStateClick,
}: Props): ReactElement {
  const { t } = useTranslation()
  const mapboxToken = useSettingsStore(s => s.settings.mapbox_access_token || '')
  const mapboxStyle = useSettingsStore(s => s.settings.mapbox_style || 'mapbox://styles/mapbox/light-v11')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const onMarkerClickRef = useRef(onMarkerClick)
  onMarkerClickRef.current = onMarkerClick
  const onStateClickRef = useRef(onStateClick)
  onStateClickRef.current = onStateClick
  const [mapReady, setMapReady] = useState(false)
  const [zoom, setZoom] = useState(US_ZOOM)
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null)

  const { stateGeo, getStateScore, colorForScore } = useRelocationMapLayers(candidates)
  const lastSelectedIdRef = useRef<string | null>(null)
  const locations = useMemo(() => candidates.map(c => c.location), [candidates])

  // GeoJSON FeatureCollection of all visible candidates. Recomputed only
  // when the candidate identity set changes (parent memoises by id).
  const candidateFc = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    return {
      type: 'FeatureCollection',
      features: candidates.map(c => ({
        type: 'Feature',
        id: featureId(c.location.id),
        geometry: { type: 'Point', coordinates: [c.location.lng, c.location.lat] },
        properties: {
          id: c.location.id,
          name: c.location.name,
          state: c.location.state ?? '',
          score: c.score,
          color: colorForScore(c.score),
        },
      })),
    }
  }, [candidates, colorForScore])

  // ── Map lifecycle: build once per style/token change ──────────────
  useEffect(() => {
    if (!containerRef.current || !mapboxToken) return
    mapboxgl.accessToken = mapboxToken
    ensurePopupStyle()

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapboxStyle,
      center: US_CENTER,
      zoom: US_ZOOM,
      minZoom: 2.5,
      maxZoom: 12,
      attributionControl: true,
    })
    mapRef.current = map

    map.on('load', () => {
      setMapReady(true)

      // ── State choropleth fill (source added here; data swapped when
      // stateGeo loads). Uses a `match` expression over `properties.name`.
      if (!map.getSource('relocation-states')) {
        map.addSource('relocation-states', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'relocation-states-fill',
          type: 'fill',
          source: 'relocation-states',
          paint: {
            // ponytail: `match` over the score→color ramp keeps the layer
            // data-driven; no JS-side re-style needed when getStateScore
            // changes. Default branch = NO_DATA_HEX for states without
            // visible metros.
            'fill-color': [
              'match',
              ['get', 'score'],
              80, '#22c55e',
              60, '#84cc16',
              40, '#eab308',
              20, '#d97706',
              0, '#b91c1c',
              '#94a3b8',
            ],
            'fill-opacity': [
              'interpolate', ['linear'], ['zoom'],
              2, 0.45,
              7, 0.45,
              9, 0.18,
              10, 0,
            ],
          },
        })
        map.addLayer({
          id: 'relocation-states-line',
          type: 'line',
          source: 'relocation-states',
          paint: { 'line-color': '#ffffff88', 'line-width': 1 },
        })

        // State click → zoom to bounds + onStateClick. Only the fill
        // layer is interactive; the line layer is purely visual.
        map.on('click', 'relocation-states-fill', (e) => {
          const f = e.features?.[0]
          if (!f) return
          const name = (f.properties as { name?: string } | undefined)?.name ?? ''
          const usps = uspsFromFeatureName(name)
          try {
            const geom = f.geometry
            if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
              const coords =
                geom.type === 'Polygon'
                  ? geom.coordinates[0]
                  : geom.coordinates.flat(1)
              const bounds = coords.reduce(
                (b, c) => b.extend([c[0], c[1]] as [number, number]),
                new mapboxgl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
              )
              if (bounds.isEmpty() === false) {
                map.fitBounds(bounds, { padding: 40, maxZoom: 8, duration: 600 })
              }
            }
          } catch { /* degenerate geometry */ }
          if (usps) onStateClickRef.current?.(usps)
        })
      }

      // ── Candidate clusters: native mapbox-gl clustering via the
      // GeoJSON source's `cluster: true`. Three layers stacked: cluster
      // bubble, cluster count, individual point. Click on a cluster
      // zooms in (mapbox handles it via getClusterExpansionZoom).
      if (!map.getSource('relocation-candidates')) {
        map.addSource('relocation-candidates', {
          type: 'geojson',
          data: candidateFc,
          cluster: true,
          clusterRadius: CLUSTER_RADIUS,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
        })
        map.addLayer({
          id: 'relocation-clusters',
          type: 'circle',
          source: 'relocation-candidates',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step', ['get', 'point_count'],
              '#60a5fa', 25,
              '#3b82f6', 100,
              '#1d4ed8',
            ],
            'circle-radius': [
              'step', ['get', 'point_count'],
              16, 25, 20, 100, 26,
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.92,
          },
        })
        map.addLayer({
          id: 'relocation-cluster-count',
          type: 'symbol',
          source: 'relocation-candidates',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-size': 12,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: { 'text-color': '#ffffff' },
        })
        map.addLayer({
          id: 'relocation-points',
          type: 'circle',
          source: 'relocation-candidates',
          filter: ['!', ['has', 'point_count']],
          minzoom: POINT_MIN_ZOOM,
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': [
              'case',
              ['boolean', ['feature-state', 'selected'], false], 11,
              7,
            ],
            'circle-stroke-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false], 3,
              2,
            ],
            'circle-stroke-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false], '#3b82f6',
              '#ffffff',
            ],
          },
        })

        // Cluster click → zoom in to expand.
        map.on('click', 'relocation-clusters', (e) => {
          const f = e.features?.[0]
          if (!f) return
          const clusterId = (f.properties as { cluster_id?: number } | undefined)?.cluster_id
          if (clusterId == null) return
          const src = map.getSource('relocation-candidates') as mapboxgl.GeoJSONSource
          try {
            src.getClusterExpansionZoom(clusterId, (err, zoomTo) => {
              if (err || zoomTo == null) return
              try {
                map.easeTo({
                  center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
                  zoom: Math.min(zoomTo, map.getMaxZoom()),
                  duration: 500,
                })
              } catch { /* noop */ }
            })
          } catch { /* source not cluster */ }
        })

        // Cluster hover popup (point count).
        map.on('mouseenter', 'relocation-clusters', (e) => {
          map.getCanvas().style.cursor = 'pointer'
          const f = e.features?.[0]
          if (!f) return
          const count = (f.properties as { point_count?: number } | undefined)?.point_count ?? 0
          popupRef.current?.remove()
          popupRef.current = new mapboxgl.Popup(POINT_POPUP_OPTS)
            .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
            .setHTML(buildClusterPopupHtml(count))
            .addTo(map)
        })
        map.on('mouseleave', 'relocation-clusters', () => {
          map.getCanvas().style.cursor = ''
          popupRef.current?.remove()
          popupRef.current = null
        })

        // Point click → select + popup + parent callback.
        map.on('click', 'relocation-points', (e) => {
          const f = e.features?.[0]
          if (!f) return
          const props = f.properties as { id?: string; name?: string; score?: number; color?: string } | undefined
          if (!props?.id) return
          onMarkerClickRef.current?.(props.id)
          popupRef.current?.remove()
          popupRef.current = new mapboxgl.Popup(POINT_POPUP_OPTS)
            .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
            .setHTML(buildCityPopupHtml(props.name ?? '', props.score ?? 0, props.color ?? '#3b82f6'))
            .addTo(map)
        })
        map.on('mouseenter', 'relocation-points', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'relocation-points', () => { map.getCanvas().style.cursor = '' })
      }

      // Cursor hint for state fill hover.
      map.on('mouseenter', 'relocation-states-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'relocation-states-fill', () => { map.getCanvas().style.cursor = '' })
    })

    return () => {
      popupRef.current?.remove()
      popupRef.current = null
      try { map.remove() } catch { /* noop */ }
      mapRef.current = null
      setMapReady(false)
    }
    // mapboxStyle / mapboxToken changes rebuild the map; that's the same
    // contract JourneyMapGL uses. Candidate data is patched in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken, mapboxStyle])

  // ── Push candidate data into the source on candidate changes ──────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource('relocation-candidates') as mapboxgl.GeoJSONSource | undefined
    if (src) src.setData(candidateFc)
  }, [candidateFc, mapReady])

  // ── Push state choropleth data when stateGeo arrives ──────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource('relocation-states') as mapboxgl.GeoJSONSource | undefined
    if (!src) return
    if (!stateGeo) return
    const enriched: StateFeatureCollection = {
      type: 'FeatureCollection',
      features: stateGeo.features.map(f => {
        const name = f.properties?.name ?? ''
        const usps = uspsFromFeatureName(name)
        const score = usps ? getStateScore(usps) : null
        return {
          ...f,
          properties: {
            ...f.properties,
            name,
            // bucket the score into the same 5-band ramp `colorForScore`
            // uses; the fill layer's `match` expression keys off this.
            score: score == null ? -1 : (score >= 80 ? 80 : score >= 60 ? 60 : score >= 40 ? 40 : score >= 20 ? 20 : 0),
          },
        }
      }),
    }
    src.setData(enriched as unknown as GeoJSON.FeatureCollection)
  }, [stateGeo, getStateScore, mapReady])

  // ── Pan to selected pin, highlight via feature-state ──────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    // Reset previous selection.
    if (lastSelectedIdRef.current) {
      try { map.setFeatureState({ source: 'relocation-candidates', id: featureId(lastSelectedIdRef.current) }, { selected: false }) } catch { /* source may not be ready */ }
    }
    lastSelectedIdRef.current = selectedId
    if (!selectedId) {
      popupRef.current?.remove()
      popupRef.current = null
      return
    }
    const sel = candidates.find(c => c.location.id === selectedId)
    if (!sel) return
    try {
      map.setFeatureState({ source: 'relocation-candidates', id: featureId(selectedId) }, { selected: true })
    } catch { /* source may not be ready */ }
    try {
      map.easeTo({
        center: [sel.location.lng, sel.location.lat],
        duration: 600,
      })
      // Show popup at the selected point too (cluster-aware: only if zoom
      // is past CLUSTER_MAX_ZOOM — otherwise the point is hidden inside a
      // cluster bubble and the popup would float off into nowhere).
      if (map.getZoom() >= POINT_MIN_ZOOM) {
        popupRef.current?.remove()
        popupRef.current = new mapboxgl.Popup(POINT_POPUP_OPTS)
          .setLngLat([sel.location.lng, sel.location.lat])
          .setHTML(buildCityPopupHtml(sel.location.name, sel.score, colorForScore(sel.score)))
          .addTo(map)
      }
    } catch { /* map not ready */ }
  }, [selectedId, candidates, mapReady, colorForScore])

  // ── Zoom indicator + viewport bounds tracker ──────────────────────
  // Ponytail: a single moveend listener fans out to both. Debounced
  // 250ms per spec — same number the old Leaflet panel used.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const update = () => {
      setZoom(map.getZoom())
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const b = map.getBounds()
        setMapBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() })
      }, 250)
    }
    map.on('moveend', update)
    map.on('zoomend', update)
    update()
    return () => {
      if (timer) clearTimeout(timer)
      map.off('moveend', update)
      map.off('zoomend', update)
    }
  }, [mapReady])

  if (!mapboxToken) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-center px-6">
        <div className="text-sm text-zinc-500">
          No Mapbox access token configured.<br />
          <span className="text-xs">Settings → Map → Mapbox GL</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full bg-slate-50 dark:bg-zinc-900 overflow-hidden">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Zoom indicator — bottom left. Mirrors the old Leaflet pill. */}
      <div
        className="absolute bottom-3 left-3 z-10 bg-white/90 dark:bg-zinc-800/90
                   backdrop-blur rounded-full px-3 py-1.5 shadow border border-slate-200 dark:border-zinc-700
                   text-xs font-medium tabular-nums text-slate-700 dark:text-zinc-200"
        aria-label={`Zoom level ${zoom}`}
      >
        Zoom {zoom.toFixed(1)}
      </div>

      {/* Legend overlay — top center */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/90 dark:bg-zinc-800/90
                   backdrop-blur rounded-full px-3 py-1.5 shadow border border-slate-200 dark:border-zinc-700
                   flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-200"
      >
        <span className="font-medium">{t('relocation.scoreLegend')}</span>
        <div className="flex items-center gap-1">
          {LEGEND_STOPS.map(s => (
            <span
              key={s.score}
              className="w-4 h-2.5 rounded-sm"
              style={{ background: s.color }}
              aria-hidden
            />
          ))}
        </div>
        <span className="text-slate-500 dark:text-zinc-400">0–100</span>
      </div>

      {/* Counter overlay — top right */}
      <div
        className="absolute top-3 right-3 z-10 bg-white/90 dark:bg-zinc-800/90
                   backdrop-blur rounded-full px-3 py-1.5 shadow border border-slate-200 dark:border-zinc-700
                   text-xs font-medium text-slate-700 dark:text-zinc-200"
      >
        {candidates.length === 1
          ? t('relocation.showingMetro', { count: 1 })
          : t('relocation.showingMetros', { count: candidates.length })}
      </div>

      {/* Viewport stat panel — top right below the counter */}
      <ViewportStatPanel
        candidates={locations}
        mapBounds={mapBounds}
        onSelect={onMarkerClick}
      />

      {/* Empty-state overlay — center */}
      {candidates.length === 0 && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          aria-live="polite"
        >
          <div className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur rounded-2xl px-5 py-3 shadow border border-slate-200 dark:border-zinc-700 text-sm text-slate-600 dark:text-zinc-300">
            No metros match your current filters. Loosen the filters or clear the
            state selector to see more.
          </div>
        </div>
      )}
    </div>
  )
}

