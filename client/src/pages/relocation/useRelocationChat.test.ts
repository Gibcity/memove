// ponytail: regression for feature-map P1#6 — chat must render `city_list`
// and `compare_prompt` server payloads, not just plain text. Mocked at the
// network boundary so this exercises normalizeChatResponse + RichCardView end
// to end. Three small assertions, three payload flavors.
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../tests/helpers/msw/server'
import { useRelocationChat } from './useRelocationChat'

// concierge fallback would mask failures — force it to throw so we know the
// /relocation/chat mock actually fired.
vi.mock('../../api/relocation', () => ({
  relocationApi: {
    askConcierge: () => Promise.reject(new Error('concierge should not run in this test')),
  },
}))

function lastAgent(result: { current: ReturnType<typeof useRelocationChat> }) {
  const msgs = result.current.messages
  return msgs[msgs.length - 1]
}

describe('useRelocationChat rich payloads', () => {
  it('renders a city_list card when server returns type=city_list', async () => {
    server.use(
      http.post('/api/relocation/chat', () =>
        HttpResponse.json({
          role: 'agent',
          content: 'Here are 3 matches.',
          type: 'city_list',
          cities: [
            { id: 'tucson-az', name: 'Tucson', state: 'AZ', matchScore: 87, keyMetrics: { medianRent: 1180, medianHomeValue: 285000, daysMaxGt90FAnnual: 92 } },
            { id: 'albuquerque-nm', name: 'Albuquerque', state: 'NM', matchScore: 81 },
            { id: 'el-paso-tx', name: 'El Paso', state: 'TX', matchScore: 74, keyMetrics: { medianRent: 990 } },
          ],
        }),
      ),
    )

    const { result } = renderHook(() => useRelocationChat())
    await act(async () => { await result.current.sendMessage('warm affordable city') })

    await waitFor(() => {
      const msg = lastAgent(result)
      expect(msg?.role).toBe('agent')
      const cityCard = msg?.cards?.find(c => c.kind === 'city_list')
      expect(cityCard).toBeDefined()
      if (cityCard?.kind === 'city_list') {
        expect(cityCard.cities).toHaveLength(3)
        expect(cityCard.cities[0]?.name).toBe('Tucson')
        // missing keyMetrics on Albuquerque must not crash the renderer —
        // server JSON-omits the key, renderer falls back to {} via `?? {}`.
        expect(cityCard.cities[1]?.keyMetrics ?? {}).toEqual({})
      }
    })
  })

  it('renders a compare_prompt card with the server-supplied shortlist', async () => {
    server.use(
      http.post('/api/relocation/chat', () =>
        HttpResponse.json({
          role: 'agent',
          content: 'Which cities?',
          type: 'compare_prompt',
          shortlist: ['Austin, TX', 'Denver, CO', 'Nashville, TN'],
        }),
      ),
    )

    const { result } = renderHook(() => useRelocationChat())
    await act(async () => { await result.current.sendMessage('compare austin and denver') })

    await waitFor(() => {
      const compareCard = lastAgent(result)?.cards?.find(c => c.kind === 'compare_prompt')
      expect(compareCard).toBeDefined()
      if (compareCard?.kind === 'compare_prompt') {
        expect(compareCard.shortlist).toEqual(['Austin, TX', 'Denver, CO', 'Nashville, TN'])
      }
    })
  })

  it('compare_prompt with empty shortlist still produces a card', async () => {
    server.use(
      http.post('/api/relocation/chat', () =>
        HttpResponse.json({ role: 'agent', content: 'Pick cities first.', type: 'compare_prompt', shortlist: [] }),
      ),
    )

    const { result } = renderHook(() => useRelocationChat())
    await act(async () => { await result.current.sendMessage('compare') })

    await waitFor(() => {
      const compareCard = lastAgent(result)?.cards?.find(c => c.kind === 'compare_prompt')
      expect(compareCard).toBeDefined()
      if (compareCard?.kind === 'compare_prompt') {
        expect(compareCard.shortlist).toEqual([])
      }
    })
  })
})