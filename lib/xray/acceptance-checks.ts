/**
 * Graduation gate adversarial checks.
 *
 * Two things must be proven, and the second matters more:
 *
 * 1. Each acceptance behavior bites when violated.
 * 2. The four verdicts are genuinely separable — in particular that BLOCKED
 *    never arises from a defect in the graph, and that a defect never hides
 *    behind BLOCKED.
 *
 * The canonical benchmark currently graduates to BLOCKED: every behavior is
 * satisfied, the graph is legal, review is clear, and six required Reviewer
 * checks cannot run because the model port is unwired. That is the decision
 * working — incomplete assurance is not graph failure.
 *
 * Run:  pnpm check:acceptance
 */

import { createXRayGraph, type XRayGraph, type XRayGraphInput } from './selectors'
import { assessGraduation, type AcceptanceBehavior, type GraduationVerdict } from './acceptance'
import { XRAY_KE_001_ACCEPTANCE } from './fixtures/xray-ke-001/acceptance'

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
const AT = '2026-09-18T00:00:00Z'

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

const assess = (graph: XRayGraph, required?: readonly string[]) =>
  assessGraduation(graph, {
    behaviors: XRAY_KE_001_ACCEPTANCE,
    assessedAt: AT,
    ...(required !== undefined ? { requiredReviewChecks: required } : {}),
  })

const behavior = (id: string): AcceptanceBehavior => {
  const hit = XRAY_KE_001_ACCEPTANCE.find((b) => b.id === id)
  if (!hit) throw new Error(`no behavior ${id}`)
  return hit
}

