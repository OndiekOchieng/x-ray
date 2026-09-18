/**
 * Reviewer adversarial checks.
 *
 * The Reviewer's whole purpose is catching what the validator cannot, so every
 * mutation below is asserted to be LEGAL first. A mutation the validator
 * rejects proves nothing about the Reviewer — the Reviewer would never see it.
 *
 * The central case is CAL-001 in its legal form: a graph asserting that "most
 * sections have already been tarmacked" is SUPPORTED, carried entirely by
 * project-completion percentages. Every relationship is declared honestly,
 * every list mirrors, every id resolves. The validator has nothing to say. It
 * is also precisely the error the benchmark was built to expose.
 *
 * Run:  pnpm check:review
 */

import { createXRayGraph, type XRayGraph, type XRayGraphInput } from './selectors'
import { validateXRayGraph } from './validation'
import {
  appendReviewRound,
  emptyReviewHistory,
  fingerprintGraph,
  latestRound,
  latestRoundIsClear,
  reviewXRayGraph,
  roundsConcernDistinctGraphs,
  DETERMINISTIC_CHECKS,
  PORT_DEPENDENT_CHECKS,
  type ReviewResult,
} from './review'

import { claims } from './fixtures/xray-ke-001/claims'
import { sources } from './fixtures/xray-ke-001/sources'
import { sourceDependencies } from './fixtures/xray-ke-001/source-dependencies'
import { evidence } from './fixtures/xray-ke-001/evidence'
import { evidenceProvenance } from './fixtures/xray-ke-001/evidence-provenance'
import { discrepancies } from './fixtures/xray-ke-001/discrepancies'
import { disconfirmations } from './fixtures/xray-ke-001/disconfirmation'
import { findings } from './fixtures/xray-ke-001/findings'
import { gaps } from './fixtures/xray-ke-001/gaps'
import { investigation, investigationVersion } from './fixtures/xray-ke-001/investigation'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

