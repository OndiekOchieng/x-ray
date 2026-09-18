/**
 * Adversarial validation checks.
 *
 * The canonical fixture passing proves the validator does not produce false
 * positives. It proves nothing about whether the rules bite — a validator that
 * returns "valid" unconditionally would also pass it.
 *
 * So every deterministic rule is exercised by MUTATING the canonical graph into
 * an illegal one and asserting the specific violation code appears. Each case
 * also asserts the code is ABSENT from the unmutated fixture, so a rule that
 * fires on everything cannot masquerade as a working guard.
 *
 * This matters most for XR-INV-005: the canonical fixture contains no
 * `CONTRADICTS` evidence and no `CONTRADICTED` finding, so the invariant the
 * whole benchmark exists to produce is completely unexercised by the passing
 * case. The mutation below is the acceptance proof that CAL-001 bites.
 *
 * Benchmark ids appear here and nowhere in `lib/xray/validation/**`.
 *
 * Run:  pnpm check:validation
 */

import { readdirSync, readFileSync } from 'node:fs'

import { createXRayGraph, type XRayGraph, type XRayGraphInput } from './selectors'
import { validateXRayGraph, type ValidationMode, type ViolationCode } from './validation'
import { INVARIANT_COVERAGE } from './validation/invariants'

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

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

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

/** Deep structural clone, so a mutation can never reach the canonical arrays. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

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

/**
 * Build an illegal graph.
 *
 * The mutator receives a mutable deep clone. Casts inside mutators are
 * deliberate: several cases inject values the type system says are impossible,
 * which is exactly the runtime data a validator exists to catch when a graph
 * arrives from a model or a store rather than from a typechecked literal.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mutated(mutate: (g: any) => void): XRayGraph {
  const input = baseInput()
  mutate(input)
  return createXRayGraph(input)
}

/** Assert a mutation produces a code the clean fixture does not. */
function bites(
  name: string,
  code: ViolationCode,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutate: (g: any) => void,
  mode: ValidationMode = 'FULL',
): void {
  check(name, () => {
    const clean = validateXRayGraph(canonical, { mode })
    if (clean.violations.some((v) => v.code === code))
      return `${code} already fires on the clean fixture, so it proves nothing`

    const broken = validateXRayGraph(mutated(mutate), { mode })
    const hit = broken.violations.filter((v) => v.code === code)
    if (hit.length === 0)
      return `mutation produced no ${code}; got [${[...new Set(broken.violations.map((v) => v.code))].join(', ') || 'nothing'}]`

    // Every violation must be fully formed: the acceptance criteria require
    // code, targets, severity and a human-readable message on each one.
    const malformed = hit.filter(
      (v) => v.targets.length === 0 || v.message.trim().length < 20 || !v.severity,
    )
    if (malformed.length) return `${code} fired but is malformed (missing targets/message/severity)`
    return null
  })
}

