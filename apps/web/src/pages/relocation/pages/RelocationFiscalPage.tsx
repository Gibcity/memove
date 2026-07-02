// ponytail: bare /relocation/fiscal — reads ?id= and asks for that state's fiscal profile.
// Falls back to the user's top shortlist if no id is given.
import React from 'react'
import { useSearchParams } from 'react-router-dom'
import PageShell from '../../../components/Layout/PageShell'
import { FiscalProfileView } from '../views/FiscalProfileView'
import {
  RelocationHeader, RelocationSpinner, RelocationError,
  useApiFetch, RELOCATION_BASE,
} from './_chrome'

export default function RelocationFiscalPage(): React.ReactElement {
  const [params] = useSearchParams()
  const id = params.get('id') ?? params.get('locationId') ?? ''
  const ready = id.length > 0
  const body = ready ? { locationId: id } : { locationId: '' }
  const res = useApiFetch<unknown>(
    'post',
    `${RELOCATION_BASE}/fiscal-health`,
    body,
    [id],
  )
  return (
    <PageShell className="bg-slate-50 dark:bg-zinc-950">
      <RelocationHeader
        title="Fiscal health"
        subtitle={ready ? `State fiscal profile for ${id}.` : 'Add ?id=<locationId> to view a state profile.'}
      />
      {!ready ? <RelocationError message="No locationId. Pass ?id=<locationId> in the URL." /> : null}
      {ready && res.loading ? <RelocationSpinner /> : null}
      {ready && res.error ? <RelocationError message={res.error} /> : null}
      {ready && res.data ? <FiscalProfileView data={res.data} /> : null}
    </PageShell>
  )
}
