/**
 * Deterministic proposal correlation (#6 D20).
 *
 * THE PROBLEM
 * ===========
 * 6a makes retry safe by rolling a failed attempt back, so the retry re-seeds
 * identically and allocates the same ordinals. That holds because the stage's
 * contribution was identical. With a live provider it is not: attempt 1 may
 * return five propositions and attempt 2 seven. Allocation stays deterministic
 * given the response, but the artifacts differ, and any reference written
 * against the first attempt means nothing.
 *
 * THE REJECTED FIX
 * ================
 * Let the provider supply a stable key. Rejected outright (D20): a provider
 * that names identity has been handed the thing ADR-0004's amendment moved
 * inside the trust boundary, and a provider with an incentive to look
 * consistent can reuse a key for a proposition it changed.
 *
 * THE FIX
 * =======
 * Correlate on content the stage computes itself: a hash over the normalized
 * proposal plus the stage input context. Same input revision plus a
 * semantically identical proposal gives the same key, from any provider, in
 * any order, on any attempt.
 *
 * Identity is then allocated in **key order**, never arrival order, so a
 * provider cannot change which artifact gets which id by reordering its
 * response. Keys already assigned in this run keep their ids, so unrelated
 * proposals appearing or disappearing renumbers nothing.
 *
 * WHAT NORMALIZATION DELIBERATELY DOES NOT DO
 * ===========================================
 * It does not try to decide that two differently worded propositions mean the
 * same thing. That is a judgment, and a hash that pretended to make it would
 * silently merge two distinct pieces of evidence. Normalization handles
 * formatting only — whitespace, case, key order, and the ordering of reference
 * lists that are sets rather than sequences.
 *
 * PURITY: no clock, no randomness, no I/O.
 */

import type { ResearchStage } from '@/lib/xray/domain'

/** What a correlation key is scoped to. */
export interface CorrelationContext {
  readonly investigationId: string
  readonly stage: ResearchStage
  /** Execution bookkeeping only; never part of semantic identity (D31). */
  readonly inputArtifactVersion: number
}

/** Fields whose element order carries no meaning, so it is normalized away. */
const UNORDERED_FIELDS = new Set([
  'claimRefs',
  'evidenceRefs',
  'discrepancyRefs',
  'supportingEvidenceRefs',
  'challengingEvidenceRefs',
  'contextualEvidenceRefs',
  'strongestSupportingEvidenceRefs',
  'strongestOpposingEvidenceRefs',
  'entities',
  'ambiguities',
  'identifiers',
])

/** Collapse formatting differences that carry no meaning. */
const normalizeText = (value: string): string =>
  value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en')

/**
 * A stable string for any proposal value.
 *
 * Object keys are sorted so serialization order cannot affect the key, and
 * `undefined` members are dropped so an explicitly-absent optional and an
 * omitted one correlate identically.
 */
function normalize(value: unknown, field?: string): unknown {
  if (typeof value === 'string') return normalizeText(value)
  if (Array.isArray(value)) {
    const items = value.map((v) => normalize(v))
    if (field !== undefined && UNORDERED_FIELDS.has(field)) {
      return [...items].sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
    }
    return items
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as object).sort()) {
      const inner = (value as Record<string, unknown>)[key]
      if (inner === undefined) continue
      out[key] = normalize(inner, key)
    }
    return out
  }
  return value
}

/** FNV-1a. No crypto dependency; stable across runs and platforms. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export type CorrelationKey = `pk_${string}`

/**
 * The correlation key for one proposal.
 *
 * Pure: same context and same proposal content gives the same key, always.
 * The length suffix makes an accidental collision between two very different
 * proposals require agreement on size as well as hash.
 */
export function correlationKey(ctx: CorrelationContext, proposal: unknown): CorrelationKey {
  const scope = `${ctx.investigationId}|${ctx.stage}`
  const body = JSON.stringify(normalize(proposal))
  return `pk_${hash(`${scope}|${body}`)}_${body.length.toString(36)}`
}

/**
 * Key → canonical id, for the life of one run.
 *
 * This is what makes retry meaningful against a non-deterministic provider:
 * a proposal that comes back unchanged gets the id it got last time, and one
 * that does not come back leaves the artifacts around it untouched.
 */
export class CorrelationLedger {
  private readonly assigned = new Map<CorrelationKey, string>()

  idFor(key: CorrelationKey): string | undefined {
    return this.assigned.get(key)
  }

  has(key: CorrelationKey): boolean {
    return this.assigned.has(key)
  }

  /** Return the id already bound to this key, or mint and bind a new one. */
  assign(key: CorrelationKey, mint: () => string): string {
    const existing = this.assigned.get(key)
    if (existing !== undefined) return existing
    const minted = mint()
    this.assigned.set(key, minted)
    return minted
  }

  get size(): number {
    return this.assigned.size
  }

  keys(): readonly CorrelationKey[] {
    return [...this.assigned.keys()]
  }

  bindings(): readonly (readonly [CorrelationKey, string])[] {
    return [...this.assigned.entries()]
  }

  static fromBindings(bindings: readonly (readonly [CorrelationKey, string])[]): CorrelationLedger {
    const ledger = new CorrelationLedger()
    for (const [key, id] of bindings) {
      if (ledger.has(key)) throw new Error(`Duplicate correlation binding ${key}`)
      ledger.assign(key, () => id)
    }
    return ledger
  }
}

export interface CorrelatedProposal<P> {
  readonly key: CorrelationKey
  readonly proposal: P
  /** How many arrivals shared this key. More than one means a duplicate. */
  readonly arrivals: number
}

export interface CorrelationOutcome<P> {
  /** Proposals in key order — never arrival order. */
  readonly ordered: readonly CorrelatedProposal<P>[]
  /** How many arrivals were collapsed into an earlier identical proposal. */
  readonly collapsed: number
}

/**
 * Key, deduplicate and order a provider's result.
 *
 * Duplicates within one response are collapsed rather than distinguished: two
 * arrivals that normalize identically are the same proposition said twice, and
 * minting two artifacts for it would inflate corroboration — the precise
 * failure XR-INV-004 exists to prevent.
 */
export function correlate<P>(
  ctx: CorrelationContext,
  proposals: readonly P[],
): CorrelationOutcome<P> {
  const byKey = new Map<CorrelationKey, { proposal: P; arrivals: number }>()

  for (const proposal of proposals) {
    const key = correlationKey(ctx, proposal)
    const seen = byKey.get(key)
    if (seen === undefined) byKey.set(key, { proposal, arrivals: 1 })
    else seen.arrivals += 1
  }

  const ordered = [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, { proposal, arrivals }]) => ({ key, proposal, arrivals }))

  return { ordered, collapsed: proposals.length - ordered.length }
}

/**
 * Correlate, then bind each proposal to a canonical id.
 *
 * `mint` is the 6a allocator for the relevant namespace. It is called in key
 * order and only for keys not already bound, so ids follow content, not the
 * provider's response order or its retry behaviour.
 */
export function correlateAndAssign<P>(
  ctx: CorrelationContext,
  proposals: readonly P[],
  ledger: CorrelationLedger,
  mint: () => string,
): { readonly assignments: readonly { key: CorrelationKey; id: string; proposal: P }[]; readonly collapsed: number } {
  const { ordered, collapsed } = correlate(ctx, proposals)
  return {
    assignments: ordered.map(({ key, proposal }) => ({
      key,
      id: ledger.assign(key, mint),
      proposal,
    })),
    collapsed,
  }
}
