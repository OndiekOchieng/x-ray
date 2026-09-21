/**
 * The ATI research bridge (#10 slice 10d).
 *
 * WHAT IT CONNECTS
 * ================
 *   durable intake + supplied material
 *     → normal execution over the exact committed predecessor
 *     → affected-claim re-evaluation
 *     → graduation
 *     → immutable successor version
 *     → intake→added-Source acceptance
 *
 * WHAT IT DELIBERATELY IS NOT
 * ===========================
 * A shortcut around #6 or #7. There is no ATI version writer, no ATI stage
 * ordering, and no ATI privilege. This composes three things that already
 * exist — `InlineExecutionService.startReevaluation`, the pipeline, and
 * `GraduationService` — and adds exactly two things of its own: binding
 * supplied material to a durable receipt, and naming the response as the cause
 * of every claim the research actually changed.
 *
 * A ministry-supplied document has no privileged evidence status for having
 * been formally requested. It enters as retrieved material; the stages decide
 * `evidenceClass`, `originStatus`, `accessibility`, publisher and provenance,
 * and validation and review judge those decisions as they would any other
 * (ADR-0010, ADR-0018, release 10d §I).
 *
 * THE OUTCOME THAT IS NOT A FAILURE
 * =================================
 * Research may conclude that nothing in what arrived is worth adding — a
 * duplicate of a record already held, a covering letter, a refusal. ADR-0018
 * says so explicitly. That returns `NO_CANONICAL_CHANGE`: no Source is
 * manufactured, no acceptance is written, and no empty version is committed
 * merely to mark the intake handled. The run and its cause stay durable, so the
 * result is readable as a research result rather than as an absence.
 */

import { createHash } from 'node:crypto'

