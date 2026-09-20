/**
 * Canonical X-Ray domain vocabulary.
 *
 * The objects the pipeline writes, the validator checks and the UI projects —
 * never the other way round. Derived from X-Ray System Architecture v0.1;
 * see docs/architecture/domain-model.md.
 *
 * ---------------------------------------------------------------------------
 * PURITY CONTRACT for `lib/xray/domain/**`
 *
 * This directory contains types only. It must never contain:
 *
 *   - React, JSX, hooks, or any component
 *   - DOM or browser API access
 *   - fixture or sample data
 *   - display copy, labels, or formatting
 *   - route helpers or URL construction
 *   - network calls or API clients
 *   - persistence implementation or ORM types
 *   - model-provider or SDK types
 *   - UI-shaped fields such as `leftLabel` / `rightLabel`
 *   - derived counts (`claimsCount`, `receiptsCount`, …) — selectors compute
 *     these from the graph; storing them creates a second source of truth
 *
 * It is the canonical vocabulary, not a view model. Synthesis and projection
 * live outside it, which is what keeps XR-INV-011 structurally true rather
 * than merely intended.
 *
 * Nothing in the application consumes this module yet. It is the target
 * contract that the fixture, selectors, validators, engine and UI adapters
 * migrate toward.
 * ---------------------------------------------------------------------------
 */

// Shared scalars and identifiers
export type {
  ATIRequestId,
  ClaimId,
  Confidence,
  DisconfirmationId,
  DiscrepancyId,
  DiscoveredClaimId,
  EvidenceId,
  FindingId,
  GapId,
  InvestigationId,
  IsoDate,
  IsoDateOrDateTime,
  IsoDateTime,
  Priority,
  SourceDependencyId,
  SourceId,
  SourcePositionId,
  StageRunId,
  SurfaceClaimId,
} from './primitives'

// Claim
export type {
  Claim,
  ClaimBase,
  ClaimIdentity,
  ClaimLayer,
  ClaimOrigin,
  ClaimType,
  DiscoveredClaim,
  Measurement,
  SurfaceClaim,
  TimeScope,
} from './claim'

// Source
export type {
  EvidenceClass,
  OriginStatus,
  Source,
  SourceAccessibility,
  SourceDependency,
  SourceDependencyRelationship,
  SourceType,
} from './source'

// Evidence
export type {
  Evidence,
  EvidenceOrigin,
  EvidenceProvenance,
  EvidenceProvenanceRelationship,
  EvidenceRelationship,
  EvidenceStrength,
  KnowledgeBasis,
} from './evidence'

// Contextual source position (ADR-0012)
export type { SourcePosition, SourcePositionBasis, SourcePositionRelationship } from './source-position'

// Analysis
export type {
  Disconfirmation,
  DisconfirmationResult,
  Discrepancy,
  DiscrepancyClassification,
  Finding,
  FindingStatus,
} from './analysis'

// Gap and action
export type {
  ATIRequest,
  ATIRequestStatus,
  AtiEligibleGap,
  CustodyBasis,
  Gap,
  GapBase,
  GapEligibility,
  GapStatus,
  LikelyHolder,
  ResolutionPath,
} from './gap'

// Investigation
export type {
  Investigation,
  InvestigationStatus,
  InvestigationVersion,
  InvestigationVersionTrigger,
  ControlGate,
  PipelineStage,
  ResearchStage,
  ResearchStop,
  StageRun,
  StageRunStatus,
} from './investigation'
