/**
 * Shared scalar vocabulary for the canonical X-Ray domain.
 *
 * Source: X-Ray System Architecture v0.1 (docs/architecture/domain-model.md).
 *
 * This module exists so the six concern modules can share timestamps and
 * identifier types without importing one another for scalars. It is an
 * addition to the module list specified for this slice; see the slice report.
 *
 * PURITY: types only. No React, no DOM, no fixtures, no copy, no I/O.
 */

/**
 * An ISO 8601 date-time string, e.g. `"2026-09-13T11:24:56Z"`.
 *
 * Canonical domain types carry timestamps as strings, never as `Date`.
 * `Date` is a runtime object that does not survive a JSON boundary; the
 * architecture specifies string timestamps throughout (§5.1, §8, §13, §15, §17).
 */
export type IsoDateTime = string

/** An ISO 8601 calendar date string, e.g. `"2026-09-13"`. */
export type IsoDate = string

/**
 * An ISO 8601 date or date-time. Used where the architecture does not fix the
 * precision — a source may be published on a date or at an instant.
 */
export type IsoDateOrDateTime = IsoDate | IsoDateTime

/** Ordinal confidence. The domain has no numeric confidence anywhere. */
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

/** Ordinal priority. */
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW'

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type InvestigationId = string
export type SourceId = string
export type SourceDependencyId = string
export type EvidenceId = string
export type DiscrepancyId = string
export type DisconfirmationId = string
export type FindingId = string
export type GapId = string
export type ATIRequestId = string
export type StageRunId = string

/**
 * Identifier of a controlled / core (surface) claim: `C001`, `C002`, …
 *
 * XR-INV-012 reserves this namespace. Research discovery MUST NOT occupy it.
 */
export type SurfaceClaimId = `C${string}`

/**
 * Identifier of a claim discovered during tracing: `DC001`, `DC002`, …
 *
 * XR-INV-012 requires discovered claims to occupy a namespace distinct from
 * the controlled claims. `DC…` and `C…` are disjoint: a `DC` identifier does
 * not satisfy `C${string}` because it does not begin with `C`.
 */
export type DiscoveredClaimId = `DC${string}`

/**
 * Any claim identifier.
 *
 * The union is intentionally narrower than `string` so that the namespace
 * separation required by XR-INV-012 is visible in the type system rather than
 * left to convention. Claim identity is bound to `origin` by the discriminated
 * union in `claim.ts`.
 */
export type ClaimId = SurfaceClaimId | DiscoveredClaimId
