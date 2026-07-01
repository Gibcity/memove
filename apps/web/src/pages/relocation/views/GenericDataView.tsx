import { ViewCard } from './_shared'

// ponytail: the fallback every unknown tool lands on. Renders arbitrary JSON
// as a key-value card — never a raw JSON dump. Arrays: count + first few items.
export function GenericDataView({ data }: { data: unknown }) {
  if (data == null) return null
  const entries = Array.isArray(data)
    ? [['count', data.length] as [string, unknown], ...data.slice(0, 6).flatMap((item, i) => Object.entries(item ?? {}).map(([k, v]) => [`${i}.${k}`, v] as [string, unknown]))]
    : typeof data === 'object'
      ? Object.entries(data as Record<string, unknown>)
      : [['value', data] as [string, unknown]]

  return (
    <ViewCard title="Result" className="space-y-2">
      <dl className="space-y-1.5">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-3 text-sm">
            <dt className="text-content-muted font-mono text-xs w-32 shrink-0 truncate">{key}</dt>
            <dd className="text-content break-words min-w-0 flex-1">
              {formatVal(value)}
            </dd>
          </div>
        ))}
      </dl>
    </ViewCard>
  )
}

function formatVal(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? `${v}` : v.toFixed(3)
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return `[${v.length} item${v.length === 1 ? '' : 's'}]`
  return JSON.stringify(v).slice(0, 200)
}
