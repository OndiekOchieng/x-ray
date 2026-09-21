/**
 * The ATI action surface (#10 slice 10e).
 *
 * WHY THE COPY LIVES HERE
 * =======================
 * Every user-visible string on the ATI surface is authored in this module, and
 * the component that renders it writes none of its own. That is deliberate:
 * the responsible-share language table is product policy, not a style guide,
 * and policy that lives in JSX cannot be tested. Here it can be, and is.
 *
 * WHAT THE WORDING MUST NEVER IMPLY
 * =================================
 * | Recorded fact        | Forbidden implication            |
 * | -------------------- | -------------------------------- |
 * | record not received  | the record does not exist        |
 * | no response recorded | the institution refused          |
 * | custody inferred     | the institution is the holder    |
 * | request closed       | the gap is resolved              |
 * | response received    | the claim is established         |
 * | response recorded    | the response was complete        |
 * | record received      | a Source exists                  |
 * | digest supplied      | the digest was verified          |
 *
 * Each row is a way of turning an absence into an accusation, which is the one
 * thing XR-INV-006 exists to prevent. So this module states what was recorded
 * and stops: no motives, no rankings, no blame, and no inference from silence.
 *
 * WHAT IT IS NOT
 * ==============
 * Not a second source of truth. Every field is derived from `RequestLifecycle`
 * — append-only action history — plus the origin gap it was anchored to. It
 * decides nothing; `ATIActionService` and `ATIResearchBridge` already did.
 */

import type { CustodyBasis, ResolutionPath } from '@/lib/xray/domain'
import type {
  DigestOrigin, RequestLifecycle, ResponseCompleteness,
} from '@/lib/xray/persistence/ati-lifecycle'
import { projectATIRequest, type ATIRequestView } from '@/lib/xray/application/ati-read-model'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** What the surface needs beyond the request's own history. */
export interface ATISurfaceContext {
  /** The gap as the **origin version** recorded it. Never the latest. */
  originGap: {
    gapId: string
    resolutionPath: ResolutionPath
    atiEligible: boolean
    /** The gap's status at the origin version, for the research-owned note. */
    status: string
  }
  /** Latest committed version of the investigation, if any. */
  latestCommittedVersion: number | null
}

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

export interface ATIOriginSurface {
  /** `Version 2 · GAP-001`. What this request is anchored to, permanently. */
  label: string
  gapId: string
  originVersion: number
  /**
   * Stated only when the investigation has moved on.
   *
   * Neutral by construction: it reports two version numbers and draws no
   * conclusion. The request does not track the latest version and must never
   * look as though it does (#10 slice 10e §C).
   */
  laterResearchNote?: string
}

export interface ATIHolderSurface {
  institution: string
  office?: string
  basis: CustodyBasis
  /** `Likely holder — inferred` or `Holder — confirmed`. Never "the responsible office". */
  label: string
  /** True when custody was reasoned about rather than established. */
  inferred: boolean
  /** Shown whenever a human asserted confirmed custody. */
  rationale?: string
  /** Why this wording is what it is, for a reader who wonders. */
  note: string
}

export type ATIFilingStage = 'DRAFT' | 'EXPORTED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'RESPONDED' | 'CLOSED'

export interface ATIFilingSurface {
  stage: ATIFilingStage
  /** Human label for the derived status. */
  statusLabel: string
  /** Always present. X-Ray does not file requests, at any stage. */
  notFiledNotice: string
  /** Which exact revision was frozen, when an export exists. */
  exportedRevisionLabel?: string
  /** Present only once a human confirmed a filing. */
  filedNote?: string
  /** The sentence a human is asked to affirm. Factual, never an instruction. */
  confirmationStatement: string
}

