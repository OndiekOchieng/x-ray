/** Canonical source context approved by ADR-0012. No source trust ranking. */
import type { TimeScope } from './claim'
import type { ClaimId, Confidence, EvidenceId, SourceId, SourcePositionId } from './primitives'

export type SourcePositionBasis = 'DOCUMENTED' | 'INFERRED'

export type SourcePositionRelationship =
  | 'SUBJECT'
  | 'PARTICIPANT'
  | 'WITNESS'
  | 'GOVERNING_AUTHORITY'
  | 'REGULATOR'
  | 'AUDITOR'
  | 'INVESTIGATOR'
  | 'DETENTION_OR_ENFORCEMENT_AUTHORITY'
  | 'EMPLOYER_OR_PRINCIPAL'
  | 'EMPLOYEE_OR_AGENT'
  | 'CONTRACTUAL_COUNTERPARTY'
  | 'BENEFICIARY'
  | 'ADVERSARY'
  | 'INTERMEDIARY'
  | 'OTHER'

/** A producer's relation to particular claims at a particular time, not an intrinsic Source property. */
export interface SourcePosition {
  id: SourcePositionId
  sourceId: SourceId
  claimIds: ClaimId[]
  relationship: SourcePositionRelationship
  relationshipDescription?: string
  powerOrDependency: string[]
  productionPurpose?: string
  timeScope?: TimeScope
  basis: SourcePositionBasis
  confidence: Confidence
  supportingEvidenceIds: EvidenceId[]
  basisDescription?: string
}
