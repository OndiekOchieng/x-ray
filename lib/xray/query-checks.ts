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
import { readFileSync, readdirSync } from 'node:fs'

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
const list = (xs: string[]) => xs.join('; ')

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

check('CAL-003 · confirmed independent origins are fewer than sources for C003', () => {
  const p = S.claimProvenanceSummary(graph, 'C003')
  if (p.independentOriginCount >= p.sourceCount)
    return `origins ${p.independentOriginCount} >= sources ${p.sourceCount}`
  return null
})

// --- Slice 4.1 regression: evidence-level provenance -----------------------

check('REGRESSION · DC001 no longer inherits an unrelated origin from SRC-018', () => {
  // SRC-018 is multi-origin: it reproduces the September ministry release AND
  // carries lot values tracing to the 2021 award notice (SRC-002). DC001 rests
  // only on the progress figures, so SRC-002 must not count for it.
  const origins = S.independentEvidenceOriginsForClaim(graph, 'DC001')
  const ids = origins.filter((o) => o.kind === 'SOURCE').map((o) => (o as { sourceId: string }).sourceId)
  if (ids.includes('SRC-002')) return `SRC-002 still counted: ${ids.join(',')}`
  if (!ids.includes('SRC-017')) return `SRC-017 missing: ${ids.join(',')}`
  // The document-lineage view still sees both, which is correct for documents.
  const lineage = S.sourceLineageOriginsForClaim(graph, 'DC001')
    .filter((o) => o.kind === 'SOURCE')
    .map((o) => (o as { sourceId: string }).sourceId)
  return lineage.includes('SRC-002') ? null : 'document lineage lost SRC-002'
})

check('REGRESSION · confirmed origins never exceed sources for any claim', () => {
  const bad: string[] = []
  for (const claim of graph.claims) {
    const p = S.claimProvenanceSummary(graph, claim.id)
    if (p.independentOriginCount > p.sourceCount)
      bad.push(`${claim.id}: ${p.independentOriginCount} origins > ${p.sourceCount} sources`)
  }
  return bad.length ? list(bad) : null
})

check('REGRESSION · one multi-origin source does not spread origins across claims', () => {
  // Every claim drawing on SRC-018 must see only the origins of the
  // propositions it actually uses.
  const bad: string[] = []
  for (const claim of graph.claims) {
    const used = evidence.filter(
      (e) => e.sourceId === 'SRC-018' && e.claimIds.some((c) => c === claim.id),
    )
    if (used.length === 0) continue
    const expected = new Set(
      used
        .map((e) => S.originForEvidence(graph, e.id))
        .filter((r) => r.status === 'RESOLVED')
        .map((r) => S.originKey((r as { origin: S.OriginRef }).origin)),
    )
    const actual = new Set(
      S.independentEvidenceOriginsForClaim(graph, claim.id).map(S.originKey),
    )
    for (const key of expected) if (!actual.has(key)) bad.push(`${claim.id} lost ${key}`)
    // SRC-002 may only appear where a proposition actually traces to it.
    const usesAward = [...expected].includes('SOURCE:SRC-002')
    if (!usesAward && actual.has('SOURCE:SRC-002')) {
      const viaOther = evidence.some(
        (e) =>
          e.sourceId !== 'SRC-018' &&
          e.claimIds.some((c) => c === claim.id) &&
          S.originKey(
            (S.originForEvidence(graph, e.id) as { origin?: S.OriginRef }).origin ?? {
              kind: 'UNIDENTIFIED',
              description: '',
              viaDependencyId: 'x',
            },
          ) === 'SOURCE:SRC-002',
      )
      if (!viaOther) bad.push(`${claim.id} gained SRC-002 spuriously`)
    }
  }
  return bad.length ? list(bad) : null
})

check('REGRESSION · unresolved provenance is never counted as independence', () => {
  const bad: string[] = []
  for (const e of evidence) {
    const r = S.originForEvidence(graph, e.id)
    if (r.status !== 'UNRESOLVED') continue
    // An unresolved proposition must not put its own source into any claim's
    // confirmed origin set by way of that evidence.
    for (const claimId of e.claimIds) {
      const origins = S.independentEvidenceOriginsForClaim(graph, claimId)
      const viaOther = evidence.some(
        (other) =>
          other.id !== e.id &&
          other.sourceId === e.sourceId &&
          other.claimIds.some((c) => c === claimId) &&
          S.originForEvidence(graph, other.id).status === 'RESOLVED',
      )
      if (
        !viaOther &&
        origins.some((o) => o.kind === 'SOURCE' && o.sourceId === e.sourceId)
      )
        bad.push(`${e.id} (${e.sourceId}) counted for ${claimId}`)
    }
  }
  return bad.length ? list(bad) : null
})

check('REGRESSION · claim-level counts come from evidence provenance, not lineage', () => {
  // The two layers must be able to disagree; if they never do, the fix is
  // inert. DC001 is the case where they differ.
  const lineage = S.sourceLineageOriginsForClaim(graph, 'DC001').length
  const evidenceLevel = S.claimProvenanceSummary(graph, 'DC001').independentOriginCount
  return lineage !== evidenceLevel
    ? null
    : `both layers report ${lineage}; the evidence-level path may be inert`
})