export interface ATITimelineEntry {
  /** Ordering key within the request. Sequence is authoritative. */
  key: string
  kind: 'REVISION' | 'EXPORT' | 'SUBMISSION' | 'ACKNOWLEDGEMENT' | 'RESPONSE' | 'CLOSURE'
  label: string
  occurredAt: string
  /** Extra recorded facts. Never a default or an inference. */
  detail?: string
  /** True for a response recorded after the request was closed. */
  afterClosure?: boolean
}

export interface ATIIntakeSurface {
  intakeId: string
  describedAs: string
  receivedAt: string
  mediaType?: string
  /** `Received record` before research; never "evidence", "proof" or "verified". */
  receiptLabel: string
  /** `Awaiting research` or `Researched into Source SRC-…`. */
  researchLabel: string
  /** Canonical sources a committed version introduced from this record. */
  acceptedSourceIds: readonly string[]
  /** `Integrity digest — computed by X-Ray` / `— supplied externally`. */
  digestLabel?: string
  digestOrigin?: DigestOrigin
  /** Why processing needs the material again. */
  materialNote: string
}

export interface ATIResponseSurface {
  sequence: number
  receivedAt: string
  completeness: ResponseCompleteness
  /** `Completeness as stated: partial`. Never a conclusion about completeness. */
  completenessLabel: string
  summary?: string
  intakes: readonly ATIIntakeSurface[]
  /** Set when this response arrived after the request was closed. */
  afterClosureNote?: string
}

export type ATIProcessingResult = 'COMMITTED' | 'NO_CANONICAL_CHANGE' | 'NOT_COMMITTABLE'

export interface ATIProcessingSurface {
  result: ATIProcessingResult
  headline: string
  detail: string
  /** Present only for `COMMITTED`. */
  committedVersion?: number
  addedSourceIds?: readonly string[]
  reEvaluatedClaimIds?: readonly string[]
  /** Where the successor version can be read. Internal explorer, never public. */
  versionHref?: string
}

/** One action the operator may take, and why not when they may not. */
export interface ATIActionSurface {
  id: 'REVISE' | 'EXPORT' | 'CONFIRM_SUBMISSION' | 'ACKNOWLEDGE' | 'CLOSE'
    | 'RECORD_RESPONSE' | 'PROCESS_INTAKE'
  label: string
  available: boolean
  /** Authored, factual, never an instruction dressed as a rule. */
  unavailableReason?: string
}

export interface ATIRequestSurface {
  requestId: string
  investigationId: string
  request: ATIRequestView
  origin: ATIOriginSurface
  holder: ATIHolderSurface
  filing: ATIFilingSurface
  timeline: readonly ATITimelineEntry[]
  responses: readonly ATIResponseSurface[]
  actions: readonly ATIActionSurface[]
  /**
   * What the action record does **not** say about the gap.
   *
   * Present always, because the temptation is always there: a filed request
   * looks like progress and a closed one looks like an ending, and neither is
   * a statement about the evidence.
   */
  gapStatusNote: string
  /** Current revision's requested records, as the gap ledger worded them. */
  requestedRecords: readonly string[]
  publicInterestContext: string
}

// ---------------------------------------------------------------------------
// Authored copy
// ---------------------------------------------------------------------------

const STAGE_LABEL: Record<ATIFilingStage, string> = {
  DRAFT: 'Draft — not filed',
  EXPORTED: 'Exported — not filed',
  SUBMITTED: 'Filed by a person, outside X-Ray',
  ACKNOWLEDGED: 'Acknowledged by the institution',
  RESPONDED: 'Response recorded',
  CLOSED: 'Closed',
}

const NOT_FILED =
  'X-Ray does not file information requests. Exporting prepares a request for a person to file themselves; nothing here sends it.'

const CONFIRMATION_STATEMENT = 'I filed this exported request outside X-Ray.'

const COMPLETENESS_LABEL: Record<ResponseCompleteness, string> = {
  PARTIAL: 'Completeness as stated: partial',
  FINAL: 'Completeness as stated: final',
  UNSTATED: 'Completeness: not stated by the institution',
}

