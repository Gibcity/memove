import React, { useEffect, useRef, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { useRelocationChat, type ChatMessage } from './useRelocationChat'
import { PayloadRenderer } from './PayloadRenderer'
import ConciergePanel from './ConciergePanel'

// ponytail: one screenful, no subfolders. The adaptive surface is the layout
// shell — message thread + sticky input. The payload renderer handles typed
// content. No context, no store, no state machine.

export default function AgentSurface(): React.ReactElement {
  const { messages, isLoading, sendMessage, clear } = useRelocationChat()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // ponytail: stick scroll to bottom on new message. auto-scroll is the
    // chat contract — users scroll up explicitly when they want history.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isLoading])

  // ponytail: focus on mount, refocus after the agent finishes a turn so
  // keyboard users can keep typing without clicking. Worth a single ref.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    if (!isLoading) inputRef.current?.focus()
  }, [isLoading])

  const handleSend = (text: string): void => {
    const t = text.trim()
    if (!t) return
    setDraft('')
    void sendMessage(t)
  }

  return (
    <div className="flex flex-col h-screen bg-surface">
      {/* ── Header (compact, persistent) ─────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-edge bg-surface-card">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-accent text-accent-text">
            <Sparkles size={16} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-content" style={{ fontFamily: 'Poppins, system-ui' }}>
              Relocation agent
            </h1>
            <p className="text-xs text-content-muted">Ask anything about where to move</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clear}
            className="text-xs text-content-muted hover:text-content px-3 py-1.5 rounded-xl border border-edge hover:bg-surface-secondary transition-colors"
          >
            Clear
          </button>
        )}
      </header>

      {/* ── Conversation thread ─────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
        style={{ scrollbarWidth: 'thin' }}
      >
        {messages.length === 0 ? (
          <EmptyHero onPick={handleSend} />
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map(m => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isLoading && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* ── Input (sticky bottom) ───────────────────────────────── */}
      <ConciergePanel />
      <div className="border-t border-edge bg-surface-card p-4">
        <form
          onSubmit={e => {
            e.preventDefault()
            handleSend(draft)
          }}
          className="max-w-3xl mx-auto flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Ask about cities, costs, timelines…"
            disabled={isLoading}
            className="flex-1 px-4 py-3 rounded-2xl bg-surface-input border border-edge text-content placeholder:text-content-faint text-sm outline-none focus:border-primary-500 transition-colors"
            style={{ fontFamily: 'Poppins, system-ui' }}
            autoFocus
          />
          <button
            type="submit"
            disabled={!draft.trim() || isLoading}
            className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary text-primary-50 disabled:opacity-40 transition-opacity shrink-0"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}

// ── MessageBubble ──────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }): React.ReactElement {
  const isUser = message.role === 'user'
  return (
    <div className={`msg-in flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-primary text-primary-50 rounded-br-md'
              : 'bg-surface-card border border-edge text-content rounded-bl-md'
          }`}
          style={{ fontFamily: 'Poppins, system-ui' }}
        >
          {message.text}
        </div>
        {!isUser && message.tool && message.data && (
          <div className="w-full">
            <PayloadRenderer tool={message.tool} data={message.data} />
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyHero({ onPick }: { onPick: (text: string) => void }): React.ReactElement {
  const prompts = [
    'Find me a warm, affordable city',
    'Compare cost of living: Austin vs Denver',
    "What's the job market like in Nashville?",
    'Help me plan a move in 3 months',
  ]
  return (
    <div className="max-w-3xl mx-auto flex flex-col items-center text-center pt-12 px-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-surface-card border border-edge mb-4">
        <Sparkles size={24} className="text-primary" />
      </div>
      <h2 className="text-2xl font-semibold text-content mb-2" style={{ fontFamily: 'Poppins, system-ui' }}>
        Where should you move?
      </h2>
      <p className="text-sm text-content-muted max-w-md mb-8">
        Ask in your own words. The agent pulls live data — climate, cost, fiscal health,
        job market — for every US metro.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
        {prompts.map(p => (
          <button
            key={p}
            onClick={() => onPick(p)}
            className="text-left px-4 py-3 rounded-2xl border border-edge bg-surface-card hover:border-primary-500 hover:bg-primary-50/50 dark:hover:bg-primary-950/20 text-sm text-content transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

// ponytail: tiny three-dot bounce. <10 lines — inlined.
function TypingIndicator(): React.ReactElement {
  return (
    <div className="msg-in flex justify-start">
      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-surface-card border border-edge flex items-center gap-1">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-content-faint inline-block"
            style={{ animation: `memove-typing-bounce 1.2s ease-in-out ${i * 150}ms infinite` }}
          />
        ))}
        <style>{`@keyframes memove-typing-bounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-3px);opacity:1} }`}</style>
      </div>
    </div>
  )
}
