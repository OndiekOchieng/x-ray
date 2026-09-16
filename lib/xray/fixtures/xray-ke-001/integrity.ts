/**
 * XRAY-KE-001 — fixture integrity checks.
 *
 * SCOPE: this is NOT the general runtime invariant validator. It asserts only
 * that THIS fixture is internally coherent and that the invariant-bearing
 * structures it exists to demonstrate are actually present. The general
 * validator belongs to a later slice.
 *
 * Run:  node lib/xray/fixtures/xray-ke-001/integrity.ts
 *       npm run check:fixtures
 */

import { claims } from './claims'
import { sources, SURFACE_SOURCE_ID } from './sources'
import { sourceDependencies } from './source-dependencies'
import { evidence } from './evidence'
import { discrepancies } from './discrepancies'
import { disconfirmations } from './disconfirmation'
import { findings } from './findings'
import { gaps } from './gaps'
import { investigation, investigationVersion, stageRuns } from './investigation'
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

const claimIds = new Set(claims.map((c) => c.id))
const sourceIds = new Set(sources.map((s) => s.id))
const evidenceIds = new Set(evidence.map((e) => e.id))
const discrepancyIds = new Set(discrepancies.map((d) => d.id))
const findingIds = new Set(findings.map((f) => f.id))
const gapIds = new Set(gaps.map((g) => g.id))

const list = (xs: string[]) => xs.join(', ')

// ---------------------------------------------------------------------------
// Referential integrity
// ---------------------------------------------------------------------------

check('every id is unique', () => {
  const all = [
    ...claims.map((c) => c.id),
    ...sources.map((s) => s.id),
    ...evidence.map((e) => e.id),
    ...sourceDependencies.map((d) => d.id),
    ...discrepancies.map((d) => d.id),
    ...disconfirmations.map((d) => d.id),
    ...findings.map((f) => f.id),
    ...gaps.map((g) => g.id),
    ...stageRuns.map((s) => s.id),
  ]
  const dupes = all.filter((id, i) => all.indexOf(id) !== i)
  return dupes.length ? `duplicate ids: ${list([...new Set(dupes)])}` : null
})

check('every Evidence references an existing Source', () => {
  const bad = evidence.filter((e) => !sourceIds.has(e.sourceId))
  return bad.length ? list(bad.map((e) => `${e.id}→${e.sourceId}`)) : null
})

check('every Evidence claimId exists', () => {
  const bad = evidence.flatMap((e) => e.claimIds.filter((c) => !claimIds.has(c)).map((c) => `${e.id}→${c}`))
  return bad.length ? list(bad) : null
})

check('every Finding references an existing Claim', () => {
  const bad = findings.filter((f) => !claimIds.has(f.claimId))
  return bad.length ? list(bad.map((f) => `${f.id}→${f.claimId}`)) : null
})

check('every Finding evidence/discrepancy/gap id exists', () => {
  const bad: string[] = []
  for (const f of findings) {
    for (const id of [...f.supportingEvidenceIds, ...f.challengingEvidenceIds])
      if (!evidenceIds.has(id)) bad.push(`${f.id}→evidence ${id}`)
    for (const id of f.discrepancyIds) if (!discrepancyIds.has(id)) bad.push(`${f.id}→discrepancy ${id}`)
    for (const id of f.gapIds) if (!gapIds.has(id)) bad.push(`${f.id}→gap ${id}`)
  }
  return bad.length ? list(bad) : null
})

check('every Gap claimId exists', () => {
  const bad = gaps.flatMap((g) => g.claimIds.filter((c) => !claimIds.has(c)).map((c) => `${g.id}→${c}`))
  return bad.length ? list(bad) : null
})

check('every Discrepancy claim/evidence id exists', () => {
  const bad: string[] = []
  for (const d of discrepancies) {
    for (const c of d.claimIds) if (!claimIds.has(c)) bad.push(`${d.id}→claim ${c}`)
    for (const e of d.evidenceIds) if (!evidenceIds.has(e)) bad.push(`${d.id}→evidence ${e}`)
  }
  return bad.length ? list(bad) : null
})

