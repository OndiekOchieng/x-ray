/**
 * Selector / projection checks against XRAY-KE-001.
 *
 * These assert that the query layer preserves the judgments the calibration
 * corpus records. Each check names the case it protects.
 *
 * This is NOT the general invariant validator. It makes no epistemic rulings;
 * it asserts that reading the graph through selectors and projections yields
 * what the graph actually says.
 *
 * Run:  pnpm check:query      (assumes types already checked)
 *       pnpm check:fixtures   (typecheck + fixture integrity + these)
 */

import { xrayKe001Graph as graph } from './fixtures/xray-ke-001/graph'
import * as S from './selectors'
import * as P from './projections'
import { claims } from './fixtures/xray-ke-001/claims'
import { sources } from './fixtures/xray-ke-001/sources'
import { evidence } from './fixtures/xray-ke-001/evidence'
import { gaps } from './fixtures/xray-ke-001/gaps'
import { discrepancies } from './fixtures/xray-ke-001/discrepancies'
import { sourceDependencies } from './fixtures/xray-ke-001/source-dependencies'

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

const eq = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? null : `${label}: expected ${expected}, got ${actual}`

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join(',')

// ---------------------------------------------------------------------------
// CAL-001 — different measurement is not contradiction
// ---------------------------------------------------------------------------

check('CAL-001 · C003 evidence partitions SUPPORTS/CHALLENGES/CONTEXTUALIZES', () => {
  const s = S.supportingEvidenceForClaim(graph, 'C003')
  const c = S.challengingEvidenceForClaim(graph, 'C003')
  const x = S.contextualEvidenceForClaim(graph, 'C003')
  return (
    eq('supporting', s.length, 0) ??
    eq('challenging', c.length, 6) ??
    eq('contextual', x.length, 3) ??
    eq('partition covers all evidence', s.length + c.length + x.length, S.evidenceForClaim(graph, 'C003').length)
  )
})

check('CAL-001 · C003 has no CONTRADICTS evidence', () => {
  const contra = S.contradictingEvidenceForClaim(graph, 'C003')
  return contra.length === 0 ? null : `found ${ids(contra)}`
})

check('CAL-001 · C003 FindingView is INSUFFICIENT_EVIDENCE and exposes GAP-002', () => {
  const v = P.findingViewForClaim(graph, 'C003')
  if (!v) return 'no finding view'
  if (v.status !== 'INSUFFICIENT_EVIDENCE') return `status ${v.status}`
  if (v.confidence !== 'HIGH') return `confidence ${v.confidence}`
  if (!v.gaps.some((g) => g.gapId === 'GAP-002')) return `gaps ${v.gaps.map((g) => g.gapId)}`
  if (v.contradicting.length) return `contradicting not empty: ${v.contradicting.length}`
  return null
})

check('CAL-001 · C003 claim and evidence measurements are not comparable', () => {
  const claim = S.measurementForClaim(graph, 'C003')
  if (!claim) return 'C003 carries no measurement'
  const overlapping = S.evidenceMeasurementsForClaim(graph, 'C003').filter(
    (m) => m.measurement.metric === claim.metric && m.measurement.denominator === claim.denominator,
  )
  return overlapping.length === 0 ? null : `comparable: ${overlapping.map((m) => m.evidenceId)}`
})

check('CAL-001 · DC001 stays distinct from C003 and IS measurement-compatible', () => {
  const c3 = S.claimById(graph, 'C003')
  const dc1 = S.claimById(graph, 'DC001')
  if (!c3 || !dc1) return 'missing claim'
  if (c3.id === dc1.id) return 'ids collide'
  if (dc1.origin !== 'DISCOVERED') return `DC001 origin ${dc1.origin}`
  if (c3.text === dc1.text) return 'claim texts identical'
  const f = P.findingViewForClaim(graph, 'DC001')
  if (f?.status !== 'SUPPORTED') return `DC001 finding ${f?.status}`
  const compatible = S.evidenceMeasurementsForClaim(graph, 'DC001').filter(
    (m) => m.measurement.metric === dc1.measurement?.metric,
  )
  return compatible.length > 0 ? null : 'DC001 has no measurement-compatible evidence'
})

// ---------------------------------------------------------------------------
// CAL-002 — different scope is not contradiction
// ---------------------------------------------------------------------------

