/**
 * Smoke test for RelocationMapPanel — the biggest risk after the Leaflet →
 * Mapbox GL swap is that the panel blows up on the "no token" fallback path
 * (every account without a Mapbox config hits it) or that the cluster source
 * never gets attached (which would silently break the new clustering). Both
 * paths are covered here. Bigger behaviour tests live in QA_ROAST.md.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '../../../../tests/helpers/render'
import { act } from '@testing-library/react'
import { resetAllStores } from '../../../../tests/helpers/store'
import { useSettingsStore } from '../../../store/settingsStore'

// State-aware map mock: getSource returns the registered source (or null),
// addSource registers it. That's the only piece of the real mapbox-gl API
// the panel's load handler actually inspects.
const glMap = vi.hoisted(() => {
  const sources = new Map<string, any>()
  return {
    on: vi.fn(),
    off: vi.fn(),
    loaded: vi.fn().mockReturnValue(true),
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    jumpTo: vi.fn(),
    remove: vi.fn(),
    getZoom: vi.fn().mockReturnValue(4),
    getBounds: vi.fn(() => ({
      getSouth: () => 24, getNorth: () => 49, getWest: () => -125, getEast: () => -66,
    })),
    addSource: vi.fn((id: string, src: any) => {
      // The panel calls getSource(id).setData(...) on the source later.
      // Mirror that by attaching a setData vi.fn onto the stored spec.
      const withApi = {
        ...src,
        setData: vi.fn(),
        // Cluster source mock: synchronously call back with a fake zoom.
        // The real mapbox API is async-callback; the panel doesn't care.
        getClusterExpansionZoom: vi.fn((_cid: number, cb: any) => cb(null, 8)),
      }
      sources.set(id, withApi)
      return withApi
    }),
    getSource: vi.fn((id: string) => sources.get(id) ?? null),
    addLayer: vi.fn(),
    setFeatureState: vi.fn(),
    setStyle: vi.fn(),
    getCanvas: vi.fn(() => ({ style: {} })),
    getMaxZoom: vi.fn(() => 12),
  }
})

vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    Map: vi.fn(function () { return glMap }),
    LngLatBounds: vi.fn(function () {
      const self = { extend: vi.fn().mockReturnThis(), isEmpty: () => false }
      return self
    }),
    Popup: vi.fn(function () {
      return {
        setLngLat: vi.fn().mockReturnThis(),
        setHTML: vi.fn().mockReturnThis(),
        setOffset: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getElement: vi.fn(() => document.createElement('div')),
      }
    }),
  },
}))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))

import RelocationMapPanel from './RelocationMapPanel'

function buildCandidate(id: string, lat: number, lng: number, score: number, state = 'TX') {
  return {
    location: { id, name: id, state, lat, lng, population: 1000 },
    score,
    rank: 1,
    decisionTrace: '',
  } as any
}

function fireLoad() {
  const loadCall = (glMap.on as any).mock.calls.find((c: any[]) => c[0] === 'load')
  if (!loadCall) throw new Error('load handler not registered')
  loadCall[1]()
}

beforeEach(() => {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      mapbox_access_token: 'pk.test_token',
      mapbox_style: 'mapbox://styles/mapbox/light-v11',
    },
  } as any)
})

afterEach(() => {
  vi.clearAllMocks()
  resetAllStores()
})

describe('RelocationMapPanel', () => {
  it('FE-COMP-RELMAP-001: renders the token-missing fallback instead of crashing when no token is set', async () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, mapbox_access_token: '' },
    } as any)
    const candidates = [buildCandidate('dallas-tx', 32.78, -96.80, 78)]
    const { container } = render(
      <RelocationMapPanel candidates={candidates} selectedId={null} onMarkerClick={() => {}} />,
    )
    await act(async () => {})
    // No-token message visible, no map container mounted.
    expect(container.textContent).toMatch(/No Mapbox access token/i)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('FE-COMP-RELMAP-002: attaches a cluster-enabled GeoJSON source on map load', async () => {
    const candidates = [
      buildCandidate('dallas-tx', 32.78, -96.80, 78),
      buildCandidate('austin-tx', 30.27, -97.74, 82),
    ]
    render(<RelocationMapPanel candidates={candidates} selectedId={null} onMarkerClick={() => {}} />)
    await act(async () => {})
    fireLoad()
    await act(async () => {})

    const calls = (glMap.addSource as any).mock.calls
    const clusterSrc = calls.find((c: any[]) => c[0] === 'relocation-candidates')
    expect(clusterSrc, 'cluster source should be added').toBeDefined()
    expect(clusterSrc[1].cluster).toBe(true)
    expect(clusterSrc[1].clusterRadius).toBe(50)
    expect(clusterSrc[1].clusterMaxZoom).toBe(10)

    // Layers stack: clusters → cluster-count → points, in that order.
    const layerCalls = (glMap.addLayer as any).mock.calls
    const layerIds = layerCalls.map((c: any[]) => c[0].id)
    expect(layerIds).toEqual(expect.arrayContaining([
      'relocation-clusters', 'relocation-cluster-count', 'relocation-points',
      'relocation-states-fill', 'relocation-states-line',
    ]))
  })

  it('FE-COMP-RELMAP-003: click on a relocation-points feature fires onMarkerClick with the candidate id', async () => {
    const candidates = [buildCandidate('dallas-tx', 32.78, -96.80, 78)]
    const onClick = vi.fn()
    render(<RelocationMapPanel candidates={candidates} selectedId={null} onMarkerClick={onClick} />)
    await act(async () => {})
    fireLoad()
    await act(async () => {})

    console.log('on calls:', JSON.stringify((glMap.on as any).mock.calls.map((c: any[]) => [c[0], c[1], typeof c[2]])))
    const pointsCall = (glMap.on as any).mock.calls.find(
      (c: any[]) => c[0] === 'click' && c[1] === 'relocation-points',
    )
    expect(pointsCall, 'points click listener should be registered').toBeDefined()
    pointsCall[2]({
      features: [{
        properties: { id: 'dallas-tx', name: 'Dallas, TX', score: 78, color: '#22c55e' },
        geometry: { type: 'Point', coordinates: [-96.80, 32.78] },
      }],
    })
    expect(onClick).toHaveBeenCalledWith('dallas-tx')
  })

  it('FE-COMP-RELMAP-004: clicking a cluster zooms in via getClusterExpansionZoom', async () => {
    const candidates = [buildCandidate('dallas-tx', 32.78, -96.80, 78)]
    render(<RelocationMapPanel candidates={candidates} selectedId={null} onMarkerClick={() => {}} />)
    await act(async () => {})
    fireLoad()
    await act(async () => {})

    const clusterClickCall = (glMap.on as any).mock.calls.find(
      (c: any[]) => c[0] === 'click' && c[1] === 'relocation-clusters',
    )
    expect(clusterClickCall, 'cluster click listener should be registered').toBeDefined()
    clusterClickCall[2]({
      features: [{
        properties: { cluster_id: 42, point_count: 5 },
        geometry: { type: 'Point', coordinates: [-96.80, 32.78] },
      }],
    })
    // The source mock's getClusterExpansionZoom calls back synchronously
    // with `null, 8`, which triggers map.easeTo on the cluster centroid.
    expect(glMap.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 8 }))
  })
})