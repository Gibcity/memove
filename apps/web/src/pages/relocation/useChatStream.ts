import { useCallback, useRef, useState } from 'react'

// ponytail: minimal SSE client primitive. Parses `data: {t:token}\n\n` chunks,
// accumulates tokens into `content`, flips isStreaming on [DONE] or error.
// Rejects on stream failure so the caller can fall back to a non-streaming
// path. Skipped: EventSource (can't POST), auto-reconnect, AbortController
// timeout plumbing. Add when the prod trace shows mid-stream disconnects.

export interface UseChatStreamResult {
  content: string
  isStreaming: boolean
  error: string | null
  start: (message: string, history?: Array<{ role: string; content: string }>) => Promise<string>
  reset: () => void
  abort: () => void
}

export function useChatStream(endpoint = '/api/relocation/chat/stream'): UseChatStreamResult {
  const [content, setContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
    setContent('')
    setError(null)
    setIsStreaming(false)
  }, [])

  const abort = useCallback(() => { ctrlRef.current?.abort() }, [])

  const start = useCallback(async (
    message: string,
    history?: Array<{ role: string; content: string }>,
  ): Promise<string> => {
    reset()
    setIsStreaming(true)
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    let acc = ''
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message, history: history ?? [] }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) throw new Error(`stream request failed: ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          const line = event.split('\n').find(l => l.startsWith('data:'))
          if (!line) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') { setIsStreaming(false); ctrlRef.current = null; return acc }
          const parsed = JSON.parse(payload) as { t?: string; error?: string }
          if (parsed.error) throw new Error(parsed.error)
          if (typeof parsed.t === 'string') { acc += parsed.t; setContent(acc) }
        }
      }
      setIsStreaming(false)
      ctrlRef.current = null
      return acc
    } catch (e) {
      if (ctrl.signal.aborted) { setIsStreaming(false); return acc }
      const msg = e instanceof Error ? e.message : 'stream failed'
      setError(msg)
      setIsStreaming(false)
      ctrlRef.current = null
      throw new Error(msg)
    }
  }, [endpoint, reset])

  return { content, isStreaming, error, start, reset, abort }
}