/**
 * The Anthropic `ReviewerModel` (#20 slice 20b).
 *
 * WHY THIS ONE PRESENTS CANONICAL IDS
 * ===================================
 * `ModelJudgment.targets` is a list of canonical ids: a reviewer that could
 * not name what it flagged would produce an unactionable judgment. So unlike
 * the research port — where `Offered<T>` exists precisely to withhold identity
 * — the review port hands over real artifacts, and this adapter presents their
 * ids.
 *
 * The boundary is therefore enforced on the way back rather than on the way
 * out: every returned target must be an artifact *this query* contained, and
 * its kind must match. `decode.ts` builds that check from `offeredTargets`
 * below. A model that names an id it was not shown is rejected, which is the
 * same property as the research port's `RefScope` arriving by the other
 * direction.
 *
 * WHAT A REFUSAL MEANS HERE
 * =========================
 * `collectModelJudgments` treats an `UNAVAILABLE` answer as a check that stays
 * NOT_EVALUATED with a reason — never a pass. That is #4's promise and #6 D21's
 * wiring, and it is why this adapter returns capability outcomes rather than
 * inventing a neutral judgment when the provider will not answer. An
 * unanswered check must look unanswered.
 */

import { available, type CapabilityResult } from '@/lib/xray/capability'
import type {
  Claim, Evidence, Finding, Source, SourcePosition,
} from '@/lib/xray/domain'
import type { ModelJudgment, ReviewerModel, ReviewerModelQuery } from '@/lib/xray/review'
import type { ReviewTargetKind } from '@/lib/xray/review'
import { decodeJudgment } from './decode'
import { REVIEW_MAX_TOKENS, REVIEW_SYSTEM, REVIEW_TASKS, REVIEW_TOOL } from './prompts'
import { callMessages, type CallDiagnostics } from './transport'

export interface AnthropicReviewerOptions {
  readonly modelId: string
  readonly apiKey: string
  readonly baseUrl?: string
  readonly timeoutMs?: number
}

/** Every query kind the calibration corpus raises. All six are answered. */
const QUERY_KINDS = [
  'CLAIM_ATOMICITY', 'CROSS_LAYER_INFERENCE', 'SEMANTIC_MEASUREMENT_COMPATIBILITY',
  'REVERSIBILITY_ADEQUACY', 'RHETORICAL_OVERCLAIM', 'EVIDENTIARY_REACH',
] as const satisfies readonly ReviewerModelQuery['kind'][]

type UncoveredKind = Exclude<ReviewerModelQuery['kind'], (typeof QUERY_KINDS)[number]>
const _kindsExhaustive: UncoveredKind extends never ? true : never = true
void _kindsExhaustive

export class AnthropicReviewerModel implements ReviewerModel {
  readonly name: string
  readonly capabilities = QUERY_KINDS

  private readonly calls: CallDiagnostics[] = []

  private readonly options: AnthropicReviewerOptions

  constructor(options: AnthropicReviewerOptions) {
    this.options = options
    this.name = `anthropic:${options.modelId}`
  }

  diagnostics(): readonly CallDiagnostics[] { return [...this.calls] }

  async judge(query: ReviewerModelQuery): Promise<CapabilityResult<ModelJudgment>> {
    const operation = `reviewer-model:${query.kind}`
    const task = REVIEW_TASKS[query.kind]
    if (task === undefined) {
      // Unreachable while `_kindsExhaustive` holds; kept so a new query kind
      // added without a task produces a capability gap rather than a prompt
      // that says `undefined`.
      return {
        kind: 'CAPABILITY_UNAVAILABLE',
        operation,
        reason: 'NOT_SUPPORTED',
        detail: `No review instruction is authored for ${query.kind}.`,
        resolvedBy: 'Author the instruction for this query kind in the provider.',
      }
    }

    const outcome = await callMessages({
      operation,
      modelId: this.options.modelId,
      apiKey: this.options.apiKey,
      ...(this.options.baseUrl === undefined ? {} : { baseUrl: this.options.baseUrl }),
      ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
      system: REVIEW_SYSTEM,
      userContent: `QUESTION\n${task}\n\nMATERIAL\n${JSON.stringify(material(query), null, 2)}`,
      tool: REVIEW_TOOL,
      maxTokens: REVIEW_MAX_TOKENS,
    })

    if (outcome.kind === 'CAPABILITY') return outcome.value
    this.calls.push(outcome.value.diagnostics)
    return available(
      decodeJudgment(operation, outcome.value.structured, offeredTargets(query)),
    )
  }
}

// ---------------------------------------------------------------------------
// What each query contains
// ---------------------------------------------------------------------------

/**
 * The ids a judgment may target, with the kind each one is.
 *
 * Built from the query rather than from the graph, so the check `decode.ts`
 * performs is "was this in front of you", not "does this exist". A reviewer
 * flagging a real artifact it never saw is exactly as wrong as one flagging an
 * invented id.
 */
