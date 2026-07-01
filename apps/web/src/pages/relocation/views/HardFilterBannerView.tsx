import { useState } from 'react'
import { Filter, X } from 'lucide-react'
import { ViewCard } from './_shared'
import { relocationApi } from '../../../api/relocation'
import type { HardFilterProposal, HardFilter } from '@memove/shared'

// ponytail: inline card — confirms-then-POSTs the hard filter. Two actions:
// "Yes, hide it" appends the locationId to the user's profile.hardFilters,
// "Not now" collapses the banner. Both closed states remove the card from
// the thread, which is the F17 UX: one banner per dismissal-threshold
// crossing, no nag loop.
export function HardFilterBannerView({ data }: { data: unknown }) {
  const proposal = data as HardFilterProposal | undefined
  const [state, setState] = useState<'open' | 'dismissed' | 'applied' | 'pending'>('open')
  const [error, setError] = useState<string | null>(null)

  if (!proposal?.locationId) return null
  if (state !== 'open') {
    return (
      <ViewCard className="text-xs text-content-muted">
        {state === 'pending' && 'Hiding…'}
        {state === 'applied' && `Hidden ${proposal.locationName}.`}
        {state === 'dismissed' && `Kept ${proposal.locationName} in the list.`}
      </ViewCard>
    )
  }

  const accept = async (): Promise<void> => {
    setState('pending')
    setError(null)
    try {
      // ponytail: read-modify-write — client holds no profile cache, so a
      // GET→append→POST cycle is the safest append. The schema-side upsert
      // is a full replace, so the GET is required to avoid clobbering
      // filters the user already pinned.
      const profile = await relocationApi.getProfile()
      const next: HardFilter[] = [
        ...(profile.hardFilters ?? []),
        {
          field: 'locationId', // ponytail: synthetic filter target; the
          // scoring engine can match on it when locationId appears in the
          // candidate set. Real metric-field filters slot in later.
          operator: 'notIn',
          value: [proposal.locationId],
          source: 'revealed',
          confidence: 1,
          discoveredAt: new Date().toISOString(),
        },
      ]
      await relocationApi.updateProfile({ hardFilters: next })
      setState('applied')
    } catch (e) {
      setError((e as Error)?.message || 'Could not save the filter')
      setState('open')
    }
  }

  const decline = (): void => {
    setState('dismissed')
  }

  return (
    <ViewCard className="flex flex-col gap-3 border-amber-500/40 bg-amber-500/5">
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full flex items-center justify-center bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">
          <Filter size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-content">
            Hide <span className="font-semibold">{proposal.locationName}</span>?
          </p>
          <p className="text-xs text-content-muted">
            You've dismissed it {proposal.dismissCount} times. Add a hard
            filter so it stays out of future rankings.
          </p>
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={decline}
          className="px-3 py-1.5 rounded-xl text-xs text-content-muted hover:text-content border border-edge hover:bg-surface-secondary transition-colors flex items-center gap-1"
        >
          <X size={12} />
          Not now
        </button>
        <button
          type="button"
          onClick={() => void accept()}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-50 hover:bg-primary-600 transition-colors"
        >
          Yes, hide it
        </button>
      </div>
    </ViewCard>
  )
}
