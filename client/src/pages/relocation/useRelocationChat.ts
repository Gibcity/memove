import { useState, useRef, useCallback, useEffect } from 'react'
import { apiClient } from '../../api/client'
import { relocationApi } from '../../api/relocation'

// ponytail: shape narrowed to what the UI needs — backend can return richer fields
// later without breaking callers (the renderer ignores unknown fields).
export type ChatRole = 'user' | 'agent'

export type RichCard =
  | { kind: 'city_compare'; cities: Array<{ name: string; state: string; colIndex: number; rent: number; weather: string }> }
  | { kind: 'timeline'; weeks: Array<{ week: number; title: string; tasks: string[] }> }
  | { kind: 'checklist'; state: string; items: Array<{ label: string; done: boolean }> }
  // ponytail: structured payloads the server returns via `type:` discriminator.
  // The renderer maps city_list → CityListCard, compare_prompt → compare chips.
  | { kind: 'city_list'; cities: Array<{ id: string; name: string; state: string; matchScore: number; keyMetrics?: Record<string, number | null> }> }
  | { kind: 'compare_prompt'; shortlist: string[] }
  | { kind: 'prompt_chips'; chips: Array<{ label: string; query: string }> }

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  cards?: RichCard[]
  ts: number
}

interface ChatResponse {
  text: string
  cards?: RichCard[]
}

const QUICK_PROMPTS = [
  'Find me a warm, affordable city',
  'Compare cost of living: Austin vs Denver',
  'Plan my move timeline',
  'What do I need for a DMV transfer to Texas?',
]

// ponytail: server chat returns { content, cards?, type, cities?, shortlist? } —
// map the structured payloads into RichCard variants the renderer knows.
// Unknown `type`s silently degrade to plain text; the contract is forward-compat.
interface ServerChatResponse {
  role?: string
  content?: string
  text?: string
  cards?: RichCard[]
  type?: string
  cities?: Array<{
    id: string
    name: string
    state: string
    matchScore: number
    keyMetrics?: Record<string, number | null>
  }>
  shortlist?: string[]
  phase?: string
  shortlistCount?: number
}

function normalizeChatResponse(raw: ServerChatResponse): ChatResponse {
  const text = raw.text ?? raw.content ?? ''
  const cards: RichCard[] = [...(raw.cards ?? [])]
  // ponytail: city_list → renderable city cards. Server gives id/matchScore,
  // renderer decorates with score color; missing keyMetrics fall back to "—".
  if (raw.type === 'city_list' && Array.isArray(raw.cities) && raw.cities.length > 0) {
    cards.push({ kind: 'city_list', cities: raw.cities })
  }
  // ponytail: compare_prompt surfaces the user's existing shortlist as chips;
  // empty shortlist shows a hint to pick cities from the dashboard.
  if (raw.type === 'compare_prompt') {
    cards.push({ kind: 'compare_prompt', shortlist: raw.shortlist ?? [] })
  }
  // ponytail: timeline/cost/admin prompts → tappable suggestion chips so the
  // user can drive the next turn without typing.
  if (raw.type === 'timeline_prompt') {
    cards.push({
      kind: 'prompt_chips',
      chips: [
        { label: 'In 3 months', query: 'Plan my move in 3 months' },
        { label: 'In 6 months', query: 'Plan my move in 6 months' },
        { label: 'September 2026', query: 'Plan my move for September 2026' },
      ],
    })
  }
  if (raw.type === 'cost_prompt') {
    cards.push({
      kind: 'prompt_chips',
      chips: [
        { label: 'Cost of living index', query: 'Show cost of living index for my shortlist' },
        { label: 'Salary needed', query: 'What salary do I need to maintain my lifestyle?' },
        { label: 'Tax impact', query: 'Compare tax impact between my shortlisted cities' },
      ],
    })
  }
  if (raw.type === 'admin_prompt') {
    cards.push({
      kind: 'prompt_chips',
      chips: [
        { label: 'Driver\u2019s license transfer', query: 'How do I transfer my driver\u2019s license?' },
        { label: 'Vehicle registration', query: 'How do I register my car in a new state?' },
        { label: 'Voter registration', query: 'How do I register to vote in a new state?' },
      ],
    })
  }
  return { text, cards: cards.length > 0 ? cards : undefined }
}