check('every Disconfirmation claim/evidence id exists', () => {
  const bad: string[] = []
  for (const d of disconfirmations) {
    if (!claimIds.has(d.claimId)) bad.push(`${d.id}→claim ${d.claimId}`)
    for (const e of [...d.strongestSupportingEvidenceIds, ...d.strongestOpposingEvidenceIds])
      if (!evidenceIds.has(e)) bad.push(`${d.id}→evidence ${e}`)
  }
  return bad.length ? list(bad) : null
})

check('every SourceDependency endpoint exists', () => {
  const bad: string[] = []
  for (const d of sourceDependencies) {
    if (!sourceIds.has(d.sourceId)) bad.push(`${d.id}→from ${d.sourceId}`)
    if (d.dependsOnSourceId && !sourceIds.has(d.dependsOnSourceId)) bad.push(`${d.id}→to ${d.dependsOnSourceId}`)
  }
  return bad.length ? list(bad) : null
})

check('Investigation id arrays match the modules exactly', () => {
  const cmp = (name: string, a: string[], b: string[]) =>
    a.length === b.length && a.every((x, i) => x === b[i]) ? null : `${name} mismatch`
  return (
    cmp('claimIds', investigation.claimIds, claims.map((c) => c.id)) ??
    cmp('sourceIds', investigation.sourceIds, sources.map((s) => s.id)) ??
    cmp('evidenceIds', investigation.evidenceIds, evidence.map((e) => e.id)) ??
    cmp('findingIds', investigation.findingIds, findings.map((f) => f.id)) ??
    cmp('gapIds', investigation.gapIds, gaps.map((g) => g.id))
  )
})

check('surfaceSourceId resolves to a real Source', () =>
  sourceIds.has(investigation.surfaceSourceId) ? null : `missing ${investigation.surfaceSourceId}`)

// ---------------------------------------------------------------------------
// XR-INV-012 — claim namespaces
// ---------------------------------------------------------------------------

check('C### ids are SURFACE', () => {
  const bad = claims.filter((c) => /^C\d+$/.test(c.id) && c.origin !== 'SURFACE')
  return bad.length ? list(bad.map((c) => c.id)) : null
})

check('DC### ids are DISCOVERED', () => {
  const bad = claims.filter((c) => /^DC\d+$/.test(c.id) && c.origin !== 'DISCOVERED')
  return bad.length ? list(bad.map((c) => c.id)) : null
})

check('claim id namespaces do not collide', () => {
  const bad = claims.filter((c) => !/^(C|DC)\d+$/.test(c.id))
  return bad.length ? `ids outside both namespaces: ${list(bad.map((c) => c.id))}` : null
})

// ---------------------------------------------------------------------------
// XR-INV-001 — surface source isolation
// ---------------------------------------------------------------------------

check('surface source yields no Evidence for its own surface claims', () => {
  const surfaceClaimIds = new Set<string>(claims.filter((c) => c.origin === 'SURFACE').map((c) => c.id))
  const bad = evidence.filter(
    (e) => e.sourceId === SURFACE_SOURCE_ID && e.claimIds.some((c) => surfaceClaimIds.has(c)),
  )
  return bad.length ? `${list(bad.map((e) => e.id))} corroborate their own surface source` : null
})

check('surface source yields no Evidence at all in this fixture', () => {
  const bad = evidence.filter((e) => e.sourceId === SURFACE_SOURCE_ID)
  return bad.length ? list(bad.map((e) => e.id)) : null
})

// ---------------------------------------------------------------------------
// XR-INV-006 — missing evidence is not negative evidence
// ---------------------------------------------------------------------------

check('no DOES_NOT_EXIST accessibility value exists', () => {
  const bad = sources.filter((s) => String(s.accessibility) === 'DOES_NOT_EXIST')
  return bad.length ? list(bad.map((s) => s.id)) : null
})

check('every Gap records the search actually attempted', () => {
  const bad = gaps.filter((g) => g.searchAlreadyAttempted.length === 0)
  return bad.length ? list(bad.map((g) => g.id)) : null
})

check('unretrieved originating records are represented, not omitted', () => {
  const unheld = sources.filter(
    (s) => s.accessibility === 'NOT_RETRIEVED' || s.accessibility === 'NOT_LOCATED',
  )
  return unheld.length >= 4 ? null : `expected the unretrieved origins to be modelled, found ${unheld.length}`
})