check('a partially-resolved claim offers no precise independence count', () => {
  const bad: string[] = []
  for (const claim of graph.claims) {
    const v = P.provenanceViewForClaim(graph, claim.id).independence
    if (!v.isResolved && v.summaryLabel !== undefined)
      bad.push(`${claim.id} states a count while unresolved`)
    if (!v.isResolved && !v.unresolvedLabel) bad.push(`${claim.id} has no unresolved label`)
    if (v.isResolved && !v.summaryLabel) bad.push(`${claim.id} resolved but unlabelled`)
  }
  return bad.length ? list(bad) : null
})

check('FM-003 · no selector or projection is named for corroboration', () => {
  const banned = /\b(corroborationCount|confirmationCount|independentSourceCount|corroborations)\b/
  const exported = [...Object.keys(S), ...Object.keys(P)]
  const bad = exported.filter((n) => banned.test(n))
  return bad.length ? bad.join(',') : null
})

check('FM-003 · claim summary reports sources and confirmed origins together', () => {
  const p = S.claimProvenanceSummary(graph, 'C003')
  const keys = Object.keys(p)
  for (const required of [
    'sourceCount',
    'independentOriginCount',
    'unresolvedEvidenceCount',
    'isIndependenceResolved',
  ])
    if (!keys.includes(required)) return `missing ${required}`
  // The document-lineage summary must NOT carry a field named as if it were
  // corroboration; that name now says what it is.
  const lineage = Object.keys(S.provenanceSummaryForClaim(graph, 'C003'))
  return lineage.includes('independentOriginCount')
    ? 'lineage summary still exposes independentOriginCount'
    : null
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
// UI migration boundary (Slice 4)
//
// The dependency direction is graph -> selectors -> projections -> pages ->
// components. These checks assert the UI stays on the right side of it.
// ---------------------------------------------------------------------------

const UI_ROOTS = ['app', 'components']

function uiFiles(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  const walk = (dir: URL, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`)
      else if (/\.tsx?$/.test(entry.name))
        out.push({
          path: `${prefix}${entry.name}`,
          text: readFileSync(new URL(entry.name, dir), 'utf8'),
        })
    }
  }
  for (const root of UI_ROOTS) walk(new URL(`../../${root}/`, import.meta.url), `${root}/`)
  return out
}

const UI = uiFiles()

/**
 * Source with comments removed.
 *
 * These checks look for patterns in CODE. Several migrated components
 * document what was removed — the old `selected.id` gate, the hardcoded gap
 * route, the single-param route lock — and that documentation is worth
 * keeping. A check that could not tell code from prose would force it deleted.
 */
const uiCode = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const UI_CODE = UI.map((f) => ({ path: f.path, text: uiCode(f.text) }))

check('UI imports no canonical fixture module directly', () => {
  const bad = UI_CODE.filter((f) => /from ['"]@?\/?(\.\.\/)*lib\/xray\/fixtures/.test(f.text))
  return bad.length ? bad.map((f) => f.path).join(',') : null
})

check('UI imports no selector module directly', () => {
  // Components consume projections. Pages consume the loader seam.
  const bad = UI_CODE.filter((f) => /from ['"]@\/lib\/xray\/selectors/.test(f.text))
  return bad.length ? bad.map((f) => f.path).join(',') : null
})

check('legacy fixture and domain types are gone and unreferenced', () => {
  const bad = UI_CODE.filter((f) => /@\/lib\/(data|types)\b/.test(f.text))
  if (bad.length) return `still imported by ${bad.map((f) => f.path).join(',')}`
  for (const legacy of ['../../lib/data/fixture.ts', '../../lib/types/index.ts', '../../lib/types/gaps.ts']) {
    try {
      readFileSync(new URL(legacy, import.meta.url))
      return `${legacy} still exists`
    } catch {
      /* expected */
    }
  }
  return null
})

check('no fixture-id gate remains in the UI', () => {
  // e.g. `selected.id === 'claim-2'`, the v0 provenance gate.
  const gate = /(id|claimId)\s*===\s*['"](claim-\d+|C\d{3}|DC\d+)['"]/
  const bad = UI_CODE.filter((f) => gate.test(f.text))
  return bad.length ? bad.map((f) => f.path).join(',') : null
})

check('no hardcoded gap route remains', () => {
  const bad = UI_CODE.filter((f) => /\/gap\/GAP-\d+/.test(f.text))
  return bad.length ? bad.map((f) => f.path).join(',') : null
})

check('no hardcoded investigation id remains outside the loader seam', () => {
  const bad = UI_CODE.filter(
    (f) => /XRAY-KE-001/.test(f.text) && !/source-input/.test(f.path),
  )
  return bad.length ? bad.map((f) => f.path).join(',') : null
})

check('dynamic routes consume their id param', () => {
  const dynamic = UI_CODE.filter((f) => /^app\/.*\[id\]\/page\.tsx$/.test(f.path))
  if (dynamic.length !== 3) return `expected 3 dynamic routes, found ${dynamic.length}`
  const bad = dynamic.filter((f) => !/await params/.test(f.text) || !/\bid\b/.test(f.text))
  if (bad.length) return `${bad.map((f) => f.path).join(',')} ignore their param`
  const notFound = dynamic.filter((f) => !/notFound\(\)/.test(f.text))
  return notFound.length ? `${notFound.map((f) => f.path).join(',')} lack a not-found branch` : null
})

check('no route locks itself to a single investigation', () => {
  const bad = UI_CODE.filter((f) => /dynamicParams\s*=\s*false/.test(f.text))
  return bad.length ? bad.map((f) => f.path).join(',') : null
})

check('the v0 hardcoded summary numbers are gone', () => {
  const completion = UI_CODE.find((f) => /completion-state\.tsx$/.test(f.path))
  const card = UI_CODE.find((f) => /cached-xray-card\.tsx$/.test(f.path))
  if (!completion || !card) return 'component missing'
  const bad: string[] = []
  if (/>\s*11\s*</.test(completion.text) || /source dependencies/.test(completion.text))
    bad.push('completion-state')
  if (/>\s*(5|11|2)\s*</.test(card.text)) bad.push('cached-xray-card')
  return bad.length ? bad.join(',') : null
})

check('no numeric confidence is rendered', () => {
  const bad = UI_CODE.filter((f) => /confidence \* 100|% confidence|Math\.round\(.*confidence/.test(f.text))
  return bad.length ? bad.map((f) => f.path).join(',') : null
})

check('resolution path is not user-editable state', () => {
  const bad = UI_CODE.filter((f) => /setGap\(|resolutionPath:\s*path/.test(f.text))
  return bad.length ? bad.map((f) => f.path).join(',') : null
})

check('FM-003 · the unsafe claim-level API is gone, not merely unused', () => {
  // Slice 4.1 replaced source-level claim independence with evidence-level
  // provenance. The old name must not survive, or a caller could silently
  // reach for the unsafe method again.
  const source = readFileSync(new URL('./selectors/provenance.ts', import.meta.url), 'utf8')
  if (/export function independentOriginsForClaim/.test(source))
    return 'independentOriginsForClaim still exported'
  if (!/sourceLineageOriginsForClaim/.test(source))
    return 'the lineage-scoped replacement is missing'
  if (!/independentEvidenceOriginsForClaim/.test(source))
    return 'the evidence-level replacement is missing'
  return null
})

check('per-cluster provenance ratios never overstate independence', () => {
  for (const claim of graph.claims) {
    for (const cluster of P.provenanceViewForClaim(graph, claim.id).clusters) {
      if (cluster.independentOriginCount !== 1) return `${claim.id} cluster origin count != 1`
      if (cluster.publicationCount < 0) return `${claim.id} negative publication count`
    }
  }
  return null
})

// ---------------------------------------------------------------------------
// ATI drafting
// ---------------------------------------------------------------------------

check('CAL-005 · GAP-003 produces no ATI draft', () => {
  const gap = P.gapView(graph, gaps.find((g) => g.id === 'GAP-003')!)
  if (gap.atiEligible) return 'GAP-003 is marked eligible'
  return P.atiDraftFor(gap) === null ? null : 'a draft was composed for an ineligible gap'
})

check('an eligible gap drafts, labelled DRAFT and not submitted', () => {
  const gap = P.gapView(graph, gaps.find((g) => g.id === 'GAP-001')!)
  const draft = P.atiDraftFor(gap)
  if (!draft) return 'no draft for an eligible gap'
  if (draft.status !== 'DRAFT') return `status ${draft.status}`
  if (!/NOT been submitted/i.test(draft.submissionDisclaimer)) return 'no submission disclaimer'
  return null
})

check('an inferred custodian is never drafted as confirmed', () => {
  const gap = P.gapView(graph, gaps.find((g) => g.id === 'GAP-001')!)
  const draft = P.atiDraftFor(gap)!
  if (!draft.holderIsInferred) return 'GAP-001 custody is not marked inferred'
  return /has not confirmed/i.test(draft.body) ? null : 'draft body implies confirmed custody'
})

check('a draft requests only records the gap names', () => {
  for (const g of gaps) {
    const view = P.gapView(graph, g)
    const draft = P.atiDraftFor(view)
    if (!draft) continue
    for (const record of view.recordsSought)
      if (!draft.body.includes(record)) return `${g.id} draft omits "${record}"`
  }
  return null
})

// ---------------------------------------------------------------------------
// Responsible sharing
// ---------------------------------------------------------------------------

check('gap share wording describes the record, never conduct', () => {
  const accusatory = /\b(cannot explain|refuses|concealed|hiding|misused|failed to account|corrupt)\b/i
  for (const g of gaps) {
    const share = P.gapShareView(P.gapView(graph, g), { investigatedAt: '2026-09-13' })
    if (accusatory.test(share.shareText)) return `${g.id}: "${share.shareText}"`
    if (!/not evidence of wrongdoing/i.test(share.shareText))
      return `${g.id} share text omits the responsibility note`
  }
  return null
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