check('CAL-002 · 63/122 km projects as DIFFERENT_SCOPE, not a contradiction', () => {
  const views = P.discrepancyViewsForClaim(graph, 'C001')
  const d = views.find((v) => v.discrepancyId === 'DISC-001')
  if (!d) return 'DISC-001 not projected for C001'
  if (d.classification !== 'DIFFERENT_SCOPE') return `classification ${d.classification}`
  if (d.isGenuineContradiction) return 'projected as genuine contradiction'
  if (!d.reconciliation) return 'reconciliation missing'
  return null
})

check('CAL-002 · C001 remains SUPPORTED with contextual evidence surfaced', () => {
  const v = P.findingViewForClaim(graph, 'C001')
  if (v?.status !== 'SUPPORTED') return `status ${v?.status}`
  if (v.confidence !== 'MEDIUM') return `confidence ${v.confidence}`
  return v.contextual.length === 2 ? null : `contextual ${v.contextual.length}`
})

check('CAL-002 · no claim in the graph is graded CONTRADICTED', () => {
  const bad = S.findingsByStatus(graph, 'CONTRADICTED')
  return bad.length === 0 ? null : ids(bad)
})

// ---------------------------------------------------------------------------
// CAL-003 / FM-003 — repetition is not corroboration
// ---------------------------------------------------------------------------

check('CAL-003 · September cluster: 3 publications, 1 originating observation', () => {
  const cluster = S.provenanceClusterForOrigin(graph, 'SRC-017')
  return (
    eq('publicationCount', cluster.publicationCount, 3) ??
    eq('independentOriginCount', cluster.independentOriginCount, 1) ??
    eq('publications', cluster.publicationSourceIds.sort().join(','), 'SRC-018,SRC-019,SRC-020')
  )
})

check('CAL-003 · the same cluster projects with both numbers visible', () => {
  const v = P.provenanceClusterViewForOrigin(graph, 'SRC-017')
  if (v.publicationCount !== 3) return `publicationCount ${v.publicationCount}`
  if (v.independentOriginCount !== 1) return `independentOriginCount ${v.independentOriginCount}`
  if (!/3 publications/.test(v.summaryLabel)) return `label "${v.summaryLabel}"`
  if (!/1 originating observation/.test(v.summaryLabel)) return `label "${v.summaryLabel}"`
  return null
})

check('CAL-003 · independent origins are fewer than sources for C003', () => {
  const p = S.provenanceSummaryForClaim(graph, 'C003')
  if (p.independentOriginCount >= p.sourceCount)
    return `origins ${p.independentOriginCount} >= sources ${p.sourceCount}`
  return null
})

check('FM-003 · no selector or projection is named for corroboration', () => {
  const banned = /\b(corroborationCount|confirmationCount|independentSourceCount|corroborations)\b/
  const exported = [...Object.keys(S), ...Object.keys(P)]
  const bad = exported.filter((n) => banned.test(n))
  return bad.length ? bad.join(',') : null
})

check('FM-003 · provenance summary reports sources and origins together', () => {
  const p = S.provenanceSummaryForClaim(graph, 'C003')
  const keys = Object.keys(p)
  return keys.includes('sourceCount') && keys.includes('independentOriginCount')
    ? null
    : `keys ${keys.join(',')}`
})

check('CAL-003 · provenance is reachable without a claim-id special case', () => {
  // Any claim whose sources carry repetition gets a panel; nothing is gated on
  // a hardcoded id. C003 has repetition; C001 does not.
  const withRepetition = graph.claims.filter(
    (c) => P.provenanceViewForClaim(graph, c.id).hasRepetition,
  )
  if (!withRepetition.some((c) => c.id === 'C003')) return 'C003 shows no repetition'
  if (withRepetition.length === graph.claims.length) return 'every claim flagged — gate is useless'
  return null
})

// ---------------------------------------------------------------------------
// CAL-004 — not located is not nonexistent
// ---------------------------------------------------------------------------

check('CAL-004 · unobtained sources are surfaced, never as non-existence', () => {
  const unobtained = S.unobtainedSources(graph)
  if (unobtained.length !== 4) return `expected 4, got ${unobtained.length}`
  const bad = unobtained.filter((s) => String(s.accessibility) === 'DOES_NOT_EXIST')
  return bad.length ? ids(bad) : null
})