check('Evidence is only extracted from sources actually obtained', () => {
  const held = new Set(
    sources.filter((s) => s.accessibility === 'RETRIEVED' || s.accessibility === 'PARTIAL').map((s) => s.id),
  )
  const bad = evidence.filter((e) => !held.has(e.sourceId))
  return bad.length ? `${list(bad.map((e) => `${e.id}(${e.sourceId})`))} quote a record never obtained` : null
})

// ---------------------------------------------------------------------------
// XR-INV-009 — action eligibility
// ---------------------------------------------------------------------------

check('atiEligible true iff resolutionPath is PUBLIC_RECORD_REQUEST', () => {
  const bad = gaps.filter((g) => g.atiEligible !== (g.resolutionPath === 'PUBLIC_RECORD_REQUEST'))
  return bad.length ? list(bad.map((g) => g.id)) : null
})

check('both eligibility branches are demonstrated', () => {
  const yes = gaps.filter((g) => g.atiEligible).length
  const no = gaps.filter((g) => !g.atiEligible).length
  return yes > 0 && no > 0 ? null : `eligible=${yes} ineligible=${no}`
})

check('inferred custody is marked INFERRED, never left unstated', () => {
  const bad = gaps.filter((g) => g.likelyHolder && !g.likelyHolder.basis)
  return bad.length ? list(bad.map((g) => g.id)) : null
})

// ---------------------------------------------------------------------------
// XR-INV-005 — same-measure regression case
// ---------------------------------------------------------------------------

check('C003 carries a surfaced-length measurement', () => {
  const c = claims.find((x) => x.id === 'C003')
  const m = c?.measurement
  return m?.metric === 'surfaced_length' && m.denominator === 'road_sections'
    ? null
    : `C003 measurement is ${JSON.stringify(m)}`
})

check('C003 evidence measures project completion, not surfaced length', () => {
  const ev = evidence.filter((e) => e.claimIds.includes('C003') && e.measurement?.value !== undefined)
  if (!ev.length) return 'no measured evidence on C003'
  const bad = ev.filter((e) => e.measurement?.metric !== 'physical_project_completion')
  return bad.length ? list(bad.map((e) => e.id)) : null
})

check('C003 claim and evidence measurements are incompatible (the regression)', () => {
  const claim = claims.find((c) => c.id === 'C003')!.measurement!
  const ev = evidence.filter((e) => e.claimIds.includes('C003') && e.measurement)
  const compatible = ev.filter(
    (e) => e.measurement!.metric === claim.metric && e.measurement!.denominator === claim.denominator,
  )
  return compatible.length === 0
    ? null
    : `${list(compatible.map((e) => e.id))} claim measurement-compatibility with C003`
})

check('no Evidence asserts CONTRADICTS against C003', () => {
  const bad = evidence.filter((e) => e.claimIds.includes('C003') && e.relationship === 'CONTRADICTS')
  return bad.length ? list(bad.map((e) => e.id)) : null
})

check('C003 is not graded CONTRADICTED', () => {
  const f = findings.find((x) => x.claimId === 'C003')!
  return f.status === 'INSUFFICIENT_EVIDENCE' ? null : `graded ${f.status}`
})

check('DC001 IS measurement-compatible with its evidence (the contrast case)', () => {
  const claim = claims.find((c) => c.id === 'DC001')!.measurement!
  const ev = evidence.filter((e) => e.claimIds.includes('DC001') && e.measurement)
  const compatible = ev.filter((e) => e.measurement!.metric === claim.metric)
  return compatible.length > 0 ? null : 'no measurement-compatible evidence on DC001'
})

// ---------------------------------------------------------------------------
// XR-INV-004 — source independence
// ---------------------------------------------------------------------------

