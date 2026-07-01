import { useState, useRef, useCallback, useEffect } from 'react'
import { apiClient } from '../../api/client'
import type { HardFilterProposal } from '@memove/shared'

// ponytail: backend contract is the source of truth — { role, text, tool?, data? }.
// Renderer ignores fields it doesn't know; unknown tools fall through to a
// generic key-value card. No client-side type aliasing; the wire shape IS
// the rendered shape.
export type ChatRole = 'user' | 'agent'

// ponytail: discriminated tool tag — extends the chat-message contract with a
// 'hard_filter_proposal' variant so the payload renderer can mount the
// HardFilterBanner instead of the generic data card. Adding a string union
// entry keeps the rest of the message shape identical.
export type ChatTool =
  | 'hard_filter_proposal'
  | string
  | undefined

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  tool?: ChatTool
  data?: unknown
  ts: number
}

export interface UseRelocationChatResult {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  quickPrompts: string[]
  sendMessage: (text: string) => Promise<void>
  /**
   * Add an externally-detected implicit-signal outcome (e.g. a
   * HardFilterProposal surfaced by /relocation/profile/signal) as a
   * special tool-payload message so it renders inline in the thread.
   */
  pushToolMessage: (tool: ChatTool, text: string, data?: unknown) => void
  clear: () => void
}

const QUICK_PROMPTS = [
  'Find me a warm, affordable city',
  'Compare cost of living: Austin vs Denver',
  'Plan my move timeline',
  'What do I need for a DMV transfer to Texas?',
]

// ponytail: capped at 50 messages to keep localStorage bounded. Historical
// cap; still correct for the typed-payload era.
const STORAGE_KEY = 'relocation.chat.history'
const MAX_PERSISTED = 50

function loadHistory(): ChatMessage[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(-MAX_PERSISTED) : []
  } catch {
    return []
  }
}

// ponytail: no mock payload — the wire shape owns the truth. If /chat 500s,
// the response bubble shows the agent's text (or an error). No client-side
// fake city_list cards to mask real backend failures.

export function useRelocationChat(): UseRelocationChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {
      // quota / disabled storage — fail silent, in-memory copy still works
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

    try {
      const res = await apiClient.post<ChatMessage>(
        '/relocation/chat',
        { message: text, history: messages.map(m => ({ role: m.role, content: m.text })) },
        { signal: ctrl.signal },
      )
      const data = res.data
      setMessages(prev => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'agent',
          text: data.text ?? '',
          tool: data.tool,
          data: data.data,
          ts: Date.now(),
        },
      ])
      // ponytail: F17 — if the chat response carries a hardFilterProposal
      // alongside the assistant text, surface it as its own banner message
      // inline in the thread so the user can act on it.
      const proposal = (data as { hardFilterProposal?: HardFilterProposal }).hardFilterProposal
      if (proposal) {
        setMessages(prev => [
          ...prev,
          {
            id: `hfp_${Date.now()}`,
            role: 'agent',
            text: `You've dismissed ${proposal.locationName} ${proposal.dismissCount} times — want to hide it?`,
            tool: 'hard_filter_proposal',
            data: proposal,
            ts: Date.now(),
          },
        ])
      }
    } catch (e) {
      if (ctrl.signal.aborted) return
      const msg = (e as Error)?.message || 'Chat request failed'
      setError(msg)
      // ponytail: surface the failure inline as an agent bubble so the
      // conversation history still reads coherently. No toast spam.
      setMessages(prev => [
        ...prev,
        { id: `e_${Date.now()}`, role: 'agent', text: `Sorry — ${msg}`, ts: Date.now() },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
  }, [])

  // ponytail: F17 — let callers inject a tool-payload message (e.g. a
  // HardFilterProposal detected via /relocation/profile/signal) so it
  // renders inline in the same thread.
  const pushToolMessage = useCallback((tool: ChatTool, text: string, data?: unknown) => {
    setMessages(prev => [
      ...prev,
      {
        id: `t_${Date.now()}`,
        role: 'agent',
        text,
        tool,
        data,
        ts: Date.now(),
      },
    ])
  }, [])

  // ponytail: abort any in-flight chat on unmount — otherwise the closure
  // keeps the component alive (and React warns on setState-after-unmount).
  useEffect(() => () => abortRef.current?.abort(), [])

  return { messages, isLoading, error, quickPrompts: QUICK_PROMPTS, sendMessage, pushToolMessage, clear }
}