check('CAL-004 · accessibility labels keep NOT_LOCATED and NOT_RETRIEVED distinct', () => {
  const a = P.accessibilityLabel.NOT_LOCATED
  const b = P.accessibilityLabel.NOT_RETRIEVED
  if (a === b) return 'labels identical'
  if (/does not exist|no such/i.test(a + b)) return 'label implies non-existence'
  return null
})

check('CAL-004 · every GapView carries the search actually attempted', () => {
  const bad = gaps
    .map((g) => P.gapView(graph, g))
    .filter((v) => v.searchAlreadyAttempted.length === 0)
  return bad.length ? bad.map((v) => v.gapId).join(',') : null
})

// ---------------------------------------------------------------------------
// CAL-005 — scheduled is not occurred
// ---------------------------------------------------------------------------

check('CAL-005 · C004 projection does not present the claim as occurred', () => {
  const v = P.claimViewById(graph, 'C004')
  if (!v) return 'no claim view'
  const claim = S.claimById(graph, 'C004')!
  if (v.text !== claim.text) return 'projection reworded the claim'
  if (/\b(inspected|occurred|took place|visited the)\b/i.test(v.text))
    return `claim text asserts occurrence: "${v.text}"`
  if (!/scheduled|expected/i.test(v.text)) return 'claim text lost its scheduling scope'
  return null
})

check('CAL-005 · C004 post-event gap is WAIT_FOR_RECORD and not ATI-eligible', () => {
  const g = P.gapViewsForClaim(graph, 'C004').find((x) => x.gapId === 'GAP-003')
  if (!g) return 'GAP-003 not projected for C004'
  if (g.resolutionPath !== 'WAIT_FOR_RECORD') return `path ${g.resolutionPath}`
  if (g.atiEligible) return 'projected as ATI-eligible'
  return null
})

check('CAL-005 · both ATI eligibility branches are reachable', () => {
  const yes = S.atiEligibleGaps(graph).length
  const no = S.nonAtiEligibleGaps(graph).length
  return yes > 0 && no > 0 ? null : `eligible=${yes} ineligible=${no}`
})

// ---------------------------------------------------------------------------
// CAL-006 — unexplained financial bridge remains unresolved
// ---------------------------------------------------------------------------

check('CAL-006 · C002 FindingView exposes DISC-002 and GAP-001', () => {
  const v = P.findingViewForClaim(graph, 'C002')
  if (!v) return 'no finding view'
  if (v.status !== 'UNRESOLVED') return `status ${v.status}`
  if (v.confidence !== 'HIGH') return `confidence ${v.confidence}`
  if (!v.discrepancies.some((d) => d.discrepancyId === 'DISC-002'))
    return `discrepancies ${v.discrepancies.map((d) => d.discrepancyId)}`
  if (!v.gaps.some((g) => g.gapId === 'GAP-001')) return `gaps ${v.gaps.map((g) => g.gapId)}`
  return null
})

check('CAL-006 · the financial discrepancy stays unresolved in projection', () => {
  const d = P.discrepancyViewsForClaim(graph, 'C002').find((x) => x.discrepancyId === 'DISC-002')
  if (!d) return 'DISC-002 missing'
  if (d.resolved) return 'projected as resolved'
  if (d.isGenuineContradiction) return 'projected as genuine contradiction'
  return null
})

check('CAL-006 · confidence is never numeric anywhere in projections', () => {
  const views = graph.claims.map((c) => P.findingViewForClaim(graph, c.id))
  const bad = views.filter((v) => v && typeof (v.confidence as unknown) !== 'string')
  if (bad.length) return `${bad.length} numeric confidences`
  const labels = views.map((v) => v?.confidenceLabel ?? '')
  return labels.some((l) => /%|\d/.test(l)) ? `label contains a number: ${labels}` : null
})

// ---------------------------------------------------------------------------
// XR-INV-001 — surface source isolation
// ---------------------------------------------------------------------------

check('XR-INV-001 · surface source contributes zero corroborating evidence', () => {
  const surface = S.surfaceSource(graph)
  if (!surface) return 'no surface source'
  const fromSurface = S.evidenceForSource(graph, surface.id)
  if (fromSurface.length) return `${ids(fromSurface)} drawn from the surface source`
  const inAnyClaimView = graph.claims.some((c) =>
    P.claimViewById(graph, c.id)!.supporting.some((r) => r.sourceId === surface.id),
  )
  return inAnyClaimView ? 'surface source appears as supporting evidence' : null
})

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