check('September status dataset: >=2 publications, <=1 originating observation', () => {
  const ORIGIN = 'SRC-017'
  const pubs = sourceDependencies.filter((d) => d.dependsOnSourceId === ORIGIN)
  if (pubs.length < 2) return `only ${pubs.length} publications depend on ${ORIGIN}`
  const origins = new Set(pubs.map((d) => d.dependsOnSourceId))
  if (origins.size > 1) return `expected one origin, found ${origins.size}`
  const originSource = sources.find((s) => s.id === ORIGIN)!
  if (originSource.originStatus !== 'ORIGINATING') return `${ORIGIN} is not ORIGINATING`
  const allRepeating = pubs.every(
    (d) => sources.find((s) => s.id === d.sourceId)!.originStatus === 'REPEATING',
  )
  return allRepeating ? null : 'a dependent publication is not marked REPEATING'
})

check('dependent repetitions are not counted as independent corroboration', () => {
  // The three September publications reproduce ONE dataset (SRC-017). At most
  // one may carry evidence above WEAK; the others are duplicates of the same
  // observation, not further observations. XR-INV-004.
  const PUBS = ['SRC-018', 'SRC-019', 'SRC-020']
  const strong = PUBS.filter((src) =>
    evidence.some(
      (e) => e.sourceId === src && (e.strength === 'DIRECT' || e.strength === 'STRONG_INDIRECT'),
    ),
  )
  if (strong.length > 1) return `${list(strong)} all carry non-weak evidence for one observation`
  const weakOnly = PUBS.filter((src) => !strong.includes(src))
  const bad = weakOnly.filter((src) =>
    evidence.some((e) => e.sourceId === src && e.strength !== 'WEAK'),
  )
  return bad.length ? `${list(bad)} should carry WEAK evidence only` : null
})

// ---------------------------------------------------------------------------
// XR-INV-007 — findings must be reversible
// ---------------------------------------------------------------------------

check('every Finding can describe how it would be overturned', () => {
  const bad = findings.filter((f) => f.wouldChangeFinding.length === 0 || f.rationale.trim() === '')
  return bad.length ? list(bad.map((f) => f.id)) : null
})

// --- Finding evidence traceability (Slice 2.1) ---
//
//   SUPPORTS       → supportingEvidenceIds
//   CHALLENGES     → challengingEvidenceIds
//   CONTRADICTS    → challengingEvidenceIds
//   CONTEXTUALIZES → contextualEvidenceIds
//
// Checked in both directions: every list is complete for its relationships,
// and no list contains an id whose relationship maps elsewhere.

const BUCKET = {
  SUPPORTS: 'supportingEvidenceIds',
  CHALLENGES: 'challengingEvidenceIds',
  CONTRADICTS: 'challengingEvidenceIds',
  CONTEXTUALIZES: 'contextualEvidenceIds',
} as const

const evidenceFor = (claimId: string) => evidence.filter((e) => e.claimIds.some((c) => c === claimId))

const expectedBucket = (claimId: string, bucket: string) =>
  evidenceFor(claimId)
    .filter((e) => BUCKET[e.relationship] === bucket)
    .map((e) => e.id)

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

check('supportingEvidenceIds reference only SUPPORTS evidence', () => {
  const bad: string[] = []
  for (const f of findings)
    for (const id of f.supportingEvidenceIds) {
      const e = evidence.find((x) => x.id === id)!
      if (e.relationship !== 'SUPPORTS') bad.push(`${f.id}→${id} is ${e.relationship}`)
    }
  return bad.length ? list(bad) : null
})

check('challengingEvidenceIds reference only CHALLENGES or CONTRADICTS', () => {
  const bad: string[] = []
  for (const f of findings)
    for (const id of f.challengingEvidenceIds) {
      const e = evidence.find((x) => x.id === id)!
      if (e.relationship !== 'CHALLENGES' && e.relationship !== 'CONTRADICTS')
        bad.push(`${f.id}→${id} is ${e.relationship}`)
    }
  return bad.length ? list(bad) : null
})

check('contextualEvidenceIds reference only CONTEXTUALIZES evidence', () => {
  const bad: string[] = []
  for (const f of findings)
    for (const id of f.contextualEvidenceIds) {
      const e = evidence.find((x) => x.id === id)!
      if (e.relationship !== 'CONTEXTUALIZES') bad.push(`${f.id}→${id} is ${e.relationship}`)
    }
  return bad.length ? list(bad) : null
})

