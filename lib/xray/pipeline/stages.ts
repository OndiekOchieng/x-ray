/**
 * Research stage contracts.
 *
 * WHAT A STAGE IS
 * ===============
 * A research stage transforms investigation state and owns canonical
 * artifacts. It is the only kind of step permitted to claim an artifact
 * revision transition. Control gates — `VALIDATE`, `REVIEW` — inspect state
 * and decide whether the run continues; they mint nothing and are not stages
 * (#6 D15). The two vocabularies are disjoint by type, so a gate cannot be
 * scheduled as a stage and a stage cannot be recorded as a gate.
 *
 * WHAT A STAGE IS NOT
 * ===================
 * A stage is not a model call. ADR-0004 (amended) separates them: an adapter
 * returns id-free unvalidated proposals; the stage validates them, assigns
 * canonical identity, merges, records the run and decides retry. 6a defines
 * that stage half. The adapter half is 6b, and nothing here imports a
 * provider or knows one exists.
 *
 * PURITY: no React, no DOM, no network, no fixture ids.
 */

import type { InvestigationId, ResearchStage } from '@/lib/xray/domain'
import type { XRayGraph, XRayGraphInput } from '@/lib/xray/selectors'
import type { IdentityAllocator } from './identity'

/**
 * Execution order. Protocol v0.1 stages 1–9, with the architecture's
 * `PROVENANCE` split out of `TRACE` and `IDENTIFY GAPS` named `GAPS`.
 *
 * Order is a contract, not a convenience: `PROVENANCE` cannot establish
 * proposition origins before `TRACE` has located evidence, and `GRADE` cannot
 * grade what `RECONCILE` has not reconciled.
 */
export const RESEARCH_STAGES = [
  'INGEST',
  'DECOMPOSE',
  'CLASSIFY',
  'PLAN',
  'TRACE',
  'PROVENANCE',
  'DISCONFIRM',
  'RECONCILE',
  'GRADE',
  'GAPS',
] as const satisfies readonly ResearchStage[]

/**
 * Compile-time proof that `RESEARCH_STAGES` covers `ResearchStage` exactly.
 *
 * Adding a member to the type without adding it to the ordering is a type
 * error here rather than a stage the runner silently never executes.
 */
type Uncovered = Exclude<ResearchStage, (typeof RESEARCH_STAGES)[number]>
const _exhaustive: Uncovered extends never ? true : never = true
void _exhaustive

export function researchStageIndex(stage: ResearchStage): number {
  return RESEARCH_STAGES.indexOf(stage)
}

// ---------------------------------------------------------------------------
// Artifact ownership
// ---------------------------------------------------------------------------

/**
 * Canonical collections a stage may write.
 *
 * `atiRequests` is deliberately absent. ATI requests are produced by the
 * resolution adapter (ADR-0008) over an already-graduated graph, not by
 * research. Their lifecycle is #10.
 *
 * `investigation` and `version` are absent for a different reason: the
 * pipeline never writes them. `currentVersion` is published history owned by
 * XR-INV-010, and a run that incremented it would make in-flight retry state
 * look like a published version (research-pipeline §17).
 */
export type ArtifactCollection =
  | 'claims'
  | 'sources'
  | 'sourceDependencies'
  | 'evidence'
  | 'evidenceProvenance'
  | 'discrepancies'
  | 'disconfirmations'
  | 'findings'
  | 'gaps'

export const ARTIFACT_COLLECTIONS = [
  'claims',
  'sources',
  'sourceDependencies',
  'evidence',
  'evidenceProvenance',
  'discrepancies',
  'disconfirmations',
  'findings',
  'gaps',
] as const satisfies readonly ArtifactCollection[]

type UncoveredCollection = Exclude<ArtifactCollection, (typeof ARTIFACT_COLLECTIONS)[number]>
const _collectionsExhaustive: UncoveredCollection extends never ? true : never = true
void _collectionsExhaustive

