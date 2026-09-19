/** Slice 14c executable calibration: model-assisted judgments over validator-legal graphs. */
import assert from 'node:assert/strict'
import { available } from './capability'
import { createXrayKe001Graph } from './fixtures/xray-ke-001/graph'
import { kenyattaMaralalGraph, type CalibrationMutation } from './fixtures/kenyatta-maralal-calibration'
import { validateXRayGraph } from './validation'
import {
  appendReviewRound, emptyReviewHistory, latestRoundIsClear, reviewXRayGraph,
  reviewXRayGraphWithModel, roundsConcernDistinctGraphs, V03_PORT_DEPENDENT_CHECKS,
  CHECK_ROUTING,
  type ModelJudgment, type ReviewerModel, type ReviewerModelQuery,
} from './review'

const clear: ModelJudgment = {
  flagged: false, severity: 'ADVISORY', rationale: 'Calibration boundary preserved.',
  requiredAction: 'None.', targets: [],
}

/** Deliberately fixture-scoped oracle; production Reviewer does no keyword matching. */
const fixtureModel: ReviewerModel = {
  name: '14c-calibration-stub',
  async judge(query: ReviewerModelQuery) {
    if (query.kind !== 'EVIDENTIARY_REACH' || query.claim.id !== 'DC003') return available(clear)
    const text = query.claim.text
    const promotes = query.checkId === 'V03/INSTITUTIONAL_CHARACTERIZATION_PROMOTION' &&
      text === 'Kenyatta operationally led Mau Mau.' &&
      query.evidence.some((e) => e.knowledgeBasis === 'INSTITUTIONAL_CHARACTERIZATION')
    const actor = ['V03/ACTOR_IDENTITY_LAUNDERING', 'V03/AGENCY_CHAIN_INHERITANCE',
      'V03/COMMON_OUTCOME_COORDINATION'].includes(query.checkId) && text.startsWith('They coordinated')
    const retrospective = query.checkId === 'V03/RETROSPECTIVE_INTENT_PROJECTION' &&
      text.startsWith('The later political benefit proves')
    const unfalsifiable = query.checkId === 'V03/UNFALSIFIABLE_SYSTEM_NARRATIVE' &&
      query.finding.wouldChangeFinding.every((condition) => condition.includes('confirms') || condition.includes('explained'))
    const flagged = promotes || actor || retrospective || unfalsifiable
    return available(flagged ? {
      flagged: true, severity: 'BLOCKING' as const,
      rationale: `Calibration judgment: ${query.checkId} exceeds the direct proposition in EV-100.`,
      requiredAction: 'Revise the claim or trace evidence for the broader proposition.',
      targets: [{ kind: 'Claim' as const, id: query.claim.id }, { kind: 'Evidence' as const, id: 'EV-100' }],
    } : clear)
  },
}

async function main(): Promise<void> {
  const historical = createXrayKe001Graph()
  const oldReview = reviewXRayGraph(historical)
  assert.equal(oldReview.findings.some((f) => f.checkId.startsWith('V03/')), false)
  assert.equal(oldReview.checks.some((c) => c.checkId.startsWith('V03/')), false)
  const clean = kenyattaMaralalGraph()
  assert.equal(validateXRayGraph(clean).valid, true)
  const withoutModel = reviewXRayGraph(clean)
  assert.equal(withoutModel.checks.filter((c) => c.checkId.startsWith('V03/') && c.outcome === 'NOT_EVALUATED').length,
    V03_PORT_DEPENDENT_CHECKS.length)
  assert.equal(withoutModel.summary.fullCapability, false)
  assert.ok(V03_PORT_DEPENDENT_CHECKS.every((c) => CHECK_ROUTING[c.checkId] !== undefined))
  const cleanReview = await reviewXRayGraphWithModel(clean, { model: fixtureModel })
  assert.equal(cleanReview.findings.some((f) => f.checkId.startsWith('V03/')), false)
  assert.equal(cleanReview.checks.filter((c) => c.checkId.startsWith('V03/')).length, V03_PORT_DEPENDENT_CHECKS.length)
  assert.ok(cleanReview.checks.filter((c) => c.checkId.startsWith('V03/')).every((c) => c.outcome === 'EVALUATED'))
  assert.deepEqual(clean.sourcePositions.map((p) => p.relationship), ['DETENTION_OR_ENFORCEMENT_AUTHORITY', 'INTERMEDIARY'])
  console.log('14c: historical unchanged; clean characterization and T1/T2 pass')

  const expected: Record<Exclude<CalibrationMutation, 'CLEAN'>, string> = {
    CHARACTERIZATION_PROMOTED: 'V03/INSTITUTIONAL_CHARACTERIZATION_PROMOTION',
    ACTOR_LAUNDERED: 'V03/ACTOR_IDENTITY_LAUNDERING',
    RETROSPECTIVE_INTENT: 'V03/RETROSPECTIVE_INTENT_PROJECTION',
    UNFALSIFIABLE_SYSTEM: 'V03/UNFALSIFIABLE_SYSTEM_NARRATIVE',
  }
  for (const [mutation, checkId] of Object.entries(expected)) {
    const graph = kenyattaMaralalGraph(mutation as CalibrationMutation)
    assert.equal(validateXRayGraph(graph).valid, true, `${mutation} must reach Reviewer`)
    const review = await reviewXRayGraphWithModel(graph, { model: fixtureModel })
    const finding = review.findings.find((f) => f.checkId === checkId)
    assert.ok(finding, `${mutation} must raise ${checkId}`)
    assert.ok(review.revisionRequests.some((r) => r.findingId === finding.id), `${mutation} must route`)
    assert.equal(review.summary.fullCapability, true)
  }
  const promoted = await reviewXRayGraphWithModel(kenyattaMaralalGraph('CHARACTERIZATION_PROMOTED'), { model: fixtureModel })
  const history = appendReviewRound(appendReviewRound(emptyReviewHistory(clean.investigation.id), promoted), cleanReview)
  assert.equal(history.rounds.length, 2)
  assert.equal(roundsConcernDistinctGraphs(history), true)
  assert.equal(latestRoundIsClear(history), true)
  assert.ok(promoted.revisionRequests.every((r) => Object.values(CHECK_ROUTING).some((route) => route.stage === r.stage)))
  console.log('14c: characterization, agency, retrospective intent, falsifier, and revision history pass')
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
