/**
 * Source domain.
 *
 * Source: X-Ray System Architecture v0.1 §8 (Source), §9 (SourceDependency)
 * — docs/architecture/domain-model.md#source, #sourcedependency.
 *
 * A Source is a retrieved (or attempted) artifact. It is NOT evidence.
 * The proposition extracted from a source is `Evidence` — see `evidence.ts`.
 *
 * PURITY: types only. No React, no DOM, no fixtures, no copy, no I/O.
 */

import type {
  Confidence,
  IsoDateOrDateTime,
  SourceDependencyId,
  SourceId,
} from './primitives'

/** The kind of record a source is. */
export type SourceType =
  | 'LEGISLATION'
  | 'GAZETTE'
  | 'PROCUREMENT_RECORD'
  | 'CONTRACT'
  | 'BUDGET'
  | 'AUDIT'
  | 'PARLIAMENTARY_RECORD'
  | 'COURT_RECORD'
  | 'OFFICIAL_REPORT'
  | 'OFFICIAL_STATEMENT'
  | 'DATASET'
  | 'NEWS'
  | 'CONTRACTOR_RECORD'
  | 'OTHER'

/**
 * How close the source is to the thing it reports.
 *
 * `ATTRIBUTED_ORIGIN_NOT_RETRIEVED` is the honest middle case: a record is
 * named and attributed by something else, but X-Ray never held it. It is not
 * primary evidence, and its absence is not evidence of anything.
 */
export type EvidenceClass =
  | 'PRIMARY'
  | 'PRIMARY_ADJACENT'
  | 'ATTRIBUTED_ORIGIN_NOT_RETRIEVED'
  | 'SECONDARY'
  | 'TERTIARY'

/**
 * Whether this source originated the assertion or repeated it.
 *
 * XR-INV-004 — repetition is not corroboration. `REPEATING` sources are
 * counted as publications, not as independent observations.
 */
export type OriginStatus = 'ORIGINATING' | 'REPEATING' | 'UNKNOWN'

/**
 * What actually happened when X-Ray tried to obtain this record.
 *
 * XR-INV-006 — failure to obtain a record MUST NOT be converted into evidence
 * that the record or event does not exist. The graph records what was not
 * obtained; it never records non-existence.
 *
 * There is deliberately **no** `DOES_NOT_EXIST` member of this union, and none
 * may be added. A record whose existence is genuinely in question is
 * represented as a `Gap`, not as a negative fact about a source.
 *
 * The four states are distinct and not interchangeable:
 *
 * - `RETRIEVED`     — obtained in full.
 * - `PARTIAL`       — obtained in part (paywall, excerpt, truncated dataset).
 * - `NOT_LOCATED`   — no such record was found. X-Ray does not know whether it
 *                     exists. This is the state XR-INV-006 is written about.
 * - `NOT_RETRIEVED` — the record is identified (cited, attributed, indexed)
 *                     but X-Ray could not obtain its content.
 * - `DEAD_LINK`     — a specific known location no longer resolves.
 *
 * `NOT_LOCATED` is an addition to the four values in §8, required by this
 * slice and by XR-INV-006's own wording. §8 supplies only `NOT_RETRIEVED`,
 * which cannot express "searched for, never found" — a materially different
 * research result. See the slice report.
 */
export type SourceAccessibility =
  | 'RETRIEVED'
  | 'PARTIAL'
  | 'NOT_LOCATED'
  | 'NOT_RETRIEVED'
  | 'DEAD_LINK'

/** A record X-Ray located, or attempted to locate, while tracing a claim. */
export interface Source {
  id: SourceId

  title: string
  publisher?: string
  institution?: string
  author?: string

  url?: string

  /** Recorded precision may be month, date, or date-time (XRAY-KE-001). */
  publishedAt?: string

  /** Retrieval observation at recorded precision: date-only in XRAY-KE-001. */
  retrievedAt: IsoDateOrDateTime

  sourceType: SourceType

  evidenceClass: EvidenceClass

  originStatus: OriginStatus

  accessibility: SourceAccessibility

  /** Content digest, where the artifact was obtained and can be pinned. */
  contentHash?: string
}

/**
 * How one source relates to another.
 *
 * `PROBABLE_COMMON_ORIGIN` records a suspected shared origin where the
 * originating record itself was not retrieved — the common real case when
 * several outlets publish the same figures on the same day.
 */
export type SourceDependencyRelationship =
  | 'REPRODUCES'
  | 'QUOTES'
  | 'ATTRIBUTES_TO'
  | 'DERIVED_FROM'
  | 'SAME_EVENT'
  | 'PROBABLE_COMMON_ORIGIN'
  | 'UNKNOWN'

/**
 * A provenance edge between sources.
 *
 * XR-INV-004 — multiple publications derived from the same originating record
 * MUST NOT be treated as multiple independent confirmations. This edge is what
 * makes "publications = 3, independent observations = 1" computable rather
 * than asserted in prose.
 *
 * `dependsOnSourceId` is optional because the origin is sometimes described
 * but never retrieved; `originDescription` carries it in that case.
 */
export interface SourceDependency {
  id: SourceDependencyId

  /** The dependent (usually repeating) source. */
  sourceId: SourceId

  /** The source depended upon, when it was actually identified as a record. */
  dependsOnSourceId?: SourceId

  /** The origin as described, when it could not be resolved to a Source. */
  originDescription?: string

  relationship: SourceDependencyRelationship

  /** Confidence in the dependency claim itself, not in either source. */
  confidence: Confidence
}
