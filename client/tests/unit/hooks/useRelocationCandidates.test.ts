import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock the relocation api so we can verify the hook debounces /score calls
// when sliders change and uses DEFAULT_TOPK (not the old hardcoded 1000).
const mockListLocations = vi.fn()
const mockScoreCandidates = vi.fn()

vi.mock('../../../src/api/relocation', () => ({
  relocationApi: {
    listLocations: () => mockListLocations(),
    scoreCandidates: (req: unknown) => mockScoreCandidates(req),
    submitSignal: vi.fn().mockResolvedValue({}),
  },
}))

// ponytail: stable toast object so hook deps don't refetch on every render.
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}

vi.mock('../../../src/components/shared/Toast', () => ({
  useToast: () => mockToast,
}))

// ponytail: useTranslation must return a stable object so hook deps
// (toast, t) don't change between renders and trigger refetch loops.
vi.mock('../../../src/i18n', () => {
  const t = (k: string) => k
  return {
    useTranslation: () => ({ t }),
  }
})

import { useRelocationCandidates } from '../../../src/pages/relocation/useRelocationCandidates'
import type { Location } from '@memove/shared'

const SAMPLE_LOCATION: Location = {
  id: 'austin-tx',
  name: 'Austin',
  state: 'TX',
  cost: undefined,
  climate: undefined,
  crime: undefined,
  healthcare: undefined,
  broadband: undefined,
  fiscal: undefined,
  amenities: undefined,
  blended: undefined,
} as unknown as Location

describe('useRelocationCandidates — slider debounce + DEFAULT_TOPK', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockListLocations.mockReset()
    mockScoreCandidates.mockReset()
    mockListLocations.mockResolvedValue([SAMPLE_LOCATION])
    mockScoreCandidates.mockResolvedValue({ topMatches: [], weights: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses topK=50 (DEFAULT_TOPK), not the old hardcoded 1000', async () => {
    renderHook(() => useRelocationCandidates())

    // let the listLocations promise resolve + initial fetch settle
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(mockScoreCandidates).toHaveBeenCalledWith({ topK: 50 })
  })

  it('debounces slider changes — 5 rapid updates → exactly 1 score call', async () => {
    const { result } = renderHook(() => useRelocationCandidates())

    // let mount + initial score fetch settle
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    const callsAfterMount = mockScoreCandidates.mock.calls.length
    expect(callsAfterMount).toBeGreaterThanOrEqual(1)

    // 5 rapid slider updates within the debounce window
    act(() => {
      result.current.updateSlider('cost', [40_000, 80_000])
      result.current.updateSlider('cost', [40_000, 90_000])
      result.current.updateSlider('cost', [40_000, 100_000])
      result.current.updateSlider('cost', [40_000, 110_000])
      result.current.updateSlider('cost', [40_000, 120_000])
    })

    // still inside debounce window — none of the 5 should have fired yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299)
    })
    expect(mockScoreCandidates.mock.calls.length).toBe(callsAfterMount)

    // cross the threshold — exactly one debounced call should fire
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(mockScoreCandidates.mock.calls.length).toBe(callsAfterMount + 1)
    const [lastReq] = mockScoreCandidates.mock.calls[mockScoreCandidates.mock.calls.length - 1]
    expect(lastReq).toMatchObject({ topK: 50 })
  })
})