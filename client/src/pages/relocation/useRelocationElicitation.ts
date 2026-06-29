import { useState, useCallback, useEffect } from 'react'
import { relocationApi } from '../../api/relocation'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import type { UserProfile, HardFilter } from '@trek/shared'
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
        // Find the location name for the prompt
        setHardFilterPrompt({
          field: locationId,
          label: locationId,
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
  }, [dismissCounts])

  const confirmHardFilter = useCallback(async (_filter: HardFilter) => {
    // Engine would handle this via discover_hard_filter tool
    // For now, just record the confirmation
    setHardFilterPrompt(null)
    toast.success(
      t('relocation.hardFilterConfirmed'),
    )
  }, [toast, t])

  const dismissHardFilterPrompt = useCallback(() => {
    setHardFilterPrompt(null)
  }, [])

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
  }, [])

  return {
    // State
    elicitation,
    profile,
    showElicitationCard,
    hardFilterPrompt,

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