function check(name: string, fn: () => string | null): void {
  let detail: string | null
  try {
    detail = fn()
  } catch (err) {
    detail = `threw: ${(err as Error).message}`
  }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const baseInput = (): XRayGraphInput => ({
  investigation: clone(investigation),
  version: clone(investigationVersion),
  claims: clone(claims),
  sources: clone(sources),
  sourceDependencies: clone(sourceDependencies),
  evidence: clone(evidence),
  evidenceProvenance: clone(evidenceProvenance),
  discrepancies: clone(discrepancies),
  disconfirmations: clone(disconfirmations),
  findings: clone(findings),
  gaps: clone(gaps),
})

const canonical: XRayGraph = createXRayGraph(baseInput())
const AT = '2026-09-18T00:00:00Z'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mutated(mutate: (g: any) => void): XRayGraph {
  const input = baseInput()
  mutate(input)
  return createXRayGraph(input)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const find = (xs: any[], id: string): any => {
  const hit = xs.find((x) => x.id === id)
  if (!hit) throw new Error(`fixture is missing ${id}`)
  return hit
}

/**
 * Assert a mutation is LEGAL to the validator yet CAUGHT by the Reviewer.
 *
 * The legality assertion comes first and is not optional: it is what makes this
 * evidence about the Reviewer rather than about the validator.
 */
function legalButCaught(
  name: string,
  checkId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutate: (g: any) => void,
): void {
  check(name, () => {
    const graph = mutated(mutate)

    const validation = validateXRayGraph(graph)
    if (!validation.valid)
      return `mutation is ILLEGAL (${validation.summary.errorCount} validator error(s): ${validation.violations
        .filter((v) => v.severity === 'ERROR')
        .map((v) => v.code)
        .join(', ')}) — proves nothing about the Reviewer`

    const clean = reviewXRayGraph(canonical, { reviewedAt: AT })
    if (clean.findings.some((f) => f.checkId === checkId))
      return `${checkId} already fires on the clean fixture, so it proves nothing`

    const review = reviewXRayGraph(graph, { validation, reviewedAt: AT })
    const hit = review.findings.filter((f) => f.checkId === checkId)
    if (hit.length === 0)
      return `Reviewer produced no ${checkId}; got [${
        [...new Set(review.findings.map((f) => f.checkId))].join(', ') || 'nothing'
      }]`

    const malformed = hit.filter(
      (f) =>
        f.targets.length === 0 ||
        f.rationale.trim().length < 40 ||
        f.requiredAction.trim().length < 20 ||
        f.calibrationCases.length === 0 ||
        !f.failureMode,
    )
    if (malformed.length) return `${checkId} fired but the finding is malformed`
    return null
  })
}

// ---------------------------------------------------------------------------
// The clean fixture
// ---------------------------------------------------------------------------

check('canonical XRAY-KE-001 is validator-clean and review-clean', () => {
  const validation = validateXRayGraph(canonical)
  if (!validation.valid) return `fixture fails validation with ${validation.summary.errorCount} error(s)`
  const review = reviewXRayGraph(canonical, { validation, reviewedAt: AT })
  if (review.status !== 'REVIEWED') return `status ${review.status}`
  return review.findings.length === 0
    ? null
    : `review flagged the worked example of correct judgment: ${review.findings
        .map((f) => `${f.checkId}(${f.targets.map((t) => t.id).join('/')})`)
        .join('; ')}`
})

check('clean state can graduate with review evidence attached', () => {
  const review = reviewXRayGraph(canonical, { reviewedAt: AT })
  const history = appendReviewRound(emptyReviewHistory(canonical.investigation.id), review)
  if (!latestRoundIsClear(history)) return 'latest round is not clear'
  const round = latestRound(history)
  if (!round) return 'no round recorded'
  if (round.result.graphFingerprint !== fingerprintGraph(canonical))
    return 'round does not identify the graph it reviewed'
  if (round.result.checks.length === 0) return 'no check evidence attached'
  return null
})

// ---------------------------------------------------------------------------
// THE ACCEPTANCE CASE — legal to the validator, caught by the Reviewer
// ---------------------------------------------------------------------------

/**
 * "Most sections have already been tarmacked" graded SUPPORTED, carried
 * entirely by project-completion percentages.
 *
 * Every relationship is declared honestly, every finding list mirrors, every id
 * resolves, no CONTRADICTS is asserted. The validator is satisfied. It is also
 * exactly the proxy-measure move CAL-001 exists to prevent, and the grade the
 * benchmark's two runs disagreed over.
 */
legalButCaught(
  'ACCEPTANCE · CAL-001 proxy-measure grade is legal but caught',
  'FM-001/SETTLED_GRADE_ON_INCOMPARABLE_EVIDENCE',
  (g) => {
    for (const id of ['EV-020', 'EV-021', 'EV-022', 'EV-023', 'EV-024', 'EV-025'])
      find(g.evidence, id).relationship = 'SUPPORTS'
    const finding = find(g.findings, 'FND-C003')
    finding.status = 'SUPPORTED'
    finding.confidence = 'HIGH'
    finding.supportingEvidenceIds = ['EV-020', 'EV-021', 'EV-022', 'EV-023', 'EV-024', 'EV-025']
    finding.challengingEvidenceIds = []
  },
)

// ---------------------------------------------------------------------------
// The remaining failure modes, each legal
// ---------------------------------------------------------------------------

legalButCaught(
  'CAL-002 · a contradiction declared with no reconciliation recorded',
  'FM-002/CONTRADICTION_WITHOUT_RECONCILIATION',
  (g) => {
    delete find(g.discrepancies, 'DISC-004').reconciliation
  },
)

legalButCaught(
  'CAL-002 · a discrepancy marked resolved without saying how',
  'FM-002/RESOLVED_WITHOUT_RECONCILIATION',
  (g) => {
    delete find(g.discrepancies, 'DISC-001').reconciliation
  },
)

legalButCaught(
  'CAL-003 · several supporting records collapsing to one origin, graded positively',
  'FM-003/POSITIVE_GRADE_ON_SINGLE_ORIGIN',
  (g) => {
    // C002's four supporting records all reproduce one KeNHA briefing. Grading
    // it SUPPORTED reads as corroboration it does not have.
    const finding = find(g.findings, 'FND-C002')
    finding.status = 'SUPPORTED'
  },
)

legalButCaught(
  'CAL-004 · a settled grade standing over an open gap',
  'FM-004/SETTLED_GRADE_OVER_OPEN_GAP',
  (g) => {
    find(g.findings, 'FND-C002').status = 'ESTABLISHED'
  },
)

legalButCaught(
  'CAL-004 · a gap resting on a single search avenue',
  'FM-004/THIN_SEARCH_BEHIND_GAP',
  (g) => {
    find(g.gaps, 'GAP-003').searchAlreadyAttempted = ['Pre-tour reporting']
  },
)

legalButCaught(
  'CAL-005 · an event after the cutoff graded as established',
  'FM-005/OCCURRENCE_ESTABLISHED_AFTER_CUTOFF',
  (g) => {
    find(g.findings, 'FND-C004').status = 'ESTABLISHED'
  },
)

legalButCaught(
  'CAL-005 · temporal scope hidden inside a measurement field',
  'FM-005/TEMPORAL_SCOPE_IN_MEASUREMENT',
  (g) => {
    find(g.evidence, 'EV-020').measurement.definition =
      'Overall physical completion as at 30 June 2025, not road length surfaced.'
  },
)

legalButCaught(
  'CAL-006 · a finding established over an unresolved discrepancy',
  'FM-006/SETTLED_GRADE_OVER_UNRESOLVED_DISCREPANCY',
  (g) => {
    find(g.findings, 'FND-C002').status = 'ESTABLISHED'
  },
)

legalButCaught(
  'CAL-003 · ESTABLISHED while some evidence independence is undetermined',
  'FM-003/UNRESOLVED_INDEPENDENCE_ON_POSITIVE_GRADE',
  (g) => {
    // DC001 carries one evidence point whose origin was never established.
    find(g.findings, 'FND-DC001').status = 'ESTABLISHED'
  },
)

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

check('Reviewer refuses to run on a validator-failing graph', () => {
  const graph = mutated((g) => {
    find(g.sources, 'SRC-017').accessibility = 'DOES_NOT_EXIST'
  })
  const validation = validateXRayGraph(graph)
  if (validation.valid) return 'mutation did not actually break validation'
  const review = reviewXRayGraph(graph, { validation, reviewedAt: AT })
  if (review.status !== 'REFUSED_VALIDATOR_FAILING') return `status ${review.status}`
  if (review.findings.length > 0) return 'refused but still produced findings'
  if (!review.refusalReason) return 'refused without a reason'
  return null
})

check('Reviewer revalidates when no validation result is supplied', () => {
  const graph = mutated((g) => {
    find(g.sources, 'SRC-017').accessibility = 'DOES_NOT_EXIST'
  })
  const review = reviewXRayGraph(graph, { reviewedAt: AT })
  return review.status === 'REFUSED_VALIDATOR_FAILING'
    ? null
    : 'accepted an illegal graph when validation was not supplied'
})

check('Reviewer never mutates the candidate graph', () => {
  const before = JSON.stringify(baseInput())
  const graph = createXRayGraph(JSON.parse(before) as XRayGraphInput)
  reviewXRayGraph(graph, { reviewedAt: AT })
  const after = JSON.stringify({
    investigation: graph.investigation,
    version: graph.version,
    claims: graph.claims,
    sources: graph.sources,
    sourceDependencies: graph.sourceDependencies,
    evidence: graph.evidence,
    evidenceProvenance: graph.evidenceProvenance,
    discrepancies: graph.discrepancies,
    disconfirmations: graph.disconfirmations,
    findings: graph.findings,
    gaps: graph.gaps,
  })
  return before === after ? null : 'graph changed during review'
})

check('a blocking finding produces an explicit revision request naming a stage', () => {
  const graph = mutated((g) => {
    find(g.findings, 'FND-C004').status = 'ESTABLISHED'
  })
  const review = reviewXRayGraph(graph, { reviewedAt: AT })
  const blocking = review.findings.filter((f) => f.severity === 'BLOCKING')
  if (blocking.length === 0) return 'no blocking finding produced'
  for (const finding of blocking) {
    const request = review.revisionRequests.find((r) => r.findingId === finding.id)
    if (!request) return `blocking finding ${finding.checkId} produced no revision request`
    if (!request.stage) return 'revision request names no stage'
    if (request.targets.length === 0) return 'revision request names no target'
  }
  return null
})

check('advisory findings produce no revision request', () => {
  const graph = mutated((g) => {
    find(g.gaps, 'GAP-003').searchAlreadyAttempted = ['Pre-tour reporting']
  })
  const review = reviewXRayGraph(graph, { reviewedAt: AT })
  const advisory = review.findings.filter((f) => f.severity === 'ADVISORY')
  if (advisory.length === 0) return 'no advisory finding produced'
  const wrong = advisory.filter((f) => review.revisionRequests.some((r) => r.findingId === f.id))
  return wrong.length ? `${wrong.length} advisory finding(s) routed a revision` : null
})

check('every finding is tied to canonical ids present in the graph', () => {
  const graph = mutated((g) => {
    find(g.findings, 'FND-C002').status = 'ESTABLISHED'
    find(g.findings, 'FND-C004').status = 'ESTABLISHED'
  })
  const review = reviewXRayGraph(graph, { reviewedAt: AT })
  if (review.findings.length === 0) return 'no findings to inspect'
  const known = new Set<string>([
    ...graph.claims.map((c) => c.id),
    ...graph.sources.map((s) => s.id),
    ...graph.evidence.map((e) => e.id),
    ...graph.evidenceProvenance.map((p) => p.id),
    ...graph.discrepancies.map((d) => d.id),
    ...graph.disconfirmations.map((d) => d.id),
    ...graph.findings.map((f) => f.id),
    ...graph.gaps.map((g2) => g2.id),
  ])
  const dangling: string[] = []
  for (const f of review.findings)
    for (const target of f.targets) if (!known.has(target.id)) dangling.push(target.id)
  return dangling.length ? `dangling target ids: ${[...new Set(dangling)].join(', ')}` : null
})

// ---------------------------------------------------------------------------
// Capability honesty (D4)
// ---------------------------------------------------------------------------

check('model-dependent checks report NOT_EVALUATED, never a pass', () => {
  const review = reviewXRayGraph(canonical, { reviewedAt: AT })
  const port = review.checks.filter((c) => c.capability === 'MODEL_ASSISTED')
  if (port.length !== PORT_DEPENDENT_CHECKS.length)
    return `${port.length} model-assisted checks reported, expected ${PORT_DEPENDENT_CHECKS.length}`
  const wrong = port.filter((c) => c.outcome !== 'NOT_EVALUATED')
  if (wrong.length) return `${wrong.map((c) => c.checkId).join(', ')} reported as evaluated`
  const unexplained = port.filter(
    (c) => !c.notEvaluatedReason || c.notEvaluatedReason.trim().length < 40,
  )
  return unexplained.length ? 'a NOT_EVALUATED check gives no reason' : null
})

check('capability is reported as partial while the port is unwired', () => {
  const review = reviewXRayGraph(canonical, { reviewedAt: AT })
  if (review.summary.fullCapability) return 'claims full capability with no model wired'
  if (review.summary.checksNotEvaluated !== PORT_DEPENDENT_CHECKS.length)
    return `notEvaluated=${review.summary.checksNotEvaluated}`
  if (review.summary.checksEvaluated !== DETERMINISTIC_CHECKS.length)
    return `evaluated=${review.summary.checksEvaluated}`
  return null
})

check('supplying a model does not fake evaluation in this build', () => {
  // #4 wires no provider. A model object must not flip checks to EVALUATED.
  const review = reviewXRayGraph(canonical, {
    reviewedAt: AT,
    model: {
      name: 'stub',
      judge: async () => {
        throw new Error('no provider is wired in #4')
      },
    },
  })
  const port = review.checks.filter((c) => c.capability === 'MODEL_ASSISTED')
  const wrong = port.filter((c) => c.outcome !== 'NOT_EVALUATED')
  if (wrong.length) return 'a model object alone flipped checks to EVALUATED'
  return review.summary.fullCapability ? 'claims full capability with no provider execution' : null
})

check('no deterministic check claims to cover a port-dependent judgment', () => {
  const portIds = new Set(PORT_DEPENDENT_CHECKS.map((c) => c.checkId))
  const overlap = DETERMINISTIC_CHECKS.filter((c) => portIds.has(c.checkId))
  return overlap.length
    ? `${overlap.map((c) => c.checkId).join(', ')} exists in both sets`
    : null
})

// ---------------------------------------------------------------------------
// Re-review and history
// ---------------------------------------------------------------------------

check('re-review after revision preserves prior review evidence', () => {
  const bad = mutated((g) => {
    find(g.findings, 'FND-C004').status = 'ESTABLISHED'
  })
  const round1 = reviewXRayGraph(bad, { reviewedAt: AT })
  if (round1.summary.blockingFindings === 0) return 'round 1 found nothing to revise'

  let history = appendReviewRound(emptyReviewHistory(canonical.investigation.id), round1)

  // The revision: re-grade as the review asked.
  const revised = canonical
  const round2 = reviewXRayGraph(revised, { reviewedAt: '2026-09-18T01:00:00Z' })
  history = appendReviewRound(history, round2)

  if (history.rounds.length !== 2) return `history has ${history.rounds.length} round(s)`
  if (history.rounds[0].result.summary.blockingFindings === 0)
    return 'round 1 evidence was erased by the second round'
  if (history.rounds[0].round !== 1 || history.rounds[1].round !== 2)
    return 'rounds are not sequentially numbered'
  if (!latestRoundIsClear(history)) return 'latest round is not clear after revision'
  if (!roundsConcernDistinctGraphs(history))
    return 'both rounds reviewed the same graph state, so nothing was actually revised'
  return null
})

check('history rejects a result from a different investigation', () => {
  const review = reviewXRayGraph(canonical, { reviewedAt: AT })
  try {
    appendReviewRound(emptyReviewHistory('SOME-OTHER-ID'), review)
    return 'accepted a result from another investigation'
  } catch {
    return null
  }
})

check('a re-review of unrevised state is visible as such', () => {
  const bad = mutated((g) => {
    find(g.findings, 'FND-C004').status = 'ESTABLISHED'
  })
  let history = emptyReviewHistory(canonical.investigation.id)
  history = appendReviewRound(history, reviewXRayGraph(bad, { reviewedAt: AT }))
  history = appendReviewRound(
    history,
    reviewXRayGraph(bad, { reviewedAt: '2026-09-18T02:00:00Z' }),
  )
  return roundsConcernDistinctGraphs(history)
    ? 'two rounds over identical state look like distinct graphs'
    : null
})

// ---------------------------------------------------------------------------
// Corpus coverage and independence
// ---------------------------------------------------------------------------

check('every failure mode FM-001..006 is referenced by some check', () => {
  const covered = new Set([
    ...DETERMINISTIC_CHECKS.map((c) => c.failureMode),
    ...PORT_DEPENDENT_CHECKS.map((c) => c.failureMode),
  ])
  const missing = (['FM-001', 'FM-002', 'FM-003', 'FM-004', 'FM-005', 'FM-006'] as const).filter(
    (id) => !covered.has(id),
  )
  return missing.length ? `uncovered: ${missing.join(', ')}` : null
})

check('every calibration case CAL-001..006 is referenced by some check', () => {
  const covered = new Set([
    ...DETERMINISTIC_CHECKS.flatMap((c) => c.calibrationCases),
    ...PORT_DEPENDENT_CHECKS.flatMap((c) => c.calibrationCases),
  ])
  const missing = (
    ['CAL-001', 'CAL-002', 'CAL-003', 'CAL-004', 'CAL-005', 'CAL-006'] as const
  ).filter((id) => !covered.has(id))
  return missing.length ? `uncovered: ${missing.join(', ')}` : null
})

check('D8 · Reviewer does not import validator warnings as findings', () => {
  // The validator emits no warnings today, so the strong form of this check is
  // structural: no reviewer finding may carry a validator violation code.
  const graph = mutated((g) => {
    find(g.findings, 'FND-C002').status = 'ESTABLISHED'
  })
  const validation = validateXRayGraph(graph)
  const review = reviewXRayGraph(graph, { validation, reviewedAt: AT })
  const validatorCodes = new Set(validation.violations.map((v) => v.code as string))
  const imported = review.findings.filter((f) => validatorCodes.has(f.checkId))
  return imported.length ? `${imported.length} finding(s) mirror a validator code` : null
})

check('review is reproducible for identical input', () => {
  const a = reviewXRayGraph(canonical, { reviewedAt: AT })
  const b = reviewXRayGraph(canonical, { reviewedAt: AT })
  return JSON.stringify(a) === JSON.stringify(b) ? null : 'two runs over one graph differ'
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
const width = Math.max(...results.map((r) => r.name.length))

console.log('\nX-Ray Reviewer — adversarial checks\n' + '='.repeat(width + 8))
for (const r of results) {
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
}
console.log('='.repeat(width + 8))
console.log(`${results.length - failed.length}/${results.length} passed`)

const sample: ReviewResult = reviewXRayGraph(canonical, { reviewedAt: AT })
console.log(
  `\nCapability: ${sample.summary.checksEvaluated} deterministic evaluated, ` +
    `${sample.summary.checksNotEvaluated} model-assisted NOT_EVALUATED (port unwired, #6).\n`,
)

if (failed.length) process.exit(1)