check('every contextualEvidenceId bears on that Finding\'s Claim', () => {
  const bad: string[] = []
  for (const f of findings)
    for (const id of f.contextualEvidenceIds) {
      const e = evidence.find((x) => x.id === id)
      if (!e) bad.push(`${f.id}→${id} missing`)
      else if (!e.claimIds.includes(f.claimId)) bad.push(`${f.id}→${id} does not bear on ${f.claimId}`)
    }
  return bad.length ? list(bad) : null
})

check('every CONTEXTUALIZES evidence on a claim appears in its contextualEvidenceIds', () => {
  const bad: string[] = []
  for (const f of findings) {
    const expected = expectedBucket(f.claimId, 'contextualEvidenceIds')
    const missing = expected.filter((id) => !f.contextualEvidenceIds.includes(id))
    if (missing.length) bad.push(`${f.id} omits ${list(missing)}`)
  }
  return bad.length ? list(bad) : null
})

check('Finding evidence lists are complete for all material relationships', () => {
  const bad: string[] = []
  for (const f of findings) {
    for (const [bucket, actual] of [
      ['supportingEvidenceIds', f.supportingEvidenceIds],
      ['challengingEvidenceIds', f.challengingEvidenceIds],
      ['contextualEvidenceIds', f.contextualEvidenceIds],
    ] as const) {
      const expected = expectedBucket(f.claimId, bucket)
      if (!sameSet(expected, actual)) bad.push(`${f.id}.${bucket} expected [${list(expected)}] got [${list(actual)}]`)
    }
    // Total: nothing bearing on the claim may fall outside all three lists.
    const all = [...f.supportingEvidenceIds, ...f.challengingEvidenceIds, ...f.contextualEvidenceIds]
    const orphans = evidenceFor(f.claimId).filter((e) => !all.includes(e.id))
    if (orphans.length) bad.push(`${f.id} unreachable: ${list(orphans.map((e) => e.id))}`)
  }
  return bad.length ? list(bad) : null
})

check('contextualEvidenceIds exist in this fixture where the rationale relies on them', () => {
  // Five of six findings rest on contextualizing evidence; DC001 legitimately
  // has none. A fixture where every list were empty would pass the mapping
  // checks above while proving nothing.
  const withContext = findings.filter((f) => f.contextualEvidenceIds.length > 0)
  return withContext.length >= 5
    ? null
    : `only ${withContext.length} findings carry contextual evidence`
})

// --- Evidence temporal scope (Slice 2.1) ---

check('Measurement.definition carries no temporal scope', () => {
  const YEAR = /\b(19|20)\d{2}\b/
  const bad = evidence
    .filter((e) => e.measurement)
    .filter((e) => YEAR.test(e.measurement!.definition ?? '') || YEAR.test(e.measurement!.scope ?? ''))
  return bad.length ? `${list(bad.map((e) => e.id))} encode dates in Measurement` : null
})

check('evidence whose observation predates its source carries timeScope', () => {
  // The case this field exists for: Treasury published in November 2025 a
  // completion figure as at 30 June 2025.
  const bad = ['EV-028', 'EV-031'].filter((id) => {
    const e = evidence.find((x) => x.id === id)!
    return e.timeScope?.asOf !== '2025-06-30'
  })
  return bad.length ? `${list(bad)} lack the as-of date of the observation` : null
})

check('timeScope never asserts a date the benchmark does not give', () => {
  // The September ministry release states no measurement date, so those records
  // must carry description only — never a fabricated asOf.
  const septemberRecords = ['EV-020', 'EV-021', 'EV-022', 'EV-029']
  const bad = septemberRecords.filter((id) => {
    const ts = evidence.find((x) => x.id === id)!.timeScope
    return ts?.asOf !== undefined || !ts?.description
  })
  return bad.length ? `${list(bad)} assert an unsupported measurement date` : null
})

check('every unresolved material finding has a gap', () => {
  const needsGap = ['UNRESOLVED', 'INSUFFICIENT_EVIDENCE', 'CONTESTED']
  const bad = findings.filter((f) => needsGap.includes(f.status) && f.gapIds.length === 0)
  return bad.length ? list(bad.map((f) => f.id)) : null
})

