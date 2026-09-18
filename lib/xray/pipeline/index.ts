/**
 * X-Ray pipeline execution layer.
 *
 * 6a: stage contracts, the in-flight accumulator, deterministic identity, the
 * append-only run journal, sequential execution with retry and resume, and
 * the two control gates.
 *
 * NOT HERE, DELIBERATELY:
 *   - model or search adapters, and anything that knows a provider exists (6b)
 *   - research stop assessment and revision routing (6c)
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
  CONTROL_GATES,
  RESEARCH_STAGES,
  STAGE_OUTPUTS,
  isResearchStage,
  researchStageIndex,
} from './stages'
export type {
  ArtifactCollection,
  StageContext,
  StageContribution,
  StageDefinition,
} from './stages'

export { GraphAccumulator, PipelineContractError } from './accumulator'
export type { AccumulatorCheckpoint } from './accumulator'

export { createIdentityAllocator, nextGateRunId, nextStageRunId, seedFrom } from './identity'
export type { IdentityAllocator, IdentitySeed } from './identity'

export { JournalError, RunJournal } from './journal'
export type {
  GateOutcome,
  GateResultRef,
  GateRun,
  JournalEntry,
  ResearchStageRun,
} from './journal'

export { runPipeline } from './run'
export type { PipelineRunResult, RunOptions, RunStatus } from './run'
