/**
 * Evidence domain.
 *
 * Source: X-Ray System Architecture v0.1 §10 — docs/architecture/domain-model.md#evidence
 * and docs/architecture/evidence-graph.md#source-is-not-evidence.
 *
 * A Source is not Evidence. Evidence is the material proposition extracted
 * from a Source and connected to Claims:
 *
 *   Source
 *      ├── Evidence A ──supports────► C001
 *      ├── Evidence B ──challenges──► C002
 *      └── Evidence C ──context─────► C005
 *
 * One source yields many propositions, bearing on different claims in
 * different directions. Fusing the two concepts into a single "receipt" makes
 * that unrepresentable and silently forces one relationship per source.
 *
 * PURITY: types only. No React, no DOM, no fixtures, no copy, no I/O.
 */

import type { ClaimId, EvidenceId, SourceId } from './primitives'
import type { Measurement } from './claim'

/**
 * The direction in which a piece of evidence bears on a claim.
 *
 * `CONTRADICTS` is the constrained member. XR-INV-005 — a finding MUST NOT be
 * graded `CONTRADICTED` solely from evidence measuring a materially different
 * quantity, scope, denominator, definition or time period. Asserting this
 * relationship is permitted by the type system; asserting it *validly* is a
 * validator concern, and requires `measurement` on both sides.
 */
export type EvidenceRelationship =
  | 'SUPPORTS'
  | 'CHALLENGES'
  | 'CONTRADICTS'
  | 'CONTEXTUALIZES'

/**
 * How directly the evidence bears on the claim.
 *
 * Orthogonal to `EvidenceRelationship`: direction and force are separate.
 * Weak supporting evidence and weak contradicting evidence are both possible.
 */
export type EvidenceStrength =
  | 'DIRECT'
  | 'STRONG_INDIRECT'
  | 'CONTEXTUAL'
  | 'WEAK'

/**
 * A material proposition extracted from a Source and connected to Claims.
 *
 * `claimIds` is a list because one proposition can bear on several claims.
 * The relationship and strength belong to the evidence, which is why a source
 * that bears on two claims differently is modelled as two Evidence records
 * rather than one record with an ambiguous relationship.
 */
export interface Evidence {
  id: EvidenceId

  /** The source this proposition was extracted from. */
  sourceId: SourceId

  /** What the source materially asserts, in X-Ray's words. */
  proposition: string

  relationship: EvidenceRelationship

  /** The claims this proposition bears on. */
  claimIds: ClaimId[]

  strength: EvidenceStrength

  /**
   * The quantity this evidence measures, where it measures one.
   *
   * Required in practice before `relationship: 'CONTRADICTS'` can be validated
   * against a measured claim — see XR-INV-005.
   */
  measurement?: Measurement

  /** The source's own words, preserved verbatim. */
  quotedPassage?: string

  /** Where in the source the passage sits (page, section, table, timestamp). */
  locationInSource?: string
}