import type { InvestigationVersionTrigger } from '@/lib/xray/domain'
import type { XRayGraph } from '@/lib/xray/selectors'
import type { CapabilityResult } from '@/lib/xray/capability'
import {
  bound, type BoundedExtract, type ObservedDocumentMetadata, type ResearchAdapter,
  type RetrievalQuery, type RetrievalResult, type RetrievedDocument,
} from '@/lib/xray/pipeline/retrieval-port'
import type { ProposalRef } from '@/lib/xray/pipeline/proposals'
import type { AcceptanceBehavior } from '@/lib/xray/acceptance'
import type { ReviewerModel } from '@/lib/xray/review'
import type { SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import {
  atiResponseRef, readRequestLifecycle, type DigestOrigin, type RequestLifecycle,
} from '@/lib/xray/persistence/ati-lifecycle'
import { readRunsForIntake } from '@/lib/xray/persistence/execution-cause'
import type { CausalReference, ReEvaluationAudit } from '@/lib/xray/persistence/version-commit'
import { GraduationService } from './graduation-service'
import { InlineExecutionService } from './inline-execution'

// ---------------------------------------------------------------------------
// Rejection
// ---------------------------------------------------------------------------

export type IntakeProcessingRejectionCode =
  | 'ATI/INTAKE_NOT_FOUND'
  | 'ATI/INTAKE_WRONG_INVESTIGATION'
  | 'ATI/MATERIAL_DIGEST_MISMATCH'
  | 'ATI/MATERIAL_MISSING'
  | 'ATI/INTAKE_ALREADY_ACCEPTED'

export class IntakeProcessingRejected extends Error {
  readonly code: IntakeProcessingRejectionCode
  readonly detail: Readonly<Record<string, unknown>>

  constructor(
    code: IntakeProcessingRejectionCode, message: string,
    detail: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'IntakeProcessingRejected'
    this.code = code
    this.detail = detail
  }
}

const reject = (
  code: IntakeProcessingRejectionCode, message: string, detail?: Record<string, unknown>,
): never => {
  throw new IntakeProcessingRejected(code, message, detail)
}

// ---------------------------------------------------------------------------
// Material
// ---------------------------------------------------------------------------

/**
 * The actual material for one durable intake, supplied at processing time.
 *
 * 10c retains no document body, so this is how bytes reach research at all.
 * The shape follows ADR-0010's retrieved-document boundary rather than
 * inventing a second one: bounded content, honest metadata about reaching it,
 * and a `truncated` flag that is not cosmetic — a stage quoting from a
 * truncated extract has to know it read part of a record.
 *
 * Note what cannot be supplied: a `Source`, an `Evidence`, an `evidenceClass`,
 * an `originStatus`. The caller supplies material; stages decide artifacts.
 */
export interface ATIIntakeMaterial {
  intakeId: string
  boundedContent: string | Uint8Array
  mediaType?: string
  truncated: boolean
  /** The caller's own digest, if it has one. Checked, never trusted over bytes. */
  contentDigest?: string
  locator?: string
  observedMetadata?: ObservedDocumentMetadata
}

/**
 * What binding supplied material to a durable receipt established.
 *
 * `receiptDigestOrigin` is what 10c recorded, and is **not** rewritten by this
 * check. A `SUPPLIED` digest that matches newly supplied bytes has been shown
 * to correspond to what someone stated; that is not the same fact as X-Ray
 * having hashed the bytes at receipt, and quietly promoting it to `COMPUTED`
 * would erase the difference (release 10d §E).
 *
 * And what equality proves is bounded: correspondence to the stored receipt
 * claim. Not that the document is authentic, complete, or shows anything.
 */
export interface MaterialBinding {
  intakeId: string
  requestId: string
  investigationId: string
  responseSequence: number
  /** The durable response identity a re-evaluation cause names. */
  responseRef: string
  /** Digest of what was actually supplied now, computed here. */
  suppliedDigest: string
  /** The digest 10c stored at receipt, if any. */
  receiptDigest?: string
  receiptDigestOrigin?: DigestOrigin
  /** True when a stored digest existed and matched. */
  receiptDigestVerified: boolean
}

const sha256 = (content: string | Uint8Array): string =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`

const asText = (content: string | Uint8Array): string =>
  typeof content === 'string' ? content : Buffer.from(content).toString('utf8')

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export type IntakeProcessingOutcome =
  /** Research added canonical state and a successor version was committed. */
  | {
    result: 'COMMITTED'
    executionRunId: string
    version: number
    binding: MaterialBinding
    addedSourceIds: readonly string[]
    reEvaluatedClaimIds: readonly string[]
    acceptedSourceIds: readonly string[]
  }
  /**
   * Research ran and concluded there was nothing canonical to add.
   *
   * A valid research result (ADR-0018), not a failure. The intake stays
   * received and unaccepted.
   */
  | {
    result: 'NO_CANONICAL_CHANGE'
    executionRunId: string
    binding: MaterialBinding
  }
  /** The run did not reach a committable state. Nothing was committed. */
  | {
    result: 'NOT_COMMITTABLE'
    executionRunId: string
    binding: MaterialBinding
    status: string
    reason: string
  }

export interface ProcessIntakeOptions {
  intakeId: string
  material: ATIIntakeMaterial
  /** Defaults to the investigation's latest committed version. */
  expectedPredecessorVersion?: number
  behaviors?: readonly AcceptanceBehavior[]
  requiredReviewChecks?: readonly string[]
  model?: ReviewerModel
  /** Recorded on each re-evaluation audit row, if given. */
  detail?: string
}

// ---------------------------------------------------------------------------
// The material adapter
// ---------------------------------------------------------------------------

/**
 * Supplied intake material, presented at the retrieval boundary.
 *
 * The stage asks; this answers with one already-obtained record. It reports
 * `RETRIEVED` or `PARTIAL` — what it actually has — and nothing else. Look at
 * what it cannot return: `ResearchAdapter` has no operation that yields
 * `Evidence`, a `Source`, an `evidenceClass` or an `originStatus`, so an ATI
 * provider cannot mint any of them however much it would like to.
 */
export function intakeResearchAdapter(
  material: ATIIntakeMaterial, ref: ProposalRef,
): ResearchAdapter {
  const extract: BoundedExtract = {
    ...bound(asText(material.boundedContent), material.locator),
    ...(material.truncated ? { truncated: true } : {}),
  }
  const document: RetrievedDocument = {
    ref,
    ...(material.locator === undefined ? {} : { locator: material.locator }),
    outcome: material.truncated ? 'PARTIAL' : 'RETRIEVED',
    observed: {
      ...(material.observedMetadata ?? {}),
      ...(material.mediaType === undefined ? {} : { mediaType: material.mediaType }),
    },
    extract,
    contentHash: sha256(material.boundedContent),
    diagnostics: { provider: 'ati-intake', requestId: material.intakeId },
  }
  return {
    name: 'ati-intake',
    capabilities: ['retrieve', 'search'],
    async search(query: RetrievalQuery): Promise<CapabilityResult<RetrievalResult>> {
      return { kind: 'AVAILABLE', value: { query, documents: [document] } }
    },
    async retrieve(): Promise<CapabilityResult<RetrievedDocument>> {
      return { kind: 'AVAILABLE', value: document }
    },
  }
}

// ---------------------------------------------------------------------------
// The bridge
// ---------------------------------------------------------------------------

export class ATIResearchBridge {
  private readonly db: SnapshotDatabase
  private readonly execution: InlineExecutionService
  private readonly graduation: GraduationService
  private readonly clock: () => string

  constructor(
    db: SnapshotDatabase, execution: InlineExecutionService,
    clock: () => string = () => new Date().toISOString(),
  ) {
    this.db = db
    this.execution = execution
    this.graduation = new GraduationService(db, clock)
    this.clock = clock
  }

  /**
   * Bind supplied material to a durable intake.
   *
   * Everything here happens **before** any execution run or candidate
   * workspace exists, so mismatched material cannot leave a half-started run
   * behind, and no canonical state is touched on rejection.
   */
  async bindMaterial(
    intakeId: string, material: ATIIntakeMaterial,
  ): Promise<MaterialBinding> {
    if (material.intakeId !== intakeId) {
      reject('ATI/INTAKE_WRONG_INVESTIGATION',
        `material names intake ${material.intakeId}, not ${intakeId}`,
        { intakeId, named: material.intakeId })
    }

    const located = (await this.db.query(
      `SELECT i.request_id, i.response_sequence, i.content_hash, i.content_hash_origin,
              r.investigation_id
         FROM ati_response_intakes i
         JOIN ati_requests r ON r.id = i.request_id
        WHERE i.intake_id=$1`, [intakeId])).rows
    if (located.length !== 1) {
      reject('ATI/INTAKE_NOT_FOUND', `no ATI intake ${intakeId}`, { intakeId })
    }
    const row = located[0]

    if (asText(material.boundedContent).length === 0) {
      reject('ATI/MATERIAL_MISSING',
        `no material was supplied for intake ${intakeId}; research cannot read an empty record`,
        { intakeId })
    }

    const suppliedDigest = sha256(material.boundedContent)
    const receiptDigest = row.content_hash as string | null
    if (receiptDigest !== null && receiptDigest !== suppliedDigest) {
      reject('ATI/MATERIAL_DIGEST_MISMATCH',
        `the material supplied for intake ${intakeId} does not match the digest recorded at receipt`,
        { intakeId, receiptDigest, suppliedDigest })
    }
    if (material.contentDigest !== undefined
      && material.contentDigest.trim().toLowerCase() !== suppliedDigest) {
      reject('ATI/MATERIAL_DIGEST_MISMATCH',
        `the caller's stated digest does not match the material it supplied for intake ${intakeId}`,
        { intakeId, stated: material.contentDigest, suppliedDigest })
    }

    const sequence = row.response_sequence as number
    const requestId = row.request_id as string
    return {
      intakeId,
      requestId,
      investigationId: row.investigation_id as string,
      responseSequence: sequence,
      responseRef: atiResponseRef(requestId, sequence),
      suppliedDigest,
      ...(receiptDigest === null ? {} : { receiptDigest }),
      // Preserved exactly as 10c recorded it. A match does not promote a
      // SUPPLIED digest to COMPUTED, and no receipt row is rewritten.
      ...(row.content_hash_origin === null
        ? {} : { receiptDigestOrigin: row.content_hash_origin as DigestOrigin }),
      receiptDigestVerified: receiptDigest !== null,
    }
  }

  /**
   * Process one intake through research, end to end.
   *
   * One command, one intake, one run (release 10d §F). Not batched: the causal
   * audit `run → exact response/intake` is only exact if it is one-to-one, and
   * several intakes can be processed as several runs and several versions.
   */
  async processIntake(options: ProcessIntakeOptions): Promise<IntakeProcessingOutcome> {
    const binding = await this.bindMaterial(options.intakeId, options.material)
    await this.refuseIfAlreadyAccepted(binding)

    const predecessorVersion = options.expectedPredecessorVersion
      ?? await this.latestCommittedVersion(binding.investigationId)

    const trigger: InvestigationVersionTrigger = 'ATI_RESPONSE_RECEIVED'
    const started = await this.execution.startReevaluation({
      investigationId: binding.investigationId,
      expectedPredecessorVersion: predecessorVersion,
      trigger,
      cause: {
        kind: 'ATI_INTAKE',
        reference: `intake ${binding.intakeId} of response ${binding.responseRef}`,
        atiIntakeId: binding.intakeId,
        atiResponseRef: binding.responseRef,
      },
    })
    const executionRunId = started.executionRunId

    if (started.status.status !== 'COMPLETED' && started.status.status !== 'CAPABILITY_BLOCKED') {
      return {
        result: 'NOT_COMMITTABLE', executionRunId, binding,
        status: started.status.status,
        reason: 'the run did not reach a completed or capability-blocked state',
      }
    }

    const promoted = await this.graduation.promote(binding.investigationId, executionRunId, {
      expectedPredecessor: predecessorVersion, trigger, createdAt: this.clock(),
    })

    // ADR-0018's zero-source case. Nothing canonical changed, so there is
    // nothing to commit and nothing to accept — and an empty version committed
    // to mark the intake handled would be a false research record.
    if (!producedCanonicalChange(promoted)) {
      return { result: 'NO_CANONICAL_CHANGE', executionRunId, binding }
    }

    await this.graduation.assess(binding.investigationId, executionRunId, {
      ...(options.behaviors ? { behaviors: options.behaviors } : {}),
      ...(options.requiredReviewChecks
        ? { requiredReviewChecks: options.requiredReviewChecks } : {}),
      ...(options.model ? { model: options.model } : {}),
    })

    const acceptedAt = this.clock()
    const version = promoted.version!
    await this.graduation.commit(binding.investigationId, executionRunId, {
      expectedPredecessor: predecessorVersion,
      reEvaluationAudit: responseCausedAudit(
        version.reEvaluatedClaimIds, binding.responseRef, options.detail),
      // Written inside #7's commit transaction, after the pointer advances.
      intakeAcceptances: version.addedSourceIds.map((sourceId) => ({
        intakeId: binding.intakeId, sourceId, acceptedAt,
      })),
    })

    return {
      result: 'COMMITTED', executionRunId, version: version.version, binding,
      addedSourceIds: [...version.addedSourceIds],
      reEvaluatedClaimIds: [...version.reEvaluatedClaimIds],
      acceptedSourceIds: [...version.addedSourceIds],
    }
  }

  /** Every run that has processed one intake, and what each committed. */
  async runsForIntake(intakeId: string) {
    return readRunsForIntake(this.db, intakeId)
  }

  /** The request whose history this intake belongs to. Unchanged by research. */
  async lifecycleForIntake(intakeId: string): Promise<RequestLifecycle | undefined> {
    const located = (await this.db.query(
      'SELECT request_id FROM ati_response_intakes WHERE intake_id=$1', [intakeId])).rows
    if (located.length !== 1) return undefined
    return readRequestLifecycle(this.db, located[0].request_id as string)
  }

  // -- internals -----------------------------------------------------------

  /**
   * One intake is not researched twice into two committed versions.
   *
   * An accepted intake already has canonical sources behind it, so a second
   * pass would produce a second version from the same record with an
   * indistinguishable cause. A prior run that failed or never committed is a
   * different matter: it leaves no acceptance, and the intake stays available
   * (release 10d §P).
   */
  private async refuseIfAlreadyAccepted(binding: MaterialBinding): Promise<void> {
    const accepted = (await this.db.query(
      `SELECT committed_version, source_id FROM ati_intake_source_acceptances
        WHERE intake_id=$1 ORDER BY ordinal`, [binding.intakeId])).rows
    if (accepted.length === 0) return
    reject('ATI/INTAKE_ALREADY_ACCEPTED',
      `intake ${binding.intakeId} was already accepted into research at v${String(accepted[0].committed_version)}; re-researching one record into a second version needs explicit semantics that do not exist`,
      { intakeId: binding.intakeId,
        acceptedSourceIds: accepted.map((row) => row.source_id as string) })
  }

  private async latestCommittedVersion(investigationId: string): Promise<number> {
    const found = (await this.db.query(
      'SELECT latest_committed_version FROM investigations WHERE id=$1',
      [investigationId])).rows
    const latest = found.length === 1
      ? found[0].latest_committed_version as number | null : null
    if (latest === null) throw new Error(`${investigationId} has no committed version to research against`)
    return latest
  }
}