function offeredTargets(query: ReviewerModelQuery): ReadonlyMap<string, ReviewTargetKind> {
  const targets = new Map<string, ReviewTargetKind>()
  const add = (kind: ReviewTargetKind, ids: readonly string[]) => {
    for (const id of ids) targets.set(id, kind)
  }

  switch (query.kind) {
    case 'CLAIM_ATOMICITY':
      add('Claim', [query.claim.id])
      break
    case 'CROSS_LAYER_INFERENCE':
      add('Claim', [query.claim.id])
      add('Finding', [query.finding.id])
      add('Evidence', query.evidence.map((item) => item.id))
      break
    case 'SEMANTIC_MEASUREMENT_COMPATIBILITY':
      add('Claim', [query.claim.id])
      add('Evidence', [query.evidence.id])
      break
    case 'REVERSIBILITY_ADEQUACY':
    case 'RHETORICAL_OVERCLAIM':
      add('Claim', [query.claim.id])
      add('Finding', [query.finding.id])
      break
    case 'EVIDENTIARY_REACH':
      add('Claim', [query.claim.id, ...query.relatedClaims.map((item) => item.id)])
      add('Finding', [query.finding.id, ...query.relatedFindings.map((item) => item.id)])
      add('Evidence', query.evidence.map((item) => item.id))
      add('Source', query.sources.map((item) => item.id))
      add('SourcePosition', query.sourcePositions.map((item) => item.id))
      break
  }

  return targets
}

/**
 * The material, field by field.
 *
 * Nothing is spread, for the same reason as `present.ts`: a `...artifact` would
 * put every future domain field on the wire. Cross-reference id arrays are
 * presented here — unlike the research port — because a reviewer judging
 * whether evidence reaches a claim needs to see which claim it is attached to.
 */
function material(query: ReviewerModelQuery): Record<string, unknown> {
  switch (query.kind) {
    case 'CLAIM_ATOMICITY':
      return { claim: reviewClaim(query.claim) }
    case 'CROSS_LAYER_INFERENCE':
      return {
        claim: reviewClaim(query.claim),
        finding: reviewFinding(query.finding),
        evidence: query.evidence.map(reviewEvidence),
      }
    case 'SEMANTIC_MEASUREMENT_COMPATIBILITY':
      return { claim: reviewClaim(query.claim), evidence: reviewEvidence(query.evidence) }
    case 'REVERSIBILITY_ADEQUACY':
    case 'RHETORICAL_OVERCLAIM':
      return { claim: reviewClaim(query.claim), finding: reviewFinding(query.finding) }
    case 'EVIDENTIARY_REACH':
      return {
        claim: reviewClaim(query.claim),
        finding: reviewFinding(query.finding),
        evidence: query.evidence.map(reviewEvidence),
        sources: query.sources.map(reviewSource),
        sourcePositions: query.sourcePositions.map(reviewPosition),
        relatedClaims: query.relatedClaims.map(reviewClaim),
        relatedFindings: query.relatedFindings.map(reviewFinding),
      }
  }
}

const present = <T>(key: string, value: T | undefined): Record<string, T> =>
  value === undefined ? {} as Record<string, T> : { [key]: value }

const listed = (key: string, value: readonly unknown[]): Record<string, unknown> =>
  value.length === 0 ? {} : { [key]: value }

function reviewClaim(claim: Claim): Record<string, unknown> {
  return {
    id: claim.id,
    text: claim.text,
    layer: claim.layer,
    type: claim.type,
    ...present('sourcePassage', claim.sourcePassage),
    ...present('measurement', claim.measurement),
    ...present('timeScope', claim.timeScope),
    ...listed('ambiguities', claim.ambiguities),
  }
}

function reviewEvidence(evidence: Evidence): Record<string, unknown> {
  return {
    id: evidence.id,
    proposition: evidence.proposition,
    relationship: evidence.relationship,
    strength: evidence.strength,
    claimIds: evidence.claimIds,
    sourceId: evidence.sourceId,
    ...present('knowledgeBasis', evidence.knowledgeBasis),
    ...present('measurement', evidence.measurement),
    ...present('timeScope', evidence.timeScope),
  }
}

function reviewFinding(finding: Finding): Record<string, unknown> {
  return {
    id: finding.id,
    claimId: finding.claimId,
    status: finding.status,
    confidence: finding.confidence,
    rationale: finding.rationale,
    wouldChangeFinding: finding.wouldChangeFinding,
    supportingEvidenceIds: finding.supportingEvidenceIds,
    challengingEvidenceIds: finding.challengingEvidenceIds,
    contextualEvidenceIds: finding.contextualEvidenceIds,
  }
}

function reviewSource(source: Source): Record<string, unknown> {
  return {
    id: source.id,
    title: source.title,
    ...present('publisher', source.publisher),
    ...present('institution', source.institution),
    ...present('author', source.author),
    ...present('publishedAt', source.publishedAt),
    sourceType: source.sourceType,
    evidenceClass: source.evidenceClass,
    originStatus: source.originStatus,
    accessibility: source.accessibility,
  }
}

function reviewPosition(position: SourcePosition): Record<string, unknown> {
  return {
    id: position.id,
    sourceId: position.sourceId,
    claimIds: position.claimIds,
    relationship: position.relationship,
    basis: position.basis,
    confidence: position.confidence,
    ...listed('powerOrDependency', position.powerOrDependency),
    ...present('relationshipDescription', position.relationshipDescription),
    ...present('productionPurpose', position.productionPurpose),
  }
}
