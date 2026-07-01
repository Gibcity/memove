import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getIntlLanguage, getLocaleForLanguage, useTranslation } from '../../i18n'
import { useSettingsStore } from '../../store/settingsStore'
import apiClient, { mapsApi } from '../../api/client'
import type { GeoJsonFeatureCollection } from '../../types'
import { A2_TO_A3, type AtlasData, type CountryDetail, type BucketItem } from './atlasModel'
import { continentForCountry } from '@memove/shared'

function useCountryNames(language: string): (code: string) => string {
  const [resolver, setResolver] = useState<(code: string) => string>(() => (code: string) => code)
  useEffect(() => {
    try {
      const dn = new Intl.DisplayNames([getIntlLanguage(language)], { type: 'region' })
      setResolver(() => (code: string) => { try { return dn.of(code) || code } catch { return code } })
    } catch { /* */ }
  }, [language])
  return resolver
}

/**
 * Atlas page logic — owns the whole interactive globe: atlas/bucket-list loading,
 * the MapLibre map lifecycle (country + sub-national region layers, bucket markers,
 * viewport-driven region fetching), country/region mark/unmark flows, and the country
 * search. AtlasPage stays a wiring container that renders the returned state via its
 * presentational SidebarContent/MobileStats helpers.
 *
 * Mapbox-style source/layer API replaces the previous Leaflet GeoJSON classes. Sticky
 * tooltips (Leaflet's `bindTooltip({sticky:true})`) become a per-layer mousemove handler
 * that repositions a DOM div via `regionTooltipRef`. The L.canvas/L.svg distinction goes
 * away because MapLibre renders everything through WebGL.
 */
