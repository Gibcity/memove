import { useCallback, useEffect, useState } from 'react'
import { relocationApi } from '../../api/relocation'
import { useToast } from '../../components/shared/Toast'

/**
 * Relocation journey workspace — persisted per-user state (shortlist, tasks,
 * phase). Mirrors the controller at `relocation-journey.controller`.
 *
 * 6 endpoints, all POST/GET: getJourney / shortlist / eliminate /
 * updateJourneyPreferences / toggleTask / setPhase. The hook exposes a
 * thin wrapper around each — server is the source of truth, so every action
 * re-fetches the journey rather than mutating locally.
 */

// ponytail: shape lives here, not @memove/shared, because the journey types
// haven't been promoted to the shared schema yet. Hoist when a second
// consumer (FE + server + ETL) needs them.
export interface JourneyTimelineTask {
  id: string
  phase: string
  title: string
  description: string
  dueOffsetDays: number
  category: 'research' | 'logistics' | 'admin' | 'housing' | 'financial'
  completed: boolean
}

export interface JourneyTimeline {
  moveDate?: string
  tasks: JourneyTimelineTask[]
}

export interface RelocationJourney {
  userId: number
  shortlistedLocations: string[]
  savedComparisons: unknown[]
  moveTimeline: JourneyTimeline | null
  preferences: Record<string, unknown>
  decisionLog: unknown[]
  completedTasks: string[]
  currentPhase: string
  createdAt: string
  updatedAt: string
}

// ponytail: the server defines 4 phases (discovery/housing/logistics/
// settlement). Inline the list here so the panel can render phase chips
// without an extra constant export from shared.
export const JOURNEY_PHASES = [
  'discovery',
  'housing',
  'logistics',
  'settlement',
] as const
export type JourneyPhase = (typeof JOURNEY_PHASES)[number]

const EMPTY_JOURNEY: RelocationJourney = {
  userId: 0,
  shortlistedLocations: [],
  savedComparisons: [],
  moveTimeline: null,
  preferences: {},
  decisionLog: [],
  completedTasks: [],
  currentPhase: 'discovery',
  createdAt: '',
  updatedAt: '',
}

export function useRelocationJourney() {
  const [journey, setJourney] = useState<RelocationJourney>(EMPTY_JOURNEY)
  const [isLoading, setIsLoading] = useState(true)
  const toast = useToast()

  const refresh = useCallback(async () => {
    try {
      const next = await relocationApi.getJourney()
      setJourney(next)
    } catch {
      // Server may be slow on first call — keep the empty default; panel
      // already handles null/empty gracefully.
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const shortlist = useCallback(
    async (locationId: string) => {
      try {
        const next = await relocationApi.shortlist(locationId)
        setJourney(next)
      } catch (e) {
        toast.error((e as Error).message || 'Failed to shortlist city')
      }
    },
    [toast],
  )

  const eliminate = useCallback(
    async (locationId: string, reason?: string) => {
      try {
        const next = await relocationApi.eliminate(locationId, reason)
        setJourney(next)
      } catch (e) {
        toast.error((e as Error).message || 'Failed to eliminate city')
      }
    },
    [toast],
  )

  const toggleTask = useCallback(
    async (taskId: string) => {
      try {
        const next = await relocationApi.toggleTask(taskId)
        setJourney(next)
      } catch (e) {
        toast.error((e as Error).message || 'Failed to toggle task')
      }
    },
    [toast],
  )

  const setPhase = useCallback(
    async (phase: string) => {
      try {
        const next = await relocationApi.setPhase(phase)
        setJourney(next)
      } catch (e) {
        toast.error((e as Error).message || 'Failed to change phase')
      }
    },
    [toast],
  )

  const updatePreferences = useCallback(
    async (prefs: Record<string, unknown>) => {
      try {
        const next = await relocationApi.updateJourneyPreferences(prefs)
        setJourney(next)
      } catch (e) {
        toast.error((e as Error).message || 'Failed to update preferences')
      }
    },
    [toast],
  )

  // ponytail: derived helpers rather than yet more state. Saves the panel
  // from re-implementing the same Set lookup and the completed-count math.
  const completedTaskIds = new Set(journey.completedTasks)
  const shortlistedSet = new Set(journey.shortlistedLocations)
  const completedCount = journey.moveTimeline
    ? journey.moveTimeline.tasks.filter(t => t.completed).length
    : 0
  const totalTasks = journey.moveTimeline?.tasks.length ?? 0

  return {
    journey,
    isLoading,
    shortlist,
    eliminate,
    toggleTask,
    setPhase,
    updatePreferences,
    refresh,
    completedTaskIds,
    shortlistedSet,
    completedCount,
    totalTasks,
  }
}