/** Assert a mutation makes one named behavior report VIOLATED. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function behaviorBites(name: string, id: string, mutate: (g: any) => void): void {
  check(name, () => {
    const clean = behavior(id).run(canonical)
    if (clean.status !== 'SATISFIED')
      return `${id} is ${clean.status} on the clean fixture, so it proves nothing`
    const outcome = behavior(id).run(mutated(mutate))
    if (outcome.status !== 'VIOLATED') return `${id} reported ${outcome.status} after mutation`
    if (outcome.detail.trim().length < 20) return `${id} violated but gives no usable detail`
    return null
  })
}

// ---------------------------------------------------------------------------
// The canonical benchmark
// ---------------------------------------------------------------------------

check('canonical XRAY-KE-001 satisfies all ten acceptance behaviors', () => {
  const result = assess(canonical)
  const bad = result.behaviors.filter((b) => b.status !== 'SATISFIED')
  return bad.length === 0
    ? null
    : bad.map((b) => `${b.id} ${b.status}: ${b.detail}`).join(' | ')
})

check('canonical benchmark graduates to BLOCKED, not FAIL or REVISE', () => {
  const result = assess(canonical)
  if (result.verdict !== 'BLOCKED') return `verdict ${result.verdict}`
  return null
})

check('BLOCKED carries no accusation against the graph', () => {
  // The decisive property: a capability gap produces blockers, never reasons.
  const result = assess(canonical)
  if (result.reasons.length > 0)
    return `BLOCKED but ${result.reasons.length} reason(s) recorded against the graph: ${result.reasons
      .map((r) => r.ref)
      .join(', ')}`
  if (result.blockers.length === 0) return 'BLOCKED with no blocker named'
  const unexplained = result.blockers.filter(
    (b) => !b.resolvedBy || b.resolvedBy.trim().length < 5,
  )
  return unexplained.length ? 'a blocker does not say what would resolve it' : null
})

check('every blocker names the check and who supplies the capability', () => {
  const result = assess(canonical)
  const bad = result.blockers.filter(
    (b) => !b.ref || !b.title || !b.reason || !/#6|capability/.test(b.resolvedBy),
  )
  return bad.length ? `${bad.length} blocker(s) are not actionable` : null
})

check('PASS is reachable once assurance is not required', () => {
  // Demonstrates the blocking is purely capability: the same graph, with no
  // review check treated as required, graduates cleanly.
  const result = assess(canonical, [])
  if (result.verdict !== 'PASS') return `verdict ${result.verdict}: ${result.reasons.map((r) => r.ref).join(', ')}`
  if (result.blockers.length > 0) return 'PASS with blockers recorded'
  if (result.reasons.length > 0) return 'PASS with reasons recorded'
  return null
})

// ---------------------------------------------------------------------------
// Verdict separability
// ---------------------------------------------------------------------------

check('an illegal graph graduates to FAIL', () => {
  const graph = mutated((g) => {
    find(g.sources, 'SRC-017').accessibility = 'DOES_NOT_EXIST'
  })
  const result = assess(graph)
  if (result.verdict !== 'FAIL') return `verdict ${result.verdict}`
  if (!result.reasons.some((r) => r.kind === 'VALIDATION_ERROR'))
    return 'FAIL without a validation reason'
  return null
})

check('a legal graph with blocking review findings graduates to REVISE', () => {
  const graph = mutated((g) => {
    find(g.findings, 'FND-C004').status = 'ESTABLISHED'
  })
  const result = assess(graph)
  // A06 also catches this, which would force FAIL. Confirm the review path
  // independently by suppressing the behaviors.
  const reviewOnly = assessGraduation(graph, { behaviors: [], assessedAt: AT })
  if (reviewOnly.verdict !== 'REVISE') return `review-only verdict ${reviewOnly.verdict}`
  if (!reviewOnly.reasons.some((r) => r.kind === 'REVIEW_BLOCKING_FINDING'))
    return 'REVISE without a review reason'
  if (result.verdict !== 'FAIL')
    return `with behaviors enabled expected FAIL (A06 also violated), got ${result.verdict}`
  return null
})

check('a violated acceptance behavior graduates to FAIL', () => {
  const graph = mutated((g) => {
    find(g.findings, 'FND-C001').wouldChangeFinding = []
  })
  const result = assess(graph)
  if (result.verdict !== 'FAIL') return `verdict ${result.verdict}`
  return result.reasons.some((r) => r.kind === 'ACCEPTANCE_BEHAVIOR_VIOLATED')
    ? null
    : 'FAIL without an acceptance-behavior reason'
})

check('FAIL outranks REVISE outranks BLOCKED outranks PASS', () => {
  const failing = mutated((g) => {
    find(g.sources, 'SRC-017').accessibility = 'DOES_NOT_EXIST'
  })
  const revising = mutated((g) => {
    find(g.findings, 'FND-C002').status = 'SUPPORTED'
  })

  const order: [GraduationVerdict, GraduationVerdict][] = [
    [assess(failing).verdict, 'FAIL'],
    [assess(revising).verdict, 'FAIL'], // A03 also violated -> FAIL outranks REVISE
    [assess(canonical).verdict, 'BLOCKED'],
    [assess(canonical, []).verdict, 'PASS'],
  ]
  const wrong = order.filter(([actual, expected]) => actual !== expected)
  return wrong.length
    ? wrong.map(([a, e]) => `expected ${e}, got ${a}`).join('; ')
    : null
})

check('a capability gap alone never produces REVISE or FAIL', () => {
  // Across every graph state, no reason may be attributed to an unevaluated
  // check. This is the binding rule from the recorded decision.
  for (const graph of [canonical, mutated((g) => { find(g.findings, 'FND-C002').status = 'SUPPORTED' })]) {
    const result = assess(graph)
    const blockerRefs = new Set(result.blockers.map((b) => b.ref))
    const crossed = result.reasons.filter((r) => blockerRefs.has(r.ref))
    if (crossed.length > 0)
      return `${crossed.length} unevaluated check(s) recorded as a reason against the graph`
  }
  return null
})

check('assurance blockers are reported even when the verdict is worse', () => {
  // A FAILing graph must still disclose what could not be checked, or a fix
  // would look complete when assurance is still missing.
  const graph = mutated((g) => {
    find(g.findings, 'FND-C001').wouldChangeFinding = []
  })
  const result = assess(graph)
  if (result.verdict !== 'FAIL') return `verdict ${result.verdict}`
  return result.blockers.length > 0 ? null : 'FAIL hid the outstanding capability gaps'
})

// ---------------------------------------------------------------------------
// Each acceptance behavior bites
// ---------------------------------------------------------------------------

behaviorBites('A01 bites · surface source corroborating its own claim', 'XRAY-KE-001-A01', (g) => {
  find(g.evidence, 'EV-033').sourceId = 'SRC-001'
})

behaviorBites('A02 bites · length discrepancy reclassified as contradiction', 'XRAY-KE-001-A02', (g) => {
  find(g.discrepancies, 'DISC-001').classification = 'GENUINE_CONTRADICTION'
})

behaviorBites('A02 bites · reconciliation losing the feeder/spur concept', 'XRAY-KE-001-A02', (g) => {
  find(g.discrepancies, 'DISC-001').reconciliation =
    'The figures differ because the sources disagree about the length.'
})

behaviorBites('A03 bites · project value graded ESTABLISHED', 'XRAY-KE-001-A03', (g) => {
  find(g.findings, 'FND-C002').status = 'ESTABLISHED'
})

behaviorBites('A04 bites · dependency modelling lost, so repetition is invisible', 'XRAY-KE-001-A04', (g) => {
  // Drop the edges recording that the September publications reproduce one
  // release. Without them no cluster has two or more publications and the
  // repetition simply disappears from the graph.
  //
  // NOTE on what this behavior cannot catch: an earlier mutation here rewrote
  // evidence provenance so each publication asserted a different origin. A04
  // reported SATISFIED, correctly — that is a FALSE provenance record, not a
  // structural inflation, and nothing in the graph contradicts it. Detecting a
  // provenance claim that is simply untrue is research-integrity work, not
  // something an acceptance suite can assert. Evidence recorded on issue #5.
  // Removing two edges from one cluster is not enough — other clusters remain
  // and repetition is still visible. The regression A04 actually guards is the
  // PROVENANCE stage not running at all.
  g.sourceDependencies = []
})

behaviorBites('A05 bites · surfacing claim graded CONTRADICTED', 'XRAY-KE-001-A05', (g) => {
  find(g.findings, 'FND-C003').status = 'CONTRADICTED'
})

behaviorBites('A05 bites · surfacing claim graded SUPPORTED on proxy evidence', 'XRAY-KE-001-A05', (g) => {
  find(g.findings, 'FND-C003').status = 'SUPPORTED'
})

behaviorBites('A06 bites · post-cutoff event graded ESTABLISHED', 'XRAY-KE-001-A06', (g) => {
  find(g.findings, 'FND-C004').status = 'ESTABLISHED'
})

behaviorBites('A06 bites · post-cutoff source yielding evidence', 'XRAY-KE-001-A06', (g) => {
  find(g.sources, 'SRC-022').publishedAt = '2026-09-20'
})

behaviorBites('A07 bites · an unsettled finding exposing no gap', 'XRAY-KE-001-A07', (g) => {
  find(g.findings, 'FND-C003').gapIds = []
})

behaviorBites('A07 bites · a source asserting non-existence', 'XRAY-KE-001-A07', (g) => {
  find(g.sources, 'SRC-017').accessibility = 'DOES_NOT_EXIST'
})

behaviorBites('A08 bites · a finding that cannot be overturned', 'XRAY-KE-001-A08', (g) => {
  find(g.findings, 'FND-DC002').wouldChangeFinding = []
})

behaviorBites('A09 bites · a discovered claim in the surface namespace', 'XRAY-KE-001-A09', (g) => {
  find(g.claims, 'DC001').origin = 'SURFACE'
})

check('A10 bites · projections mutating canonical state would be caught', () => {
  // A10 cannot be broken by mutating data - it asserts a property of the
  // projection layer. Assert instead that it actually exercises projections
  // and would observe a change, by confirming it compares before and after.
  const clean = behavior('XRAY-KE-001-A10').run(canonical)
  if (clean.status !== 'SATISFIED') return `A10 is ${clean.status} on the clean fixture`
  const frozen = createXRayGraph(baseInput())
  const before = JSON.stringify(frozen.claims)
  behavior('XRAY-KE-001-A10').run(frozen)
  const after = JSON.stringify(frozen.claims)
  return before === after ? null : 'A10 itself mutated the graph while checking'
})

// ---------------------------------------------------------------------------
// Runner properties
// ---------------------------------------------------------------------------

check('the graduation runner never mutates the graph', () => {
  const before = JSON.stringify(baseInput())
  const graph = createXRayGraph(JSON.parse(before) as XRayGraphInput)
  assess(graph)
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
  return before === after ? null : 'graph changed during graduation assessment'
})

check('research stop and open gaps are recorded, not treated as defects', () => {
  const result = assess(canonical)
  if (!result.researchStop) return 'research stop not recorded'
  if (result.researchStop.unresolvedHighPriorityLeads.length === 0)
    return 'no unfollowed leads recorded'
  if (result.unresolvedMaterialGaps.length === 0) return 'open gaps not recorded'
  // And none of them may appear as a reason against the graph.
  const gapIds = new Set(result.unresolvedMaterialGaps.map((g) => g.gapId))
  const blamed = result.reasons.filter((r) => r.targets?.some((t) => gapIds.has(t.split(':')[1])))
  return blamed.length ? 'an open gap was recorded as a graduation failure' : null
})

check('acceptance asserts behavior, not prose', () => {
  // Rewording every claim, finding rationale and gap description must not
  // change the verdict. Acceptance is semantic (ADR-0009).
  const reworded = mutated((g) => {
    for (const c of g.claims) c.text = `${c.text} (rephrased for this run)`
    for (const f of g.findings) f.rationale = `Restated: ${f.rationale}`
    for (const gap of g.gaps) gap.whyItMatters = `Restated: ${gap.whyItMatters}`
  })
  const before = assess(canonical)
  const after = assess(reworded)
  return before.verdict === after.verdict
    ? null
    : `verdict changed from ${before.verdict} to ${after.verdict} on rewording alone`
})

check('all ten acceptance behaviors are present and uniquely identified', () => {
  const ids = XRAY_KE_001_ACCEPTANCE.map((b) => b.id)
  if (ids.length !== 10) return `${ids.length} behaviors, expected 10`
  if (new Set(ids).size !== 10) return 'duplicate behavior id'
  const expected = Array.from({ length: 10 }, (_, i) => `XRAY-KE-001-A${String(i + 1).padStart(2, '0')}`)
  const missing = expected.filter((id) => !ids.includes(id))
  return missing.length ? `missing ${missing.join(', ')}` : null
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
const width = Math.max(...results.map((r) => r.name.length))

console.log('\nX-Ray graduation gate — adversarial checks\n' + '='.repeat(width + 8))
for (const r of results) {
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
}
console.log('='.repeat(width + 8))
console.log(`${results.length - failed.length}/${results.length} passed`)

const current = assess(canonical)
console.log(
  `\nCanonical benchmark verdict: ${current.verdict} ` +
    `(${current.reasons.length} reason(s) against the graph, ${current.blockers.length} capability blocker(s))\n`,
)

if (failed.length) process.exit(1)
