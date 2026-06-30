import { useState, useEffect, useCallback } from 'react'
import { relocationApi } from '../../api/relocation'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import type { Location, ImplicitSignal } from '@memove/shared'
import type { CandidateView, FilterSlider } from './relocationModel'
import { DEFAULT_FILTER_SLIDERS, sortCandidatesByRank } from './relocationModel'

/**
 * Data hook for relocation candidate discovery — owns all state for
 * fetching, filtering and sorting the 59-metro candidate set.
 */
export function useRelocationCandidates(profileVersion?: number) {
  const [allLocations, setAllLocations] = useState<Location[]>([])
  const [candidates, setCandidates] = useState<CandidateView[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [sliders, setSliders] = useState<FilterSlider[]>(DEFAULT_FILTER_SLIDERS)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [dismissCounts, setDismissCounts] = useState<Record<string, number>>({})
  const [seenAt, setSeenAt] = useState<Record<string, number>>({})
  const [scoreDegraded, setScoreDegraded] = useState(false)

  const toast = useToast()
  const { t } = useTranslation()

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

  const fetchScored = useCallback(async (
    filters?: Record<string, { min: number; max: number }>,
  ) => {
    try {
      const resp = await relocationApi.scoreCandidates(
        filters ? { filters } : undefined,
      )
      setScoreDegraded(false)
      const mapped: CandidateView[] = (resp.candidates || []).map(c => ({
        location: c,
        score: c.matchScore,
        rank: c.rank,
        decisionTrace: c.decisionTrace,
      }))
      setCandidates(sortCandidatesByRank(mapped))
      // ponytail: seed seenAt on first appearance so dismiss can report real dwell
      setSeenAt(prev => {
        const now = Date.now()
        const next = { ...prev }
        for (const v of mapped) {
          if (!(v.location.id in next)) next[v.location.id] = now
        }
        return next
      })
    } catch {
      // Score endpoint may not be ready; fall back to showing all locations
      setScoreDegraded(true)
      const mapped: CandidateView[] = allLocations.map((loc, i) => ({
        location: loc,
        score: loc.blended?.totalScore0to100 ?? 50,
        rank: i + 1,
        decisionTrace: '',
      }))
      setCandidates(sortCandidatesByRank(mapped))
      setSeenAt(prev => {
        const now = Date.now()
        const next = { ...prev }
        for (const v of mapped) {
          if (!(v.location.id in next)) next[v.location.id] = now
        }
        return next
      })
    }
  }, [allLocations])

  useEffect(() => {
    if (allLocations.length > 0) {
      fetchScored()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLocations.length])

  // Re-rank when the elicitation profile changes server-side
  useEffect(() => {
    if (allLocations.length > 0) {
      fetchScored()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileVersion])

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
      const start = seenAt[locationId] ?? Date.now()
      const signal: ImplicitSignal = {
        kind: 'candidate_dismiss',
        locationId,
        dwellMs: Math.max(0, Date.now() - start),
        reason,
        ts: new Date().toISOString(),
      }
      await relocationApi.submitSignal(signal).catch(() => {})
      // ponytail: re-fetch so the list re-ranks against the updated profile weights
      fetchScored()
    },
    [fetchScored, seenAt],
  )

  const saveCandidate = useCallback(async (locationId: string) => {
    const signal: ImplicitSignal = {
      kind: 'candidate_save',
      locationId,
      ts: new Date().toISOString(),
    }
    await relocationApi.submitSignal(signal).catch(() => {})
    // ponytail: re-fetch so the list re-ranks against the updated profile weights
    fetchScored()
  }, [fetchScored])

  const sendFilterApplySignal = useCallback(async () => {
    const activeSliders = sliders.filter(s => s.enabled)
    const filter: Record<string, { min: number; max: number }> = {}
    for (const s of activeSliders) {
      filter[s.field] = { min: s.value[0], max: s.value[1] }
    }
    const signal: ImplicitSignal = {
      kind: 'filter_apply',
      filter,
      ts: new Date().toISOString(),
    }
    relocationApi.submitSignal(signal).catch(() => {})
    await fetchScored(Object.keys(filter).length > 0 ? filter : undefined)
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
    scoreDegraded,

    // Filters
    sliders,
    updateSlider,
    toggleSlider,
    sendFilterApplySignal,

    // Actions
    dismissCandidate,
    saveCandidate,
    dismissCounts,
  }
}
