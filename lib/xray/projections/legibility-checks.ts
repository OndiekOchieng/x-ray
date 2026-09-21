/**
 * Demo legibility checks (#11 slice 11c).
 *
 * WHAT THIS GATE IS FOR
 * =====================
 * A judge should understand what a claim is standing on without X-Ray's
 * internal vocabulary. That is a claim about **copy**, so this gate reads the
 * authored strings the surfaces render and the component sources that render
 * them — not the canonical data, which 11c does not touch.
 *
 * Every assertion here is over presentation. The counts, findings, gap
 * statuses and resolution paths are read from the frozen corpus and asserted
 * **unchanged**.
 *
 * HONEST LIMITATION
 * =================
 * Node's type-stripping cannot execute JSX, so component assertions are over
 * source text. Rendered-page evidence is captured separately against the
 * seeded database in `verification/issue-11-11c/`.
 *
 * Run:  pnpm check:legibility
 */

import { readFileSync } from 'node:fs'

import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { claimView } from './claim-view'
import { gapView } from './gap-view'
import { provenanceViewForClaim } from './provenance-view'
import { claimLayerLabel, claimLayerNote } from './labels'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

function check(name: string, fn: () => string | null): void {
  let detail: string | null
  try { detail = fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Text a reader could actually see.
 *
 * A single pass over JSX expressions, deliberately. Stripping them
 * innermost-out until stable was tried and is worse: once the inner
 * expressions of a ternary are gone, the outer one swallows the text between
 * the tags as well, and real copy disappears from the gate's view.
 */
function visibleCopy(source: string): string {
  const clean = stripComments(source)
    .replace(/^\s*import[\s\S]*?from\s*'[^']*'\s*$/gm, '')
    .replace(/\{[^{}]*\}/g, ' \u2022 ')
  const textNodes = clean.match(/>[^<>]{3,}</g) ?? []
  const literals = clean.match(/'[^'\n]{6,}'|`[^`]{6,}`/g) ?? []
  // Prop assignments are identifiers, not sentences.
  return [...textNodes, ...literals].filter((text) => !text.includes('=')).join('\n')
}

/**
 * `provenance` used as a word a reader would read, rather than as an
 * identifier.
 *
 * Trying to answer this by extracting JSX text nodes produced false positives
 * in both directions, so it is answered directly: the technical name is
 * legitimate as a module path, a prop, a field or a type, and illegitimate as
 * prose. Those are distinguishable by what sits next to it.
 *
 *   ./provenance-cluster   preceded by `/`            → identifier
 *   provenance.sourceCount followed by `.`            → identifier
 *   provenance={…}         followed by `=`            → identifier
 *   ProvenanceView         followed by a word char    → identifier
 *   {provenance}           surrounded by braces       → identifier
 *   { provenance }         destructured parameter     → identifier
 *   { provenance: View }   type annotation            → identifier
 *   "…receipts, provenance, contradictions…"          → PROSE
 *   "…provenance is recorded…"                        → PROSE
 */
const proseProvenance = /(?<![\w./-])provenance(?![\w.=}])(?!\s*[}:])/i

/** Demo-facing surfaces whose copy a judge reads. */
const DEMO_SURFACES = [
  'app/page.tsx',
  'app/library/page.tsx',
  'components/investigations/evidence-explorer.tsx',
  'components/investigations/finding-panel.tsx',
  'components/investigations/provenance-cluster.tsx',
  'components/investigations/evidence-actions.tsx',
  'components/investigations/gap-detail.tsx',
  'components/investigations/receipt-drawer.tsx',
  'components/investigations/evidence-graph.tsx',
  'components/investigations/pipeline-stage.tsx',
  'components/investigations/discrepancy-card.tsx',
  'components/investigations/ati-request-panel.tsx',
]

const graph = createXrayKe001Graph()
const claimOf = (id: string) => claimView(graph, graph.claims.find((c) => c.id === id)!)
const gapOf = (id: string) => gapView(graph, graph.gaps.find((g) => g.id === id)!)

main()

