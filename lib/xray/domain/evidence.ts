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

import type { Confidence, ClaimId, EvidenceId, SourceId } from './primitives'
import type { Measurement, TimeScope } from './claim'

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

  /**
   * The period the observation or measurement is scoped to.
   *
   * NOT the source's publication time. A record published in November 2025 may
   * report completion as at 30 June 2025; a 2022 article may state contract
   * sums fixed at award in 2021. `Source.publishedAt` answers "when was this
   * published"; `timeScope` answers "when is this true of".
   *
   * Temporal scope MUST NOT be encoded inside `Measurement.definition`, which
   * is reserved for measurement-definition semantics — what the metric means,
   * not when it was taken.
   */
  timeScope?: TimeScope

  /** The source's own words, preserved verbatim. */
  quotedPassage?: string

  /** Where in the source the passage sits (page, section, table, timestamp). */
  locationInSource?: string
}

// ---------------------------------------------------------------------------
// Evidence-level provenance
// ---------------------------------------------------------------------------

/**
 * How one proposition relates to the record it came from.
 *
 * A narrower vocabulary than `SourceDependencyRelationship`. Document-level
 * relations such as `SAME_EVENT` and `PROBABLE_COMMON_ORIGIN` describe two
 * publications standing in some relation to each other; they say nothing about
 * where a *particular proposition* came from, so they are not offered here.
 */
export type EvidenceProvenanceRelationship =
  | 'REPRODUCES'
  | 'QUOTES'
  | 'ATTRIBUTES_TO'
  | 'DERIVED_FROM'

/**
 * Where a proposition originated.
 *
 * `UNIDENTIFIED` is not a failure state. It records that the evidence is
 * derivative and that the originating record was never identified — which is
 * materially different from the proposition being an independent observation.
 * Treating an unidentified origin as independent is the overcount this whole
 * entity exists to prevent.
 */
export type EvidenceOrigin =
  | { kind: 'SOURCE'; sourceId: SourceId }
  | { kind: 'UNIDENTIFIED'; description: string }

/**
 * The origin of one Evidence proposition.
 *
 * WHY THIS EXISTS SEPARATELY FROM `SourceDependency`
 * ==================================================
 * `SourceDependency` is document lineage: this publication reproduces that
 * ministry release. It is correct and it stays canonical.
 *
 * But a single publication routinely carries propositions from several
 * origins. In XRAY-KE-001, one People Daily article reports September progress
 * percentages that come from a ministry status release AND lot contract values
 * that come from a 2021 procurement notice. At document level the article
 * depends on both. At proposition level each figure has exactly one origin.
 *
 * Resolving claim-level independence from document lineage therefore attributes
 * every origin of a source to every claim that source touches. For a claim
 * resting only on the progress figures, the procurement notice is counted as a
 * second independent observation that never bore on it — inflating apparent
 * corroboration, which is the direction of error XR-INV-004 exists to prevent.
 *
 * So: **claim-level independence is evaluated at the evidence-proposition
 * level.** Document lineage remains the right answer for document-level
 * questions, including the publication clusters shown to readers.
 *
 * Absence of a record here does not mean independence. An Evidence record with
 * no provenance is independent only if its own source is `ORIGINATING`;
 * otherwise its independence is unresolved, and unresolved is not counted.
 */
export interface EvidenceProvenance {
  id: string

  /** The proposition whose origin this describes. */
  evidenceId: EvidenceId

  origin: EvidenceOrigin

  relationship: EvidenceProvenanceRelationship

  /** Confidence in the provenance claim itself, not in the evidence. */
  confidence: Confidence
}
