// ponytail: bare /relocation/search — query params flow straight to /locations.
// Filters live in the URL: ?states=CO,UT&maxRent=2000 — same shape as the chat tool.
import React from 'react'
import { useSearchParams } from 'react-router-dom'
import PageShell from '../../../components/Layout/PageShell'
import { LocationSearchView } from '../views/LocationSearchView'
import {
  RelocationHeader, RelocationSpinner, RelocationError,
  useApiFetch,
} from './_chrome'

export default function RelocationSearchPage(): React.ReactElement {
  const [params] = useSearchParams()
  const qs = params.toString()
  const url = qs ? `/api/relocation/locations?${qs}` : '/api/relocation/locations'
  const res = useApiFetch<unknown>('get', url, undefined, [qs])
  return (
    <PageShell className="bg-slate-50 dark:bg-zinc-950">
      <RelocationHeader title="Browse locations" subtitle="Filter the relocation candidate set." />
      {res.loading ? <RelocationSpinner /> : null}
      {res.error ? <RelocationError message={res.error} /> : null}
      {res.data ? <LocationSearchView data={res.data} /> : null}
    </PageShell>
  )
}
