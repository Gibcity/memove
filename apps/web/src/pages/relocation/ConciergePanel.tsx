import React, { useEffect, useState } from 'react'
import { Send, BarChart3 } from 'lucide-react'
import { relocationApi } from '../../api/relocation'

// ponytail: one-file panel — the chat agent already handles categorized
// intents (housing, costs, jobs) via /chat. The concierge endpoint is the
// fallback for everything else, plus a stats view for lane promotion.
// Same apiClient, same .then(r => r.data) idiom as the rest of relocation.ts.

type Entry = { question: string; answer: string; category: string }

export default function ConciergePanel(): React.ReactElement {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [stats, setStats] = useState<{ category: string; count: number; sampleQueries: string[] }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)

  // ponytail: refresh stats whenever the panel opens — they're tiny and the
  // backend is in-memory, so a refetch on toggle keeps the view honest without
  // adding a polling loop.
  useEffect(() => {
    if (!statsOpen) return
    relocationApi
      .getConciergeStats()
      .then(setStats)
      .catch(e => setError((e as Error)?.message || 'Stats failed'))
  }, [statsOpen])

  const send = async (): Promise<void> => {
    const q = query.trim()
    if (!q || loading) return
    setQuery('')
    setError(null)
    setLoading(true)
    try {
      const res = await relocationApi.askConcierge(q)
      setEntries(prev => [...prev, { question: q, answer: res.answer, category: res.category }])
    } catch (e) {
      setError((e as Error)?.message || 'Concierge request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-edge bg-surface-card">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
            Concierge — questions the agent can't classify
          </h2>
          <button
            onClick={() => setStatsOpen(o => !o)}
            className="text-xs text-content-muted hover:text-content flex items-center gap-1 px-2 py-1 rounded-lg border border-edge hover:bg-surface-secondary transition-colors"
          >
            <BarChart3 size={12} />
            {statsOpen ? 'Hide stats' : 'Stats'}
          </button>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault()
            void send()
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Ask anything about your move (scams, pets, mail, utilities…)"
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-xl bg-surface-input border border-edge text-content placeholder:text-content-faint text-sm outline-none focus:border-primary-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary text-primary-50 disabled:opacity-40 transition-opacity shrink-0"
            aria-label="Ask concierge"
          >
            <Send size={14} />
          </button>
        </form>

        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

        {entries.length > 0 && (
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
            {entries.map((e, i) => (
              <div key={i} className="text-sm rounded-xl border border-edge bg-surface p-3">
                <div className="text-content-muted text-xs mb-1">
                  You · <span className="italic">{e.category}</span>
                </div>
                <div className="text-content mb-1">{e.question}</div>
                <div className="text-content/90">{e.answer}</div>
              </div>
            ))}
          </div>
        )}

        {statsOpen && (
          <div className="mt-3 rounded-xl border border-edge bg-surface p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted mb-2">
              Category frequency
            </h3>
            {stats.length === 0 ? (
              <p className="text-xs text-content-muted">No concierge queries logged yet.</p>
            ) : (
              <ul className="space-y-1">
                {stats.map(s => (
                  <li key={s.category} className="text-xs text-content">
                    <span className="font-medium">{s.category}</span>
                    <span className="text-content-muted"> · {s.count} queries</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}