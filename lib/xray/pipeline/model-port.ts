/**
 * The research model boundary (ADR-0004 as amended, #6 D16, D17).
 *
 * WHY NOT ONE METHOD PER STAGE
 * ============================
 * ADR-0004 originally sketched one method per pipeline stage. D17 supersedes
 * that: methods exist only where model judgment is genuinely required, not by
 * ceremony. Three stages are absent as a result, each for its own reason:
 *
 *   INGEST      obtains a record. That is retrieval, not judgment.
 *   PLAN        owns no canonical collection and there is no `ResearchPlan`
 *               domain type to return. Inventing one to fill a method slot is
 *               exactly what D13 forbids. Query formulation is carried on
 *               `TraceInput` instead.
 *   PROVENANCE  decides lineage — which record originated an assertion, and
 *               whether two publications are independent. ADR-0010 assigns
 *               that to the stage precisely so a provider cannot assert it.
 *               The adapter supplies the attribution a document prints; the
 *               stage decides what it means.
 *
 * WHAT A METHOD RETURNS
 * =====================
 * `CapabilityResult<Proposal[]>`. Two layers of honesty in one type: the
 * provider may say it cannot do this (capability, not failure — D19), and
 * what it returns when it can is a proposal, never a canonical artifact.
 *
 * Proposals may carry judgment — a proposed grade, a proposed layer (D16).
 * They carry no canonical id, no canonical cross-reference, and no field
 * ADR-0010 assigns to a stage. The stage validates, assigns identity, and
 * decides accept / reject / route for revision.
 *
 * PURITY: types only. No SDK, no `fetch`, no prompt string.
 */

import type { Claim, Evidence, Finding, Gap, IsoDate, Source } from '@/lib/xray/domain'
import type { CapabilityResult } from '@/lib/xray/capability'
import type {
  ClaimClassificationProposal,
  ClaimProposal,
  DisconfirmationProposal,
  DiscoveredClaimProposal,
  DiscrepancyProposal,
  EvidenceProposal,
  FindingProposal,
  GapProposal,
  ProposalRef,
  SourcePositionProposal,
} from './proposals'
import type { RetrievalQuery, RetrievedDocument } from './retrieval-port'

/**
 * A canonical artifact offered to the provider, behind a stage-issued handle.
 *
 * The provider sees the artifact's content and answers about `ref`. It never
 * learns a canonical id it could later assert, which is what keeps XR-INV-012's
 * reserved namespaces inside the trust boundary.
 */
export interface Offered<T> {
  ref: ProposalRef
  value: T
}

/** Shared by every query, so a provider always knows the temporal boundary. */
export interface ModelInputBase {
  /**
   * Evidence after this date is out of scope.
   *
   * On every input because post-cutoff material is the failure mode FM-005 is
   * written about — "expected to inspect" becoming "inspected" — and a
   * provider that never sees the cutoff cannot respect it.
   */
  researchCutoffAt?: IsoDate
}

export interface DecomposeInput extends ModelInputBase {
  /** The surface record under investigation. */
  surfaceSource: Offered<Source>
  /** Inspected content of that record. */
  document: RetrievedDocument
}

export interface ClassifyInput extends ModelInputBase {
  claims: readonly Offered<Claim>[]
}

export interface TraceInput extends ModelInputBase {
  /** The claim being traced. */
  claim: Offered<Claim>
  /** Material the retrieval adapter reached for this claim. */
  documents: readonly RetrievedDocument[]
  /**
   * Queries already run, so the provider can propose what to try next.
   *
   * This is where `PLAN`'s work lives. It is run state, not a canonical
   * artifact, so it needs no domain type and gets no stage method (D17).
   */
  queriesAttempted?: readonly RetrievalQuery[]
}

