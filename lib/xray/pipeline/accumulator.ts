/**
 * The in-flight canonical-input accumulator.
 *
 * WHY THIS EXISTS RATHER THAN A MUTABLE GRAPH
 * ===========================================
 * `XRayGraph` is the read aggregate and gains no mutation API (D3). If it had
 * one, the single canonical record ADR-0001 depends on would have two shapes:
 * the arrays, and a graph that had drifted from them. Instead the pipeline
 * accumulates canonical arrays here and rebuilds the read aggregate whenever
 * a stage needs to inspect. The graph is assembled on demand and thrown away,
 * exactly as the query layer intends.
 *
 * WHY MERGES ARE OWNERSHIP-CHECKED
 * ================================
 * Each stage may write only the collections `STAGE_OUTPUTS` grants it. A
 * stage writing outside its ownership fails loudly. Without that, an artifact
 * could acquire a second author, and "which stage can address this finding?"
 * — the question `RevisionRequest` exists to answer — would have no reliable
 * answer.
 *
 * WHY CHECKPOINTS
 * ===============
 * A failed attempt must leave no trace in canonical state, or a retry would
 * see artifacts its predecessor added and allocate different identifiers. The
 * runner checkpoints before each attempt and restores on failure, which is
 * what makes deterministic identity survive retry (research-pipeline §17).
 *
 * PURITY: no clock, no randomness, no I/O, no fixture ids.
 */

import type { Investigation, InvestigationVersion, ResearchStage, ResearchStop } from '@/lib/xray/domain'
import { createXRayGraph, type XRayGraph, type XRayGraphInput } from '@/lib/xray/selectors'
import {
  ARTIFACT_COLLECTIONS,
  STAGE_OUTPUTS,
  type ArtifactCollection,
  type StageContribution,
} from './stages'

/** A stage broke a structural contract. Distinct from a validator violation. */
export class PipelineContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PipelineContractError'
  }
}

type Mutable = { [K in ArtifactCollection]: unknown[] }

/** Opaque restore point. Array copies, so later merges cannot reach back in. */
export interface AccumulatorCheckpoint {
  readonly _collections: Readonly<Record<ArtifactCollection, readonly unknown[]>>
  readonly _outputs: ReadonlyMap<ResearchStage, ReadonlyMap<ArtifactCollection, ReadonlySet<string>>>
  readonly _stop?: ResearchStop
}

export class GraphAccumulator {
  private readonly collections: Mutable
  private readonly investigation: Investigation
  private readonly version?: InvestigationVersion
  private stop?: ResearchStop
  private outputs = new Map<ResearchStage, Map<ArtifactCollection, Set<string>>>()

  /**
   * @param investigation Read-only throughout the run. The pipeline never
   *   writes `currentVersion`: that is published history owned by XR-INV-010,
   *   and in-run artifact revisions are a separate axis (§17).
   */
  constructor(investigation: Investigation, seed: Partial<XRayGraphInput> = {}) {
    this.investigation = investigation
    this.stop = investigation.researchStop
    this.version = seed.version
    this.collections = Object.fromEntries(
      ARTIFACT_COLLECTIONS.map((c) => [c, [...((seed[c] ?? []) as readonly unknown[])]]),
    ) as Mutable
  }

  /**
   * Apply a stage's contribution.
   *
   * An element whose id already exists replaces it; otherwise it is appended.
   * Replacement is deliberate and named: `CLASSIFY` revises the claims
   * `DECOMPOSE` produced, and `RECONCILE` may revise a discrepancy. Append-only
   * accumulation would force a revising stage to invent a second artifact for
   * the same fact.
   */
  merge(stage: ResearchStage, contribution: StageContribution): void {
    const owned = STAGE_OUTPUTS[stage]

    for (const key of Object.keys(contribution) as ArtifactCollection[]) {
      const incoming = contribution[key] as readonly { id: string }[] | undefined
      if (incoming === undefined) continue

      if (!owned.includes(key)) {
        throw new PipelineContractError(
          `stage ${stage} wrote '${key}', which it does not own ` +
            `(owns: ${owned.length ? owned.join(', ') : 'nothing'})`,
        )
      }

      const target = this.collections[key] as { id: string }[]
      const stageOutputs = this.outputs.get(stage) ?? new Map<ArtifactCollection, Set<string>>()
      this.outputs.set(stage, stageOutputs)
      const ids = stageOutputs.get(key) ?? new Set<string>()
      stageOutputs.set(key, ids)
      const seen = new Set<string>()

      for (const item of incoming) {
        if (item.id === undefined || item.id === '') {
          throw new PipelineContractError(`stage ${stage} contributed a '${key}' element with no id`)
        }
        if (seen.has(item.id)) {
          throw new PipelineContractError(
            `stage ${stage} contributed '${item.id}' twice in one '${key}' contribution`,
          )
        }
        seen.add(item.id)
        ids.add(item.id)

        const at = target.findIndex((existing) => existing.id === item.id)
        if (at === -1) target.push(item)
        else target[at] = item
      }
    }
  }

