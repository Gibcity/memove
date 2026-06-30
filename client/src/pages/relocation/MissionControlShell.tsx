import React, { useState, useRef, useCallback } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import Navbar from '../../components/Layout/Navbar'
import { useResizablePanels } from '../../hooks/useResizablePanels'
import { useRelocationCandidates } from './useRelocationCandidates'
import { useRelocationElicitation } from './useRelocationElicitation'
import { useRelocationScore } from './useRelocationScore'
import { relocationApi } from '../../api/relocation'
import { useToast } from '../../components/shared/Toast'
import { useTripStore } from '../../store/tripStore'
import MoveTimelinePanel from './panels/MoveTimelinePanel'
import RelocationMapPanel from './panels/RelocationMapPanel'
import CandidateLibraryPanel from './panels/CandidateLibraryPanel'
import { CandidateDetailSheet } from './panels/CandidateDetailSheet'
import RelocationChat from './RelocationChat'
import type { CandidateView } from './relocationModel'
import type { ImplicitSignal } from '@memove/shared'

const MAX_COMPARE = 3 // ponytail: 2–3 is the readable band, hard cap to keep the side-by-side sane

/**
 * MissionControlShell — 3-panel relocation dashboard.
 *
 * Left:   Move timeline + elicitation + checklist
 * Center: US map with score-colored city pins
 * Right:  Candidate library (search, filter, sort, list)
 *
 * Click any city (map pin or library row) → detail sheet overlays right panel.
 * State lives in the existing hooks. This component is layout-only wiring.
 */
