// ponytail: tiny shared chrome + a 12-line fetcher for the wrapper pages.
// Pattern: chrome renders a header (back-link + title + subtitle), spinner, error.
// Wrappers fetch and pass `data` to the corresponding presentational view.
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { apiClient } from '../../../api/client'

export function RelocationHeader({ title, subtitle }: { title: string; subtitle?: string }): React.ReactElement {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-3 flex items-start gap-3">
      <Link
        to="/relocation"
        className="mt-0.5 shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-content-muted hover:text-content border border-edge hover:bg-surface-secondary transition-colors"
        aria-label="Back to Relocation chat"
      >
        <ArrowLeft size={12} />Chat
      </Link>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-content truncate">{title}</h1>
        {subtitle ? <p className="text-xs text-content-muted mt-0.5">{subtitle}</p> : null}
      </div>
    </div>
  )
}

export function RelocationSpinner(): React.ReactElement {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
      <p className="text-xs text-content-muted">Loading…</p>
    </div>
  )
}

export function RelocationError({ message }: { message: string }): React.ReactElement {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col items-center gap-2 text-center">
      <AlertCircle size={20} className="text-red-500" />
      <p className="text-sm text-content">{message}</p>
    </div>
  )
}

// ponytail: one-liner fetcher — method is 'get' | 'post', url is the relocated path.
// Returns { data, loading, error }. Caller renders. No retries, no caching:
// these pages are entered-with-data, reload-is-fresh.
export function useApiFetch<T = unknown>(
  method: 'get' | 'post',
  url: string,
  body?: unknown,
  deps: ReadonlyArray<unknown> = [],
): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const req = method === 'get' ? apiClient.get<T>(url) : apiClient.post<T>(url, body)
    req
      .then((res) => { if (!cancelled) setData(res.data) })
      .catch((e: unknown) => {
        if (cancelled) return
        const msg = (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
          ?? (e as { message?: string })?.message
          ?? 'Request failed'
        setError(msg)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, loading, error }
}

// ponytail: bridge — the API uses axios but the chat/base url is at '/api'.
export const RELOCATION_BASE = '/api/relocation'
