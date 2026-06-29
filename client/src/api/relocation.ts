import { apiClient } from './client'
import type {
  Location,
  UserProfile,
  ImplicitSignal,
  ScoreRequest,
  ScoreResponse,
  ElicitationQuestion,
} from '@trek/shared'

// ── Locations ────────────────────────────────────────────────────────────

export const relocationApi = {
  /** List all 59+ relocation candidate metros (lightweight). */
  listLocations: () =>
    apiClient.get<Location[]>('/relocation/locations').then(r => r.data),

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

  /** Natural-language explanation of why a candidate scored as it did. */
  explainScore: (locationId: string) =>
    apiClient
      .post<{ explanation: string; trace: Record<string, unknown> }>(
        '/relocation/score/explain',
        { locationId },
      )
      .then(r => r.data),
}