export default function MissionControlShell(): React.ReactElement {
  const { t } = useTranslation()
  const toast = useToast()

  // ponytail: ref breaks the TDZ cycle between elicitation (needs dismissCounts)
  // and candidates (needs roundsCompleted).
  const dismissCountsRef = useRef<Record<string, number>>({})

  // ── Hooks (order matters: elicitation before candidates) ──

  const {
    elicitation,
    profile,
    showElicitationCard,
    setShowElicitationCard,
    hardFilterPrompt,
    startElicitation,
    answerQuestion,
    skipQuestion,
    skipAll,
    confirmHardFilter,
    dismissHardFilterPrompt,
  } = useRelocationElicitation(dismissCountsRef.current)

  const {
    allLocations,
    candidates,
    allCandidates,
    isLoading,
    loadError,
    retryLoad,
    sliders,
    updateSlider,
    toggleSlider,
    sendFilterApplySignal,
    dismissCandidate,
    saveCandidate,
    dismissCounts,
    scoreDegraded,
  } = useRelocationCandidates(elicitation.roundsCompleted)

  dismissCountsRef.current = dismissCounts

  const { detail, explainLoading, openDetail, closeDetail, deepData, fetchDeepData } =
    useRelocationScore()

  // ponytail: read active trip reactively; null until user opens a trip elsewhere.
  const activeTrip = useTripStore(s => s.trip)

  // ── Selection state (shared between map + library + detail) ──

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Chat toggle ──
  const [showChat, setShowChat] = useState(false)

  // ── Compare state ──
  // ponytail: ids-as-state keeps this cheap — derive the candidate views from
  // `candidates` below. Storing objects would double-cache data that's already
  // memoized upstream.
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareResult, setCompareResult] = useState<
    { winner: string } | { error: string } | null
  >(null)
  const [compareLoading, setCompareLoading] = useState(false)

  const toggleCompare = useCallback((id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= MAX_COMPARE) {
        toast.warning(`You can compare up to ${MAX_COMPARE} cities at once — remove one to swap.`)
        return prev
      }
      return [...prev, id]
    })
  }, [toast])

  const clearCompare = useCallback(() => {
    setCompareIds([])
    setCompareOpen(false)
    setCompareResult(null)
  }, [])

  const openCompare = useCallback(async () => {
    if (compareIds.length < 2) return
    setCompareOpen(true)
    setCompareLoading(true)
    setCompareResult(null)
    try {
      const resp = await relocationApi.compareLocations(compareIds)
      setCompareResult(resp)
    } catch (e) {
      setCompareResult({ error: (e as Error).message || 'Compare failed' })
    } finally {
      setCompareLoading(false)
    }
    // ponytail: fire implicit compare signal so profile re-ranks — schema already has 'candidate_compare'
    const signal: ImplicitSignal = {
      kind: 'candidate_compare',
      locationIds: compareIds,
      ts: new Date().toISOString(),
    }
    relocationApi.submitSignal(signal).catch(() => {})
  }, [compareIds])

  // ponytail: derive compare candidates from current list. They may briefly be
  // missing if the user dismissed one in another tab — fall back to allCandidates.
  const compareCandidates = compareIds
    .map(id => candidates.find(c => c.location.id === id) ?? allCandidates.find(c => c.location.id === id))
    .filter((c): c is CandidateView => !!c)

  const handleSelectById = useCallback((id: string) => {
    setSelectedId(id)
    const candidate = candidates.find(c => c.location.id === id)
    if (candidate) {
      openDetail(candidate)
      fetchDeepData(candidate.location.id)
    }
  }, [candidates, openDetail, fetchDeepData])

  const handleSelectByCandidate = useCallback((c: CandidateView) => {
    handleSelectById(c.location.id)
  }, [handleSelectById])

  const handleClose = useCallback(() => {
    setSelectedId(null)
    closeDetail()
  }, [closeDetail])

  // ── Checklist CTA ──

  const handleApplyChecklist = useCallback(async () => {
    const tripId = activeTrip?.id
    const moveDate = profile?.moveContext?.moveDate
    if (!tripId) {
      toast.warning('Open a trip first — the checklist attaches to that trip\'s todo list.')
      return
    }
    if (!moveDate) {
      toast.warning('Set your move date in the elicitation card first.')
      return
    }
    try {
      const resp = await relocationApi.applyMoveChecklist(tripId, moveDate)
      if (resp.skipped) {
        toast.info(`Move checklist already applied (${resp.existing ?? 0} task${resp.existing === 1 ? '' : 's'} on this trip).`)
      } else if (resp.error) {
        toast.error(resp.error)
      } else {
        toast.success(`Added ${resp.applied} move-checklist task${resp.applied === 1 ? '' : 's'} to your trip.`)
      }
    } catch (e) {
      toast.error((e as Error).message || 'Failed to apply move checklist')
    }
  }, [activeTrip, profile, toast])

  // ── Layout (must be before early returns — hooks ordering) ──

  const { leftWidth, rightWidth, startResizeLeft, startResizeRight } = useResizablePanels()

  // ── Loading state ──

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">{t('common.loading')}</p>
          </div>
        </div>
      </>
    )
  }

  // ── Layout ──

  const selectedCandidate = detail.candidate

  return (
    <>
      <Navbar />
      <div className="fixed inset-0 top-[var(--navbar-height,56px)] flex bg-slate-50 dark:bg-zinc-950 overflow-hidden">
        {/* ── LEFT: Timeline ── */}
        <aside
          className="h-full shrink-0 overflow-y-auto border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          style={{ width: leftWidth }}
        >
          <MoveTimelinePanel
            elicitation={elicitation}
            showElicitationCard={showElicitationCard}
            onStartElicitation={startElicitation}
            onAnswer={answerQuestion}
            onSkip={skipQuestion}
            onSkipAll={skipAll}
            onDismissElicitation={() => setShowElicitationCard(false)}
            hardFilterPrompt={hardFilterPrompt}
            onConfirmHardFilter={confirmHardFilter}
            onDismissHardFilter={dismissHardFilterPrompt}
            profile={profile}
            onApplyChecklist={handleApplyChecklist}
          />
        </aside>

        {/* Left resize handle */}
        <div
          className="w-1 cursor-col-resize bg-slate-200 dark:bg-zinc-700 hover:bg-blue-400 transition-colors shrink-0"
          onMouseDown={startResizeLeft}
        />

        {/* ── CENTER: Map ── */}
        <main className="flex-1 relative min-w-0">
          <RelocationMapPanel
            candidates={candidates}
            selectedId={selectedId}
            onMarkerClick={handleSelectById}
          />

          {/* Score degraded banner */}
          {scoreDegraded && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 p-2 px-4 bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-full text-xs text-amber-700 dark:text-amber-300 shadow-sm whitespace-nowrap z-10">
              {t('relocation.scoreDegraded')}
            </div>
          )}

          {/* Load error */}
          {loadError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 p-2 px-4 bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded-full text-xs text-red-700 dark:text-red-300 shadow-sm whitespace-nowrap z-10">
              {t('relocation.loadError')}{' '}
              <button onClick={retryLoad} className="underline font-medium">Retry</button>
            </div>
          )}

          {/* Chat overlay — floats over the map, dismissible via toggle or X */}
          {showChat && (
            <div
              className="absolute bottom-4 right-4 w-[min(400px,calc(100%-2rem))] h-[min(600px,calc(100%-2rem))]
                         bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700
                         rounded-2xl shadow-xl flex flex-col overflow-hidden z-20"
            >
              <button
                onClick={() => setShowChat(false)}
                className="absolute top-2 right-2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700
                           dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors z-10"
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
              <div className="flex-1 min-h-0 p-4">
                <RelocationChat />
              </div>
            </div>
          )}

          {/* Chat toggle — fixed bottom-right of the map area */}
          {!showChat && (
            <button
              onClick={() => setShowChat(true)}
              className="absolute bottom-4 right-4 w-12 h-12 rounded-full
                         bg-blue-600 hover:bg-blue-700 text-white shadow-lg
                         flex items-center justify-center transition-colors z-20"
              aria-label={t('relocation.chatTitle')}
            >
              <MessageCircle size={20} />
            </button>
          )}
        </main>

        {/* Right resize handle */}
        <div
          className="w-1 cursor-col-resize bg-slate-200 dark:bg-zinc-700 hover:bg-blue-400 transition-colors shrink-0"
          onMouseDown={startResizeRight}
        />

        {/* ── RIGHT: Candidate Library ── */}
        <aside
          className="h-full shrink-0 overflow-hidden relative border-l border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          style={{ width: rightWidth }}
        >
          <CandidateLibraryPanel
            candidates={candidates}
            allCandidates={allCandidates}
            selectedId={selectedId}
            onSelect={handleSelectByCandidate}
            onDismiss={(id: string) => dismissCandidate(id, 'dismissed_from_library')}
            onSave={saveCandidate}
            sliders={sliders}
            onUpdateSlider={updateSlider}
            onToggleSlider={toggleSlider}
            onApplyFilters={sendFilterApplySignal}
            compareIds={compareIds}
            onToggleCompare={toggleCompare}
            onClearCompare={clearCompare}
            onOpenCompare={openCompare}
          />

          {/* ── Detail sheet overlay (replaces drawer) ── */}
          {compareOpen && compareCandidates.length >= 2 ? (
            <CandidateDetailSheet
              candidate={compareCandidates[0]}
              explanation={null}
              affordability={null}
              deepData={null}
              loading={compareLoading}
              onClose={handleClose}
              compareWith={compareCandidates[1]}
              compareResult={compareResult}
            />
          ) : detail.isOpen && selectedCandidate ? (
            <CandidateDetailSheet
              candidate={selectedCandidate}
              explanation={detail.explanation}
              affordability={detail.affordability}
              deepData={deepData}
              loading={explainLoading}
              onClose={handleClose}
            />
          ) : null}
        </aside>
      </div>
    </>
  )
}