check('every Claim has exactly one Finding', () => {
  const bad = claims.filter((c) => findings.filter((f) => f.claimId === c.id).length !== 1)
  return bad.length ? list(bad.map((c) => c.id)) : null
})

// ---------------------------------------------------------------------------
// Confidence, timestamps, derived counts
// ---------------------------------------------------------------------------

check('no numeric confidence anywhere', () => {
  const bad = findings.filter((f) => typeof (f.confidence as unknown) !== 'string')
  return bad.length ? list(bad.map((f) => f.id)) : null
})

check('all timestamps are ISO strings, never Date', () => {
  const stamps: [string, unknown][] = [
    ['investigation.createdAt', investigation.createdAt],
    ['investigation.researchCutoffAt', investigation.researchCutoffAt],
    ['investigation.completedAt', investigation.completedAt],
    ['version.createdAt', investigationVersion.createdAt],
    ...findings.map((f) => [`${f.id}.gradedAt`, f.gradedAt] as [string, unknown]),
    ...sources.map((s) => [`${s.id}.retrievedAt`, s.retrievedAt] as [string, unknown]),
  ]
  const bad = stamps.filter(([, v]) => v !== undefined && typeof v !== 'string')
  return bad.length ? list(bad.map(([k]) => k)) : null
})

check('research cutoff is 2026-09-13 and nothing is dated after it', () => {
  if (investigation.researchCutoffAt !== '2026-09-13') return `cutoff is ${investigation.researchCutoffAt}`
  const bad = sources.filter((s) => s.publishedAt && s.publishedAt.slice(0, 10) > '2026-09-13')
  return bad.length ? `post-cutoff sources: ${list(bad.map((s) => s.id))}` : null
})

check('no derived counts are stored as canonical fields', () => {
  const countish = /count$/i
  const offenders: string[] = []
  const scan = (label: string, obj: object) => {
    for (const k of Object.keys(obj)) if (countish.test(k)) offenders.push(`${label}.${k}`)
  }
  scan('investigation', investigation)
  scan('investigationVersion', investigationVersion)
  claims.forEach((c) => scan(c.id, c))
  findings.forEach((f) => scan(f.id, f))
  gaps.forEach((g) => scan(g.id, g))
  sources.forEach((s) => scan(s.id, s))
  return offenders.length ? list(offenders) : null
})

check('Version 1 inherits nothing and re-evaluates nothing', () => {
  if (investigationVersion.version !== 1) return `version is ${investigationVersion.version}`
  if (investigationVersion.supersedesVersion !== undefined) return 'v1 supersedes something'
  return investigationVersion.reEvaluatedClaimIds.length === 0 ? null : 're-evaluated claims at v1'
})

check('stages not executed by the benchmark are PENDING, not SUCCEEDED', () => {
  const notRun = ['VALIDATE', 'SYNTHESIZE', 'RESOLVE']
  const bad = stageRuns.filter((s) => notRun.includes(s.stage) && s.status !== 'PENDING')
  return bad.length ? list(bad.map((s) => s.stage)) : null
})

// ---------------------------------------------------------------------------
// Calibration corpus (docs/calibration/)
//
// The calibration cases cite canonical fixture ids. These checks stop a case
// outliving the record it describes: if an id is renamed or removed here, the
// corpus fails rather than silently pointing at nothing.
// ---------------------------------------------------------------------------

const CALIBRATION_DIR = new URL('../../../../docs/calibration/', import.meta.url)

const readCalibration = (): { path: string; text: string }[] => {
  const out: { path: string; text: string }[] = []
  for (const sub of ['cases', 'failure-modes']) {
    const dir = new URL(`${sub}/`, CALIBRATION_DIR)
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      out.push({ path: `${sub}/${name}`, text: readFileSync(new URL(name, dir), 'utf8') })
    }
  }
  out.push({ path: 'README.md', text: readFileSync(new URL('README.md', CALIBRATION_DIR), 'utf8') })
  return out
}

const KNOWN_IDS = new Set<string>([
  ...claims.map((c) => c.id),
  ...sources.map((s) => s.id),
  ...evidence.map((e) => e.id),
  ...sourceDependencies.map((d) => d.id),
  ...discrepancies.map((d) => d.id),
  ...disconfirmations.map((d) => d.id),
  ...findings.map((f) => f.id),
  ...gaps.map((g) => g.id),
])

