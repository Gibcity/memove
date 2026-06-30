import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'
import { Send, Sparkles, MapPin, CalendarDays, ListChecks, Trash2, GitCompareArrows } from 'lucide-react'
import { useRelocationChat, type ChatMessage, type RichCard } from './useRelocationChat'

// ponytail: whole component is one file, ~one screenful. No subfolders, no
// abstraction until a second screen needs the same shape.

const QUICK_ICONS = [Sparkles, MapPin, CalendarDays, ListChecks] as const

// ponytail: hook supplies context-aware prompts; these static ones cover
// scenarios the hook can't infer (no trip yet, no chosen city). Append-only.
const STATIC_PROMPTS = [
  'Is this rental a scam?',
  'How do I transfer my professional license?',
  "What's the job market like in Austin?",
  'Help me budget upfront costs',
  "I'm feeling overwhelmed",
]

export default function RelocationChat(): React.ReactElement {
  const { t } = useTranslation()
  const { messages, isLoading, quickPrompts, sendMessage, clear } = useRelocationChat()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // ponytail: stick scroll to bottom on new message — auto-scroll is the
    // chat contract; users scroll up explicitly when they want history.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = async (text: string) => {
    setDraft('')
    await sendMessage(text)
  }

  const empty = messages.length === 0

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] memove-page-enter">
      {/* ── Header strip ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            <Sparkles size={16} />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight" style={{ color: 'var(--text-primary)', fontFamily: 'Poppins, system-ui' }}>
              {t('relocation.chatTitle')}
            </h2>
            <p className="text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
              {t('relocation.chatSubtitle')}
            </p>
          </div>
        </div>
        {!empty && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
            aria-label={t('relocation.chatClear')}
          >
            <Trash2 size={12} />
            {t('relocation.chatClear')}
          </button>
        )}
      </div>

      {/* ── Message thread ───────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-1 py-4 space-y-4"
        style={{ scrollbarWidth: 'thin' }}
      >
        {empty ? (
          <EmptyHero onPick={handleSend} />
        ) : (
          <div className="space-y-4 memove-stagger">
            {messages.map(m => (
              <MessageBubble key={m.id} message={m} onPick={handleSend} />
            ))}
            {isLoading && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* ── Quick-start prompt bar ───────────────────────────────── */}
      <div className="pt-3 pb-2 border-t" style={{ borderColor: 'var(--border-secondary)' }}>
        <div
          className="flex gap-2 overflow-x-auto pb-2"
          style={{ scrollbarWidth: 'none', scrollSnapType: 'x mandatory' }}
        >
          {[...quickPrompts, ...STATIC_PROMPTS].map((p, i) => {
            const Icon = QUICK_ICONS[i % QUICK_ICONS.length]
            return (
              <button
                key={p}
                onClick={() => handleSend(p)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors shrink-0"
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                  scrollSnapAlign: 'start',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
              >
                <Icon size={12} />
                {p}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Input row ────────────────────────────────────────────── */}
      <form
        onSubmit={e => { e.preventDefault(); handleSend(draft) }}
        className="flex items-end gap-2 pt-2"
      >
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={t('relocation.chatPlaceholder')}
          disabled={isLoading}
          className="flex-1 px-4 py-3 rounded-2xl text-sm outline-none transition-all"
          style={{
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
            fontFamily: 'Poppins, system-ui',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--text-faint)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || isLoading}
          className="w-12 h-12 rounded-2xl flex items-center justify-center transition-opacity"
          style={{
            background: 'var(--accent)',
            color: 'var(--accent-text)',
            opacity: !draft.trim() || isLoading ? 0.4 : 1,
          }}
          aria-label={t('relocation.chatSend')}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════════════

function EmptyHero({ onPick }: { onPick: (text: string) => void }): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'var(--bg-tertiary)' }}
      >
        <Sparkles size={24} style={{ color: 'var(--accent)' }} />
      </div>
      <h3
        className="text-xl font-semibold mb-2"
        style={{ color: 'var(--text-primary)', fontFamily: 'Poppins, system-ui' }}
      >
        {t('relocation.chatEmptyTitle')}
      </h3>
      <p className="text-sm max-w-md mb-6" style={{ color: 'var(--text-muted)' }}>
        {t('relocation.chatEmptyBody')}
      </p>
      <div className="flex flex-col items-stretch gap-2 w-full max-w-md memove-stagger">
        {[
          { icon: MapPin, text: 'Find me a warm, affordable city', q: 'Find me a warm, affordable city' },
          { icon: ListChecks, text: 'Compare cost of living: Austin vs Denver', q: 'Compare cost of living: Austin vs Denver' },
          { icon: CalendarDays, text: 'Plan my move timeline', q: 'Plan my move timeline' },
          { icon: ListChecks, text: 'What do I need for a DMV transfer to Texas?', q: 'What do I need for a DMV transfer to Texas?' },
        ].map(({ icon: Icon, text, q }) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl text-left text-sm transition-colors"
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
              boxShadow: 'var(--shadow-card)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
          >
            <Icon size={16} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontFamily: 'Poppins, system-ui' }}>{text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  onPick,
}: {
  message: ChatMessage
  onPick?: (text: string) => void
}): React.ReactElement {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[80%] px-4 py-3 rounded-2xl"
        style={{
          background: isUser ? 'var(--accent)' : 'var(--bg-card)',
          color: isUser ? 'var(--accent-text)' : 'var(--text-primary)',
          border: !isUser ? '1px solid var(--border-primary)' : undefined,
          boxShadow: !isUser ? 'var(--shadow-card)' : undefined,
          fontFamily: 'Poppins, system-ui',
          borderBottomRightRadius: isUser ? 6 : undefined,
          borderBottomLeftRadius: !isUser ? 6 : undefined,
        }}
      >
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.text}</p>
        {message.cards && message.cards.length > 0 && (
          <div className="mt-3 space-y-3">
            {message.cards.map((c, i) => (
              <RichCardView key={i} card={c} onPick={onPick} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RichCardView({
  card,
  onPick,
}: {
  card: RichCard
  onPick?: (text: string) => void
}): React.ReactElement {
  if (card.kind === 'city_compare') {
    return (
      <div
        className="rounded-xl p-3"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={12} style={{ color: 'var(--text-muted)' }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            City comparison
          </span>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(card.cities.length, 3)}, minmax(0, 1fr))` }}>
          {card.cities.map(c => (
            <div
              key={c.name}
              className="rounded-lg p-2.5"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
            >
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                {c.name}, {c.state}
              </div>
              <div className="text-[10px] space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                <div>CoL index: <span className="tabular-nums font-medium" style={{ color: 'var(--text-secondary)' }}>{c.colIndex}</span></div>
                <div>Rent: <span className="tabular-nums font-medium" style={{ color: 'var(--text-secondary)' }}>${c.rent}/mo</span></div>
                <div>{c.weather}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (card.kind === 'timeline') {
    return (
      <div
        className="rounded-xl p-3"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <CalendarDays size={12} style={{ color: 'var(--text-muted)' }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Move timeline
          </span>
        </div>
        <div className="space-y-1.5">
          {card.weeks.map(w => (
            <div
              key={w.week}
              className="flex items-start gap-2 p-2 rounded-lg"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
            >
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 tabular-nums"
                style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}
              >
                {w.week}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>
                  {w.title}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {w.tasks.join(' · ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (card.kind === 'city_list') {
    // ponytail: server-issued ranked list. Score dot + name+state + key metric
    // pills. Missing metrics fall back to em-dash so the card never blanks.
    return (
      <div
        className="rounded-xl p-3"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={12} style={{ color: 'var(--text-muted)' }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Top matches
          </span>
        </div>
        <div className="space-y-1.5">
          {card.cities.map(c => {
            const km = c.keyMetrics ?? {}
            const rent = km.medianRent ?? null
            const home = km.medianHomeValue ?? null
            const hot = km.daysMaxGt90FAnnual ?? null
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick?.(`Tell me more about ${c.name}, ${c.state}`)}
                className="w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-secondary)' }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: scoreHex(c.matchScore) }}
                  aria-label={`Score ${c.matchScore}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {c.name}, {c.state}
                  </div>
                  <div className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    Score {c.matchScore} · Rent {rent != null ? `$${rent.toLocaleString()}/mo` : '—'} · Home {home != null ? `$${(home / 1000).toFixed(0)}K` : '—'} · {hot != null ? `${hot} hot days` : '—'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  if (card.kind === 'compare_prompt') {
    // ponytail: server tells the chat to suggest comparison. Existing shortlist
    // becomes tappable chips; if shortlist is empty, surface a hint.
    return (
      <div
        className="rounded-xl p-3"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <GitCompareArrows size={12} style={{ color: 'var(--text-muted)' }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Compare cities
          </span>
        </div>
        {card.shortlist.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Save 2 or more cities from the dashboard, then ask to compare.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {card.shortlist.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => onPick?.(`Compare ${name} with my other shortlisted cities`)}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-primary)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (card.kind === 'prompt_chips') {
    // ponytail: server-prompted next-turn suggestions. Tappable so the user
    // can drive the conversation without typing.
    return (
      <div className="flex flex-wrap gap-1.5">
        {card.chips.map(chip => (
          <button
            key={chip.query}
            type="button"
            onClick={() => onPick?.(chip.query)}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-primary)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
          >
            {chip.label}
          </button>
        ))}
      </div>
    )
  }
  if (card.kind === 'checklist') {
    return (
      <div
        className="rounded-xl p-3"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)' }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <ListChecks size={12} style={{ color: 'var(--text-muted)' }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {card.state} DMV checklist
          </span>
        </div>
        <div className="space-y-1">
          {card.items.map((item, i) => (
            <label
              key={i}
              className="flex items-start gap-2 p-1.5 rounded-md cursor-pointer"
              style={{ background: 'var(--bg-card)' }}
            >
              <input
                type="checkbox"
                defaultChecked={item.done}
                className="mt-0.5 cursor-pointer accent-indigo-500"
              />
              <span
                className="text-xs leading-snug"
                style={{
                  color: item.done ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: item.done ? 'line-through' : 'none',
                }}
              >
                {item.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    )
  }
  // exhaustive fallback — ponytail: unknown card kinds render nothing rather
  // than crash. Bump the discriminated union check when new kinds are added.
  return <></>
}

// ponytail: tiny hex-color helper for city_list score dots. Inline so the chat
// file stays self-contained; mirrors scoreToColor breakpoints in relocationModel.
function scoreHex(score: number): string {
  if (score >= 80) return '#22c55e' // green
  if (score >= 60) return '#84cc16' // lime
  if (score >= 40) return '#eab308' // yellow
  if (score >= 20) return '#f97316' // orange
  return '#ef4444' // red
}

function TypingIndicator(): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div className="flex justify-start">
      <div
        className="px-4 py-3 rounded-2xl flex items-center gap-1"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-primary)',
          borderBottomLeftRadius: 6,
        }}
        aria-label={t('relocation.chatTyping')}
      >
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{
              background: 'var(--text-faint)',
              animation: `memove-typing-bounce 1.2s cubic-bezier(0.23, 1, 0.32, 1) infinite`,
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
        <style>{`
          @keyframes memove-typing-bounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-3px); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  )
}