check('derived counts equal canonical array lengths', () => {
  const c = S.graphCounts(graph)
  return (
    eq('claims', c.claims, claims.length) ??
    eq('sources', c.sources, sources.length) ??
    eq('evidence', c.evidence, evidence.length) ??
    eq('gaps', c.gaps, gaps.length) ??
    eq('discrepancies', c.discrepancies, discrepancies.length) ??
    eq('dependencies', c.dependencies, sourceDependencies.length)
  )
})

check('projected counts match derived counts', () => {
  const v = P.investigationView(graph)
  const c = S.graphCounts(graph)
  return (
    eq('claims', v.counts.claims, c.claims) ??
    eq('receipts', v.counts.receipts, c.evidence) ??
    eq('sources', v.counts.sources, c.sources) ??
    eq('openGaps', v.counts.openGaps, c.openGaps)
  )
})

check('no count is stored back into canonical state', () => {
  const countish = /count$/i
  const offenders: string[] = []
  const scan = (label: string, obj: object) => {
    for (const k of Object.keys(obj)) if (countish.test(k)) offenders.push(`${label}.${k}`)
  }
  scan('investigation', graph.investigation)
  claims.forEach((c) => scan(c.id, c))
  sources.forEach((s) => scan(s.id, s))
  evidence.forEach((e) => scan(e.id, e))
  gaps.forEach((g) => scan(g.id, g))
  // The graph aggregate itself must carry no counts either.
  for (const k of Object.keys(graph)) if (countish.test(k)) offenders.push(`graph.${k}`)
  return offenders.length ? offenders.join(',') : null
})

check('projections do not mutate canonical state', () => {
  const before = JSON.stringify({ claims, evidence, gaps })
  P.claimViews(graph).forEach((v) => v.entities.push('MUTATION PROBE'))
  P.investigationView(graph)
  P.libraryEntryView(graph)
  const after = JSON.stringify({ claims, evidence, gaps })
  return before === after ? null : 'canonical arrays changed'
})

// ---------------------------------------------------------------------------
// Lookup convention
// ---------------------------------------------------------------------------

check('unknown ids return undefined, never a fabricated fallback', () => {
  const misses = [
    S.claimById(graph, 'C999'),
    S.sourceById(graph, 'SRC-999'),
    S.evidenceById(graph, 'EV-999'),
    S.gapById(graph, 'GAP-999'),
    S.discrepancyById(graph, 'DISC-999'),
    S.findingById(graph, 'FND-999'),
    S.findingForClaim(graph, 'C999'),
  ]
  const bad = misses.filter((m) => m !== undefined)
  return bad.length ? `${bad.length} lookups returned an object` : null
})

check('resolving a dangling id throws rather than rendering blank', () => {
  try {
    S.requireEntity(S.evidenceById(graph, 'EV-999'), 'Evidence', 'EV-999')
    return 'requireEntity did not throw'
  } catch (err) {
    return err instanceof S.GraphIntegrityError ? null : `threw ${(err as Error).name}`
  }
})

// ---------------------------------------------------------------------------
// ReceiptView
// ---------------------------------------------------------------------------

check('one Source yields several ReceiptViews', () => {
  const receipts = P.receiptViewsForSource(graph, 'SRC-018')
  if (receipts.length < 2) return `SRC-018 yielded ${receipts.length}`
  const relationships = new Set(receipts.map((r) => r.relationship))
  return relationships.size > 1 ? null : 'all receipts share one relationship'
})

check('ReceiptView marks evidence drawn from unobtained records', () => {
  const held = new Set(S.obtainedSources(graph).map((s) => s.id))
  const bad = evidence.filter((e) => !held.has(e.sourceId))
  if (bad.length) return `${ids(bad)} quote an unobtained record`
  const anyReceipt = P.receiptViewsForClaim(graph, 'C003')[0]
  return anyReceipt?.wasObtained === true ? null : 'wasObtained not set'
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
const width = Math.max(...results.map((r) => r.name.length))

console.log('\nXRAY-KE-001 selector / projection checks\n' + '='.repeat(width + 8))
for (const r of results) {
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  → ' + r.detail}`)
}
console.log('='.repeat(width + 8))
console.log(`${results.length - failed.length}/${results.length} passed\n`)

if (failed.length) process.exit(1)
