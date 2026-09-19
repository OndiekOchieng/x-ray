/**
 * Proposal types — what a provider may return.
 *
 * WHAT A PROPOSAL IS
 * ==================
 * A provider's suggestion about canonical state, before any of it is
 * canonical. Per ADR-0004 as amended and #6 D16, a proposal MAY carry
 * epistemic judgment that cannot be derived deterministically — a proposed
 * grade, a proposed claim layer, a proposed discrepancy classification. Two
 * benchmark runs of XRAY-KE-001 produced materially different grades for the
 * same claim; that is judgment, and no stage can compute it.
 *
 * The boundary is not "providers may not suggest judgment". It is:
 *
 *   1. no canonical ids;
 *   2. not canonical domain objects;
 *   3. cannot mutate graph state;
 *   4. the stage validates shape, applies invariants, assigns identity, and
 *      decides accept / reject / route for revision;
 *   5. facts ADR-0010 assigns to a stage stay stage-owned.
 *
 * HOW A PROPOSAL REFERS TO ANYTHING
 * =================================
 * By `ProposalRef` — an opaque handle the **stage** issues and hands to the
 * provider in the query. The provider echoes it back. It is not a canonical
 * id, cannot become one, and cannot name an artifact the stage did not offer.
 *
 * That is what lets `CLASSIFY` ask about a claim that already exists without
 * letting a provider address canonical state by name. Positional correlation
 * was the alternative and is forbidden: provider ordering must not determine
 * canonical identity (D20).
 *
 * WHAT IS DELIBERATELY ABSENT
 * ===========================
 * No `id`, anywhere. No `investigationId`. No `gradedAt`, `retrievedAt` or
 * other record-of-execution field — those are facts about what X-Ray did, not
 * suggestions. No `Gap.atiEligible`: XR-INV-009 binds it to `resolutionPath`,
 * so the stage derives it and a provider cannot assert ATI eligibility.
 * No `Finding.gapIds`: `GAPS` owns that back-reference (6a). No
 * `Source.accessibility`, `evidenceClass` or `originStatus`, and no
 * `EvidenceProvenance` of any shape — ADR-0010 assigns all of those to the
 * stage, because a provider must not be able to declare two publications
 * independent.
 *
 * PURITY: types only. No provider SDK, no prompt, no transport.
 */

import type {
  ClaimLayer,
  ClaimType,
  Confidence,
  DisconfirmationResult,
  DiscrepancyClassification,
  EvidenceRelationship,
  EvidenceStrength,
  FindingStatus,
  GapStatus,
  LikelyHolder,
  Measurement,
  Priority,
  ResolutionPath,
  KnowledgeBasis,
  SourcePositionBasis,
  SourcePositionRelationship,
  TimeScope,
} from '@/lib/xray/domain'

/**
 * A stage-issued handle for something a provider may refer to.
 *
 * Prefixed so it cannot be mistaken for a canonical id: `C001` and `SRC-001`
 * do not satisfy `ref:${string}`.
 */
export type ProposalRef = `ref:${string}`

export const isProposalRef = (value: string): value is ProposalRef => value.startsWith('ref:')

// ---------------------------------------------------------------------------
// DECOMPOSE / CLASSIFY
// ---------------------------------------------------------------------------

/** A claim a provider read out of source text. */
export interface ClaimProposal {
  text: string
  /** The passage the claim was read from, for the stage to verify against. */
  sourcePassage?: string
  /** Judgment candidates. The stage validates them; XR-INV-002 is its rule. */
  layer?: ClaimLayer
  type?: ClaimType
  priority?: Priority
  entities?: readonly string[]
  ambiguities?: readonly string[]
  measurement?: Measurement
  timeScope?: TimeScope
}

/** A classification of a claim the stage already holds. */
export interface ClaimClassificationProposal {
  /** The claim being classified, by the handle the stage issued. */
  claimRef: ProposalRef
  layer: ClaimLayer
  type: ClaimType
  priority: Priority
  entities?: readonly string[]
  ambiguities?: readonly string[]
  measurement?: Measurement
  timeScope?: TimeScope
}

// ---------------------------------------------------------------------------
// TRACE
// ---------------------------------------------------------------------------

