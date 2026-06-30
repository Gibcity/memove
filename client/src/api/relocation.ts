import { apiClient } from './client'
import type {
  Location,
  UserProfile,
  ImplicitSignal,
  ScoreRequest,
  ScoreResponse,
  ElicitationQuestion,
} from '@memove/shared'

/** Server response for POST /relocation/score/explain. */
export interface ScoreExplanation {
  location: { id: string; name: string; state: string }
  matchScore: number
  subscores: Record<string, number>
  explanation: string[]
  dataGaps: { count: number; fields: string[]; note: string }
  weightsUsed: Record<string, number>
  allMetrics: Record<string, unknown>
}

// ── Locations ────────────────────────────────────────────────────────────

export const relocationApi = {
  /** List relocation candidate metros (lightweight). */
  listLocations: () =>
    apiClient.get<{ total: number; locations: Location[] }>('/relocation/locations?limit=1000').then(r => r.data.locations),

  /** Full detail for one metro. */
  getLocation: (id: string) =>
    apiClient.get<Location>(`/relocation/locations/${id}`).then(r => r.data),

  // ── User profile ───────────────────────────────────────────────────

  /** Read current user's relocation profile. */
  getProfile: () =>
    apiClient.get<UserProfile>('/relocation/profile').then(r => r.data),

  // ── Elicitation flow ───────────────────────────────────────────────

  /** Begin a new elicitation round; returns the first question. */
  startElicitation: () =>
    apiClient
      .post<{ sessionId: string; firstQuestion: ElicitationQuestion }>(
        '/relocation/profile/elicitation/start',
      )
      .then(r => r.data),

  /** Answer a question; returns the next question or signals completion. */
  respondElicitation: (sessionId: string, answer: string) =>
    apiClient
      .post<{
        nextQuestion: ElicitationQuestion | null
        done: boolean
        profileSnapshot: UserProfile
      }>('/relocation/profile/elicitation/respond', { sessionId, answer })
      .then(r => r.data),

  // ── Implicit signals ───────────────────────────────────────────────

  /** Send a behavioral signal (pan, dismiss, save, dwell, etc.). */
  submitSignal: (signal: ImplicitSignal) =>
    apiClient
      .post<{ profileSnapshot: UserProfile }>('/relocation/profile/signal', {
        signal,
      })
      .then(r => r.data),

  // ── Scoring ────────────────────────────────────────────────────────

  /** Compute top-K scored candidates given current profile. */
  scoreCandidates: (req?: ScoreRequest) =>
    apiClient
      .post<ScoreResponse>('/relocation/score', req ?? {})
      .then(r => r.data),

  /** Why a candidate scored as it did — subscores, weights, data gaps, trace. */
  explainScore: (locationId: string) =>
    apiClient
      .post<ScoreExplanation>(
        '/relocation/score/explain',
        { locationId },
      )
      .then(r => r.data),

  /** Side-by-side comparison of 2+ locations (POST /relocation/compare). */
  compareLocations: (locationIds: string[]) =>
    apiClient
      .post<{ locations: unknown[]; winner: string } | { error: string }>(
        '/relocation/compare',
        { locationIds },
      )
      .then(r => r.data),

  // ── Move checklist ───────────────────────────────────────────────

  /** Apply personalized move checklist to a trip's todo list. */
  applyMoveChecklist: (tripId: string | number, moveDate: string) =>
    apiClient
      .post<{
        applied: number
        skipped: boolean
        reason?: string
        existing?: number
        error?: string
      }>('/relocation/move-checklist', { tripId, moveDate })
      .then(r => r.data),

  // ── Housing ──────────────────────────────────────────────────────

  /** Check affordability for a budget. */
  getAffordability: (locationId: string, budget?: number) =>
    apiClient.get(`/relocation/housing/affordability/${locationId}` + (budget ? `?budget=${budget}` : '')).then(r => r.data),

  // ── Concierge ────────────────────────────────────────────────────

  /** Ask the concierge a general relocation question. */
  askConcierge: (query: string) =>
    apiClient.post<{ answer: string; category: string }>('/relocation/concierge', { query }).then(r => r.data),
}
