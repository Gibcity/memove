// MapLibre GL setup helpers. Ponytail: this used to be mapbox-gl with terrain DEM
// and 3D buildings from mapbox:// sources. MapLibre can't fetch those, so all
// the building/terrain attachment helpers are now no-ops kept for the call sites
// that still import them. Upgrade path: swap to a self-hosted DEM/building source
// (e.g. Protomaps PMTiles) and re-enable the layer construction below.
import type maplibregl from 'maplibre-gl'

// ponytail: simplest possible basemap. MapLibre can't fetch `mapbox://` styles
// (no token resolver), so the trip / journey / atlas maps share this constant
// raster style until Phase 2 swaps in Protomaps PMTiles.
export const DEFAULT_MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

export function isStandardFamily(style: string): boolean {
  return false
}

export function wantsTerrain(style: string): boolean {
  return false
}

export function supportsCustom3d(style: string): boolean {
  return false
}

// ponytail: was a real fill-extrusion builder. Now a no-op — 3D needs a vector
// source with `building` layer (e.g. Protomaps) before it can be re-enabled.
export function addCustom3dBuildings(_map: maplibregl.Map, _dark: boolean) {
  // noop
}

// ponytail: was the terrain DEM + sky layer. Now a no-op — DEM needs a hosted
// raster-dem source (e.g. terrarium or self-hosted) before it can re-attach.
export function addTerrainAndSky(_map: maplibregl.Map) {
  // noop
}
