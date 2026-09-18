/**
 * Deterministic canonical identity allocation.
 *
 * WHY THE STAGE OWNS THIS
 * =======================
 * Identity is assigned by the stage, never by a provider (ADR-0004, amended).
 * A model that minted its own ids could occupy `C…`, the namespace XR-INV-012
 * reserves for controlled claims, and the namespace separation the type
 * system enforces would become a matter of provider good behaviour.
 *
 * WHY IT IS DETERMINISTIC
 * =======================
 * Identity must survive retry (research-pipeline §17). Allocation is a pure
 * function of the artifacts already accumulated: an allocator built twice
 * from the same state produces the same sequence. There is no clock and no
 * randomness anywhere in this module, because an id generated from either
 * would make a retried stage produce artifacts that no longer match the
 * references written against its first attempt.
 *
 * The runner rolls a failed attempt back before retrying, so the retry sees
 * exactly the state the first attempt saw and allocates exactly the same ids.
 *
 * PURITY: no clock, no randomness, no I/O, no fixture ids.
 */

import type {
  ClaimId,
  DiscoveredClaimId,
  DiscrepancyId,
  DisconfirmationId,
  EvidenceId,
  FindingId,
  GapId,
  SourceDependencyId,
  SourceId,
  StageRunId,
  SurfaceClaimId,
} from '@/lib/xray/domain'
import type { XRayGraphInput } from '@/lib/xray/selectors'

/** Width of the zero-padded ordinal, matching the established id shapes. */
const PAD = 3

const ordinal = (n: number): string => String(n).padStart(PAD, '0')

/**
 * Highest ordinal already used in a namespace.
 *
 * Deliberately the maximum, not the count. A collection with a hole in it —
 * `SRC-001`, `SRC-003` — has count 2, and allocating `SRC-003` from that
 * count would collide with an existing artifact.
 */
function highestOrdinal(ids: Iterable<string>, prefix: string): number {
  let max = 0
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue
    const rest = id.slice(prefix.length)
    if (!/^\d+$/.test(rest)) continue
    const n = Number(rest)
    if (n > max) max = n
  }
  return max
}

/** Allocates canonical identifiers. Stage-scoped; rebuilt each attempt. */
export interface IdentityAllocator {
  /** `C001`, `C002`, … — the namespace XR-INV-012 reserves for surface claims. */
  surfaceClaim(): SurfaceClaimId
  /** `DC001`, `DC002`, … — disjoint from `C…` by construction. */
  discoveredClaim(): DiscoveredClaimId
  source(): SourceId
  evidence(): EvidenceId
  sourceDependency(): SourceDependencyId
  evidenceProvenance(): string
  discrepancy(): DiscrepancyId
  disconfirmation(): DisconfirmationId
  /**
   * `FND-C001`. Derived from the claim, not from a counter.
   *
   * A finding is the graded verdict on one claim, so its identity is already
   * determined by the claim it grades. Deriving it means a re-run of `GRADE`
   * reproduces the same finding id without needing to remember a counter.
   */
  finding(claimId: ClaimId): FindingId
  gap(): GapId
}

/** Ids already present, per namespace. */
export interface IdentitySeed {
  claims: readonly string[]
  sources: readonly string[]
  evidence: readonly string[]
  sourceDependencies: readonly string[]
  evidenceProvenance: readonly string[]
  discrepancies: readonly string[]
  disconfirmations: readonly string[]
  gaps: readonly string[]
}

export function seedFrom(input: XRayGraphInput): IdentitySeed {
  return {
    claims: input.claims.map((c) => c.id),
    sources: input.sources.map((s) => s.id),
    evidence: input.evidence.map((e) => e.id),
    sourceDependencies: input.sourceDependencies.map((d) => d.id),
    evidenceProvenance: (input.evidenceProvenance ?? []).map((p) => p.id),
    discrepancies: input.discrepancies.map((d) => d.id),
    disconfirmations: input.disconfirmations.map((d) => d.id),
    gaps: input.gaps.map((g) => g.id),
  }
}

/**
 * Build an allocator over existing state.
 *
 * Pure: same seed in, same sequence out. Call it again with the same seed and
 * you get the same ids, which is exactly what makes retry safe.
 */
export function createIdentityAllocator(seed: IdentitySeed): IdentityAllocator {
  const counters = {
    surfaceClaim: highestOrdinal(seed.claims, 'C'),
    discoveredClaim: highestOrdinal(seed.claims, 'DC'),
    source: highestOrdinal(seed.sources, 'SRC-'),
    evidence: highestOrdinal(seed.evidence, 'EV-'),
    sourceDependency: highestOrdinal(seed.sourceDependencies, 'SD-'),
    evidenceProvenance: highestOrdinal(seed.evidenceProvenance, 'EP-'),
    discrepancy: highestOrdinal(seed.discrepancies, 'DISC-'),
    disconfirmation: highestOrdinal(seed.disconfirmations, 'DCF-'),
    gap: highestOrdinal(seed.gaps, 'GAP-'),
  }

  /**
   * `DC001` starts with `C`? No — `highestOrdinal(ids, 'C')` on `DC001`
   * fails the `startsWith` test, so the two namespaces do not contaminate
   * one another's counters. The check harness proves this rather than
   * trusting the reading.
   */
  return {
    surfaceClaim: () => `C${ordinal(++counters.surfaceClaim)}` as SurfaceClaimId,
    discoveredClaim: () => `DC${ordinal(++counters.discoveredClaim)}` as DiscoveredClaimId,
    source: () => `SRC-${ordinal(++counters.source)}`,
    evidence: () => `EV-${ordinal(++counters.evidence)}`,
    sourceDependency: () => `SD-${ordinal(++counters.sourceDependency)}`,
    evidenceProvenance: () => `EP-${ordinal(++counters.evidenceProvenance)}`,
    discrepancy: () => `DISC-${ordinal(++counters.discrepancy)}`,
    disconfirmation: () => `DCF-${ordinal(++counters.disconfirmation)}`,
    finding: (claimId: ClaimId): FindingId => `FND-${claimId}`,
    gap: () => `GAP-${ordinal(++counters.gap)}`,
  }
}

// ---------------------------------------------------------------------------
// Run record identity
// ---------------------------------------------------------------------------

/**
 * Journal record identity, kept out of `IdentityAllocator` on purpose.
 *
 * A stage allocates artifact identifiers; it does not name its own run
 * record. Separating them means a stage cannot issue an id that collides
 * with a journal entry, and keeps the two prefixes readable as what they are.
 *
 * `SR-…` is a `StageRun`. `GR-…` is a `GateRun`. The prefixes are disjoint so
 * that a record id alone says whether the step could have changed canonical
 * state (#6 D15).
 */
export function nextStageRunId(existing: Iterable<string>): StageRunId {
  return `SR-${ordinal(highestOrdinal(existing, 'SR-') + 1)}`
}

export function nextGateRunId(existing: Iterable<string>): string {
  return `GR-${ordinal(highestOrdinal(existing, 'GR-') + 1)}`
}