export interface TraceProposals {
  evidence: readonly EvidenceProposal[]
  sourcePositions?: readonly SourcePositionProposal[]
  /** Claims surfaced by the material that were not on the surface record. */
  discoveredClaims: readonly DiscoveredClaimProposal[]
  /** Further retrieval worth attempting. Advisory; the stage decides. */
  suggestedQueries?: readonly RetrievalQuery[]
}

export interface DisconfirmInput extends ModelInputBase {
  claim: Offered<Claim>
  evidence: readonly Offered<Evidence>[]
}

export interface ReconcileInput extends ModelInputBase {
  claims: readonly Offered<Claim>[]
  evidence: readonly Offered<Evidence>[]
}

export interface GradeInput extends ModelInputBase {
  claim: Offered<Claim>
  evidence: readonly Offered<Evidence>[]
  /** Discrepancies bearing on the claim, so a grade can account for them. */
  discrepancyRefs: readonly ProposalRef[]
}

export interface IdentifyGapsInput extends ModelInputBase {
  claims: readonly Offered<Claim>[]
  findings: readonly Offered<Finding>[]
  /** Gaps already recorded, so the provider does not re-propose them. */
  existingGaps: readonly Offered<Gap>[]
}

export type ResearchModelOperation =
  | 'decompose'
  | 'classify'
  | 'trace'
  | 'disconfirm'
  | 'reconcile'
  | 'grade'
  | 'identifyGaps'

/** Every operation, for capability reporting and exhaustiveness checks. */
export const RESEARCH_MODEL_OPERATIONS = [
  'decompose',
  'classify',
  'trace',
  'disconfirm',
  'reconcile',
  'grade',
  'identifyGaps',
] as const satisfies readonly ResearchModelOperation[]

type UncoveredOperation = Exclude<
  ResearchModelOperation,
  (typeof RESEARCH_MODEL_OPERATIONS)[number]
>
const _operationsExhaustive: UncoveredOperation extends never ? true : never = true
void _operationsExhaustive

/**
 * The model port. No implementation ships in 6b.
 *
 * Note what it does NOT expose: no free-form prompt and no raw completion.
 * Every operation is a typed question about named material, so a provider
 * cannot be asked to "research this" in general — which is what keeps the
 * protocol, not an ad-hoc instruction, as the definition of the method.
 */
export interface ResearchModel {
  readonly name: string
  /**
   * Operations this model claims to support.
   *
   * Advisory. A caller must still handle `UNAVAILABLE` at runtime: capability
   * depends on quota, content type and execution context, not only on what the
   * adapter was built to do.
   */
  readonly capabilities?: readonly ResearchModelOperation[]

  decompose(input: DecomposeInput): Promise<CapabilityResult<readonly ClaimProposal[]>>
  classify(
    input: ClassifyInput,
  ): Promise<CapabilityResult<readonly ClaimClassificationProposal[]>>
  trace(input: TraceInput): Promise<CapabilityResult<TraceProposals>>
  disconfirm(
    input: DisconfirmInput,
  ): Promise<CapabilityResult<readonly DisconfirmationProposal[]>>
  reconcile(input: ReconcileInput): Promise<CapabilityResult<readonly DiscrepancyProposal[]>>
  grade(input: GradeInput): Promise<CapabilityResult<readonly FindingProposal[]>>
  identifyGaps(input: IdentifyGapsInput): Promise<CapabilityResult<readonly GapProposal[]>>
}

/** What resolves an absent research model, for capability reporting. */
export const RESEARCH_MODEL_RESOLVED_BY =
  'Configure a research model adapter for this run (ADR-0004).'

/** What resolves an absent retrieval adapter. */
export const RESEARCH_ADAPTER_RESOLVED_BY =
  'Configure a research/retrieval adapter for this run (ADR-0010).'

/** Whether a model declares an operation. Absent declaration means unknown. */
export function declares(model: ResearchModel, operation: ResearchModelOperation): boolean {
  return model.capabilities === undefined || model.capabilities.includes(operation)
}