function main(): void {
  // === A · origin for readers, provenance for the machine ================

  check('1 · no demo-facing copy says "provenance" where "origin" says it', () => {
    for (const file of DEMO_SURFACES) {
      const source = stripComments(read(file))
        .replace(/^\s*import[\s\S]*?from\s*'[^']*'\s*$/gm, '')
      const hit = proseProvenance.exec(source)
      if (hit) {
        const at = source.slice(Math.max(0, hit.index - 50), hit.index + 50)
        return `${file} shows it to a reader: …${at.replace(/\s+/g, ' ')}…`
      }
    }
    // And the replacement is actually present, so this cannot pass by silence.
    const panel = visibleCopy(read('components/investigations/provenance-cluster.tsx'))
    return /Evidence origin/.test(panel)
      ? null : 'the origin panel no longer names itself for a reader'
  })

  check('2 · internal provenance terminology is untouched', () => {
    // The domain, the schema and the invariants keep the technical name.
    const domain = read('lib/xray/domain/index.ts')
    if (!domain.includes('EvidenceProvenance')) return 'the domain type was renamed'
    const migration = read('db/migrations/0001_version_ownership.up.sql')
    if (!migration.includes('evidence_provenance')) return 'the schema table was renamed'
    const invariants = read('docs/architecture/validation-and-invariants.md')
    if (!/provenance/i.test(invariants)) return 'the invariant documentation was reworded'
    // The projection type keeps its name too: this was not a symbol rename.
    const view = read('lib/xray/projections/provenance-view.ts')
    return view.includes('export interface ProvenanceView')
      ? null : 'the projection type was renamed'
  })

  // === B · the two axes, named ===========================================

  check('3 · C001 names both axes rather than stacking two bare numbers', () => {
    const view = provenanceViewForClaim(graph, 'C001')!
    if (!view.lineageLabel.startsWith('Document lineage — '))
      return `lineage label "${view.lineageLabel}"`
    if (!view.independence.originLabel?.startsWith('Evidence origin — '))
      return `origin label "${String(view.independence.originLabel)}"`
    // The component renders the named labels, not the bare ones.
    const panel = stripComments(read('components/investigations/provenance-cluster.tsx'))
    if (!panel.includes('{provenance.lineageLabel}'))
      return 'the panel still renders the unlabelled lineage sentence'
    if (!panel.includes('{provenance.independence.originLabel}'))
      return 'the panel still renders the unlabelled independence sentence'
    return null
  })

  check('4 · C001 traced, repeating and independent counts are unchanged', () => {
    const view = provenanceViewForClaim(graph, 'C001')!
    const observed = [view.sourceCount, view.publicationCount,
      view.independence.independentOriginCount, view.independence.isResolved]
    // The values 11a measured, pinned.
    return JSON.stringify(observed) === JSON.stringify([8, 3, 8, true])
      ? null : `C001 now reads ${JSON.stringify(observed)}`
  })

  check('5 · C002 remains correct and reads coherently', () => {
    const view = provenanceViewForClaim(graph, 'C002')!
    const observed = [view.sourceCount, view.publicationCount,
      view.independence.independentOriginCount]
    if (JSON.stringify(observed) !== JSON.stringify([9, 5, 4]))
      return `C002 now reads ${JSON.stringify(observed)}`
    return view.lineageLabel.includes('9 records traced')
      && view.independence.originLabel?.includes('4 independent')
      ? null : 'C002 labels do not carry its own numbers'
  })

  check('6 · repetition and evidence origin are visibly distinct concepts', () => {
    const view = provenanceViewForClaim(graph, 'C001')!
    if (view.lineageLabel === view.independence.originLabel)
      return 'both axes render the same sentence'
    if (!/repeat another record/.test(view.lineageLabel))
      return 'the lineage axis no longer mentions repetition'
    if (!/independent originating observation/.test(String(view.independence.originLabel)))
      return 'the origin axis no longer mentions independent observation'
    // And the panel's own heading keeps them apart.
    const panel = visibleCopy(read('components/investigations/provenance-cluster.tsx'))
    return /Repetition is not corroboration/.test(panel)
      ? null : 'the panel no longer states that repetition is not corroboration'
  })

  // === C · the six calibration behaviours, visible =======================

  check('7 · layer separation is explained where a claim is shown', () => {
    // XR-INV-002/003. Every label and note is total over the enum.
    for (const layer of ['OBSERVATION', 'INTERPRETATION', 'MEANING'] as const) {
      if (!claimLayerLabel[layer]) return `no label for ${layer}`
      if (!claimLayerNote[layer]) return `no explanation for ${layer}`
    }
    if (!/not a reading of what it means/.test(claimLayerNote.OBSERVATION))
      return 'the observation note does not separate it from interpretation'
    const panel = stripComments(read('components/investigations/finding-panel.tsx'))
    if (!panel.includes('{layerLabel}') || !panel.includes('{layerNote}'))
      return 'the finding panel does not render the layer'
    const explorer = stripComments(read('components/investigations/evidence-explorer.tsx'))
    return /layerLabel=\{claimLayerLabel\[selected\.layer\]\}/.test(explorer)
      ? null : 'the explorer does not pass the selected claim’s layer'
  })

  check('8 · a measurement or scope mismatch is shown as a classification', () => {
    const claim = claimOf('C001')
    if (claim.discrepancies.length === 0) return 'C001 shows no discrepancy'
    const labels = claim.discrepancies.map((item) => item.classificationLabel)
    if (!labels.some((label) => /scope|measur/i.test(label)))
      return `classifications are ${JSON.stringify(labels)}`
    const explorer = visibleCopy(read('components/investigations/evidence-explorer.tsx'))
    return /Discrepancies around this claim/.test(explorer)
      ? null : 'the explorer does not surface discrepancies'
  })

  check('9 · repetition is shown as repetition, not as corroboration', () => {
    const view = provenanceViewForClaim(graph, 'C001')!
    if (!view.hasRepetition) return 'C001 shows no repetition to explain'
    const panel = visibleCopy(read('components/investigations/provenance-cluster.tsx'))
    if (/\d+ sources confirm|sources corroborate/i.test(panel))
      return 'the panel describes repetition as corroboration'
    return /trace to|repeat another record/.test(panel)
      ? null : 'the panel does not say what repetition means'
  })

  check('10 · every record is shown at its actual evidentiary reach', () => {
    /*
     * Institutional authority is not evidentiary strength: a publisher's name
     * says nothing about how close the record is to the thing asserted.
     *
     * HONEST LIMITATION. Every one of this corpus's 38 evidence records was
     * RETRIEVED, and its four `ATTRIBUTED_ORIGIN_NOT_RETRIEVED` sources carry
     * no evidence point — so the sharpest case, a figure attributed to a
     * record nobody obtained, has nothing to render here. What the corpus does
     * carry is the SECONDARY / PRIMARY_ADJACENT / PRIMARY distinction, which
     * is the same behaviour at lower contrast. Fixing the contrast would mean
     * changing the fixture, which 11c is not authorised to do.
     */
    const receipts = graph.claims
      .map((claim) => claimView(graph, claim))
      .flatMap((claim) => [...claim.supporting, ...claim.opposing, ...claim.contextual])
    for (const receipt of receipts) {
      if (!receipt.reachNote) return `${receipt.evidenceId} carries no reach note`
    }
    const notes = new Set(receipts.map((receipt) => receipt.reachNote))
    if (notes.size < 3)
      return `every record reads the same way: ${JSON.stringify([...notes])}`
    const secondary = receipts.find((receipt) => receipt.evidenceClass === 'SECONDARY')!
    if (!/reporting on a record rather than the record itself/.test(secondary.reachNote))
      return `secondary reads "${secondary.reachNote}"`
    const primary = receipts.find((receipt) => receipt.evidenceClass === 'PRIMARY')!
    if (!/originating record itself/.test(primary.reachNote))
      return `primary reads "${primary.reachNote}"`
    // And the unobtained cases are authored, even though this corpus has none.
    const source = read('lib/xray/projections/receipt-view.ts')
    for (const unobtained of ['NOT_LOCATED', 'NOT_RETRIEVED', 'DEAD_LINK',
      'ATTRIBUTED_ORIGIN_NOT_RETRIEVED']) {
      if (!source.includes(unobtained)) return `no wording is authored for ${unobtained}`
    }
    const panel = stripComments(read('components/investigations/finding-panel.tsx'))
    return panel.includes('{receipt.reachNote}')
      ? null : 'the finding panel does not render how far a record was reached'
  })

  check('11 · missing evidence is shown as missing, never as absent', () => {
    const gap = gapOf('GAP-001')
    if (!/Not finding a record is not evidence that it does not exist/.test(gap.searchNote))
      return `search note "${gap.searchNote}"`
    const detail = visibleCopy(read('components/investigations/gap-detail.tsx'))
    if (!/Not finding a record is not evidence that it does not exist/.test(detail))
      return 'the gap page does not state it'
    const preview = stripComments(read('components/investigations/evidence-actions.tsx'))
    return preview.includes('{gap.searchNote}')
      ? null : 'the explorer gap preview does not state it'
  })

  check('12 · the unresolved financial bridge states what would settle it', () => {
    const gap = gapOf('GAP-001')
    if (!/16\.7 billion/.test(gap.missingEvidence))
      return `GAP-001 is not the financial bridge: "${gap.missingEvidence.slice(0, 60)}"`
    if (gap.recordsSought.length === 0) return 'it names nothing that would settle it'
    return gap.whyItMatters.length > 0 ? null : 'it does not say why it matters'
  })

  check('13 · no surface displays a calibration identifier', () => {
    for (const file of DEMO_SURFACES) {
      const hit = /\bCAL-\d{3}\b|\bFM-\d{3}\b/.exec(read(file))
      if (hit) return `${file} displays ${hit[0]}`
    }
    return null
  })

  // === E · headings ======================================================

  check('14/15 · the explorer has exactly one h1, and the claim is subordinate', () => {
    const explorer = read('components/investigations/evidence-explorer.tsx')
    const finding = read('components/investigations/finding-panel.tsx')
    const explorerH1 = (explorer.match(/<h1[\s>]/g) ?? []).length
    const findingH1 = (finding.match(/<h1[\s>]/g) ?? []).length
    if (explorerH1 !== 1) return `${explorerH1} h1 element(s) in the explorer`
    if (findingH1 !== 0) return `${findingH1} h1 element(s) in the finding panel`
    // The one h1 is the article title; the claim is an h2 beneath it.
    if (!/<h1[^>]*>\s*\{investigation\.surface\.title\}/.test(explorer))
      return 'the explorer h1 is not the investigation title'
    return /<h2[^>]*>\s*\{finding\.claimText\}/.test(finding)
      ? null : 'the selected claim is not subordinate to the page heading'
  })

  // === F · findings are not verdicts =====================================

  check('16 · a finding reads as reversible, not as a verdict', () => {
    const claim = claimOf('C001')
    const note = claim.finding!.reversibilityNote
    if (!/not a verdict/.test(note)) return `note "${note}"`
    if (!/what the evidence supported/.test(note))
      return 'the note does not say what the status actually is'
    if (claim.finding!.wouldChangeFinding.length === 0)
      return 'C001 names nothing that would change it'
    const panel = visibleCopy(read('components/investigations/finding-panel.tsx'))
    for (const verdict of [/X-Ray confirms/i, /\bproven\b/i, /\bverdict\b(?! X)/i,
      /truth score/i, /\bdebunk/i, /\bfalse claim\b/i]) {
      const hit = verdict.exec(panel)
      if (hit) return `the panel says "${hit[0]}"`
    }
    return /What would change this finding/.test(panel)
      ? null : 'the panel does not ask what would change the finding'
  })

  // === G · gaps ==========================================================

  check('17/18 · a material gap states what is missing and what would settle it', () => {
    const gap = gapOf('GAP-001')
    if (gap.missingEvidence.trim() === '') return 'nothing is stated as missing'
    if (gap.recordsSought.length === 0) return 'nothing is stated as settling it'
    const preview = stripComments(read('components/investigations/evidence-actions.tsx'))
    if (!preview.includes('{gap.missingEvidence}')) return 'the preview omits what is missing'
    if (!preview.includes('{gap.recordsSought[0]}'))
      return 'the preview omits what would settle it'
    return preview.includes('{gap.nextStep}')
      ? null : 'the preview omits what happens now'
  })

  check('19/20 · only a public-record gap offers a records request', () => {
    const eligible = gapOf('GAP-001')
    const waiting = gapOf('GAP-003')
    if (eligible.resolutionPath !== 'PUBLIC_RECORD_REQUEST')
      return `GAP-001 is ${eligible.resolutionPath}`
    if (waiting.resolutionPath !== 'WAIT_FOR_RECORD')
      return `GAP-003 is ${waiting.resolutionPath}`
    if (!eligible.offersRecordsRequest) return 'the eligible gap offers no request'
    if (waiting.offersRecordsRequest) return 'the waiting gap offers a request'
    if (eligible.nextStep === waiting.nextStep) return 'both paths state the same next step'
    if (!/can be requested/.test(eligible.nextStep))
      return `eligible next step "${eligible.nextStep}"`
    if (!/nothing to request/.test(waiting.nextStep))
      return `waiting next step "${waiting.nextStep}"`
    // The action is gated on the flag, not on prose.
    const preview = stripComments(read('components/investigations/evidence-actions.tsx'))
    if (!/gap\.offersRecordsRequest[\s\S]{0,120}Draft records request/.test(preview))
      return 'the records-request action is not gated on the resolution path'
    return null
  })

  // === H · the public exact version ======================================

  check('21 · the public version keeps claim, origin, finding and gap distinct', () => {
    const html = read('lib/xray/publication/public-html.ts')
    for (const required of ['Claims examined', 'Records traced', 'Independent origins',
      'Open gaps', 'repetition is not corroboration']) {
      if (!html.includes(required)) return `the public version omits "${required}"`
    }
    // Claim rows carry the finding and its gap count.
    if (!/findingStatusLabel/.test(html)) return 'claim rows carry no finding status'
    return /gapCount/.test(html) ? null : 'claim rows carry no gap count'
  })

  check('22 · the public version embeds no mutable ATI state or action control', () => {
    const html = stripComments(read('lib/xray/publication/public-html.ts'))
    const atiToken = /\bATI\b|\bati_|atiRequest|custodyBasis|holdingInstitution|receiptLabel/
    if (atiToken.test(html)) return 'the public version references ATI lifecycle state'
    // No action controls at all: a published version is a document.
    return /<button|<form|onclick/i.test(html)
      ? 'the public version carries an action control' : null
  })

  // === canonical data untouched ==========================================

  check('23/24 · canonical counts, findings, gap statuses and paths are unchanged', () => {
    const observed = {
      claims: graph.claims.length, sources: graph.sources.length,
      evidence: graph.evidence.length, findings: graph.findings.length,
      gaps: graph.gaps.length, discrepancies: graph.discrepancies.length,
      statuses: graph.findings.map((finding) => finding.status).sort(),
      gapStatuses: graph.gaps.map((gap) => gap.status).sort(),
      paths: graph.gaps.map((gap) => gap.resolutionPath).sort(),
      layers: graph.claims.map((claim) => claim.layer).sort(),
    }
    // Pinned from the corpus as 11a measured it. 11c changes presentation only.
    const expected = {
      claims: 6, sources: 22, evidence: 38, findings: 6, gaps: 6, discrepancies: 4,
      statuses: ['CONTESTED', 'INSUFFICIENT_EVIDENCE', 'SUPPORTED', 'SUPPORTED', 'SUPPORTED',
        'UNRESOLVED'],
      gapStatuses: ['OPEN', 'OPEN', 'OPEN', 'OPEN', 'OPEN', 'OPEN'],
      paths: ['PUBLIC_RECORD_REQUEST', 'PUBLIC_RECORD_REQUEST', 'PUBLIC_RECORD_REQUEST',
        'PUBLIC_RECORD_REQUEST', 'PUBLIC_RECORD_REQUEST', 'WAIT_FOR_RECORD'],
      layers: ['OBSERVATION', 'OBSERVATION', 'OBSERVATION', 'OBSERVATION', 'OBSERVATION',
        'OBSERVATION'],
    }
    return JSON.stringify(observed) === JSON.stringify(expected)
      ? null : `canonical state changed: ${JSON.stringify(observed)}`
  })

  report()
}

function report(): void {
  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
  }
  const failed = results.filter((result) => !result.ok).length
  console.log(`\n${results.length - failed}/${results.length} legibility checks passed`)
  if (failed > 0) process.exitCode = 1
}
