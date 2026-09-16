/**
 * Display labels for canonical enum values.
 *
 * Presentation only. Nothing here changes meaning, and every mapping is
 * total — a new enum member fails the typecheck rather than silently
 * rendering a raw token.
 *
 * `Confidence` is rendered as a band and never as a number. The v0 scaffold
 * displayed `0.86` as "86% confidence", implying a calibration the pipeline
 * cannot produce; that was a scaffold defect and it is not reachable from
 * here.
 */

import type {
  Confidence,
  CustodyBasis,
  EvidenceClass,
  EvidenceRelationship,
  EvidenceStrength,
  FindingStatus,
  DiscrepancyClassification,
  DisconfirmationResult,
  GapStatus,
  OriginStatus,
  ResolutionPath,
  SourceAccessibility,
} from '@/lib/xray/domain'

export const findingStatusLabel: Record<FindingStatus, string> = {
  ESTABLISHED: 'Established',
  SUPPORTED: 'Supported',
  PARTIALLY_SUPPORTED: 'Partially supported',
  CONTESTED: 'Contested',
  CONTRADICTED: 'Contradicted',
  UNRESOLVED: 'Unresolved',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
}

/** Ordinal band. Never a percentage. */
export const confidenceLabel: Record<Confidence, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
}

export const relationshipLabel: Record<EvidenceRelationship, string> = {
  SUPPORTS: 'Supports',
  CHALLENGES: 'Challenges',
  CONTRADICTS: 'Contradicts',
  CONTEXTUALIZES: 'Provides context',
}

export const strengthLabel: Record<EvidenceStrength, string> = {
  DIRECT: 'Direct',
  STRONG_INDIRECT: 'Strong indirect',
  CONTEXTUAL: 'Contextual',
  WEAK: 'Weak',
}

export const evidenceClassLabel: Record<EvidenceClass, string> = {
  PRIMARY: 'Primary',
  PRIMARY_ADJACENT: 'Primary-adjacent',
  ATTRIBUTED_ORIGIN_NOT_RETRIEVED: 'Attributed origin, not retrieved',
  SECONDARY: 'Secondary',
  TERTIARY: 'Tertiary',
}

export const originStatusLabel: Record<OriginStatus, string> = {
  ORIGINATING: 'Originating',
  REPEATING: 'Repeating',
  UNKNOWN: 'Origin unknown',
}

/**
 * Accessibility labels.
 *
 * `NOT_LOCATED` and `NOT_RETRIEVED` stay distinct in the copy, and neither
 * reads as non-existence — XR-INV-006 and CAL-004.
 */
export const accessibilityLabel: Record<SourceAccessibility, string> = {
  RETRIEVED: 'Retrieved',
  PARTIAL: 'Partially retrieved',
  NOT_LOCATED: 'Searched for, not located',
  NOT_RETRIEVED: 'Identified, contents not obtained',
  DEAD_LINK: 'Link no longer resolves',
}

export const discrepancyClassificationLabel: Record<DiscrepancyClassification, string> = {
  DIFFERENT_DATE: 'Different date',
  DIFFERENT_SCOPE: 'Different scope',
  DIFFERENT_DEFINITION: 'Different definition',
  DIFFERENT_PHASE: 'Different phase',
  DIFFERENT_UNIT: 'Different unit',
  REVISED_VALUE: 'Revised value',
  GENUINE_CONTRADICTION: 'Genuine contradiction',
  PROBABLE_SOURCE_ERROR: 'Probable source error',
  UNRESOLVED: 'Unresolved',
}

export const disconfirmationResultLabel: Record<DisconfirmationResult, string> = {
  SURVIVED: 'Survived',
  SURVIVED_WEAKENED: 'Survived, weakened',
  CHANGED: 'Changed the finding',
  FAILED: 'Did not survive',
  UNRESOLVED: 'Unresolved',
}

export const resolutionPathLabel: Record<ResolutionPath, string> = {
  PUBLIC_RECORD_REQUEST: 'Public record request',
  WAIT_FOR_RECORD: 'Wait for record',
  FIELD_VERIFICATION: 'Field verification',
  SOURCE_CLARIFICATION: 'Source clarification',
  DATASET_QUERY: 'Dataset query',
  EXPERT_INTERPRETATION: 'Expert interpretation',
  OTHER: 'Other',
}

export const gapStatusLabel: Record<GapStatus, string> = {
  OPEN: 'Open',
  REQUESTED: 'Requested',
  RECEIVED: 'Received',
  RESOLVED: 'Resolved',
  UNRESOLVABLE: 'Unresolvable',
}

/** Custody basis. An inferred holder must never read as a confirmed one. */
export const custodyBasisLabel: Record<CustodyBasis, string> = {
  CONFIRMED: 'Confirmed custodian',
  INFERRED: 'Likely custodian (inferred, not confirmed)',
}
