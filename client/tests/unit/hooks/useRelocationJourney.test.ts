import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { JourneyPreferences } from '@memove/shared'
import { JOURNEY_PHASES } from '@memove/shared'

// Mock the api module so we can verify the 6 journey endpoints are called
// with the right paths/payloads, and so the hook's logic is testable without
// a running server.
const mockGetJourney = vi.fn()
const mockShortlist = vi.fn()
const mockEliminate = vi.fn()
const mockUpdatePrefs = vi.fn()
const mockToggleTask = vi.fn()
const mockSetPhase = vi.fn()

vi.mock('../../../src/api/relocation', () => ({
  relocationApi: {
    getJourney: () => mockGetJourney(),
    shortlist: (id: string) => mockShortlist(id),
    eliminate: (id: string, reason?: string) => mockEliminate(id, reason),
    updateJourneyPreferences: (prefs: Partial<JourneyPreferences>) => mockUpdatePrefs(prefs),
    toggleTask: (id: string) => mockToggleTask(id),
    setPhase: (phase: string) => mockSetPhase(phase),
  },
}))

vi.mock('../../../src/components/shared/Toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

import { useRelocationJourney } from '../../../src/pages/relocation/useRelocationJourney'

// FE-JOURNEY-001 through FE-JOURNEY-008 — verify all 6 endpoints are wired
// and the hook exposes the derived state the MoveTimelinePanel consumes.

const SAMPLE_JOURNEY = {
  userId: 1,
  shortlistedLocations: ['austin-tx', 'raleigh-nc'],
  savedComparisons: [],
  moveTimeline: {
    moveDate: '2026-09-01',
    tasks: [
      { id: 't1', phase: 'discovery', title: 'Research cities', description: '', dueOffsetDays: -60, category: 'research', completed: true },
      { id: 't2', phase: 'logistics', title: 'Book movers', description: '', dueOffsetDays: -14, category: 'logistics', completed: false },
      { id: 't3', phase: 'housing', title: 'Sign lease', description: '', dueOffsetDays: -30, category: 'housing', completed: false },
    ],
  },
  preferences: {},
  decisionLog: [],
  completedTasks: ['t1'],
  currentPhase: 'discovery',
  createdAt: '',
  updatedAt: '',
}

describe('useRelocationJourney', () => {
  beforeEach(() => {
    mockGetJourney.mockReset()
    mockShortlist.mockReset()
    mockEliminate.mockReset()
    mockUpdatePrefs.mockReset()
    mockToggleTask.mockReset()
    mockSetPhase.mockReset()

    // Server pattern: every action returns the updated journey.
    mockGetJourney.mockResolvedValue(SAMPLE_JOURNEY)
    mockShortlist.mockResolvedValue({ ...SAMPLE_JOURNEY, shortlistedLocations: ['austin-tx', 'raleigh-nc', 'denver-co'] })
    mockEliminate.mockResolvedValue({ ...SAMPLE_JOURNEY, shortlistedLocations: ['raleigh-nc'] })
    mockUpdatePrefs.mockResolvedValue({ ...SAMPLE_JOURNEY, preferences: { climatePreference: 'warm' } })
    mockToggleTask.mockResolvedValue({
      ...SAMPLE_JOURNEY,
      completedTasks: ['t1', 't2'],
      moveTimeline: {
        ...SAMPLE_JOURNEY.moveTimeline!,
        tasks: SAMPLE_JOURNEY.moveTimeline!.tasks.map(t =>
          t.id === 't2' ? { ...t, completed: true } : t,
        ),
      },
    })
    mockSetPhase.mockResolvedValue({ ...SAMPLE_JOURNEY, currentPhase: 'housing' })
  })

  // FE-JOURNEY-001
  it('loads the journey on mount', async () => {
    const { result } = renderHook(() => useRelocationJourney())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockGetJourney).toHaveBeenCalledTimes(1)
    expect(result.current.journey.shortlistedLocations).toEqual(['austin-tx', 'raleigh-nc'])
    expect(result.current.journey.currentPhase).toBe('discovery')
  })

  // FE-JOURNEY-002 — shortlist endpoint wired + UI derived set updated
  it('shortlist() pushes to the server and stores the response', async () => {
    const { result } = renderHook(() => useRelocationJourney())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.shortlist('denver-co') })
    expect(mockShortlist).toHaveBeenCalledWith('denver-co')
    await waitFor(() => expect(result.current.shortlistedSet.has('denver-co')).toBe(true))
  })

  // FE-JOURNEY-003 — eliminate mirrors shortlist (X button on chip)
  it('eliminate() removes from the server shortlist', async () => {
    const { result } = renderHook(() => useRelocationJourney())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.eliminate('austin-tx', 'too_hot') })
    expect(mockEliminate).toHaveBeenCalledWith('austin-tx', 'too_hot')
    await waitFor(() => expect(result.current.shortlistedSet.has('austin-tx')).toBe(false))
  })

  // FE-JOURNEY-004 — task toggle wires to the server
  it('toggleTask() hits /journey/toggle-task with the task id', async () => {
    const { result } = renderHook(() => useRelocationJourney())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.toggleTask('t2') })
    expect(mockToggleTask).toHaveBeenCalledWith('t2')
    await waitFor(() => expect(result.current.completedCount).toBe(2))
  })

  // FE-JOURNEY-005 — phase advance wires to the server
  it('setPhase() hits /journey/phase with the new phase', async () => {
    const { result } = renderHook(() => useRelocationJourney())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.setPhase('housing') })
    expect(mockSetPhase).toHaveBeenCalledWith('housing')
    await waitFor(() => expect(result.current.journey.currentPhase).toBe('housing'))
  })

  // FE-JOURNEY-006 — preferences update path exists (sixth endpoint)
  it('updatePreferences() hits /journey/preferences with the merged payload', async () => {
    const { result } = renderHook(() => useRelocationJourney())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.updatePreferences({ climatePreference: 'warm' }) })
    expect(mockUpdatePrefs).toHaveBeenCalledWith({ climatePreference: 'warm' })
  })

  // FE-JOURNEY-007 — derived helpers used by the panel
  it('derives completedCount, totalTasks, shortlistedSet from the journey', async () => {
    const { result } = renderHook(() => useRelocationJourney())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.completedCount).toBe(1)
    expect(result.current.totalTasks).toBe(3)
    expect(result.current.shortlistedSet.size).toBe(2)
    expect(result.current.shortlistedSet.has('austin-tx')).toBe(true)
  })

  // FE-JOURNEY-008 — phase list is stable (chip order is the panel's contract)
  it('JOURNEY_PHASES has the four server-side phases in order', () => {
    expect(JOURNEY_PHASES).toEqual(['discovery', 'housing', 'logistics', 'settlement'])
  })

  // FE-JOURNEY-009 — graceful failure (server unreachable, no toast spam)
  it('keeps the empty default when getJourney rejects', async () => {
    mockGetJourney.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useRelocationJourney())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.journey.shortlistedLocations).toEqual([])
    expect(result.current.journey.currentPhase).toBe('discovery')
  })
})