/**
 * Which collections each stage owns.
 *
 * Enforced at merge time. A stage that writes outside its ownership fails,
 * rather than quietly acquiring a second author for an artifact — the
 * condition that makes "which stage produced this?" unanswerable during
 * revision routing.
 *
 * LIMITATION — `PLAN` owns nothing. Protocol v0.1 stage 4 produces a research
 * plan, but the domain has no canonical `ResearchPlan` artifact and #6 is not
 * the slice that invents one. `PLAN` therefore executes and records a run
 * while contributing no graph artifact. That is recorded as a gap in the
 * domain, not worked around by letting `PLAN` write someone else's
 * collection.
 */
export const STAGE_OUTPUTS: Readonly<Record<ResearchStage, readonly ArtifactCollection[]>> = {
  INGEST: ['sources'],
  DECOMPOSE: ['claims'],
  CLASSIFY: ['claims'],
  PLAN: [],
  TRACE: ['claims', 'sources', 'evidence'],
  PROVENANCE: ['evidenceProvenance', 'sourceDependencies'],
  DISCONFIRM: ['evidence', 'disconfirmations'],
  RECONCILE: ['discrepancies'],
  GRADE: ['findings'],
  /**
   * `GAPS` revises findings as well as producing gaps.
   *
   * `Finding.gapIds` is a back-reference: the link exists once the gap is
   * identified, which is stage 9, not when the grade was assigned at stage 8.
   * A finding cannot carry it earlier without referencing an artifact that
   * does not exist, and staged validation rejects exactly that.
   *
   * The alternative was reordering `GAPS` before `GRADE`. That was rejected:
   * Protocol v0.1 grades at stage 8 and identifies gaps at stage 9, and
   * reordering the frozen method to suit the type model is not a change #6
   * is authorised to make (D12).
   */
  GAPS: ['gaps', 'findings'],
}

// ---------------------------------------------------------------------------
// The stage contract
// ---------------------------------------------------------------------------

/** What a stage contributes. Elements with a known id replace; others append. */
export type StageContribution = {
  readonly [K in ArtifactCollection]?: XRayGraphInput[K]
}

/** Everything a stage is given. Read-only: a stage never mutates the graph. */
export interface StageContext {
  readonly investigationId: InvestigationId

  /**
   * Read aggregate over everything produced so far, rebuilt for this attempt.
   *
   * `XRayGraph` gains no mutation API (D3). A stage reads through selectors
   * and returns a contribution; it cannot reach into canonical state.
   */
  readonly graph: XRayGraph

  /** Deterministic identity allocation in the reserved namespaces (D5). */
  readonly ids: IdentityAllocator

  /** In-run artifact revision being read. Not an `InvestigationVersion`. */
  readonly inputArtifactVersion: number

  /** 1 for the first attempt. Present so a stage can vary strategy on retry. */
  readonly attempt: number
}

/**
 * An executable stage.
 *
 * `run` may be async because 6b will put a provider call behind it. 6a ships
 * no implementation of this interface outside the check harness — defining
 * the contract is the deliverable.
 */
export interface StageDefinition {
  readonly stage: ResearchStage
  run(ctx: StageContext): StageContribution | Promise<StageContribution>
}

// ---------------------------------------------------------------------------
// Control gates
// ---------------------------------------------------------------------------

/**
 * Gate execution order, after every research stage and before graduation.
 *
 * `REVIEW` follows `VALIDATE` because the Reviewer runs only on
 * validator-clean graphs (#4 D1). Neither appears in `RESEARCH_STAGES`.
 */
export const CONTROL_GATES = ['VALIDATE', 'REVIEW'] as const

/**
 * True for names that historical `StageRun` records may carry but the
 * pipeline must never schedule as a research stage.
 *
 * XRAY-KE-001 records `VALIDATE`, `SYNTHESIZE` and `RESOLVE` as `PENDING`
 * stage runs. Those observations stay readable (#6 D15 migration rule); this
 * is how new code tells them apart from work it may execute.
 */
export function isResearchStage(stage: string): stage is ResearchStage {
  return (RESEARCH_STAGES as readonly string[]).includes(stage)
}
