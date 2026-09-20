/**
 * X-Ray pipeline execution layer.
 *
 * 6a: stage contracts, the in-flight accumulator, deterministic identity, the
 * append-only run journal, sequential execution with retry and resume, and
 * the two control gates.
 *
 * 6b: the two adapter boundaries, the proposal types that cross them,
 * deterministic proposal correlation, and capability-unavailable semantics.
 *
 * NOT HERE, DELIBERATELY:
 *   - any provider implementation, SDK, network call or prompt string
 *   - persistence and durable version history (#7)
 *   - persistence (#7), HTTP (#8), caching (#9), ATI lifecycle (#10)
 *   - stage bodies. 6a defines the contract; nothing implements
 *     `StageDefinition` outside the check harness.
 *
 * VOCABULARY (#6 D15)
 * ===================
 * `ResearchStage` transforms state and owns artifacts. `ControlGate` inspects
 * state and owns nothing. They are disjoint types, recorded by disjoint
 * journal shapes, with disjoint id namespaces. The legacy `PipelineStage`
 * union exists only so XRAY-KE-001's historical records stay readable.
 */

export {
  ARTIFACT_COLLECTIONS,
  isCapabilityOutcome,
  CONTROL_GATES,
  RESEARCH_STAGES,
  STAGE_OUTPUTS,
  isResearchStage,
  researchStageIndex,
} from './stages'
export type {
  ArtifactCollection,
  StageAdapters,
  StageContext,
  StageContribution,
  StageDefinition,
  StageOutcome,
} from './stages'

export { GraphAccumulator, PipelineContractError } from './accumulator'
export type { AccumulatorCheckpoint } from './accumulator'

export {
  createIdentityAllocator,
  nextCapabilityRunId,
  nextGateRunId,
  nextStageRunId,
  seedFrom,
} from './identity'
export type { IdentityAllocator, IdentitySeed } from './identity'

export { JournalError, RunJournal } from './journal'
export type {
  CapabilityRun,
  GateOutcome,
  GateResultRef,
  GateRun,
  JournalEntry,
  ResearchStageRun,
} from './journal'

// --- 6b: adapter boundaries ------------------------------------------------

export { isProposalRef } from './proposals'
export { canonicalizeSourcePositions } from './source-position'
export type { SourcePositionHandles } from './source-position'
export type {
  ClaimClassificationProposal,
  ClaimProposal,
  DisconfirmationProposal,
  DiscoveredClaimProposal,
  DiscrepancyProposal,
  EvidenceProposal,
  FindingProposal,
  GapProposal,
  Proposal,
  ProposalRef,
  SourcePositionProposal,
} from './proposals'

export {
  CorrelationLedger,
  correlate,
  correlateAndAssign,
  correlationKey,
} from './correlation'
export type {
  CorrelatedProposal,
  CorrelationContext,
  CorrelationKey,
  CorrelationOutcome,
} from './correlation'

export {
  RESEARCH_ADAPTER_RESOLVED_BY,
  RESEARCH_MODEL_OPERATIONS,
  RESEARCH_MODEL_RESOLVED_BY,
  declares,
} from './model-port'
export type {
  ClassifyInput,
  DecomposeInput,
  DisconfirmInput,
  GradeInput,
  IdentifyGapsInput,
  ModelInputBase,
  Offered,
  ReconcileInput,
  ResearchModel,
  ResearchModelOperation,
  TraceInput,
  TraceProposals,
} from './model-port'

export { MAX_EXTRACT_LENGTH, bound, hashExtract, isInspectable, isQuotable } from './retrieval-port'
export type {
  BoundedExtract,
  ObservedDocumentMetadata,
  ProviderDiagnostics,
  ResearchAdapter,
  ResearchAdapterOperation,
  RetrievalOutcome,
  RetrievalQuery,
  RetrievalResult,
  RetrievedDocument,
} from './retrieval-port'

export { runPipeline } from './run'
export type { PipelineRunResult, RunOptions, RunStatus } from './run'
export { assessResearchStop } from './stop'
export type { StopAssessment, StopEvidence } from './stop'