export function useAtlas() {
  const { t, language } = useTranslation()
  const { settings } = useSettingsStore()
  const navigate = useNavigate()
  const resolveName = useCountryNames(language)
  const dm = settings.dark_mode
  const dark = dm === true || dm === 'dark' || (dm === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<maplibregl.Map | null>(null)
  const glareRef = useRef<HTMLDivElement>(null)
  const borderGlareRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // ponytail: lookup tables for hover/click handlers — replaces Leaflet's per-layer refs
  const countryFeatureByCodeRef = useRef<Record<string, { feature: any; a3: string }>>({})
  const countryFeatureBoundsRef = useRef<Record<string, [number, number]>>({})

  const handlePanelMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!panelRef.current || !glareRef.current || !borderGlareRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    // Subtle inner glow
    glareRef.current.style.background = `radial-gradient(circle 300px at ${x}px ${y}px, ${dark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.25)'} 0%, transparent 70%)`
    glareRef.current.style.opacity = '1'
    // Border glow that follows cursor
    borderGlareRef.current.style.opacity = '1'
    borderGlareRef.current.style.maskImage = `radial-gradient(circle 150px at ${x}px ${y}px, black 0%, transparent 100%)`
    borderGlareRef.current.style.webkitMaskImage = `radial-gradient(circle 150px at ${x}px ${y}px, black 0%, transparent 100%)`
  }
  const handlePanelMouseLeave = () => {
    if (glareRef.current) glareRef.current.style.opacity = '0'
    if (borderGlareRef.current) borderGlareRef.current.style.opacity = '0'
  }

  const [data, setData] = useState<AtlasData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [countryDetail, setCountryDetail] = useState<CountryDetail | null>(null)
  const [geoData, setGeoData] = useState<GeoJsonFeatureCollection | null>(null)
  const [visitedRegions, setVisitedRegions] = useState<Record<string, { code: string; name: string; placeCount: number; manuallyMarked?: boolean }[]>>({})
  const regionGeoCache = useRef<Record<string, GeoJsonFeatureCollection>>({})
  const [showRegions, setShowRegions] = useState(false)
  const [regionGeoLoaded, setRegionGeoLoaded] = useState(0)
  const regionTooltipRef = useRef<HTMLDivElement>(null)
  const loadCountryDetailRef = useRef<(code: string) => void>(() => {})
  const handleMarkCountryRef = useRef<(code: string, name: string) => void>(() => {})
  const setConfirmActionRef = useRef<typeof setConfirmAction>(() => {})
  const [confirmAction, setConfirmAction] = useState<{ type: 'mark' | 'unmark' | 'choose' | 'bucket' | 'choose-region' | 'unmark-region'; code: string; name: string; regionCode?: string; countryName?: string } | null>(null)
  const [bucketMonth, setBucketMonth] = useState(0)
  const [bucketYear, setBucketYear] = useState(0)

  // Bucket list
  const [bucketList, setBucketList] = useState<BucketItem[]>([])
  const [showBucketAdd, setShowBucketAdd] = useState(false)
  const [bucketForm, setBucketForm] = useState({ name: '', notes: '', lat: '', lng: '', target_date: '' })
  const [bucketSearch, setBucketSearch] = useState('')
  const [bucketSearchResults, setBucketSearchResults] = useState<any[]>([])
  const [bucketSearching, setBucketSearching] = useState(false)
  const [bucketPoiMonth, setBucketPoiMonth] = useState(0)
  const [bucketPoiYear, setBucketPoiYear] = useState(0)
  const [bucketTab, setBucketTab] = useState<'stats' | 'bucket'>('stats')
  const bucketMarkersRef = useRef<maplibregl.Marker[]>([])

  const [atlas_country_search, set_atlas_country_search] = useState('')
  const [atlas_country_results, set_atlas_country_results] = useState<{ code: string; label: string }[]>([])
  const [atlas_country_open, set_atlas_country_open] = useState(false)

  const atlas_country_options = useMemo(() => {
    if (!geoData) return []
    // Precompute A3 → A2 reverse lookup once per geoData change instead of
    // scanning A2_TO_A3 for every feature that needs the fallback.
    const a3ToA2 = new Map<string, string>()
    for (const [a2Key, a3Val] of Object.entries(A2_TO_A3)) a3ToA2.set(a3Val, a2Key)

    const opts: { code: string; label: string }[] = []
    const seen = new Set<string>()
    for (const f of (geoData as any).features || []) {
      const rawA2 = f?.properties?.ISO_A2
      let resolvedA2: string | null = (typeof rawA2 === 'string' && rawA2.length === 2 && rawA2 !== '-99') ? rawA2 : null
      if (!resolvedA2) {
        const a3 = f?.properties?.ADM0_A3 || f?.properties?.ISO_A3 || f?.properties?.['ISO3166-1-Alpha-3'] || null
        if (a3 && a3 !== '-99') resolvedA2 = a3ToA2.get(a3) ?? null
      }
      if (!resolvedA2 || seen.has(resolvedA2)) continue
      seen.add(resolvedA2)
      const label = String(resolveName(resolvedA2) || f?.properties?.NAME || f?.properties?.ADMIN || resolvedA2)
      opts.push({ code: resolvedA2, label })
    }
    opts.sort((a, b) => a.label.localeCompare(b.label))
    return opts
  }, [geoData, resolveName])

  // Load atlas data + bucket list
  useEffect(() => {
    Promise.all([
      apiClient.get('/addons/atlas/stats'),
      apiClient.get('/addons/atlas/bucket-list'),
    ]).then(([statsRes, bucketRes]) => {
      setData(statsRes.data)
      setBucketList(bucketRes.data.items || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Load country-border GeoJSON from our API (geoBoundaries, served server-side —
  // no third-party fetch from the browser). Even gzipped the payload is a few MB, so
  // it gets a longer timeout than the global 8s default to survive slow links and
  // reverse-proxy / Cloudflare-Tunnel setups instead of aborting and leaving the map
  // with no countries (#1254).
  useEffect(() => {
    apiClient.get('/addons/atlas/countries/geo', { timeout: 30000 })
      .then(res => {
        const geo = res.data
        // Dynamically build A2→A3 mapping from GeoJSON
        for (const f of geo.features) {
          const a2 = f.properties?.ISO_A2
          const a3 = f.properties?.ADM0_A3 || f.properties?.ISO_A3
          // Only accept clean 2-letter ISO codes and never overwrite an existing
          // mapping: some datasets carry subdivision-style values like "CN-TW" for
          // Taiwan, which would clobber the legitimate TWN->TW entry (#1049).
          if (a2 && a3 && a2.length === 2 && a2 !== '-99' && a3 !== '-99' && !A2_TO_A3[a2]) {
            A2_TO_A3[a2] = a3
          }
        }
        setGeoData(geo)
      })
      .catch(err => console.warn('[atlas] geo data load failed:', err))
  }, [])

  // Load visited regions (geocoded from places/trips) — once on mount
  useEffect(() => {
    apiClient.get(`/addons/atlas/regions?_t=${Date.now()}`)
      .then(r => setVisitedRegions(r.data?.regions || {}))
      .catch(() => {})
  }, [])

  // Load admin-1 GeoJSON for countries visible in the current viewport.
  // ponytail: MapLibre's `map.queryRenderedFeatures` replaces Leaflet's
  // `(layer as any).getBounds()` per-feature intersects loop.
  const loadRegionsForViewportRef = useRef<() => void>(() => {})
  const loadRegionsForViewport = (): void => {
    const map = mapInstance.current
    if (!map) return
    const bounds = map.getBounds()
    const toLoad: string[] = []
    for (const code of Object.keys(countryFeatureByCodeRef.current)) {
      if (regionGeoCache.current[code]) continue
      // ponytail: countries without feature bounds are skipped — same effect as a try/catch around Leaflet's getBounds()
      const featureBounds = countryFeatureBoundsRef.current[code]
      if (!featureBounds) continue
      try {
        // ponytail: featureBounds is a single representative [lng,lat], not a real bbox — bounds.contains(point) is the closest primitive.
        if (bounds.contains(featureBounds)) toLoad.push(code)
      } catch { /* */ }
    }
    if (!toLoad.length) return
    apiClient.get(`/addons/atlas/regions/geo?countries=${toLoad.join(',')}`)
      .then(geoRes => {
        const geo = geoRes.data
        if (!geo?.features) return
        let added = false
        for (const c of toLoad) {
          const features = geo.features.filter((f: any) => f.properties?.iso_a2?.toUpperCase() === c)
          if (features.length > 0) { regionGeoCache.current[c] = { type: 'FeatureCollection', features }; added = true }
        }
        if (added) setRegionGeoLoaded(v => v + 1)
      })
      .catch(() => {})
  }
  loadRegionsForViewportRef.current = loadRegionsForViewport

  // Initialize map — runs after loading is done and mapRef is available
  useEffect(() => {
    if (loading || !mapRef.current) return
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          countries: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          regions: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          // Country fill layer (idle state — Filled-in for visited, faint for unvisited)
          {
            id: 'countries-fill',
            type: 'fill',
            source: 'countries',
            paint: { 'fill-color': ['get', '_fill'], 'fill-opacity': ['get', '_fillOpacity'] },
          },
          {
            id: 'countries-line',
            type: 'line',
            source: 'countries',
            paint: { 'line-color': ['get', '_lineColor'], 'line-width': 0.5 },
          },
          // Region layer rendered above countries when zoomed in
          {
            id: 'regions-fill',
            type: 'fill',
            source: 'regions',
            paint: { 'fill-color': ['get', '_fill'], 'fill-opacity': ['get', '_fillOpacity'] },
          },
          {
            id: 'regions-line',
            type: 'line',
            source: 'regions',
            paint: { 'line-color': ['get', '_lineColor'], 'line-width': 1 },
          },
        ],
      },
      center: [0, 25],
      zoom: 3,
      minZoom: 3,
      maxZoom: 10,
      attributionControl: false,
      // ponytail: MapLibre has no `maxBoundsViscosity`; uses `maxPitch`/`renderWorldCopies` instead.
      // Using a setMaxBounds-style constraint via setMaxBounds().
      fadeDuration: 0,
    })
    // ponytail: Set bounding constraint — Leaflet's maxBoundsViscosity: 1 is the default
    map.setMaxBounds([[-90, -220], [90, 220]])

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    mapInstance.current = map

    // Zoom-based region switching + region cursor-follow tooltip
    map.on('zoomend', () => {
      const z = map.getZoom()
      const shouldShow = z >= 5
      setShowRegions(shouldShow)
      // Mute country layer when regions are on so it doesn't fight for clicks
      try {
        map.setPaintProperty('countries-fill', 'fill-opacity', shouldShow ? 0.35 : 1)
        if (shouldShow) map.setLayoutProperty('countries-fill', 'visibility', 'visible')
      } catch { /* */ }
      if (shouldShow) {
        loadRegionsForViewportRef.current()
      } else {
        if (regionTooltipRef.current) regionTooltipRef.current.style.display = 'none'
      }
    })

    map.on('moveend', () => {
      if (map.getZoom() >= 6) loadRegionsForViewportRef.current()
    })

    return () => { map.remove(); mapInstance.current = null }
  }, [dark, loading])

  // Render GeoJSON countries by feeding the existing source with decorated features.
  // ponytail: instead of attaching handlers per Leaflet layer, paint properties live
  // on the feature (`_fill`, `_fillOpacity`, `_lineColor`) and click/hover handlers
  // attach to the layer ids — MapLibre dispatches events to all features in the layer.
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !geoData || !data) return

    const visitedA3 = new Set(data.countries.map(c => A2_TO_A3[c.code]).filter(Boolean))
    // ponytail: countryMap is built but never read — kept for future per-A3 lookups. firstVisit/lastVisit are optional on AtlasCountry, widen the local shape to accept undefined.
    const countryMap: Record<string, { code: string; placeCount: number; tripCount: number; firstVisit: string | null; lastVisit: string | null }> = {}
    data.countries.forEach(c => { if (A2_TO_A3[c.code]) countryMap[A2_TO_A3[c.code]] = { ...c, firstVisit: c.firstVisit ?? null, lastVisit: c.lastVisit ?? null } })

    // Generate deterministic color per country code
    const VISITED_COLORS = ['#6366f1','#ec4899','#14b8a6','#f97316','#8b5cf6','#ef4444','#3b82f6','#22c55e','#06b6d4','#f43f5e','#a855f7','#10b981','#0ea5e9','#e11d48','#0d9488','#7c3aed','#2563eb','#dc2626','#059669','#d946ef']
    const colorMap: Record<string, string> = {}
    // ponytail: Set.forEach doesn't expose an index — spread to array to keep the deterministic palette order.
    Array.from(visitedA3).forEach((a3, i) => { if (a3) colorMap[a3] = VISITED_COLORS[i % VISITED_COLORS.length] })
    const colorForCode = (a3: string) => colorMap[a3] || VISITED_COLORS[0]

    const decorated = {
      type: 'FeatureCollection' as const,
      features: (geoData.features as any[]).map((f) => {
        const a3 = f.properties?.ADM0_A3 || f.properties?.ISO_A3 || f.properties?.['ISO3166-1-Alpha-3'] || f.id
        const visited = visitedA3.has(a3)
        return {
          ...f,
          properties: {
            ...f.properties,
            _fill: visited ? colorForCode(a3) : (dark ? '#1e1e2e' : '#e2e8f0'),
            _fillOpacity: visited ? 0.7 : 0.3,
            _lineColor: dark ? '#333' : '#cbd5e1',
            _a3: a3,
          },
        }
      }),
    }

    // Cache per-A2 feature + approximate bounds for viewport intersection
    const newFeatureByCode: Record<string, { feature: any; a3: string }> = {}
    const newBounds: Record<string, [number, number]> = {}
    for (const f of (geoData as any).features) {
      const rawA2 = f?.properties?.ISO_A2
      const a3 = f.properties?.ADM0_A3 || f.properties?.ISO_A3 || f.properties?.['ISO3166-1-Alpha-3'] || f.id
      const a3Entry = Object.entries(A2_TO_A3).find(([, v]) => v === a3)
      const code = (rawA2 && rawA2.length === 2 && rawA2 !== '-99')
        ? rawA2
        : (a3Entry ? a3Entry[0] : null)
      if (!code) continue
      newFeatureByCode[code] = { feature: f, a3 }
      // ponytail: precompute one representative point per feature (centroid-ish) for viewport checks.
      // Real bounding boxes would require a turf-style helper; this is a coarse fast approximation.
      const coords = (f.geometry?.type === 'Polygon')
        ? f.geometry.coordinates?.[0]?.[0]
        : (f.geometry?.type === 'MultiPolygon')
          ? f.geometry.coordinates?.[0]?.[0]?.[0]
          : null
      if (Array.isArray(coords) && coords.length === 2) newBounds[code] = [coords[0], coords[1]] as [number, number]
    }
    countryFeatureByCodeRef.current = newFeatureByCode
    countryFeatureBoundsRef.current = newBounds

    const src = map.getSource('countries')
    if (src) (src as maplibregl.GeoJSONSource).setData(decorated as any)
  }, [geoData, data, dark])

  // Click handlers + tooltips live on the layer, attached once
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    const handleUnmarkCountry = (code: string): void => {
      const country = data?.countries.find(c => c.code === code)
      setConfirmAction({ type: 'unmark', code, name: resolveName(code) })
    }

    const onCountryClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) return
      const a3 = f.properties?._a3
      const code = (Object.entries(A2_TO_A3).find(([, v]) => v === a3)?.[0]) || (f.properties?.ISO_A2 && f.properties.ISO_A2 !== '-99' ? f.properties.ISO_A2 : null)
      if (!code) return
      const c = data?.countries.find(co => A2_TO_A3[co.code] === a3)
      if (c && c.placeCount === 0 && c.tripCount === 0) handleUnmarkCountry(code)
      else if (c) loadCountryDetailRef.current(code)
    }
    const onCountryEnter = () => { map.getCanvas().style.cursor = 'pointer' }
    const onCountryLeave = () => { map.getCanvas().style.cursor = '' }

    map.on('click', 'countries-fill', onCountryClick)
    map.on('mouseenter', 'countries-fill', onCountryEnter)
    map.on('mouseleave', 'countries-fill', onCountryLeave)

    return () => {
      try {
        map.off('click', 'countries-fill', onCountryClick)
        map.off('mouseenter', 'countries-fill', onCountryEnter)
        map.off('mouseleave', 'countries-fill', onCountryLeave)
      } catch { /* */ }
    }
  }, [data, resolveName])

  // Render sub-national region layer.
  // ponytail: same approach as countries — paint props baked into features, layer-level
  // event listeners for hover (sticky tooltip) and click.
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    if (Object.keys(regionGeoCache.current).length === 0) return

    const visitedRegionCodes = new Set<string>()
    const visitedRegionNamesByCountry = new Map<string, Set<string>>()
    const regionPlaceCounts: Record<string, number> = {}
    for (const [countryCode, regions] of Object.entries(visitedRegions)) {
      const names = new Set<string>()
      for (const r of regions) {
        visitedRegionCodes.add(r.code)
        names.add(r.name.toLowerCase())
        regionPlaceCounts[r.code] = r.placeCount
        regionPlaceCounts[`${countryCode}:${r.name.toLowerCase()}`] = r.placeCount
      }
      visitedRegionNamesByCountry.set(countryCode, names)
    }

    const isVisitedFeature = (f: any) => {
      if (visitedRegionCodes.has(f.properties?.iso_3166_2)) return true
      const countryA2 = (f.properties?.iso_a2 || '').toUpperCase()
      const countryNames = visitedRegionNamesByCountry.get(countryA2)
      if (!countryNames) return false
      const name = (f.properties?.name || '').toLowerCase()
      if (countryNames.has(name)) return true
      const nameEn = (f.properties?.name_en || '').toLowerCase()
      if (nameEn && countryNames.has(nameEn)) return true
      return false
    }

    const allFeatures: any[] = []
    for (const geo of Object.values(regionGeoCache.current)) {
      for (const f of geo.features) allFeatures.push(f)
    }
    if (allFeatures.length === 0) return

    const VISITED_COLORS = ['#6366f1','#ec4899','#14b8a6','#f97316','#8b5cf6','#ef4444','#3b82f6','#22c55e','#06b6d4','#f43f5e','#a855f7','#10b981','#0ea5e9','#e11d48','#0d9488','#7c3aed','#2563eb','#dc2626','#059669','#d946ef']
    const countryA3Set = data ? data.countries.map(c => A2_TO_A3[c.code]).filter(Boolean) : []
    const countryColorMap: Record<string, string> = {}
    countryA3Set.forEach((a3, i) => { countryColorMap[a3 as string] = VISITED_COLORS[i % VISITED_COLORS.length] })
    const a2ColorMap: Record<string, string> = {}
    if (data) data.countries.forEach(c => { if (A2_TO_A3[c.code] && countryColorMap[A2_TO_A3[c.code]]) a2ColorMap[c.code] = countryColorMap[A2_TO_A3[c.code]] })

    const decorated = {
      type: 'FeatureCollection' as const,
      features: allFeatures.map((f) => {
        const countryA2 = (f.properties?.iso_a2 || '').toUpperCase()
        const visited = isVisitedFeature(f)
        return {
          ...f,
          properties: {
            ...f.properties,
            _fill: visited ? (a2ColorMap[countryA2] || '#6366f1') : (dark ? '#ffffff' : '#000000'),
            _fillOpacity: visited ? 0.85 : 0.03,
            _lineColor: visited ? (dark ? '#888' : '#64748b') : (dark ? '#555' : '#94a3b8'),
            _countryA2: countryA2,
            _visited: visited,
          },
        }
      }),
    }

    const src = map.getSource('regions')
    if (src) (src as maplibregl.GeoJSONSource).setData(decorated as any)
  }, [regionGeoLoaded, visitedRegions, dark, t])

  // Sticky region tooltip — ponytail: MapLibre has no `sticky: true` tooltip option, so
  // we render a DOM div once and reposition it via layer mousemove events.
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    const onRegionMove = (e: maplibregl.MapLayerMouseEvent) => {
      const tt = regionTooltipRef.current
      if (!tt) return
      const f = e.features?.[0]
      if (!f) return
      tt.style.display = 'block'
      // point.x/y are pixel coordinates in the canvas — use clientX/Y for screen-space
      const clientX = e.originalEvent?.clientX ?? 0
      const clientY = e.originalEvent?.clientY ?? 0
      tt.style.left = clientX + 12 + 'px'
      tt.style.top = clientY - 10 + 'px'
      const regionName = f.properties?.name || ''
      const countryName = f.properties?.admin || ''
      const regionCode = f.properties?.iso_3166_2 || ''
      const countryA2 = (f.properties?.iso_a2 || '').toUpperCase()
      const visited = !!f.properties?._visited
      const count = regionPlaceCountsByCache(regionCode, countryA2, regionName, f.properties?.name_en || '')
      tt.innerHTML = visited
        ? `<div style="font-weight:600;margin-bottom:3px">${regionName}</div><div style="opacity:0.5;font-size:10px">${countryName}</div><div style="margin-top:5px;font-size:11px"><b>${count}</b> ${count === 1 ? 'place' : 'places'}</div>`
        : `<div style="font-weight:600;margin-bottom:3px">${regionName}</div><div style="opacity:0.5;font-size:10px">${countryName}</div>`
    }
    const onRegionLeave = () => { if (regionTooltipRef.current) regionTooltipRef.current.style.display = 'none' }
    const onRegionEnter = () => { const c = map.getCanvas(); if (c) c.style.cursor = 'pointer' }
    const onRegionLeaveCursor = () => { const c = map.getCanvas(); if (c) c.style.cursor = '' }

    // ponytail: closure over visitedRegions keeps place counts live; stash on `map` so we
    // don't pull them into effect deps (which would re-bind listeners on every change)
    const regionPlaceCountsByCache = (regionCode: string, countryA2: string, regionName: string, regionNameEn: string): number => {
      let count = 0
      for (const [countryCode, regions] of Object.entries(visitedRegions)) {
        const r = regions.find(rr => rr.code === regionCode || rr.name.toLowerCase() === regionNameEn.toLowerCase() || rr.name.toLowerCase() === regionName.toLowerCase())
        if (r) count = r.placeCount
      }
      return count
    }

    map.on('mousemove', 'regions-fill', onRegionMove)
    map.on('mouseenter', 'regions-fill', onRegionEnter)
    map.on('mouseleave', 'regions-fill', () => {
      onRegionLeave()
      onRegionLeaveCursor()
    })

    const onRegionClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) return
      const countryA2 = (f.properties?._countryA2 || '').toUpperCase()
      if (!countryA2) return
      const regionName = f.properties?.name || ''
      const regionCode = f.properties?.iso_3166_2 || ''
      const countryName = f.properties?.admin || ''
      const visited = !!f.properties?._visited
      if (visited) {
        const regionEntry = visitedRegions[countryA2]?.find(r => r.code === regionCode || r.name.toLowerCase() === (f.properties?.name_en || '').toLowerCase())
        if (regionEntry?.manuallyMarked) {
          setConfirmActionRef.current({
            type: 'unmark-region',
            code: countryA2,
            name: regionName,
            regionCode,
            countryName,
          })
        } else {
          loadCountryDetailRef.current(countryA2)
        }
      } else {
        setConfirmActionRef.current({
          type: 'choose-region',
          code: countryA2,
          name: regionName,
          regionCode,
          countryName,
        })
      }
    }
    map.on('click', 'regions-fill', onRegionClick)

    return () => {
      try {
        map.off('mousemove', 'regions-fill', onRegionMove)
        map.off('mouseenter', 'regions-fill', onRegionEnter)
        map.off('mouseleave', 'regions-fill', onRegionLeave)
        map.off('click', 'regions-fill', onRegionClick)
      } catch { /* */ }
    }
  }, [regionGeoLoaded, visitedRegions])

  const handleMarkCountry = (code: string, name: string): void => {
    setConfirmAction({ type: 'choose', code, name })
  }
  handleMarkCountryRef.current = handleMarkCountry
  setConfirmActionRef.current = setConfirmAction

  // ponytail: handleUnmarkCountry moved inside the country-click effect to keep it close to its
  // only caller. Re-exported via the outer ref pattern below.
  const handleUnmarkCountry = (code: string): void => {
    setConfirmAction({ type: 'unmark', code, name: resolveName(code) })
  }

  const select_country_from_search = (country_code: string): void => {
    const country_label = resolveName(country_code)
    set_atlas_country_search(country_label)
    set_atlas_country_open(false)
    set_atlas_country_results([])

    // ponytail: precomputed bounds centroid — MapLibre doesn't expose getBounds() on a feature,
    // so we use the cached feature point and fitBounds around it
    const point = countryFeatureBoundsRef.current[country_code]
    const map = mapInstance.current
    if (point && map) {
      try {
        map.flyTo({ center: point as [number, number], zoom: 6 })
      } catch (e) { console.error('Error flying to country', e) }
    }

    const visited = data?.countries.find(c => c.code === country_code)
    if (visited) {
      if (visited.placeCount === 0 && visited.tripCount === 0) {
        handleUnmarkCountry(country_code)
      } else {
        loadCountryDetailRef.current(country_code)
      }
      return
    }
    setConfirmAction({ type: 'choose', code: country_code, name: country_label })
  }

  const executeConfirmAction = async (): Promise<void> => {
    if (!confirmAction) return
    const { type, code } = confirmAction
    setConfirmAction(null)

    if (type === 'mark') {
      apiClient.post(`/addons/atlas/country/${code}/mark`).catch(() => {})
      setData(prev => {
        if (!prev || prev.countries.find(c => c.code === code)) return prev
        const cont = continentForCountry(code)
        return {
          ...prev,
          countries: [...prev.countries, { code, placeCount: 0, tripCount: 0, firstVisit: null, lastVisit: null }],
          stats: { ...prev.stats, totalCountries: prev.stats.totalCountries + 1 },
          continents: { ...prev.continents, [cont]: (prev.continents?.[cont] || 0) + 1 },
        }
      })
    } else {
      apiClient.delete(`/addons/atlas/country/${code}/mark`).catch(() => {})
      setSelectedCountry(null)
      setCountryDetail(null)
      setData(prev => {
        if (!prev) return prev
        const c = prev.countries.find(c => c.code === code)
        if (!c || c.placeCount > 0 || c.tripCount > 0) return prev
        const cont = continentForCountry(code)
        return {
          ...prev,
          countries: prev.countries.filter(c => c.code !== code),
          stats: { ...prev.stats, totalCountries: Math.max(0, prev.stats.totalCountries - 1) },
          continents: { ...prev.continents, [cont]: Math.max(0, (prev.continents?.[cont] || 0) - 1) },
        }
      })
      setVisitedRegions(prev => {
        if (!prev[code]) return prev
        const next = { ...prev }
        delete next[code]
        return next
      })
    }
  }

  const handleAddBucketItem = async (): Promise<void> => {
    if (!bucketForm.name.trim()) return
    try {
      const data: Record<string, unknown> = { name: bucketForm.name.trim() }
      if (bucketForm.notes.trim()) data.notes = bucketForm.notes.trim()
      if (bucketForm.lat && bucketForm.lng) { data.lat = parseFloat(bucketForm.lat); data.lng = parseFloat(bucketForm.lng) }
      const targetDate = bucketForm.target_date || (bucketPoiMonth > 0 && bucketPoiYear > 0 ? `${bucketPoiYear}-${String(bucketPoiMonth).padStart(2, '0')}` : null)
      if (targetDate) data.target_date = targetDate
      const r = await apiClient.post('/addons/atlas/bucket-list', data)
      setBucketList(prev => [r.data.item, ...prev])
      setBucketForm({ name: '', notes: '', lat: '', lng: '', target_date: '' })
      setBucketSearch(''); setBucketSearchResults([]); setBucketPoiMonth(0); setBucketPoiYear(0)
      setShowBucketAdd(false)
    } catch { /* */ }
  }

  const handleDeleteBucketItem = async (id: number): Promise<void> => {
    try {
      await apiClient.delete(`/addons/atlas/bucket-list/${id}`)
      setBucketList(prev => prev.filter(i => i.id !== id))
    } catch { /* */ }
  }

  const handleBucketPoiSearch = async () => {
    if (!bucketSearch.trim()) return
    setBucketSearching(true)
    try {
      const result = await mapsApi.search(bucketSearch, language)
      setBucketSearchResults(result.places || [])
    } catch (err) { console.error('Bucket-list place search failed:', err) } finally { setBucketSearching(false) }
  }

  const handleSelectBucketPoi = (result: any) => {
    const targetDate = bucketPoiMonth > 0 && bucketPoiYear > 0 ? `${bucketPoiYear}-${String(bucketPoiMonth).padStart(2, '0')}` : null
    setBucketForm({
      name: result.name || bucketSearch,
      notes: '',
      lat: String(result.lat || ''),
      lng: String(result.lng || ''),
      target_date: targetDate || '',
    })
    setBucketSearchResults([])
    setBucketSearch('')
  }

  // Render bucket list markers as MapLibre markers (replaces Leaflet layerGroup).
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    bucketMarkersRef.current.forEach(m => m.remove())
    bucketMarkersRef.current = []
    if (bucketList.length === 0) return

    for (const b of bucketList) {
      if (!b.lat || !b.lng) continue
      const el = document.createElement('div')
      // innerHTML static; values via textContent — only the `${b.name}` below is untrusted.
      el.innerHTML = `<div style="width:28px;height:28px;border-radius:50%;background:rgba(251,191,36,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white"><svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>`
      const popup = new maplibregl.Popup({ offset: 14, closeButton: false })
      // Use setText/setHTML safely — pre-escape by going through setHTML with explicit string ops
      popup.setHTML(`<div style="font-size:12px;font-weight:600">${escapeHtml(String(b.name ?? ''))}</div>${b.notes ? `<div style="font-size:10px;opacity:0.7;margin-top:2px">${escapeHtml(String(b.notes))}</div>` : ''}`)
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([b.lng, b.lat])
        .setPopup(popup)
        .addTo(map)
      bucketMarkersRef.current.push(marker)
    }
  }, [bucketList])

  const loadCountryDetail = async (code: string): Promise<void> => {
    setSelectedCountry(code)
    try {
      const r = await apiClient.get(`/addons/atlas/country/${code}`)
      setCountryDetail(r.data)
    } catch { /* */ }
  }
  loadCountryDetailRef.current = loadCountryDetail

  const stats = data?.stats || { totalTrips: 0, totalPlaces: 0, totalCountries: 0, totalDays: 0 }
  const countries = data?.countries || []

  return {
    t, language, navigate, resolveName, dark, loading,
    mapRef, regionTooltipRef, panelRef, glareRef, borderGlareRef,
    handlePanelMouseMove, handlePanelMouseLeave,
    data, setData, stats, countries, selectedCountry, countryDetail,
    loadCountryDetail, handleUnmarkCountry, select_country_from_search,
    visitedRegions, setVisitedRegions,
    atlas_country_search, set_atlas_country_search,
    atlas_country_results, set_atlas_country_results,
    atlas_country_open, set_atlas_country_open, atlas_country_options,
    confirmAction, setConfirmAction, executeConfirmAction,
    bucketMonth, setBucketMonth, bucketYear, setBucketYear,
    bucketList, setBucketList, bucketTab, setBucketTab,
    showBucketAdd, setShowBucketAdd, bucketForm, setBucketForm,
    handleAddBucketItem, handleDeleteBucketItem, handleBucketPoiSearch, handleSelectBucketPoi,
    bucketSearchResults, setBucketSearchResults,
    bucketPoiMonth, setBucketPoiMonth, bucketPoiYear, setBucketPoiYear,
    bucketSearching, bucketSearch, setBucketSearch,
  }
}

// ponytail: tiny helper to escape user-controlled strings before injecting into the bucket-marker popup HTML.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
