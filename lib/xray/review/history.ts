/**
 * Append-only review history.
 *
 * Re-review after revision must never erase prior review evidence. A graph that
 * was flagged, revised and then passed is a different record from a graph that
 * passed first time, and the difference is the audit trail.
 *
 * Pure: `appendReviewRound` returns a new history and mutates nothing. The same
 * discipline the system applies to investigation versions (ADR-0006) — history
 * accumulates rather than being overwritten.
 */

import type { ReviewHistory, ReviewResult, ReviewRound } from './types'

export function emptyReviewHistory(investigationId: string): ReviewHistory {
  return { investigationId, rounds: [] }
}

/** Add a round. Prior rounds are carried forward untouched. */
export function appendReviewRound(history: ReviewHistory, result: ReviewResult): ReviewHistory {
  if (result.investigationId !== history.investigationId) {
    throw new Error(
      `Review history is for ${history.investigationId} but the result concerns ${result.investigationId}`,
    )
  }
  const round: ReviewRound = { round: history.rounds.length + 1, result }
  return { investigationId: history.investigationId, rounds: [...history.rounds, round] }
}

export const latestRound = (history: ReviewHistory): ReviewRound | undefined =>
  history.rounds[history.rounds.length - 1]

/**
 * True when the most recent round found nothing blocking.
 *
 * Deliberately NOT called `canGraduate`. The graduation verdict belongs to #5;
 * this only reports what the last review found.
 */
export function latestRoundIsClear(history: ReviewHistory): boolean {
  const last = latestRound(history)
  return last !== undefined && last.result.summary.blockingFindings === 0
}

/**
 * Whether the rounds concern distinct graph states.
 *
 * Two rounds sharing a fingerprint reviewed identical state, which means a
 * revision was requested and nothing was revised.
 */
export function roundsConcernDistinctGraphs(history: ReviewHistory): boolean {
  const prints = history.rounds.map((r) => r.result.graphFingerprint)
  return new Set(prints).size === prints.length
}
