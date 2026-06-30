import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet/dist/leaflet.css'
import { useTranslation } from '../../../i18n'
import type { CandidateView } from '../relocationModel'
import { scoreToColor } from '../relocationModel'

/**
 * Center panel — US map of candidate cities as score-colored pins.
 *
 * Upgraded from the static-SVG dot layer to react-leaflet + OSM tiles +
 * react-leaflet-cluster (the upgrade path the original file's comment
 * named). All three deps were already in package.json — the trip
 * planner's MapView uses the same stack. Click-to-select, hover
 * tooltips, zoom/pan, and clustering are now first-class. The static
 * SVG silhouette is gone: real tiles render the coastline correctly and
 * CA/TX/NY metros no longer smear into each other.
 */

// Continental US centre + default zoom (covers the lower 48).
const US_CENTER: [number, number] = [39.5, -98.35]
const US_ZOOM = 4

// Lazy color bar for the legend. Same breakpoints as scoreToColor so the
// swatches line up visually with the pins.
const LEGEND_STOPS: Array<{ score: number; color: string; label: string }> = [
  { score: 10, color: scoreToColor(10), label: '0–20' },
  { score: 30, color: scoreToColor(30), label: '20–40' },
  { score: 50, color: scoreToColor(50), label: '40–60' },
  { score: 70, color: scoreToColor(70), label: '60–80' },
  { score: 90, color: scoreToColor(90), label: '80–100' },
]

// ponytail: global icon cache keyed by (selected, score). The trip
// planner's MapView does the same thing for its photo markers — same
// rationale: 939 divIcons in a render is expensive; ~20 unique ones is
// fine. Upgrade path: if a future refactor needs >10k, switch to a
// Canvas renderer (L.canvas()) instead of caching DivIcons.
const pinIconCache = new Map<string, L.DivIcon>()
function createPinIcon(score: number, isSelected: boolean): L.DivIcon {
  const key = `${score}:${isSelected}`
  const cached = pinIconCache.get(key)
  if (cached) return cached
  const size = isSelected ? 22 : 16
  const ring = isSelected
    ? '0 0 0 3px rgba(59,130,246,0.45), 0 1px 4px rgba(0,0,0,0.35)'
    : '0 1px 3px rgba(0,0,0,0.35)'
  const color = scoreToColor(score)
  const icon = L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -size / 2 - 4],
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:2px solid #fff;
      box-shadow:${ring};
      cursor:pointer;
    "></div>`,
  })
  pinIconCache.set(key, icon)
  return icon
}

interface Props {
  candidates: CandidateView[]
  selectedId: string | null
  onMarkerClick: (id: string) => void
}

/** Pan to the selected pin; fit bounds whenever the candidate set changes. */
function MapViewController({
  candidates,
  selectedId,
}: {
  candidates: CandidateView[]
  selectedId: string | null
}): null {
  const map = useMap()
  const prevFitKey = useRef('')

  // Fit bounds when the candidate set identity changes.
  useEffect(() => {
    const fitKey = candidates.map(c => c.location.id).join(',')
    if (!fitKey || fitKey === prevFitKey.current) return
    prevFitKey.current = fitKey
    if (candidates.length === 0) return
    try {
      const bounds = L.latLngBounds(
        candidates.map(c => [c.location.lat, c.location.lng] as [number, number]),
      )
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 })
    } catch {
      /* leaflet throws on degenerate bounds — ignore */
    }
  }, [candidates, map])

  // Pan to the selected pin (no zoom change) so the row click feels coupled.
  useEffect(() => {
    if (!selectedId) return
    const sel = candidates.find(c => c.location.id === selectedId)
    if (!sel) return
    try {
      map.panTo([sel.location.lat, sel.location.lng], { animate: true })
    } catch {
      /* ignore */
    }
  }, [selectedId, candidates, map])

  return null
}

// ponytail: #31 — small overlay that mirrors the live map zoom level. Driven
// off the leaflet `zoomend` event so it stays in sync without polling.
function MapZoomIndicator(): ReactElement {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useEffect(() => {
    const update = () => setZoom(map.getZoom())
    map.on('zoomend', update)
    return () => { map.off('zoomend', update) }
  }, [map])
  return (
    <div
      className="absolute bottom-3 left-3 z-[400] bg-white/90 dark:bg-zinc-800/90
                 backdrop-blur rounded-full px-3 py-1.5 shadow border border-slate-200 dark:border-zinc-700
                 text-xs font-medium tabular-nums text-slate-700 dark:text-zinc-200"
      aria-label={`Zoom level ${zoom}`}
    >
      Zoom {zoom}
    </div>
  )
}

export default function RelocationMapPanel({
  candidates,
  selectedId,
  onMarkerClick,
}: Props): ReactElement {
  const { t } = useTranslation()

  // Build markers once per (selected, candidates) — the icon cache keeps
  // this cheap even at 939 metros.
  const markers = useMemo(() => {
    return candidates.map(c => {
      const isSelected = c.location.id === selectedId
      return (
        <Marker
          key={c.location.id}
          position={[c.location.lat, c.location.lng]}
          icon={createPinIcon(c.score, isSelected)}
          zIndexOffset={isSelected ? 1000 : 0}
          eventHandlers={{ click: () => onMarkerClick(c.location.id) }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={1} sticky>
            <div className="text-xs font-medium">{c.location.name}</div>
            <div className="text-[10px] opacity-75">Score {c.score}</div>
          </Tooltip>
        </Marker>
      )
    })
  }, [candidates, selectedId, onMarkerClick])

  return (
    <div className="relative w-full h-full bg-slate-50 dark:bg-zinc-900 overflow-hidden">
      <MapContainer
        center={US_CENTER}
        zoom={US_ZOOM}
        minZoom={3}
        maxZoom={12}
        scrollWheelZoom
        className="absolute inset-0 w-full h-full"
        style={{ background: 'transparent' }}
        worldCopyJump={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains={['a', 'b', 'c', 'd']}
        />
        <MapViewController candidates={candidates} selectedId={selectedId} />
        <MapZoomIndicator />
        <MarkerClusterGroup
          chunkedLoading
          chunkInterval={30}
          chunkDelay={0}
          maxClusterRadius={50}
          disableClusteringAtZoom={10}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
          animate={false}
        >
          {markers}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Legend overlay — top center */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-white/90 dark:bg-zinc-800/90
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
        className="absolute top-3 right-3 z-[400] bg-white/90 dark:bg-zinc-800/90
                   backdrop-blur rounded-full px-3 py-1.5 shadow border border-slate-200 dark:border-zinc-700
                   text-xs font-medium text-slate-700 dark:text-zinc-200"
      >
        {candidates.length === 1
          ? t('relocation.showingMetro', { count: 1 })
          : t('relocation.showingMetros', { count: candidates.length })}
      </div>
    {/* Empty-state overlay — center */}
      {candidates.length === 0 && (
        <div
          className="absolute inset-0 z-[400] flex items-center justify-center pointer-events-none"
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