  /** Replace the complete output set from a successful stage re-run (D30). */
  replace(stage: ResearchStage, contribution: StageContribution): void {
    const checkpoint = this.checkpoint()
    const previous = checkpoint._outputs.get(stage)
    try {
      this.merge(stage, contribution)
      for (const key of STAGE_OUTPUTS[stage]) {
        const prior = previous?.get(key) ?? new Set<string>()
        const incoming = new Set(((contribution[key] ?? []) as readonly { id: string }[]).map((x) => x.id))
        this.collections[key] = (this.collections[key] as { id: string }[]).filter(
          (item) => !prior.has(item.id) || incoming.has(item.id),
        )
        const outputs = this.outputs.get(stage) ?? new Map<ArtifactCollection, Set<string>>()
        outputs.set(key, incoming)
        this.outputs.set(stage, outputs)
      }
    } catch (error) {
      this.restore(checkpoint)
      throw error
    }
  }

  setResearchStop(stop: ResearchStop | undefined): void {
    this.stop = stop
  }

  /** Canonical arrays as they stand. Copies: callers cannot mutate the run. */
  snapshot(): XRayGraphInput {
    return {
      investigation: this.investigationSnapshot(),
      ...(this.version ? { version: this.version } : {}),
      ...(this.copyCollections() as unknown as Omit<
        XRayGraphInput,
        'investigation' | 'version' | 'atiRequests'
      >),
    }
  }

  /**
   * The read aggregate over current state.
   *
   * Rebuilt, never cached. A cached graph would be a second source of truth
   * with its own staleness — the failure the query layer was written to rule
   * out.
   */
  rebuild(): XRayGraph {
    return createXRayGraph(this.snapshot())
  }

  checkpoint(): AccumulatorCheckpoint {
    return {
      _collections: this.copyCollections(),
      _outputs: new Map([...this.outputs].map(([stage, byCollection]) =>
        [stage, new Map([...byCollection].map(([key, ids]) => [key, new Set(ids)]))])),
      _stop: this.stop,
    }
  }

  /**
   * The investigation, with its membership index projected from the arrays.
   *
   * `Investigation` carries an index of the artifacts it owns, and the
   * validator checks that the index and the arrays agree. A run that never
   * wrote it could not produce a legal investigation at any point — every
   * intermediate state would report the index as referencing artifacts that
   * do not exist yet.
   *
   * Projected, never accumulated separately: recomputing it from the arrays
   * is the one construction that cannot drift from them. This is the same
   * reason `XRayGraph` holds no stored counts.
   *
   * EVERYTHING ELSE IS READ-ONLY. `currentVersion` is published history owned
   * by XR-INV-010 (§17); `status`, `stageRuns`, `researchStop` and the
   * timestamps are evidential fields the pipeline does not author in 6a —
   * `researchStop` is 6c, and the journal, not this field, is 6a's run record.
   */
  private investigationSnapshot(): Investigation {
    const ids = (c: ArtifactCollection): string[] =>
      (this.collections[c] as { id: string }[]).map((a) => a.id)

    return {
      ...this.investigation,
      researchStop: this.stop,
      claimIds: ids('claims') as Investigation['claimIds'],
      sourceIds: ids('sources'),
      evidenceIds: ids('evidence'),
      discrepancyIds: ids('discrepancies'),
      disconfirmationIds: ids('disconfirmations'),
      findingIds: ids('findings'),
      gapIds: ids('gaps'),
    }
  }

  /** One shallow copy per collection. Shared with `snapshot` so both agree. */
  private copyCollections(): Record<ArtifactCollection, unknown[]> {
    const out = {} as Record<ArtifactCollection, unknown[]>
    for (const c of ARTIFACT_COLLECTIONS) out[c] = [...this.collections[c]]
    return out
  }

  /** Discard everything merged since the checkpoint. */
  restore(checkpoint: AccumulatorCheckpoint): void {
    for (const c of ARTIFACT_COLLECTIONS) {
      this.collections[c] = [...checkpoint._collections[c]]
    }
    this.outputs = new Map([...checkpoint._outputs].map(([stage, byCollection]) =>
      [stage, new Map([...byCollection].map(([key, ids]) => [key, new Set(ids)]))]))
    this.stop = checkpoint._stop
  }

  /** How many artifacts a collection currently holds. For journal detail. */
  size(collection: ArtifactCollection): number {
    return this.collections[collection].length
  }
}
