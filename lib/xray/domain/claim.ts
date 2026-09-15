/**
 * Claim domain.
 *
 * Source: X-Ray System Architecture v0.1 §6 (Claim), §7 (Measurement)
 * — docs/architecture/domain-model.md#claim, #measurement.
 *
 * PURITY: types only. No React, no DOM, no fixtures, no copy, no I/O.
 */

import type {
  ClaimId,
  DiscoveredClaimId,
  InvestigationId,
  IsoDate,
  Priority,
  SurfaceClaimId,
} from './primitives'

/**
 * Where a claim came from.
 *
 * XR-INV-012 — benchmark/core claims and claims discovered during tracing
 * occupy different namespaces. See `ClaimIdentity`.
 */
export type ClaimOrigin = 'SURFACE' | 'DISCOVERED'

/**
 * The epistemic layer a claim operates at.
 *
 * XR-INV-003 — evidence appropriate to one layer MUST NOT silently establish
 * another. Carrying the layer on the claim is what makes that checkable.
 */
export type ClaimLayer = 'OBSERVATION' | 'INTERPRETATION' | 'MEANING'

/** Subject-matter classification of a claim. */
export type ClaimType =
  | 'QUANTITATIVE'
  | 'FINANCIAL'
  | 'GEOGRAPHIC'
  | 'DELIVERY'
  | 'TIMELINE'
  | 'ATTRIBUTION'
  | 'LEGAL'
  | 'OTHER'

/**
 * A quantity as actually measured: what was counted, against what, over what
 * scope, under what definition.
 *
 * Measurement compatibility is a first-class system concept (§7) and is the
 * mechanism behind XR-INV-005. Two true statements about the same project can
 * measure entirely different quantities:
 *
 *   A: metric `physical_project_completion`, 28 percent of `contractual_work`
 *   B: metric `surfaced_length`, percent of `mainline_length`
 *
 * These are not automatically compatible. Deciding whether they are is the
 * validator's job, not this type's — but the validator can only decide it if
 * the structure is present.
 *
 * Every field is optional because real evidence is frequently partial. A
 * measurement that cannot be expressed structurally MUST NOT be smuggled in as
 * display prose.
 */
export interface Measurement {
  /** What is being measured, e.g. `"surfaced_length"`. */
  metric?: string

  /** The measured magnitude. Numeric here is a measurement, not a confidence. */
  value?: number

  /** Unit of `value`, e.g. `"percent"`, `"km"`, `"KES_BILLION"`. */
  unit?: string

  /** What the value is a proportion of, e.g. `"mainline_length"`. */
  denominator?: string

  /** The extent the measurement covers, e.g. `"three-lot project"`. */
  scope?: string

  /** How the metric is defined, where the definition is itself contested. */
  definition?: string
}

/**
 * The period a claim's assertion is scoped to.
 *
 * NOTE: `TimeScope` is referenced by `Claim.timeScope` in System Architecture
 * v0.1 §6 but is never defined there. This is the minimal shape consistent
 * with how the benchmark runs recorded time scope ("as at 13 Sep 2026",
 * "undated", "2021 → 2028"). It is deliberately lean and should be settled
 * when the decomposition stage is specified.
 */
export interface TimeScope {
  /** Start of the period the claim covers. */
  from?: IsoDate

  /** End of the period the claim covers. */
  to?: IsoDate

  /** The instant the claim is asserted as true "as at". */
  asOf?: IsoDate

  /** Verbatim time-scope wording where it cannot be reduced to dates. */
  description?: string
}

/**
 * Binds a claim's identifier namespace to its origin.
 *
 * XR-INV-012 — a discovered claim MUST NOT overwrite or occupy a reserved
 * benchmark claim identifier. Expressed as a discriminated union, a
 * `DISCOVERED` claim cannot be given a `C…` identifier, and a `SURFACE` claim
 * cannot be given a `DC…` identifier, without a type error.
 */
export type ClaimIdentity =
  | { origin: 'SURFACE'; id: SurfaceClaimId }
  | { origin: 'DISCOVERED'; id: DiscoveredClaimId }

/** Fields common to every claim, independent of origin. */
export interface ClaimBase {
  investigationId: InvestigationId

  /** The independently testable proposition, decomposed (XR-INV-002). */
  text: string

  /**
   * The passage of the surface source this claim was decomposed from.
   *
   * Absent on discovered claims, which by definition did not come from the
   * surface source.
   */
  sourcePassage?: string

  layer: ClaimLayer

  type: ClaimType

  priority: Priority

  /** People, institutions and places the claim concerns. */
  entities: string[]

  /** Known ambiguities in the claim as stated, recorded rather than resolved. */
  ambiguities: string[]

  /** Present when the claim asserts a measured quantity. */
  measurement?: Measurement

  timeScope?: TimeScope
}

/**
 * A single independently testable proposition.
 *
 * `Claim = ClaimBase & ClaimIdentity`, so `origin` and `id` are checked
 * together.
 */
export type Claim = ClaimBase & ClaimIdentity

/** A claim decomposed from the surface source. */
export type SurfaceClaim = ClaimBase & { origin: 'SURFACE'; id: SurfaceClaimId }

/** A claim discovered while tracing evidence for other claims. */
export type DiscoveredClaim = ClaimBase & {
  origin: 'DISCOVERED'
  id: DiscoveredClaimId
}

export type { ClaimId }
