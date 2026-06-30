import { useState, useCallback, useEffect } from 'react'
import { apiClient } from '../../api/client'
import { relocationApi } from '../../api/relocation'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import type { UserProfile, HardFilter } from '@memove/shared'
import type { ElicitationState, HardFilterPrompt } from './relocationModel'

const HARD_FILTER_THRESHOLD = 3

/**
 * Data hook for the relocation elicitation flow — owns the 3-question
 * conversation, skip logic, and hard-filter promotion prompts.
 *
 * Per RESEARCH.md §3: follows the plan/act/observe/reflect loop by
 * learning from interactions (each dismiss/save = implicit signal).
 */
export function useRelocationElicitation(dismissCounts: Record<string, number>) {
  const [elicitation, setElicitation] = useState<ElicitationState>({
    sessionId: null,
    currentQuestion: null,
    roundsCompleted: 0,
    status: 'idle',
  })
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [hardFilterPrompt, setHardFilterPrompt] =
    useState<HardFilterPrompt | null>(null)
  const [showElicitationCard, setShowElicitationCard] = useState(true)
  // ponytail: id→name lookup so the banner reads "Hide Dallas, TX?" not
  // "Hide dallas-tx?". One mount-time fetch — same endpoint the candidates
  // hook uses, no shared-state plumbing needed (the parent shell avoids the
  // TDZ cycle by passing dismissCounts via ref).
  const [idToName, setIdToName] = useState<Record<string, string>>({})

  const toast = useToast()
  const { t } = useTranslation()

  // ── Start elicitation ──────────────────────────────────────────

  const startElicitation = useCallback(async () => {
    try {
      const resp = await relocationApi.startElicitation()
      setElicitation({
        sessionId: resp.sessionId,
        currentQuestion: resp.firstQuestion,
        roundsCompleted: 0,
        status: 'active',
      })
      setShowElicitationCard(true)
    } catch {
      // Engine may not be ready — skip elicitation gracefully
      setElicitation(prev => ({
        ...prev,
        status: 'complete',
      }))
      toast.error(
        t('relocation.elicitationStartError'),
      )
    }
  }, [toast, t])

  // ── Answer a question ─────────────────────────────────────────

  const answerQuestion = useCallback(
    async (answer: string) => {
      if (!elicitation.sessionId) return
      try {
        const resp = await relocationApi.respondElicitation(
          elicitation.sessionId,
          answer,
        )
        if (resp.done) {
          setElicitation(prev => ({
            ...prev,
            currentQuestion: null,
            status: 'complete',
            roundsCompleted: prev.roundsCompleted + 1,
          }))
          setProfile(resp.profileSnapshot)
          setShowElicitationCard(false)
        } else {
          setElicitation(prev => ({
            ...prev,
            currentQuestion: resp.nextQuestion,
            roundsCompleted: prev.roundsCompleted + 1,
          }))
          setProfile(resp.profileSnapshot)
        }
      } catch {
        toast.error(
          t('relocation.elicitationResponseError'),
        )
      }
    },
    [elicitation.sessionId, toast, t],
  )

  // ── Skip current question ─────────────────────────────────────

  const skipQuestion = useCallback(async () => {
    await answerQuestion('__SKIP__')
  }, [answerQuestion])

  // ── Skip entire elicitation ───────────────────────────────────

  const skipAll = useCallback(() => {
    setElicitation(prev => ({
      ...prev,
      currentQuestion: null,
      status: 'complete',
    }))
    setShowElicitationCard(false)
  }, [])

  // ── Hard-filter promotion ─────────────────────────────────────

  useEffect(() => {
    // Check if any field has been dismissed >= threshold times
    const entries = Object.entries(dismissCounts)
    for (const [locationId, count] of entries) {
      if (count >= HARD_FILTER_THRESHOLD) {
        // ponytail: fall back to the slug if the name lookup hasn't resolved
        // yet (rare — same /locations fetch resolves in a few ms on mount).
        setHardFilterPrompt({
          field: locationId,
          label: idToName[locationId] ?? locationId,
          dismissCount: count,
          threshold: HARD_FILTER_THRESHOLD,
          suggestedFilter: {
            field: 'id',
            operator: 'notIn',
            value: [locationId],
            source: 'revealed',
            confidence: Math.min(count / HARD_FILTER_THRESHOLD, 1),
            discoveredAt: new Date().toISOString(),
          },
        })
        break // One prompt at a time
      }
    }
  }, [dismissCounts, idToName])

  const confirmHardFilter = useCallback(async (filter: HardFilter) => {
    try {
      // ponytail: route through apiClient so the auth interceptor, idempotency
      // key, and 401/demo-login fallback apply (same pattern as
      // useRelocationChat). raw fetch would skip all three.
      const updated = await apiClient
        .post<UserProfile>('/relocation/profile', {
          hardFilters: [...(profile?.hardFilters ?? []), filter],
        })
        .then(r => r.data)
      setProfile(updated)
      setHardFilterPrompt(null)
      toast.success(t('relocation.hardFilterConfirmed'))
    } catch {
      toast.error(t('relocation.hardFilterFailed') || 'Failed to apply filter')
    }
  }, [profile, toast, t])

  const dismissHardFilterPrompt = useCallback(() => {
    setHardFilterPrompt(null)
  }, [])

  // ponytail: filter sliders in useRelocationCandidates.ts send implicit signals
  // but don't pass values in the ScoreRequest. To fix: add filters to the
  // ScoreRequest body in fetchScored(). That file is owned by another agent.
  // Tracked in Sprint 1 gap #8.

  // ── Load profile on mount ─────────────────────────────────────

  useEffect(() => {
    relocationApi
      .getProfile()
      .then(p => {
        setProfile(p)
        if (p.elicitationRoundsCompleted >= 3) {
          setElicitation(prev => ({
            ...prev,
            status: 'complete',
            roundsCompleted: p.elicitationRoundsCompleted,
          }))
          setShowElicitationCard(false)
        }
      })
      .catch(() => {
        // No profile yet — that's OK
      })

    // ponytail: piggyback on mount to build the id→display-name map. Single
    // /locations call covers both lookups (this hook + the candidates hook
    // fetch independently — could be deduped via shared cache later).
    relocationApi
      .listLocations()
      .then(locs => {
        const map: Record<string, string> = {}
        for (const l of locs) map[l.id] = l.name
        setIdToName(map)
      })
      .catch(() => {
        // Hard-filter prompt falls back to the slug if the lookup never lands
      })
  }, [])

  return {
    // State
    elicitation,
    profile,
    showElicitationCard,
    hardFilterPrompt,
    idToName,

    // Actions
    startElicitation,
    answerQuestion,
    skipQuestion,
    skipAll,
    confirmHardFilter,
    dismissHardFilterPrompt,
    setShowElicitationCard,
  }
}