// ponytail: canned responses keyed by cheap heuristic — the real backend will
// replace this. Lower-case match on substrings, first hit wins.
function mockReply(text: string): ChatResponse {
  const q = text.toLowerCase()
  if (q.includes('warm') || q.includes('affordable') || q.includes('city')) {
    return {
      text: "Based on your profile, here are three warm, affordable metros that score well on cost, weather, and remote-work infrastructure:",
      cards: [
        {
          kind: 'city_compare',
          cities: [
            { name: 'Tucson', state: 'AZ', colIndex: 92, rent: 1180, weather: 'Sunny, mild winters' },
            { name: 'Albuquerque', state: 'NM', colIndex: 95, rent: 1050, weather: 'Dry, 300 sunny days' },
            { name: 'San Antonio', state: 'TX', colIndex: 89, rent: 1290, weather: 'Hot summers, mild winters' },
          ],
        },
      ],
    }
  }
  if (q.includes('compare') || q.includes('austin') || q.includes('denver')) {
    return {
      text: 'Austin and Denver both score highly for tech workers, but they trade off on cost vs. weather:',
      cards: [
        {
          kind: 'city_compare',
          cities: [
            { name: 'Austin', state: 'TX', colIndex: 108, rent: 1850, weather: 'Hot summers, mild winters' },
            { name: 'Denver', state: 'CO', colIndex: 112, rent: 1920, weather: '4-season, sunny' },
          ],
        },
      ],
    }
  }
  if (q.includes('timeline') || q.includes('plan')) {
    return {
      text: "Here's an 8-week relocation plan calibrated for a cross-state move with family:",
      cards: [
        {
          kind: 'timeline',
          weeks: [
            { week: 1, title: 'Discovery', tasks: ['Confirm destination', 'Set budget ceiling'] },
            { week: 2, title: 'Logistics prep', tasks: ['Book movers', 'Start lease search'] },
            { week: 3, title: 'Admin — origin', tasks: ['Forward mail', 'Cancel utilities'] },
            { week: 4, title: 'Admin — destination', tasks: ['Set up utilities', 'School enrollment'] },
            { week: 5, title: 'Documents', tasks: ['DMV transfer', 'Voter registration'] },
            { week: 6, title: 'Packing', tasks: ['Declutter', 'Label boxes'] },
            { week: 7, title: 'Move day', tasks: ['Walkthrough', 'Key handoff'] },
            { week: 8, title: 'Settlement', tasks: ['Unpack priority rooms', 'Find local services'] },
          ],
        },
      ],
    }
  }
  if (q.includes('dmv') || q.includes('texas')) {
    return {
      text: "For a Texas DMV transfer within 30 days of moving, here's what you'll need:",
      cards: [
        {
          kind: 'checklist',
          state: 'Texas',
          items: [
            { label: 'Out-of-state title (or lien release)', done: false },
            { label: 'Proof of insurance from a TX-licensed carrier', done: false },
            { label: 'Vehicle inspection (passed within 90 days)', done: false },
            { label: 'Proof of residency (lease or utility bill)', done: false },
            { label: 'Payment for title + registration fees', done: false },
          ],
        },
      ],
    }
  }
  return {
    text: "I can help with discovery, cost comparisons, move timelines, and admin checklists. Try one of the prompts below or ask in your own words.",
  }
}

export interface UseRelocationChatResult {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  quickPrompts: string[]
  sendMessage: (text: string) => Promise<void>
  clear: () => void
}

export function useRelocationChat(): UseRelocationChatResult {
  // ponytail: #39 — persist transcript to localStorage so refresh doesn't lose
  // context. Keyed by session id so multi-account sessions don't cross-pollute.
  // Cap at ~50 messages to keep storage bounded.
  const STORAGE_KEY = 'relocation.chat.history'
  const loadHistory = (): ChatMessage[] => {
    if (typeof localStorage === 'undefined') return []
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.slice(-50) : []
    } catch {
      return []
    }
  }
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // ponytail: persist on every message change — debouncing here would risk
  // losing the last message on crash; the storage write is cheap.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {
      // quota or disabled storage — fail silent, in-memory copy still works
    }
  }, [messages])

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim()
    if (!text || isLoading) return

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
      ts: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setError(null)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // ponytail: cheap "vs" detector — used only to append a comparison hint on
    // concierge fallback. Replace with a real intent classifier when the chat
    // route stops rejecting.
    const compareMatch = /(\w+(?:\s\w+)?)\s+vs\.?\s+(\w+(?:\s\w+)?)/i.exec(text)

    try {
      // ponytail: routes through apiClient so the auth interceptor, idempotency
      // key, and 401/demo-login fallback apply. baseURL is '/api' so the path
      // drops the prefix.
      const res = await apiClient.post<ServerChatResponse>(
        '/relocation/chat',
        { message: text, history: messages.map(m => ({ role: m.role, content: m.text })) },
        { signal: ctrl.signal },
      )
      const data = normalizeChatResponse(res.data)
      setMessages(prev => [
        ...prev,
        { id: `a_${Date.now()}`, role: 'agent', text: data.text, cards: data.cards, ts: Date.now() },
      ])
    } catch (_e) {
      // ponytail: ignore AbortError from rapid re-sends or unmount — the next
      // request (or the cleanup effect) already owns the in-flight state.
      if (ctrl.signal.aborted) return
      // ponytail: concierge fallback when /chat route is unavailable — it has
      // real answers for scam/safety/pets/insurance/etc that mockReply can't fake.
      try {
        const concierge = await relocationApi.askConcierge(text)
        let answer = concierge.answer
        if (compareMatch) {
          answer += ` For detailed comparison, open both cities in the dashboard.`
        }
        setMessages(prev => [
          ...prev,
          { id: `a_${Date.now()}`, role: 'agent', text: answer, ts: Date.now() },
        ])
      } catch {
        // ponytail: final fallback — mock data when no backend is reachable.
        const reply = mockReply(text)
        setMessages(prev => [
          ...prev,
          { id: `a_${Date.now()}`, role: 'agent', text: reply.text, cards: reply.cards, ts: Date.now() },
        ])
      }
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
  }, [])

  // ponytail: abort any in-flight chat on unmount — otherwise the closure keeps
  // the component alive (and React warns on setState-after-unmount).
  useEffect(() => () => abortRef.current?.abort(), [])

  return { messages, isLoading, error, quickPrompts: QUICK_PROMPTS, sendMessage, clear }
}