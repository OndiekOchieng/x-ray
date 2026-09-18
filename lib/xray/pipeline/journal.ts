/**
 * The append-only run journal.
 *
 * TWO RECORD SHAPES, DELIBERATELY
 * ===============================
 * `StageRun` is for execution units that own and transform artifact state, so
 * it carries an artifact revision transition. `GateRun` is for control gates,
 * which inspect state and mint nothing — so it structurally has no output
 * revision field at all (#6 D15). A gate cannot claim to have produced an
 * artifact revision, because there is nowhere to write one.
 *
 * That was the alternative rejected: one record type with an optional output
 * version, filled in for stages and left empty for gates. It would have made
 * "did this step change canonical state?" a runtime question about whether a
 * field happened to be set, on exactly the records an auditor reads to answer
 * it. Here it is a question about which record shape you are holding.
 *
 * A gate does not duplicate its own result. `ReviewHistory` is already the
 * durable, append-only record of review execution (#4), and a `REVIEW` gate
 * entry references the round rather than restating it.
 *
 * APPEND-ONLY
 * ===========
 * Entries are frozen on append and the journal exposes no way to remove or
 * rewrite one. A failed attempt stays in the journal and the retry appends a
 * new entry beside it; the history of what was attempted is the audit trail,
 * and a journal that could be tidied would not be evidence of anything.
 *
 * PURITY: no clock (timestamps are supplied), no randomness, no I/O.
 */

import type {
  ControlGate,
  InvestigationId,
  IsoDateTime,
  ResearchStage,
  StageRun,
  StageRunStatus,
} from '@/lib/xray/domain'

/**
 * A `StageRun` the pipeline produced.
 *
 * Narrower than `StageRun`: new runs are always a research stage. The wider
 * `PipelineStage` exists only so XRAY-KE-001's historical `VALIDATE`,
 * `SYNTHESIZE` and `RESOLVE` records remain readable (#6 D15 migration rule).
 * Nothing here writes those names.
 */
export interface ResearchStageRun extends StageRun {
  stage: ResearchStage
}

/** What a gate concluded. */
export type GateOutcome =
  /** Nothing to report. The run may continue. */
  | 'CLEAR'
  /** Non-blocking concerns recorded. The run may continue. */
  | 'CONCERNS'
  /** The run must not proceed past this gate. */
  | 'BLOCKED'
  /** Not run, because an earlier gate did not permit it. */
  | 'SKIPPED'

/**
 * Where a gate's durable result lives.
 *
 * A reference, never a copy. Restating a `ValidationResult` or a review round
 * inside the journal would create a second version of the same verdict, free
 * to drift from the one the graduation gate actually reads.
 */
export type GateResultRef =
  | { kind: 'VALIDATION'; valid: boolean; errorCount: number; warningCount: number }
  | {
      kind: 'REVIEW_HISTORY'
      investigationId: InvestigationId
      roundIndex: number
      graphFingerprint: string
    }

/**
 * One execution of one control gate.
 *
 * NOTE the absent field: there is no `outputArtifactVersion`. A gate inspects
 * an artifact revision and produces none.
 */
export interface GateRun {
  id: string
  investigationId: InvestigationId
  gate: ControlGate
  status: StageRunStatus
  /** The in-run artifact revision this gate read. */
  inspectedArtifactVersion: number
  outcome?: GateOutcome
  result?: GateResultRef
  startedAt?: IsoDateTime
  completedAt?: IsoDateTime
  error?: string
}

export type JournalEntry =
  | { readonly kind: 'STAGE'; readonly sequence: number; readonly run: ResearchStageRun }
  | { readonly kind: 'GATE'; readonly sequence: number; readonly run: GateRun }

export class JournalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JournalError'
  }
}

/**
 * Append-only execution record for one pipeline run.
 *
 * Shaped so #7 persists these same conceptual records without reinterpreting
 * them (D11): each entry is a flat object with a stable id and a sequence.
 */
export class RunJournal {
  private readonly log: JournalEntry[] = []
  private readonly ids = new Set<string>()
  readonly investigationId: InvestigationId

  constructor(investigationId: InvestigationId) {
    this.investigationId = investigationId
  }

  get entries(): readonly JournalEntry[] {
    return this.log
  }

  get length(): number {
    return this.log.length
  }

  appendStage(run: ResearchStageRun): JournalEntry {
    return this.append({ kind: 'STAGE', sequence: this.log.length, run: Object.freeze(run) })
  }

  appendGate(run: GateRun): JournalEntry {
    return this.append({ kind: 'GATE', sequence: this.log.length, run: Object.freeze(run) })
  }

  private append(entry: JournalEntry): JournalEntry {
    if (entry.run.investigationId !== this.investigationId) {
      throw new JournalError(
        `entry ${entry.run.id} belongs to ${entry.run.investigationId}, not ${this.investigationId}`,
      )
    }
    if (this.ids.has(entry.run.id)) {
      throw new JournalError(`entry ${entry.run.id} is already in the journal; entries are append-only`)
    }
    this.ids.add(entry.run.id)
    const frozen = Object.freeze(entry)
    this.log.push(frozen)
    return frozen
  }

  stageEntries(): readonly ResearchStageRun[] {
    return this.log.filter((e) => e.kind === 'STAGE').map((e) => e.run)
  }

  gateEntries(): readonly GateRun[] {
    return this.log.filter((e) => e.kind === 'GATE').map((e) => e.run)
  }

  /** Every run id used, so identity allocation does not reissue one. */
  runIds(): readonly string[] {
    return [...this.ids]
  }

  /** Stages that reached `SUCCEEDED`. What a resume may skip. */
  succeededStages(): readonly ResearchStage[] {
    return this.stageEntries()
      .filter((r) => r.status === 'SUCCEEDED')
      .map((r) => r.stage)
  }

  /** How many times a stage has been attempted, successfully or not. */
  attemptsFor(stage: ResearchStage): number {
    return this.stageEntries().filter((r) => r.stage === stage).length
  }
}