// Matches the id shapes this fixture uses. `FND-C001` is matched whole so the
// trailing `C001` is not read as a second id.
const ID_PATTERN = /\b(?:FND-(?:D?C\d+)|DCF-\d+|DISC-\d+|GAP-\d+|SRC-\d+|EV-\d+|SD-\d+|DC\d+|C\d{3})\b/g

check('calibration cases cite only real fixture ids', () => {
  const bad: string[] = []
  for (const { path, text } of readCalibration()) {
    // Ignore fenced code blocks: they contain illustrative, not canonical, ids.
    const prose = text.replace(/```[\s\S]*?```/g, '')
    for (const id of new Set(prose.match(ID_PATTERN) ?? [])) {
      if (!KNOWN_IDS.has(id)) bad.push(`${path}: ${id}`)
    }
  }
  return bad.length ? list(bad) : null
})

check('calibration index matches the files on disk', () => {
  const index = JSON.parse(readFileSync(new URL('index.json', CALIBRATION_DIR), 'utf8'))
  const bad: string[] = []
  for (const entry of [...index.cases, ...index.failureModes]) {
    try {
      readFileSync(new URL(entry.file, CALIBRATION_DIR), 'utf8')
    } catch {
      bad.push(`${entry.id} → missing ${entry.file}`)
    }
  }
  const onDisk = readCalibration().filter((f) => f.path !== 'README.md').length
  const indexed = index.cases.length + index.failureModes.length
  if (onDisk !== indexed) bad.push(`${onDisk} files on disk, ${indexed} indexed`)
  return bad.length ? list(bad) : null
})

check('calibration index fixture ids exist', () => {
  const index = JSON.parse(readFileSync(new URL('index.json', CALIBRATION_DIR), 'utf8'))
  const bad: string[] = []
  for (const c of index.cases)
    for (const id of c.fixtureIds) if (!KNOWN_IDS.has(id)) bad.push(`${c.id} → ${id}`)
  return bad.length ? list(bad) : null
})

check('calibration cross-references resolve', () => {
  const index = JSON.parse(readFileSync(new URL('index.json', CALIBRATION_DIR), 'utf8'))
  const caseIds = new Set(index.cases.map((c: { id: string }) => c.id))
  const fmIds = new Set(index.failureModes.map((f: { id: string }) => f.id))
  const bad: string[] = []
  for (const c of index.cases)
    for (const fm of c.failureModes) if (!fmIds.has(fm)) bad.push(`${c.id} → ${fm}`)
  for (const f of index.failureModes)
    for (const c of f.cases) if (!caseIds.has(c)) bad.push(`${f.id} → ${c}`)
  return bad.length ? list(bad) : null
})

check('calibration cites no invariant outside XR-INV-001..012', () => {
  const bad: string[] = []
  for (const { path, text } of readCalibration())
    for (const m of new Set(text.match(/XR-INV-\d+/g) ?? [])) {
      const n = Number(m.slice(-3))
      if (n < 1 || n > 12) bad.push(`${path}: ${m}`)
    }
  return bad.length ? list(bad) : null
})

check('every calibration case states what would change the judgment', () => {
  const bad = readCalibration()
    .filter((f) => f.path.startsWith('cases/'))
    .filter((f) => !/what evidence would change the judgment/i.test(f.text))
    .map((f) => f.path)
  return bad.length ? list(bad) : null
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
const width = Math.max(...results.map((r) => r.name.length))

console.log('\nXRAY-KE-001 fixture integrity\n' + '='.repeat(width + 8))
for (const r of results) {
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  → ' + r.detail}`)
}
console.log('='.repeat(width + 8))
console.log(
  `${results.length - failed.length}/${results.length} passed` +
    `   ·  ${claims.length} claims, ${sources.length} sources, ${evidence.length} evidence, ` +
    `${sourceDependencies.length} dependencies, ${discrepancies.length} discrepancies, ` +
    `${disconfirmations.length} disconfirmations, ${findings.length} findings, ${gaps.length} gaps\n`,
)

if (failed.length) process.exit(1)