/**
 * A proposition a provider drew from inspected material.
 *
 * `sourceRef` names the retrieved document it came from — the record
 * *inspected*. The originating record it may derive from is
 * `EvidenceProvenance`, which `PROVENANCE` decides and no provider proposes
 * (ADR-0010).
 */
export interface EvidenceProposal {
  sourceRef: ProposalRef
  proposition: string
  relationship: EvidenceRelationship
  strength: EvidenceStrength
  knowledgeBasis?: KnowledgeBasis
  /** Claims this bears on, by stage-issued handle. */
  claimRefs: readonly ProposalRef[]
  measurement?: Measurement
  timeScope?: TimeScope
  /**
   * A passage the provider believes quotable.
   *
   * The stage decides whether it may actually be quoted: quoting from an
   * unobtained source is a validator ERROR under XR-INV-006, and whether the
   * source was obtained is retrieval metadata the stage checks.
   */
  quotedPassage?: string
  locationInSource?: string
}

/** Context proposed by a model; the stage resolves handles and owns identity. */
export interface SourcePositionProposal {
  /** Present when PROVENANCE revises a position offered by TRACE. */
  positionRef?: ProposalRef
  sourceRef: ProposalRef
  claimRefs: readonly ProposalRef[]
  relationship: SourcePositionRelationship
  relationshipDescription?: string
  powerOrDependency: readonly string[]
  productionPurpose?: string
  timeScope?: TimeScope
  basis: SourcePositionBasis
  confidence: Confidence
  supportingEvidenceRefs: readonly ProposalRef[]
  basisDescription?: string
}

/** A claim discovered while tracing, rather than read off the surface source. */
export interface DiscoveredClaimProposal extends ClaimProposal {
  /** The retrieved document it surfaced from. */
  sourceRef: ProposalRef
}

// ---------------------------------------------------------------------------
// DISCONFIRM / RECONCILE / GRADE / GAPS
// ---------------------------------------------------------------------------

export interface DisconfirmationProposal {
  claimRef: ProposalRef
  preliminaryHypothesis: string
  counterHypothesis: string
  searchStrategy: readonly string[]
  strongestSupportingEvidenceRefs: readonly ProposalRef[]
  strongestOpposingEvidenceRefs: readonly ProposalRef[]
  result: DisconfirmationResult
  effectOnFinding: string
}

export interface DiscrepancyProposal {
  claimRefs: readonly ProposalRef[]
  evidenceRefs: readonly ProposalRef[]
  description: string
  classification: DiscrepancyClassification
  reconciliation?: string
  /**
   * Whether the provider considers the discrepancy reconciled.
   *
   * Named `…Candidate` because the validator constrains it: XR-INV-005 rejects
   * a contradiction drawn over measurement-incompatible evidence, and the
   * stage checks that before accepting.
   */
  resolvedCandidate: boolean
}

export interface FindingProposal {
  claimRef: ProposalRef
  /** Proposed grade. The stage validates it; ADR-0005 is why. */
  status: FindingStatus
  confidence: Confidence
  rationale: string
  supportingEvidenceRefs: readonly ProposalRef[]
  challengingEvidenceRefs: readonly ProposalRef[]
  contextualEvidenceRefs: readonly ProposalRef[]
  discrepancyRefs: readonly ProposalRef[]
  /** XR-INV-007 requires this to be non-empty; the validator checks it. */
  wouldChangeFinding: readonly string[]
}

export interface GapProposal {
  claimRefs: readonly ProposalRef[]
  missingEvidence: string
  whyItMatters: string
  resolvingEvidence: readonly string[]
  likelyHolder?: LikelyHolder
  searchAlreadyAttempted: readonly string[]
  status: GapStatus
  effectOnFinding: string
  /**
   * Proposed route to resolution.
   *
   * `atiEligible` is absent on purpose: XR-INV-009 binds it to this field, so
   * the stage derives it. A provider cannot assert that a gap is answerable by
   * an access-to-information request.
   */
  resolutionPath: ResolutionPath
  identifiers?: readonly string[]
}

/** Every proposal shape, for generic correlation and shape checking. */
export type Proposal =
  | ClaimProposal
  | ClaimClassificationProposal
  | DiscoveredClaimProposal
  | EvidenceProposal
  | SourcePositionProposal
  | DisconfirmationProposal
  | DiscrepancyProposal
  | FindingProposal
  | GapProposal
