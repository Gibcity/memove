import { useState, useEffect, useCallback, useRef } from 'react'
import { relocationApi } from '../../api/relocation'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import type { Location, ImplicitSignal } from '@trek/shared'
import type { CandidateView, FilterSlider } from './relocationModel'
import { DEFAULT_FILTER_SLIDERS, sortCandidatesByRank } from './relocationModel'

/**
 * Data hook for relocation candidate discovery — owns all state for
 * fetching, filtering and sorting the 59-metro candidate set.
 */
export function useRelocationCandidates() {
  const [allLocations, setAllLocations] = useState<Location[]>([])
  const [candidates, setCandidates] = useState<CandidateView[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [sliders, setSliders] = useState<FilterSlider[]>(DEFAULT_FILTER_SLIDERS)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [dismissCounts, setDismissCounts] = useState<Record<string, number>>({})

  const toast = useToast()
  const { t } = useTranslation()

  // Track map pan signals with a debounce ref
  const panDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load locations ──────────────────────────────────────────────

  const loadLocations = useCallback(async () => {
    setIsLoading(true)
    try {
      const locs = await relocationApi.listLocations()
      setAllLocations(locs)
      setLoadError(false)
    } catch {
      setLoadError(true)
      toast.error(t('relocation.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [toast, t])

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  // ── Score candidates when filters change ───────────────────────

  const fetchScored = useCallback(async () => {
    try {
      const resp = await relocationApi.scoreCandidates()
      const mapped: CandidateView[] = (resp.candidates || []).map(c => ({
        location: c,
        score: c.matchScore,
        rank: c.rank,
        decisionTrace: c.decisionTrace,
      }))
      setCandidates(sortCandidatesByRank(mapped))
    } catch {
      // Score endpoint may not be ready; fall back to showing all locations
      const mapped: CandidateView[] = allLocations.map((loc, i) => ({
        location: loc,
        score: loc.blended?.totalScore0to100 ?? 50,
        rank: i + 1,
        decisionTrace: '',
      }))
      setCandidates(sortCandidatesByRank(mapped))
    }
  }, [allLocations])

  useEffect(() => {
    if (allLocations.length > 0) {
      fetchScored()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLocations.length])

  // ── Filter management ──────────────────────────────────────────

  const updateSlider = useCallback(
    (id: string, value: [number, number]) => {
      setSliders(prev =>
        prev.map(s => (s.id === id ? { ...s, value } : s)),
      )
    },
    [],
  )

  const toggleSlider = useCallback((id: string) => {
    setSliders(prev =>
      prev.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    )
  }, [])

  // ── Candidate actions ──────────────────────────────────────────

  const dismissCandidate = useCallback(
    async (locationId: string, reason?: string) => {
      setDismissedIds(prev => {
        const next = new Set(prev)
        next.add(locationId)
        return next
      })
      setDismissCounts(prev => ({
        ...prev,
        [locationId]: (prev[locationId] || 0) + 1,
      }))

      // Fire implicit signal
      const signal: ImplicitSignal = {
        kind: 'candidate_dismiss',
        locationId,
        dwellMs: 0,
        reason,
        ts: new Date().toISOString(),
      }
      relocationApi.submitSignal(signal).catch(() => {})
    },
    [],
  )

  const saveCandidate = useCallback(async (locationId: string) => {
    const signal: ImplicitSignal = {
      kind: 'candidate_save',
      locationId,
      ts: new Date().toISOString(),
    }
    relocationApi.submitSignal(signal).catch(() => {})
  }, [])

  const sendMapPanSignal = useCallback(
    (center: { lat: number; lng: number }, zoom: number) => {
      if (panDebounce.current) clearTimeout(panDebounce.current)
      panDebounce.current = setTimeout(() => {
        const signal: ImplicitSignal = {
          kind: 'map_pan',
          center,
          zoom,
          ts: new Date().toISOString(),
        }
        relocationApi.submitSignal(signal).catch(() => {})
      }, 1500)
    },
    [],
  )

  const sendFilterApplySignal = useCallback(async () => {
    const activeSliders = sliders.filter(s => s.enabled)
    const filter: Record<string, unknown> = {}
    for (const s of activeSliders) {
      filter[s.field] = { min: s.value[0], max: s.value[1] }
    }
    const signal: ImplicitSignal = {
      kind: 'filter_apply',
      filter,
      ts: new Date().toISOString(),
    }
    relocationApi.submitSignal(signal).catch(() => {})
    await fetchScored()
  }, [sliders, fetchScored])

  // ── Derived ────────────────────────────────────────────────────

  const visibleCandidates = candidates.filter(
    c => !dismissedIds.has(c.location.id),
  )

  return {
    // Data
    allLocations,
    candidates: visibleCandidates,
    allCandidates: candidates,
    isLoading,
    loadError,
    retryLoad: loadLocations,

    // Filters
    sliders,
    updateSlider,
    toggleSlider,
    sendFilterApplySignal,

    // Actions
    dismissCandidate,
    saveCandidate,
    sendMapPanSignal,
    dismissCounts,

    // Scoring
    fetchScored,
  }
}