/**
 * Whether the run produced anything canonical worth committing.
 *
 * Deliberately narrow: new sources or new evidence. A version whose only
 * difference is that a run happened is not a research result, and ADR-0018
 * expects a response to be able to yield nothing.
 *
 * Note that a re-evaluated claim alone does not qualify here. Re-grading an
 * existing claim on no new evidence is a `RE_EVALUATION`, not an
 * `ATI_RESPONSE_RECEIVED` — if a received record changed a grade, it did so by
 * introducing something.
 */
function producedCanonicalChange(promoted: XRayGraph): boolean {
  const version = promoted.version
  if (!version) return false
  return version.addedSourceIds.length > 0 || version.addedEvidenceIds.length > 0
}

/**
 * The audit rows for claims this response actually caused to be reassessed.
 *
 * The set comes from `changedClaimIds`, which `promote` already computed — NOT
 * from the origin gap's `claimIds`. The gap is planning context: it says which
 * claims someone expected the record to bear on, and a response routinely
 * bears on a claim nobody predicted, or fails to move one everybody did. Using
 * the gap would record both mistakes as fact (release 10d §K).
 *
 * `changedClaimIds` also already filters to claims present in the predecessor,
 * so a newly discovered claim gets its first evaluation rather than being
 * recorded as a re-evaluation (§L).
 */
function responseCausedAudit(
  reEvaluatedClaimIds: readonly string[], responseRef: string, detail?: string,
): readonly ReEvaluationAudit[] {
  const cause: CausalReference = { kind: 'ATI_RESPONSE', id: responseRef }
  return reEvaluatedClaimIds.map((claimId) => ({
    claimId,
    reason: 'EXTERNAL_RECORD_RESPONSE' as const,
    ...(detail === undefined ? {} : { detail }),
    causes: [cause],
  }))
}