const DIGEST_LABEL: Record<DigestOrigin, string> = {
  COMPUTED: 'Integrity digest — computed by X-Ray',
  SUPPLIED: 'Integrity digest — supplied externally',
}

const MATERIAL_NOTE =
  'X-Ray keeps a receipt for this record, not the record itself. Research cannot begin from the receipt alone; the material has to be supplied again for this exact record.'

const GAP_STATUS_NOTE =
  'This is the record of an information request. It says nothing about whether the gap is resolved: only a newly researched version of the investigation can show that, and only because the evidence changed.'

const PROCESSING_COPY: Record<ATIProcessingResult, { headline: string; detail: string }> = {
  COMMITTED: {
    headline: 'Research produced a new version',
    detail:
      'The supplied material went through the normal research pipeline and its results were committed as a successor version. What changed, and whether any gap closed, is a fact about that version.',
  },
  NO_CANONICAL_CHANGE: {
    headline: 'Research completed; no new record entered the evidence graph',
    detail:
      'Research ran over this material and produced no new canonical Source or Evidence — which happens when a released record is one the investigation already held, or carries nothing that bears on a claim. No version was committed. This is a research result, not a failure.',
  },
  NOT_COMMITTABLE: {
    headline: 'Research did not complete',
    detail:
      'The run did not reach a state that could be assessed and committed. Nothing was concluded about the material itself.',
  },
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Build the surface for one request.
 *
 * A processing outcome is deliberately not part of this: it belongs to an
 * execution run over one intake, not to the request, and this module reads no
 * database. `atiProcessingSurface` presents that separately.
 */
export function atiRequestSurface(
  lifecycle: RequestLifecycle, context: ATISurfaceContext,
): ATIRequestSurface {
  const request = projectATIRequest(lifecycle)
  const current = lifecycle.revisions[lifecycle.revisions.length - 1]!
  const closure = lifecycle.events.find((event) => event.act === 'CLOSE')
  const exports = lifecycle.events.filter((event) => event.act === 'EXPORT')
  const latestExport = exports[exports.length - 1]

  return {
    requestId: lifecycle.requestId,
    investigationId: lifecycle.investigationId,
    request,
    origin: origin(lifecycle, context),
    holder: holder(current),
    filing: filing(request, latestExport?.revision, lifecycle.submittedAt),
    timeline: timeline(lifecycle),
    responses: responses(lifecycle, closure?.occurredAt),
    actions: actions(lifecycle, closure !== undefined),
    gapStatusNote: GAP_STATUS_NOTE,
    requestedRecords: [...current.requestedRecords],
    publicInterestContext: current.publicInterestContext,
  }
}

function origin(
  lifecycle: RequestLifecycle, context: ATISurfaceContext,
): ATIOriginSurface {
  const latest = context.latestCommittedVersion
  // Two numbers and no conclusion. The request is anchored, not tracking.
  const laterResearchNote = latest !== null && latest > lifecycle.originVersion
    ? `Request created from version ${lifecycle.originVersion}; latest research is version ${latest}.`
    : undefined
  return {
    label: `Version ${lifecycle.originVersion} · ${lifecycle.gapId}`,
    gapId: lifecycle.gapId,
    originVersion: lifecycle.originVersion,
    ...(laterResearchNote === undefined ? {} : { laterResearchNote }),
  }
}

function holder(current: RequestLifecycle['revisions'][number]): ATIHolderSurface {
  const inferred = current.custodyBasis === 'INFERRED'
  return {
    institution: current.holdingInstitution,
    ...(current.holdingOffice === undefined ? {} : { office: current.holdingOffice }),
    basis: current.custodyBasis,
    label: inferred ? 'Likely holder — inferred' : 'Holder — confirmed',
    inferred,
    ...(current.custodyBasisRationale === undefined
      ? {} : { rationale: current.custodyBasisRationale }),
    note: inferred
      ? 'X-Ray reasoned about who is likely to hold this record and did not establish it. The request says so, so the recipient can redirect it.'
      : 'Custody was established and recorded, with the basis stated below.',
  }
}

function filing(
  request: ATIRequestView, exportedRevision: number | undefined, submittedAt: string | undefined,
): ATIFilingSurface {
  return {
    stage: request.status,
    statusLabel: STAGE_LABEL[request.status],
    notFiledNotice: NOT_FILED,
    ...(exportedRevision === undefined
      ? {} : { exportedRevisionLabel: `Exported revision ${exportedRevision}` }),
    // Only ever from a recorded submission. An export produces nothing here.
    ...(submittedAt === undefined
      ? {} : { filedNote: `A person recorded filing this request on ${submittedAt}.` }),
    confirmationStatement: CONFIRMATION_STATEMENT,
  }
}

function timeline(lifecycle: RequestLifecycle): readonly ATITimelineEntry[] {
  const closedAt = lifecycle.events.find((event) => event.act === 'CLOSE')?.occurredAt
  const entries: ATITimelineEntry[] = lifecycle.revisions.map((revision) => ({
    key: `r${revision.revision}`,
    kind: 'REVISION' as const,
    label: revision.revision === 1
      ? 'Draft created' : `Draft revised — revision ${revision.revision}`,
    occurredAt: revision.createdAt,
  }))

  for (const event of lifecycle.events) {
    if (event.act === 'EXPORT') {
      entries.push({ key: `e${event.sequence}`, kind: 'EXPORT',
        label: `Exported revision ${String(event.revision)} for a person to file`,
        occurredAt: event.occurredAt })
    } else if (event.act === 'SUBMIT') {
      const facts = [
        event.submissionMethod, event.externalReference, event.destination,
      ].filter((value): value is string => value !== undefined)
      entries.push({ key: `e${event.sequence}`, kind: 'SUBMISSION',
        label: `A person confirmed filing export ${String(event.submittedExportSequence)}`,
        occurredAt: event.occurredAt,
        // Absent stays absent: nothing is invented to fill the line out.
        ...(facts.length === 0 ? {} : { detail: facts.join(' · ') }) })
    } else if (event.act === 'ACKNOWLEDGE') {
      entries.push({ key: `e${event.sequence}`, kind: 'ACKNOWLEDGEMENT',
        label: 'The institution acknowledged receipt', occurredAt: event.occurredAt,
        ...(event.note === undefined ? {} : { detail: event.note }) })
    } else {
      entries.push({ key: `e${event.sequence}`, kind: 'CLOSURE',
        label: 'The request thread was closed', occurredAt: event.occurredAt,
        ...(event.note === undefined ? {} : { detail: event.note }) })
    }
  }

  for (const response of lifecycle.responses) {
    const after = closedAt !== undefined
    entries.push({
      key: `p${response.sequence}`,
      kind: 'RESPONSE',
      label: after ? 'Response received after closure' : 'Response received',
      occurredAt: response.receivedAt,
      detail: `${response.intakes.length} record(s) recorded`,
      ...(after ? { afterClosure: true } : {}),
    })
  }
  return entries
}

function responses(
  lifecycle: RequestLifecycle, closedAt: string | undefined,
): readonly ATIResponseSurface[] {
  return lifecycle.responses.map((response) => ({
    sequence: response.sequence,
    receivedAt: response.receivedAt,
    completeness: response.completeness,
    completenessLabel: COMPLETENESS_LABEL[response.completeness],
    ...(response.summary === undefined ? {} : { summary: response.summary }),
    // A late response is recorded, and does not reopen anything.
    ...(closedAt === undefined ? {} : {
      afterClosureNote: `Recorded after the request was closed on ${closedAt}. The request stays closed.`,
    }),
    intakes: response.intakes.map((intake) => {
      const accepted = intake.acceptedSources.map((source) => source.sourceId)
      return {
        intakeId: intake.intakeId,
        describedAs: intake.describedAs,
        receivedAt: intake.receivedAt,
        ...(intake.mediaType === undefined ? {} : { mediaType: intake.mediaType }),
        // Receipt language until research says otherwise, and after.
        receiptLabel: 'Received record',
        researchLabel: accepted.length === 0
          ? 'Awaiting research'
          : `Researched into ${accepted.length === 1 ? 'Source' : 'Sources'} ${accepted.join(', ')}`,
        acceptedSourceIds: accepted,
        // Provenance travels with the digest, or the digest is not shown.
        ...(intake.contentHashOrigin === undefined ? {} : {
          digestLabel: DIGEST_LABEL[intake.contentHashOrigin],
          digestOrigin: intake.contentHashOrigin,
        }),
        materialNote: MATERIAL_NOTE,
      }
    }),
  }))
}

function actions(
  lifecycle: RequestLifecycle, closed: boolean,
): readonly ATIActionSurface[] {
  const submitted = lifecycle.events.some((event) => event.act === 'SUBMIT')
  const hasExport = lifecycle.events.some((event) => event.act === 'EXPORT')
  const draftOnly = lifecycle.events.length === 0
  const closedReason = 'The request was closed. Closure is administrative and cannot be undone.'

  const unresearched = lifecycle.responses
    .flatMap((response) => response.intakes)
    .some((intake) => intake.acceptedSources.length === 0)

  return [
    { id: 'REVISE', label: 'Revise draft', available: !closed,
      ...(closed ? { unavailableReason: closedReason } : {}) },
    { id: 'EXPORT', label: 'Export this revision', available: !closed,
      ...(closed ? { unavailableReason: closedReason } : {}) },
    { id: 'CONFIRM_SUBMISSION', label: 'Record that I filed it', available: !closed && hasExport,
      ...(closed ? { unavailableReason: closedReason }
        : hasExport ? {} : { unavailableReason: 'Export a revision first; a filing names one exact export.' }) },
    { id: 'ACKNOWLEDGE', label: 'Record an acknowledgement',
      available: !closed && submitted,
      ...(closed ? { unavailableReason: closedReason }
        : submitted ? {} : { unavailableReason: 'Record a filing first; there is nothing yet to acknowledge.' }) },
    { id: 'CLOSE', label: 'Close the request', available: !closed && !draftOnly,
      ...(closed ? { unavailableReason: closedReason }
        : draftOnly ? { unavailableReason: 'Nothing has happened on this request yet.' } : {}) },
    // Deliberately available after closure: an institution can still reply,
    // and refusing to record that would make the history less true.
    { id: 'RECORD_RESPONSE', label: 'Record a response', available: submitted,
      ...(submitted ? {} : { unavailableReason: 'A response answers a filed request; record a filing first.' }) },
    { id: 'PROCESS_INTAKE', label: 'Process a record through research',
      available: unresearched,
      ...(unresearched ? {} : { unavailableReason: 'No received record is waiting for research.' }) },
  ]
}

/** Build the presentation for one processing outcome. */
export function atiProcessingSurface(outcome: {
  result: ATIProcessingResult
  investigationId: string
  version?: number
  addedSourceIds?: readonly string[]
  reEvaluatedClaimIds?: readonly string[]
}): ATIProcessingSurface {
  const copy = PROCESSING_COPY[outcome.result]
  return {
    result: outcome.result,
    headline: copy.headline,
    detail: copy.detail,
    ...(outcome.result === 'COMMITTED' && outcome.version !== undefined ? {
      committedVersion: outcome.version,
      addedSourceIds: [...(outcome.addedSourceIds ?? [])],
      reEvaluatedClaimIds: [...(outcome.reEvaluatedClaimIds ?? [])],
      // The internal explorer. Public version bytes never carry action state.
      versionHref: `/investigations/${outcome.investigationId}`,
    } : {}),
  }
}
