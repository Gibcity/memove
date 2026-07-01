// ponytail: regression for the agent wire contract — backend returns
// { role, text, tool?, data? } and the hook stores it intact. Three small
// assertions cover the new shape end-to-end.
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../tests/helpers/msw/server'
import { useRelocationChat } from './useRelocationChat'

vi.mock('../../api/relocation', () => ({
  relocationApi: {
    askConcierge: () => Promise.reject(new Error('concierge should not run in this test')),
  },
}))

function lastAgent(result: { current: ReturnType<typeof useRelocationChat> }) {
  const msgs = result.current.messages
  return msgs[msgs.length - 1]
}

describe('useRelocationChat agent contract', () => {
  it('stores text + tool + data when server returns a tool result', async () => {
    server.use(
      http.post('/api/relocation/chat', () =>
        HttpResponse.json({
          role: 'agent',
          text: 'Here are 3 matches.',
          tool: 'score_locations',
          data: {
            totalScored: 939,
            passedFilters: 80,
            returned: 3,
            weights: { cost: 0.4, climate: 0.3, jobs: 0.3 },
            topMatches: [
              { rank: 1, id: 'tucson-az', name: 'Tucson', state: 'AZ', matchScore: 87, subscores: { cost: 90 }, trace: [], dataGaps: [], keyMetrics: { medianRent: 1180 } },
              { rank: 2, id: 'albuquerque-nm', name: 'Albuquerque', state: 'NM', matchScore: 81, subscores: { cost: 85 }, trace: [], dataGaps: [], keyMetrics: {} },
            ],
          },
        }),
      ),
    )

    const { result } = renderHook(() => useRelocationChat())
    await act(async () => { await result.current.sendMessage('warm affordable city') })

    await waitFor(() => {
      const msg = lastAgent(result)
      expect(msg?.role).toBe('agent')
      expect(msg?.text).toBe('Here are 3 matches.')
      expect(msg?.tool).toBe('score_locations')
      expect(msg?.data).toBeDefined()
    })
  })

  it('stores plain text when server does not call a tool', async () => {
    server.use(
      http.post('/api/relocation/chat', () =>
        HttpResponse.json({ role: 'agent', text: 'Sure — what city interests you?' }),
      ),
    )

    const { result } = renderHook(() => useRelocationChat())
    await act(async () => { await result.current.sendMessage('help') })

    await waitFor(() => {
      const msg = lastAgent(result)
      expect(msg?.text).toBe('Sure — what city interests you?')
      expect(msg?.tool).toBeUndefined()
      expect(msg?.data).toBeUndefined()
    })
  })

  it('stores fiscal_health tool result intact', async () => {
    server.use(
      http.post('/api/relocation/chat', () =>
        HttpResponse.json({
          role: 'agent',
          text: 'Austin is in strong fiscal shape.',
          tool: 'fiscal_health',
          data: {
            location: { id: 'austin-tx', name: 'Austin', state: 'TX' },
            fiscalProfile: {
              fiscalTier: 'A',
              healthScore: 78,
              riskLevel: 'low',
              outlook: 'stable',
              estimated10yrTaxIncrease: 0.12,
              statePensionFundedRatio: 68,
              taxCompetitivenessScore: 72,
              stateIncomeTaxRate: 0,
              propertyTaxRate: 0.018,
            },
          },
        }),
      ),
    )

    const { result } = renderHook(() => useRelocationChat())
    await act(async () => { await result.current.sendMessage('how is austin fiscal') })

    await waitFor(() => {
      const msg = lastAgent(result)
      expect(msg?.tool).toBe('fiscal_health')
      const data = msg?.data as { fiscalProfile: { healthScore: number } }
      expect(data.fiscalProfile.healthScore).toBe(78)
    })
  })
})