/**
 * Locate an artifact inside a mutable clone.
 *
 * Returns `any` deliberately: mutators exist to write values the domain types
 * forbid, which is precisely the runtime data the validator must catch when a
 * graph arrives from a model or a store rather than a typechecked literal.
 * The looseness is confined to this harness.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const find = (xs: any[], id: string): any => {
  const hit = xs.find((x) => x.id === id)
  if (!hit) throw new Error(`fixture is missing ${id}`)
  return hit
}

// ---------------------------------------------------------------------------
// The clean fixture
// ---------------------------------------------------------------------------

check('canonical XRAY-KE-001 fixture is valid (FULL)', () => {
  const r = validateXRayGraph(canonical)
  return r.valid
    ? null
    : `${r.summary.errorCount} error(s): ${r.violations
        .filter((v) => v.severity === 'ERROR')
        .map((v) => `${v.code} ${v.targets.map((t) => t.id).join('/')}`)
        .join('; ')}`
})

check('canonical fixture is valid in STAGED mode too', () => {
  const r = validateXRayGraph(canonical, { mode: 'STAGED' })
  return r.valid ? null : `${r.summary.errorCount} error(s) in STAGED`
})

check('validator never mutates the candidate graph', () => {
  const before = JSON.stringify(baseInput())
  const graph = createXRayGraph(JSON.parse(before) as XRayGraphInput)
  validateXRayGraph(graph)
  validateXRayGraph(graph, { mode: 'STAGED' })
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
  return before === after ? null : 'graph changed during validation'
})

check('canonical fixture emits no warnings (D3: warnings are hard to earn)', () => {
  const r = validateXRayGraph(canonical)
  return r.summary.warningCount === 0
    ? null
    : `${r.summary.warningCount} warning(s): ${r.violations
        .filter((v) => v.severity === 'WARNING')
        .map((v) => v.code)
        .join(', ')}`
})

// ---------------------------------------------------------------------------
// XR-INV-005 — the required proof (CAL-001)
//
// The fixture has no CONTRADICTS evidence and no CONTRADICTED finding, so
// these mutations are the only evidence the invariant is enforced at all.
// ---------------------------------------------------------------------------

bites(
  'CAL-001 · CONTRADICTS over incompatible measurement is rejected',
  'XR-INV-005/CONTRADICTS_ON_INCOMPATIBLE_MEASUREMENT',
  (g) => {
    // EV-020 measures physical_project_completion / contractual_work.
    // C003 measures surfaced_length / road_sections. This is the exact
    // proxy-measure move CAL-001 describes.
    find(g.evidence, 'EV-020').relationship = 'CONTRADICTS'
  },
)

bites(
  'CAL-001 · CONTRADICTED grade with only incompatible evidence is rejected',
  'XR-INV-005/CONTRADICTED_WITHOUT_COMPATIBLE_EVIDENCE',
  (g) => {
    // Claude graded C003 CONTRADICTED on exactly this evidence. The rule that
    // came out of that disagreement now refuses the grade.
    for (const id of ['EV-020', 'EV-021', 'EV-022']) find(g.evidence, id).relationship = 'CONTRADICTS'
    const finding = find(g.findings, 'FND-C003')
    finding.status = 'CONTRADICTED'
    finding.supportingEvidenceIds = []
  },
)

bites(
  'XR-INV-005 · CONTRADICTED with no contradicting evidence at all is rejected',
  'XR-INV-005/CONTRADICTED_WITHOUT_COMPATIBLE_EVIDENCE',
  (g) => {
    find(g.findings, 'FND-C003').status = 'CONTRADICTED'
  },
)

bites(
  'CAL-002 · GENUINE_CONTRADICTION over incompatible measurement is rejected',
  'XR-INV-005/GENUINE_CONTRADICTION_ON_INCOMPATIBLE_MEASUREMENT',
  (g) => {
    // Scope collapse: reclassifying the measurement mismatch as a contradiction.
    find(g.discrepancies, 'DISC-003').classification = 'GENUINE_CONTRADICTION'
  },
)

check('CAL-001 · a measurement-COMPATIBLE contradiction stays legal', () => {
  // The invariant constrains the measure, not the verdict. DC001 is stated in
  // the metric its evidence carries, so contradiction there is permitted.
  const graph = mutated((g) => {
    find(g.evidence, 'EV-029').relationship = 'CONTRADICTS'
    const finding = find(g.findings, 'FND-DC001')
    finding.supportingEvidenceIds = ['EV-030', 'EV-031']
    finding.challengingEvidenceIds = ['EV-032', 'EV-029']
  })
  const r = validateXRayGraph(graph)
  const wrong = r.violations.filter((v) => v.invariant === 'XR-INV-005')
  return wrong.length === 0
    ? null
    : `compatible contradiction rejected: ${wrong.map((v) => v.code).join(', ')}`
})

check('CAL-001 · UNDETERMINED compatibility produces no violation (D2)', () => {
  // EV-033 carries no measurement; C004 carries no measurement either, so this
  // is NOT_APPLICABLE. Give the claim a measurement to force UNDETERMINED.
  const graph = mutated((g) => {
    find(g.evidence, 'EV-033').relationship = 'CONTRADICTS'
    find(g.claims, 'C004').measurement = { metric: 'inspection_occurred', unit: 'boolean' }
    const finding = find(g.findings, 'FND-C004')
    finding.supportingEvidenceIds = []
    finding.challengingEvidenceIds = ['EV-033']
  })
  const r = validateXRayGraph(graph)
  const inv005 = r.violations.filter((v) => v.invariant === 'XR-INV-005')
  return inv005.length === 0
    ? null
    : `undetermined compatibility produced ${inv005.map((v) => v.code).join(', ')}`
})

// ---------------------------------------------------------------------------
// XR-INV-001 — surface source isolation
// ---------------------------------------------------------------------------

bites(
  'XR-INV-001 · surface source corroborating its own claim is rejected',
  'XR-INV-001/SURFACE_SOURCE_CORROBORATES_OWN_CLAIM',
  (g) => {
    find(g.evidence, 'EV-033').sourceId = 'SRC-001'
    find(g.evidence, 'EV-033').claimIds = ['C004']
  },
)

bites(
  'XR-INV-001 · surface source named as an evidence origin is rejected',
  'XR-INV-001/SURFACE_SOURCE_AS_EVIDENCE_ORIGIN',
  (g) => {
    find(g.evidenceProvenance, 'EP-001').origin = { kind: 'SOURCE', sourceId: 'SRC-001' }
  },
)

// ---------------------------------------------------------------------------
// XR-INV-004 — independence at the proposition level (CAL-003)
// ---------------------------------------------------------------------------

bites(
  'CAL-003 · multi-origin publication without proposition provenance is rejected',
  'XR-INV-004/MULTI_ORIGIN_SOURCE_LACKS_PROPOSITION_PROVENANCE',
  (g) => {
    // SRC-018 depends on two originating records. Drop the provenance that
    // apportions its propositions and its origins become inherited lineage.
    g.evidenceProvenance = g.evidenceProvenance.filter(
      (p: { id: string }) => p.id !== 'EP-012',
    )
  },
)

bites(
  'XR-INV-004 · ambiguous origin (two provenance records for one proposition) is rejected',
  'XR-INV-004/EVIDENCE_HAS_MULTIPLE_ORIGINS',
  (g) => {
    // The data-level path to a fabricated independence: the resolver would
    // silently take the first origin and the graph would assert one it never
    // established.
    g.evidenceProvenance.push({
      id: 'EP-901',
      evidenceId: 'EV-033',
      origin: { kind: 'SOURCE', sourceId: 'SRC-009' },
      relationship: 'ATTRIBUTES_TO',
      confidence: 'HIGH',
    })
  },
)

check('XR-INV-004 · the origins<=evidence bound exists as a resolver-regression guard', () => {
  // HONEST LIMITATION. With a 1:1 resolver this bound cannot be violated by
  // graph data, so no mutation can trigger it. It is retained because the
  // Slice 4.1 bug was a RESOLVER bug — lineage inheritance produced 5 origins
  // from 4 evidence records — and a regression there would trip it. Asserting
  // its presence rather than pretending a data mutation exercises it.
  const source = readFileSync(new URL('./validation/epistemic.ts', import.meta.url), 'utf8')
  if (!source.includes('CONFIRMED_ORIGINS_EXCEED_EVIDENCE'))
    return 'the arithmetic bound was removed'
  const everyClaimHolds = canonical.claims.every((c) => {
    const withProvenance = canonical.evidence.filter((e) => e.claimIds.some((x) => x === c.id))
    return withProvenance.length >= 0
  })
  return everyClaimHolds ? null : 'unexpected'
})

check('XR-INV-004 · one publication relaying two originals stays LEGAL (issue #3 correction)', () => {
  // The counterexample that showed the literal acceptance criterion unsound:
  // 1 source, 2 propositions, 2 genuinely distinct originating records.
  const graph = mutated((g) => {
    find(g.evidenceProvenance, 'EP-021').origin = { kind: 'SOURCE', sourceId: 'SRC-009' }
    find(g.evidenceProvenance, 'EP-022').origin = { kind: 'SOURCE', sourceId: 'SRC-015' }
  })
  const r = validateXRayGraph(graph)
  if (!r.valid)
    return `legitimate relayed-two-originals graph rejected: ${r.violations
      .filter((v) => v.severity === 'ERROR')
      .map((v) => v.code)
      .join(', ')}`
  // It must still be surfaced as a diagnostic.
  return r.violations.some(
    (v) => v.code === 'XR-INV-004/CONFIRMED_ORIGINS_EXCEED_SOURCES' && v.severity === 'WARNING',
  )
    ? null
    : 'legal but not surfaced as a warning, so lineage inheritance would go unnoticed'
})

bites(
  'XR-INV-004 · provenance naming its own source as origin is rejected',
  'XR-INV-004/PROVENANCE_ORIGIN_IS_SELF',
  (g) => {
    find(g.evidenceProvenance, 'EP-012').origin = { kind: 'SOURCE', sourceId: 'SRC-018' }
  },
)

check('CAL-003 · publication count is never converted into independence', () => {
  // The three September publications reproduce one release. Rewriting their
  // provenance so each claims a distinct origin is the source-count-inflation
  // move; independence would then exceed what the records can support.
  const graph = mutated((g) => {
    find(g.evidenceProvenance, 'EP-018').origin = { kind: 'SOURCE', sourceId: 'SRC-019' }
    find(g.evidenceProvenance, 'EP-019').origin = { kind: 'SOURCE', sourceId: 'SRC-020' }
  })
  const r = validateXRayGraph(graph)
  const caught = r.violations.filter(
    (v) => v.code === 'XR-INV-004/PROVENANCE_ORIGIN_IS_SELF',
  )
  return caught.length >= 2
    ? null
    : `inflating publications into origins produced only ${caught.length} violation(s)`
})

check('CAL-003 · UNIDENTIFIED provenance is legal, not an error', () => {
  // C004's evidence traces to an itinerary nobody identified. That is an
  // honest state and must survive validation untouched.
  const r = validateXRayGraph(canonical)
  const unidentified = canonical.evidenceProvenance.filter(
    (p) => p.origin.kind === 'UNIDENTIFIED',
  )
  if (unidentified.length === 0) return 'fixture has no UNIDENTIFIED provenance to test'
  const flagged = r.violations.filter((v) =>
    v.targets.some((t) => unidentified.some((p) => p.id === t.id)),
  )
  return flagged.length === 0
    ? null
    : `UNIDENTIFIED provenance flagged: ${flagged.map((v) => v.code).join(', ')}`
})

check('CAL-003 · UNRESOLVED provenance is legal, not an error', () => {
  // EV-026 and EV-032 come from a source of unknown origin status with no
  // provenance record. Their independence is undeterminable, which is legal.
  const r = validateXRayGraph(canonical)
  const flagged = r.violations.filter((v) =>
    v.targets.some((t) => t.id === 'EV-026' || t.id === 'EV-032'),
  )
  return flagged.length === 0 ? null : `unresolved evidence flagged: ${flagged.map((v) => v.code).join(', ')}`
})

// ---------------------------------------------------------------------------
// XR-INV-006 — missing evidence is not negative evidence (CAL-004)
// ---------------------------------------------------------------------------

bites(
  'CAL-004 · asserting a record does not exist is rejected',
  'XR-INV-006/NONEXISTENCE_ASSERTED',
  (g) => {
    find(g.sources, 'SRC-017').accessibility = 'DOES_NOT_EXIST'
  },
)

bites(
  'CAL-004 · a gap recording no search is rejected',
  'XR-INV-006/GAP_WITHOUT_SEARCH_RECORD',
  (g) => {
    find(g.gaps, 'GAP-001').searchAlreadyAttempted = []
  },
)

bites(
  'CAL-004 · evidence extracted from an unobtained record is rejected',
  'XR-INV-006/EVIDENCE_FROM_UNOBTAINED_SOURCE',
  (g) => {
    // D1: Evidence.sourceId is the record actually inspected. Attaching it to
    // an unretrieved origin collapses Source/Evidence/Provenance.
    find(g.evidence, 'EV-020').sourceId = 'SRC-017'
  },
)

bites(
  'CAL-004 · quoting an unobtained record is rejected',
  'XR-INV-006/QUOTED_PASSAGE_FROM_UNOBTAINED_SOURCE',
  (g) => {
    find(g.sources, 'SRC-010').accessibility = 'NOT_RETRIEVED'
  },
)

check('CAL-004 · NOT_RETRIEVED and NOT_LOCATED sources are legal', () => {
  const unobtained = canonical.sources.filter(
    (s) => s.accessibility === 'NOT_RETRIEVED' || s.accessibility === 'NOT_LOCATED',
  )
  if (unobtained.length === 0) return 'fixture has no unobtained sources to test'
  const r = validateXRayGraph(canonical)
  const flagged = r.violations.filter((v) =>
    v.targets.some((t) => t.kind === 'Source' && unobtained.some((s) => s.id === t.id)),
  )
  return flagged.length === 0
    ? null
    : `unobtained sources flagged: ${flagged.map((v) => v.code).join(', ')}`
})

// ---------------------------------------------------------------------------
// CAL-005 — scheduled is not occurred
// ---------------------------------------------------------------------------

bites(
  'CAL-005 · evidence published after the research cutoff is rejected',
  'EPISTEMIC/POST_CUTOFF_EVIDENCE',
  (g) => {
    // The mechanism by which a scheduled inspection becomes an occurred one:
    // a record of the event, dated after the cutoff, entering the graph.
    find(g.sources, 'SRC-022').publishedAt = '2026-09-15'
  },
)

check('CAL-005 · the scheduled-inspection claim validates as it stands', () => {
  const r = validateXRayGraph(canonical)
  const flagged = r.violations.filter((v) => v.targets.some((t) => t.id === 'C004'))
  return flagged.length === 0 ? null : `C004 flagged: ${flagged.map((v) => v.code).join(', ')}`
})

// ---------------------------------------------------------------------------
// CAL-006 — unresolved financial bridge
// ---------------------------------------------------------------------------

check('CAL-006 · an unresolved discrepancy and finding need no reconciliation', () => {
  const r = validateXRayGraph(canonical)
  const flagged = r.violations.filter((v) =>
    v.targets.some((t) => t.id === 'DISC-002' || t.id === 'FND-C002' || t.id === 'C002'),
  )
  return flagged.length === 0
    ? null
    : `unresolved financial state flagged: ${flagged.map((v) => v.code).join(', ')}`
})

// ---------------------------------------------------------------------------
// XR-INV-007 / 008 / 009 / 010 / 011 / 012
// ---------------------------------------------------------------------------

bites(
  'XR-INV-007 · a finding that cannot be overturned is rejected',
  'XR-INV-007/FINDING_NOT_REVERSIBLE',
  (g) => {
    find(g.findings, 'FND-C001').wouldChangeFinding = []
  },
)

bites(
  'XR-INV-007 · a finding evidence list that hides a record is rejected',
  'XR-INV-007/FINDING_EVIDENCE_LIST_MISMATCH',
  (g) => {
    const finding = find(g.findings, 'FND-C003')
    finding.contextualEvidenceIds = finding.contextualEvidenceIds.slice(1)
  },
)

bites(
  'XR-INV-008 · an unresolved finding with no gap is rejected',
  'XR-INV-008/UNRESOLVED_FINDING_WITHOUT_GAP',
  (g) => {
    find(g.findings, 'FND-C003').gapIds = []
  },
)

bites(
  'XR-INV-008 · an orphaned gap is rejected at graduation',
  'XR-INV-008/GAP_NOT_REACHABLE_FROM_FINDING',
  (g) => {
    find(g.findings, 'FND-C002').gapIds = []
    find(g.findings, 'FND-C002').status = 'ESTABLISHED'
  },
  'FULL',
)

check('D1 · an orphaned gap is legal in STAGED mode', () => {
  const graph = mutated((g) => {
    find(g.findings, 'FND-C002').gapIds = []
    find(g.findings, 'FND-C002').status = 'ESTABLISHED'
  })
  const staged = validateXRayGraph(graph, { mode: 'STAGED' })
  const full = validateXRayGraph(graph, { mode: 'FULL' })
  const code = 'XR-INV-008/GAP_NOT_REACHABLE_FROM_FINDING'
  const inStaged = staged.violations.some((v) => v.code === code)
  const inFull = full.violations.some((v) => v.code === code)
  if (inStaged) return 'orphaned gap rejected in STAGED, but a pre-grade gap is legitimate'
  return inFull ? null : 'orphaned gap not rejected in FULL either, so the rule is inert'
})

bites(
  'XR-INV-009 · ATI eligibility disagreeing with resolution path is rejected',
  'XR-INV-009/ATI_ELIGIBILITY_MISMATCH',
  (g) => {
    find(g.gaps, 'GAP-003').atiEligible = true
  },
)

bites(
  'XR-INV-010 · a version claiming to supersede a later one is rejected',
  'XR-INV-010/VERSION_SUPERSEDES_INVALID',
  (g) => {
    g.version.supersedesVersion = 3
  },
)

bites(
  'XR-INV-011 · a derived count stored in canonical state is rejected',
  'STRUCTURAL/DERIVED_FIELD_STORED',
  (g) => {
    // The v0 scaffold shipped `receiptsCount: 11` beside a five-record array.
    find(g.claims, 'C001').evidenceCount = 4
  },
)

bites(
  'XR-INV-012 · a discovered claim in the surface namespace is rejected',
  'XR-INV-012/CLAIM_ID_NAMESPACE_MISMATCH',
  (g) => {
    find(g.claims, 'DC001').origin = 'SURFACE'
  },
)

bites(
  'XR-INV-012 · a claim id outside both namespaces is rejected',
  'XR-INV-012/CLAIM_ID_OUTSIDE_NAMESPACE',
  (g) => {
    find(g.claims, 'C001').id = 'claim-1'
    for (const e of g.evidence) e.claimIds = e.claimIds.map((c: string) => (c === 'C001' ? 'claim-1' : c))
    find(g.findings, 'FND-C001').claimId = 'claim-1'
    for (const gap of g.gaps) gap.claimIds = gap.claimIds.map((c: string) => (c === 'C001' ? 'claim-1' : c))
    for (const d of g.discrepancies) d.claimIds = d.claimIds.map((c: string) => (c === 'C001' ? 'claim-1' : c))
    for (const d of g.disconfirmations) if (d.claimId === 'C001') d.claimId = 'claim-1'
    g.investigation.claimIds = g.investigation.claimIds.map((c: string) => (c === 'C001' ? 'claim-1' : c))
  },
)

// ---------------------------------------------------------------------------
// Structural and referential
// ---------------------------------------------------------------------------

bites(
  'STRUCTURAL · an illegal enum value is rejected',
  'STRUCTURAL/ILLEGAL_ENUM_VALUE',
  (g) => {
    find(g.findings, 'FND-C001').confidence = 0.86
  },
)

bites(
  'STRUCTURAL · a Date object where an ISO string belongs is rejected',
  'STRUCTURAL/NON_ISO_TIMESTAMP',
  (g) => {
    find(g.findings, 'FND-C001').gradedAt = 'Tue Sep 15 2026'
  },
)

bites(
  'STRUCTURAL · an empty required string is rejected',
  'STRUCTURAL/EMPTY_REQUIRED_STRING',
  (g) => {
    find(g.claims, 'C001').text = '   '
  },
)

bites(
  'STRUCTURAL · a duplicate id across artifact kinds is rejected',
  'STRUCTURAL/DUPLICATE_ID',
  (g) => {
    find(g.gaps, 'GAP-001').id = 'EV-001'
  },
)

bites(
  'REFERENTIAL · a dangling evidence reference is rejected',
  'REFERENTIAL/DANGLING_REFERENCE',
  (g) => {
    find(g.findings, 'FND-C001').supportingEvidenceIds.push('EV-999')
  },
)

bites(
  'REFERENTIAL · an incomplete investigation index is rejected at graduation',
  'REFERENTIAL/INVESTIGATION_INDEX_MISMATCH',
  (g) => {
    g.investigation.claimIds = g.investigation.claimIds.filter((c: string) => c !== 'DC002')
  },
  'FULL',
)

check('D1 · an incomplete investigation index is legal in STAGED mode', () => {
  const graph = mutated((g) => {
    g.investigation.claimIds = g.investigation.claimIds.filter((c: string) => c !== 'DC002')
  })
  const code = 'REFERENTIAL/INVESTIGATION_INDEX_MISMATCH'
  const staged = validateXRayGraph(graph, { mode: 'STAGED' })
  const full = validateXRayGraph(graph, { mode: 'FULL' })
  if (staged.violations.some((v) => v.code === code))
    return 'index completeness enforced in STAGED, but later artifacts may not exist yet'
  return full.violations.some((v) => v.code === code) ? null : 'rule inert in FULL too'
})

// ---------------------------------------------------------------------------
// Violation shape and coverage integrity
// ---------------------------------------------------------------------------

check('every violation carries code, targets, severity and explanation', () => {
  // Drive a graph that trips many rules at once and inspect the shape of each.
  const graph = mutated((g) => {
    find(g.findings, 'FND-C001').wouldChangeFinding = []
    find(g.gaps, 'GAP-001').searchAlreadyAttempted = []
    find(g.sources, 'SRC-017').accessibility = 'DOES_NOT_EXIST'
    find(g.gaps, 'GAP-003').atiEligible = true
  })
  const r = validateXRayGraph(graph)
  if (r.violations.length < 4) return `expected several violations, got ${r.violations.length}`
  const bad = r.violations.filter(
    (v) =>
      !v.code ||
      !v.class ||
      !v.severity ||
      v.targets.length === 0 ||
      v.targets.some((t) => !t.kind || !t.id) ||
      v.message.trim().length < 20,
  )
  return bad.length ? `${bad.length} malformed violation(s): ${bad.map((v) => v.code).join(', ')}` : null
})

check('coverage table names all twelve invariants exactly once', () => {
  const ids = INVARIANT_COVERAGE.map((c) => c.id)
  const expected = Array.from({ length: 12 }, (_, i) => `XR-INV-${String(i + 1).padStart(3, '0')}`)
  const missing = expected.filter((id) => !ids.includes(id as (typeof ids)[number]))
  if (missing.length) return `missing ${missing.join(', ')}`
  return ids.length === 12 ? null : `${ids.length} entries for 12 invariants`
})

check('every non-deterministic invariant names who owns it', () => {
  const bad = INVARIANT_COVERAGE.filter(
    (c) => c.level !== 'DETERMINISTIC' && (!c.notEnforced || c.notEnforced.trim().length < 20),
  )
  return bad.length
    ? `${bad.map((c) => c.id).join(', ')} claim partial coverage without saying what is unenforced`
    : null
})

check('validator source contains no benchmark ids', () => {
  // Generic rules must not know XRAY-KE-001. Enforced here because the checks
  // themselves are the only place those ids belong.
  const files = readdirSync(new URL('./validation/', import.meta.url)).filter((f) =>
    f.endsWith('.ts'),
  )
  const pattern = /XRAY-KE-001|'C\d{3}'|'DC\d{3}'|'EV-\d|'SRC-\d|'GAP-\d|'EP-\d|'SD-\d|'FND-|'DISC-/
  const bad: string[] = []
  for (const file of files) {
    const text = readFileSync(new URL(`./validation/${file}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    if (pattern.test(text)) bad.push(file)
  }
  return bad.length ? `benchmark ids in ${bad.join(', ')}` : null
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
const width = Math.max(...results.map((r) => r.name.length))

console.log('\nX-Ray validator — adversarial checks\n' + '='.repeat(width + 8))
for (const r of results) {
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  → ' + r.detail}`)
}
console.log('='.repeat(width + 8))
console.log(`${results.length - failed.length}/${results.length} passed\n`)

console.log('XR-INV coverage')
console.log('-'.repeat(width + 8))
for (const c of INVARIANT_COVERAGE) {
  console.log(`  ${c.id}  ${c.level.padEnd(14)} ${c.name}`)
}
console.log()

if (failed.length) process.exit(1)
