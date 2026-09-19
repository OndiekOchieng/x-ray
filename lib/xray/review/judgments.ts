/**
 * Building model queries from a graph, and collecting the answers (#6 D21).
 *
 * WHY THE SEAM IS SPLIT IN TWO
 * ============================
 * `reviewXRayGraph` is synchronous, and every caller — the graduation gate,
 * the CLI, the pipeline's REVIEW gate — depends on that. Asking a model is
 * asynchronous.
 *
 * So the asynchronous half lives here: enumerate the queries, await the
 * answers, hand back a plain map. Review then stays a pure function of a graph
 * and a set of judgments, which is what keeps a review reproducible from
 * recorded state rather than only by asking a model again.
 *
 * WHAT DECIDES WHICH QUESTIONS GET ASKED
 * ======================================
 * The graph, not the model. Each port-dependent check enumerates its own
 * subjects — every claim, every finding, every contradicting piece of evidence
 * — so a provider is never handed the graph and asked what it thinks. The
 * calibration corpus defines what review means; this module only addresses it.
 *
 * PURITY: no provider SDK, no prompt string, no transport. The model is an
 * argument.
 */

import type { XRayGraph } from '@/lib/xray/selectors'
import { evidenceForClaim } from '@/lib/xray/selectors'
import { isAvailable, unavailable, type CapabilityResult } from '@/lib/xray/capability'
import type { ModelJudgment, ReviewerModel, ReviewerModelQuery } from './port'
import { activePortChecks } from './port'

/** One question, and the artifact it concerns. */
export interface JudgmentRequest {
  checkId: string
  /** Canonical id of the artifact judged, so answers can be attributed. */
  subjectId: string
  query: ReviewerModelQuery
}

/** Keyed by check and subject: two checks may share a query kind. */
export type JudgmentKey = `${string}::${string}`

export const judgmentKey = (checkId: string, subjectId: string): JudgmentKey =>
  `${checkId}::${subjectId}`

export type ModelJudgmentSet = ReadonlyMap<JudgmentKey, CapabilityResult<ModelJudgment>>

/**
 * Every question this graph raises for the port-dependent checks.
 *
 * Deterministic and ordered by canonical id, so the same graph always produces
 * the same question list — a review that asked different questions on each run
 * could not be compared with its own history.
 */
export function judgmentRequests(graph: XRayGraph): readonly JudgmentRequest[] {
  const out: JudgmentRequest[] = []

  const claims = [...graph.claims].sort((a, b) => (a.id < b.id ? -1 : 1))
  const findings = [...graph.findings].sort((a, b) => (a.id < b.id ? -1 : 1))
  const evidence = [...graph.evidence].sort((a, b) => (a.id < b.id ? -1 : 1))

  for (const check of activePortChecks(graph.investigation.protocolVersion)) {
    switch (check.queryKind) {
      case 'CLAIM_ATOMICITY': {
        for (const claim of claims) {
          out.push({
            checkId: check.checkId,
            subjectId: claim.id,
            query: { kind: 'CLAIM_ATOMICITY', claim },
          })
        }
        break
      }

      case 'CROSS_LAYER_INFERENCE': {
        for (const finding of findings) {
          const claim = graph.index.claim.get(finding.claimId)
          if (claim === undefined) continue
          out.push({
            checkId: check.checkId,
            subjectId: finding.id,
            query: {
              kind: 'CROSS_LAYER_INFERENCE',
              claim,
              finding,
              evidence: evidenceForClaim(graph, claim.id),
            },
          })
        }
        break
      }

      case 'SEMANTIC_MEASUREMENT_COMPATIBILITY': {
        // Only where a contradiction is actually drawn. Asking about evidence
        // that contradicts nothing would spend a provider call to confirm
        // there is nothing to confirm.
        for (const item of evidence) {
          if (item.relationship !== 'CONTRADICTS') continue
          for (const claimId of [...item.claimIds].sort()) {
            const claim = graph.index.claim.get(claimId)
            if (claim === undefined) continue
            out.push({
              checkId: check.checkId,
              subjectId: `${item.id}/${claim.id}`,
              query: { kind: 'SEMANTIC_MEASUREMENT_COMPATIBILITY', claim, evidence: item },
            })
          }
        }
        break
      }

      case 'REVERSIBILITY_ADEQUACY': {
        for (const finding of findings) {
          const claim = graph.index.claim.get(finding.claimId)
          if (claim === undefined) continue
          out.push({
            checkId: check.checkId,
            subjectId: finding.id,
            query: { kind: 'REVERSIBILITY_ADEQUACY', claim, finding },
          })
        }
        break
      }

      case 'RHETORICAL_OVERCLAIM': {
        for (const finding of findings) {
          const claim = graph.index.claim.get(finding.claimId)
          if (claim === undefined) continue
          out.push({
            checkId: check.checkId,
            subjectId: finding.id,
            query: { kind: 'RHETORICAL_OVERCLAIM', claim, finding },
          })
        }
        break
      }

      case 'EVIDENTIARY_REACH': {
        for (const finding of findings) {
          const claim = graph.index.claim.get(finding.claimId)
          if (!claim) continue
          out.push({
            checkId: check.checkId, subjectId: finding.id,
            query: {
              kind: 'EVIDENTIARY_REACH', checkId: check.checkId, claim, finding,
              evidence: evidenceForClaim(graph, claim.id),
              sources: graph.sources,
              sourcePositions: graph.sourcePositions,
              relatedClaims: claims,
              relatedFindings: findings,
            },
          })
        }
        break
      }
    }
  }

  return out
}

/**
 * Ask the model every question the graph raises.
 *
 * Sequential on purpose: the same reason 6a executes stages sequentially. A
 * concurrent sweep would finish in a different order each run, and a provider
 * under a rate limit would refuse a different subset each time — making the
 * capability report itself non-reproducible.
 *
 * A model that throws is not caught here. A refusal is a `CapabilityResult`; a
 * transport failure is an error, and swallowing it would report an outage as a
 * capability gap the operator cannot act on.
 */
export async function collectModelJudgments(
  graph: XRayGraph,
  model: ReviewerModel,
): Promise<ModelJudgmentSet> {
  const answers = new Map<JudgmentKey, CapabilityResult<ModelJudgment>>()

  for (const request of judgmentRequests(graph)) {
    const key = judgmentKey(request.checkId, request.subjectId)

    if (model.capabilities !== undefined && !model.capabilities.includes(request.query.kind)) {
      answers.set(
        key,
        unavailable(
          `reviewer-model:${request.query.kind}`,
          'NOT_SUPPORTED',
          `Model "${model.name}" does not offer ${request.query.kind} judgments.`,
          'Configure a reviewer model that answers this query kind.',
        ),
      )
      continue
    }

    answers.set(key, await model.judge(request.query))
  }

  return answers
}

/** Whether any answer for a check actually arrived. */
export function anyAvailable(judgments: ModelJudgmentSet, checkId: string): boolean {
  for (const [key, result] of judgments) {
    if (key.startsWith(`${checkId}::`) && isAvailable(result)) return true
  }
  return false
}
