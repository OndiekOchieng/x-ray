/**
 * Capability vocabulary, shared by the review gate and the pipeline.
 *
 * WHY THIS IS NOT AN ERROR TYPE
 * =============================
 * "The adapter cannot do this in this run" and "the adapter tried and broke"
 * are different facts with different remedies, and #5 already built the
 * distinction into graduation: `FAIL`/`REVISE` mean *fix the graph*, `BLOCKED`
 * means *supply the missing capability*. Collapsing them would make an
 * unwired provider look like a defective investigation (#6 D19).
 *
 * So capability absence is a **value**, not an exception. A function that may
 * lack capability returns `CapabilityResult<T>`; a function that may break
 * throws. The type makes the caller handle the first case, which is exactly
 * the case that is easy to forget and expensive to get wrong.
 *
 * WHY DISCOVERY IS PER OPERATION
 * ==============================
 * A coarse `supportsEverything` flag cannot describe a provider that can
 * decompose but not grade, or one that can grade until its quota runs out.
 * Capability depends on provider, model, quota, content type and execution
 * context, so an adapter may *declare* what it supports, and a caller must
 * still handle `UNAVAILABLE` at runtime (#6, capability discovery).
 *
 * PURITY: no I/O, no clock, no randomness, no provider types.
 */

/** Why a capability could not be exercised. */
export type UnavailableReason =
  /** No implementation is wired for this operation. */
  | 'NOT_CONFIGURED'
  /** An implementation exists but does not offer this operation. */
  | 'NOT_SUPPORTED'
  /** Offered, but refused for this run: quota, budget, rate limit. */
  | 'EXHAUSTED'
  /** Offered, but refused for this input: content type, size, policy. */
  | 'REFUSED_FOR_INPUT'

/**
 * A capability that could not be exercised.
 *
 * `resolvedBy` says what would make it available. #5's `CapabilityBlocker`
 * carries the same field for the same reason: a blocker a reader cannot act on
 * is only a complaint.
 */
export interface CapabilityUnavailable {
  readonly kind: 'CAPABILITY_UNAVAILABLE'
  /** The operation that could not run, e.g. `research-model:grade`. */
  readonly operation: string
  readonly reason: UnavailableReason
  /** Plain-language explanation, safe to show a reader. */
  readonly detail: string
  /** What would make this capability available. */
  readonly resolvedBy: string
}

export type CapabilityResult<T> =
  | { readonly kind: 'AVAILABLE'; readonly value: T }
  | CapabilityUnavailable

export const available = <T>(value: T): CapabilityResult<T> => ({ kind: 'AVAILABLE', value })

export function unavailable(
  operation: string,
  reason: UnavailableReason,
  detail: string,
  resolvedBy: string,
): CapabilityUnavailable {
  return { kind: 'CAPABILITY_UNAVAILABLE', operation, reason, detail, resolvedBy }
}

export const isAvailable = <T>(
  result: CapabilityResult<T>,
): result is { kind: 'AVAILABLE'; value: T } => result.kind === 'AVAILABLE'

export const isUnavailable = <T>(result: CapabilityResult<T>): result is CapabilityUnavailable =>
  result.kind === 'CAPABILITY_UNAVAILABLE'

/**
 * Not-configured is the common case and deserves one spelling.
 *
 * It is what every adapter-less run reports, and #4 established the tone: an
 * absent capability is disclosed with a reason, never silently treated as a
 * pass.
 */
export function notConfigured(operation: string, resolvedBy: string): CapabilityUnavailable {
  return unavailable(
    operation,
    'NOT_CONFIGURED',
    `No implementation is wired for ${operation} in this build.`,
    resolvedBy,
  )
}

// ---------------------------------------------------------------------------
// Operational failure — the other half of the distinction
// ---------------------------------------------------------------------------

/**
 * Whether retrying could plausibly succeed.
 *
 * 6a's retry loop is the only consumer: it re-attempts `TRANSIENT` and stops
 * on `PERMANENT`. Retrying a malformed provider response five times produces
 * five malformed responses and a longer journal.
 */
export type FailureDisposition = 'TRANSIENT' | 'PERMANENT'

/**
 * An adapter was expected to work and did not.
 *
 * Distinct from `CapabilityUnavailable`: this is a real failure and does reach
 * graduation as a graph-level concern, because the run could not be completed
 * as specified. Timeouts *after* a capability was expected belong here, not in
 * the capability vocabulary (#6 D19).
 */
export class AdapterFailure extends Error {
  readonly operation: string
  readonly disposition: FailureDisposition

  constructor(operation: string, disposition: FailureDisposition, message: string) {
    super(message)
    this.name = 'AdapterFailure'
    this.operation = operation
    this.disposition = disposition
  }
}

export const isTransient = (err: unknown): boolean =>
  err instanceof AdapterFailure && err.disposition === 'TRANSIENT'
