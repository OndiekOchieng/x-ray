/**
 * The Finding 3 gate: what X-Ray actually searches for.
 *
 * THE FIXTURE IS FIRST LIGHT'S OWN SHAPE
 * ======================================
 * The surface record is the article first light ran — its recorded URL and
 * title — and the two surface claims are the generic ones `DECOMPOSE`
 * produced from it. Neither claim names a country, which is the whole
 * difficulty: the investigation's context lives on the record, not in the
 * claims decomposed out of it.
 *
 * The corpus is first light's own result: the Auditor General of Ontario, a
 * Michigan subsidy audit, a commentator on Guyana's Auditor General and a US
 * Senate hearing on the DCAA — the four documents the unanchored query
 * actually found — plus the Kenyan material that search should have reached.
 *
 * THE ORACLE, AND WHAT IT DOES NOT PROVE
 * ======================================
 * `oracleAdapter` is a stand-in search engine: it returns documents whose
 * context the query mentions, and — when a query mentions no context at all —
 * the globally plausible ones, in the order first light got them. That models
 * "a search engine returns what you asked for", which is fair, but it is my
 * construction and not evidence about Anthropic's web search.
 *
 * So this gate proves the anchors **reach the provider with the
 * investigation's context attached**, and that the queries differ by
 * jurisdiction. Whether the live retrieval actually improves is a question
 * only the civic rerun can answer, and this slice does not run it.
 *
 * No relevance score exists in the implementation. The oracle is the fixture's
 * and stays in the fixture.
 *
 * Run:  pnpm check:query-plan
 */

import { readdirSync, readFileSync } from 'node:fs'

import { available, type CapabilityResult } from '@/lib/xray/capability'
import type { Claim, Source } from '@/lib/xray/domain'
import { runPipeline } from '@/lib/xray/pipeline/run'
import type { ResearchModel } from '@/lib/xray/pipeline/model-port'
import type { ProposalRef } from '@/lib/xray/pipeline/proposals'
import {
  isInspectable, type ResearchAdapter, type RetrievalQuery,
  type RetrievalResult, type RetrievedDocument,
} from '@/lib/xray/pipeline/retrieval-port'
import {
  investigationAnchors, planQuery, describeQueryPlan, type QueryPlan,
} from '@/lib/xray/pipeline/query-plan'
import { createIdentityAllocator, seedFrom } from '@/lib/xray/pipeline/identity'
import { CorrelationLedger } from '@/lib/xray/pipeline/correlation'
import { createXRayGraph } from '@/lib/xray/selectors'
import { submittedInvestigation } from '@/lib/xray/application/runtime'
import { liveStages, newRunMaterial, type RunMaterial } from './live-stages'

type Check = { name: string; run: () => string | null | Promise<string | null> }
const checks: Check[] = []
const check = (name: string, run: Check['run']) => { checks.push({ name, run }) }

process.on('unhandledRejection', (reason) => {
  console.error(`\nFAIL  an unhandled rejection escaped a check: ${String(reason)}`)
  process.exit(1)
})

const AT = '2026-09-21T12:00:00Z'

// ---------------------------------------------------------------------------
// First light's surface record
// ---------------------------------------------------------------------------

/** The URL first light ran. Recorded in verification/issue-20-20e. */
const SURFACE_URL = 'https://www.standardmedia.co.ke/national/article/2001512734'
  + '/audit-shame-of-counties-blowing-millions-on-bogus-projects-travel'
/** Its recorded title. */
const SURFACE_TITLE = 'Audit: Shame of counties blowing millions on bogus projects, travel'
/**
 * The publisher and date are the fixture's.
 *
 * First light's inspection recorded the URL and the title; it did not print
 * `observed.publisher` or `observed.publishedAt`. Both are plausible for that
 * outlet and both are ordinary `ObservedDocumentMetadata` fields `INGEST`
 * already copies onto the surface `Source` — but they are stated here rather
 * than quoted, and nothing in the implementation depends on them existing.
 * Check 6 covers the case where they do not.
 */
const SURFACE_PUBLISHER = 'The Standard'
const SURFACE_PUBLISHED_AT = '2026-09-19'

/** The generic surface claims first light's DECOMPOSE produced. */
const GENERIC_CLAIM = 'The Auditor General has highlighted wastage of public funds by counties.'
const VALUE_CLAIM = "The Auditor General's findings raise questions about whether"
  + ' taxpayers are getting value for money.'

const ARTICLE = `${SURFACE_TITLE}. ${GENERIC_CLAIM} ${VALUE_CLAIM}`
  + ' A county hospital also bought equipment that was never delivered.'

// ---------------------------------------------------------------------------
// The corpus, and the search oracle over it
// ---------------------------------------------------------------------------

interface CorpusEntry {
  readonly locator: string
  readonly title: string
  /** Terms a query must mention for this document to be about the right thing. */
  readonly topic: readonly string[]
  /**
   * Context the document belongs to.
   *
   * A query mentioning none of any document's context is an unanchored query,
   * and gets the globally plausible answers in corpus order — which is what
   * first light got.
   */
  readonly context: readonly string[]
}

/** First light's four wrong countries, in the order it received them. */
const OFF_TOPIC: readonly CorpusEntry[] = [
  {
    locator: 'https://www.auditor.on.ca/en/content/careers/ourwork.html',
    title: 'Office of the Auditor General of Ontario',
    topic: ['auditor general'], context: ['ontario', 'canada'],
  },
  {
    locator: 'https://www.michigancapitolconfidential.com/corporate-welfare-continues-again',
    title: 'Déjà Vu All Over Again For Auditor General Report On Select Subsidy Programs',
    topic: ['auditor general'], context: ['michigan'],
  },
  {
    locator: 'https://www.chrisram.net/?tag=auditor-general',
    title: 'Auditor General - ChrisRam.net',
    topic: ['auditor general'], context: ['guyana'],
  },
  {
    locator: 'https://www.govinfo.gov/content/pkg/CHRG-110shrg45573/html/CHRG-110shrg45573.htm',
    title: 'Expediency versus integrity: assembly-line audits at the DCAA',
    topic: ['auditor general', 'audit'], context: ['defense contract audit agency'],
  },
]

/** What the search should have reached, given the investigation's context. */
const ON_TOPIC: readonly CorpusEntry[] = [
  {
    locator: 'https://www.oagkenya.go.ke/reports/county-governments-2025',
    title: 'Report of the Auditor-General on county governments',
    topic: ['auditor general', 'counties'],
    context: ['the standard', 'standardmedia.co.ke', '2026'],
  },
  {
    locator: 'https://nation.africa/counties/audit-queries-bogus-projects',
    title: 'Audit queries over bogus county projects',
    topic: ['auditor general', 'counties', 'public funds'],
    context: ['the standard', 'standardmedia.co.ke'],
  },
  {
    locator: 'https://www.oagkenya.go.ke/reports/hospital-equipment-2025',
    title: 'Audit of county hospital equipment procurement',
    topic: ['hospital', 'equipment'],
    context: ['the standard', 'standardmedia.co.ke'],
  },
]

const CORPUS: readonly CorpusEntry[] = [...OFF_TOPIC, ...ON_TOPIC]
const ALL_CONTEXT = [...new Set(CORPUS.flatMap((entry) => entry.context))]

/** Everything the query said, terms and constraints alike, lowercased. */
const said = (query: RetrievalQuery): string =>
  [query.terms, ...(query.constraints ?? [])].join(' ').toLowerCase()

/**
 * A stand-in search engine. Returns what the query asked for.
 *
 * Topic first: a document whose subject the query never mentions is never
 * returned, so a query that lost its claim terms finds nothing. Then context:
 * a query that names a context gets that context's documents; a query that
 * names none gets the globally plausible ones.
 */
function oracleSearch(query: RetrievalQuery, limit: number): readonly CorpusEntry[] {
  const text = said(query)
  const onTopic = CORPUS.filter((entry) => entry.topic.some((term) => text.includes(term)))
  const mentioned = ALL_CONTEXT.filter((context) => text.includes(context))
  const scoped = mentioned.length === 0
    ? onTopic
    : onTopic.filter((entry) => entry.context.some((context) => mentioned.includes(context)))
  return scoped.slice(0, limit)
}

const asDocument = (
  entry: CorpusEntry, index: number, withText: boolean,
): RetrievedDocument => ({
  ref: `ref:s${index + 1}` as ProposalRef,
  locator: entry.locator,
  outcome: withText ? 'RETRIEVED' : 'NOT_RETRIEVED',
  retrievedAt: AT,
  observed: { title: entry.title },
  ...(withText
    ? { extract: { text: `${entry.title}. Audit material about ${entry.context[0]}.`, truncated: false } }
    : {}),
})

interface SurfaceFacts {
  readonly locator?: string
  readonly publisher?: string
  readonly publishedAt?: string
  readonly title?: string
}

/** The retrieval adapter: the oracle for search, the surface record for fetch. */
function oracleAdapter(
  surface: SurfaceFacts = {}, seen?: RetrievalQuery[],
): ResearchAdapter {
  const surfaceLocator = surface.locator ?? SURFACE_URL
  return {
    name: 'oracle:retrieval',
    capabilities: ['search', 'retrieve'],
    async search(query: RetrievalQuery): Promise<CapabilityResult<RetrievalResult>> {
      seen?.push(query)
      return available({
        query,
        documents: oracleSearch(query, query.maxResults ?? 5)
          .map((entry, index) => asDocument(entry, index, false)),
      })
    },
    async retrieve(locator: string): Promise<CapabilityResult<RetrievedDocument>> {
      if (locator === surfaceLocator) {
        return available({
          ref: 'ref:d1' as ProposalRef,
          locator,
          outcome: 'RETRIEVED',
          retrievedAt: AT,
          observed: {
            title: surface.title ?? SURFACE_TITLE,
            ...(surface.publisher === undefined ? {} : { publisher: surface.publisher }),
            ...(surface.publishedAt === undefined ? {} : { publishedAt: surface.publishedAt }),
          },
          extract: { text: ARTICLE, truncated: false },
        })
      }
      const entry = CORPUS.find((item) => item.locator === locator)
      if (entry === undefined) {
        return available({
          ref: 'ref:d1' as ProposalRef, locator, outcome: 'DEAD_LINK',
          retrievedAt: AT, observed: {},
        })
      }
      return available(asDocument(entry, 0, true))
    },
  }
}

// ---------------------------------------------------------------------------
// The model stub: first light's decomposition, nothing more
// ---------------------------------------------------------------------------

function stubModel(): ResearchModel {
  return {
    name: 'stub:model',
    async decompose(input) {
      void input
      return available([
        {
          text: GENERIC_CLAIM,
          sourcePassage: GENERIC_CLAIM,
          layer: 'OBSERVATION', type: 'ATTRIBUTION', priority: 'HIGH',
          // Exactly what first light had: entities the claim text already names.
          entities: ['Auditor General', 'counties'],
        },
        {
          text: VALUE_CLAIM,
          sourcePassage: VALUE_CLAIM,
          layer: 'MEANING', type: 'OTHER', priority: 'MEDIUM',
          entities: ['Auditor General', 'taxpayers'],
        },
        {
          text: 'A county hospital bought equipment that was never delivered.',
          sourcePassage: 'A county hospital also bought equipment that was never delivered.',
          layer: 'OBSERVATION', type: 'DELIVERY', priority: 'HIGH',
          entities: ['hospital', 'equipment'],
        },
      ])
    },
    async classify(input) {
      return available(input.claims.map((claim) => ({
        claimRef: claim.ref,
        layer: 'OBSERVATION' as const,
        type: 'ATTRIBUTION' as const,
        priority: 'HIGH' as const,
      })))
    },
    async trace(input) {
      const readable = input.documents.find((entry) => isInspectable(entry))
      if (readable === undefined) return available({ evidence: [], discoveredClaims: [] })
      return available({
        evidence: [{
          sourceRef: readable.ref,
          proposition: 'An audit record bears on the claim.',
          relationship: 'SUPPORTS' as const,
          strength: 'DIRECT' as const,
          knowledgeBasis: 'ADMINISTRATIVE_RECORD' as const,
          claimRefs: [input.claim.ref],
          quotedPassage: readable.extract?.text.slice(0, 80) ?? '',
        }],
        discoveredClaims: [],
      })
    },
    async disconfirm() { return available([]) },
    async reconcile() { return available([]) },
    async grade(input) {
      return available([{
        claimRef: input.claim.ref,
        status: 'PARTIALLY_SUPPORTED' as const,
        confidence: 'MEDIUM' as const,
        rationale: 'One audit record bears on it.',
        supportingEvidenceRefs: input.evidence.map((entry) => entry.ref),
        challengingEvidenceRefs: [],
        contextualEvidenceRefs: [],
        discrepancyRefs: [],
        wouldChangeFinding: ['The audit report itself.'],
      }])
    },
    async identifyGaps() { return available([]) },
  }
}

// ---------------------------------------------------------------------------
// Driving a run
// ---------------------------------------------------------------------------

interface RunOptions {
  readonly surface?: SurfaceFacts
  readonly focus?: string
  readonly observed?: QueryPlan[]
}

async function driveRun(options: RunOptions = {}): Promise<{
  material: RunMaterial
  graph: Awaited<ReturnType<typeof runPipeline>>['graph']
  queries: RetrievalQuery[]
}> {
  const material = newRunMaterial()
  const queries: RetrievalQuery[] = []
  const sourceUrl = options.surface?.locator ?? SURFACE_URL
  const stages = liveStages({
    sourceUrl,
    material,
    now: () => AT,
    retrieveLimit: 5,
    ...(options.observed === undefined
      ? {} : { observeQueryPlan: (plan: QueryPlan) => { options.observed!.push(plan) } }),
  })
  const investigation = submittedInvestigation('XRAY-QP-001', '2026-09-19T00:00:00Z')
  const result = await runPipeline({
    investigation: options.focus === undefined
      ? investigation
      : { ...investigation, focus: options.focus },
    stages,
    adapters: {
      model: stubModel(),
      research: oracleAdapter(options.surface ?? {
        publisher: SURFACE_PUBLISHER, publishedAt: SURFACE_PUBLISHED_AT,
      }, queries),
    },
    maxAttempts: 1,
  })
  return { material, graph: result.graph, queries }
}

/** The plan for the generic claim — the one first light got wrong. */
const genericPlan = (material: RunMaterial): QueryPlan | undefined =>
  [...material.queryPlans.values()].find((plan) => plan.claimTerms.startsWith(GENERIC_CLAIM))

/** Locators the run gathered for a claim whose terms start with `prefix`. */
function gatheredFor(material: RunMaterial, prefix: string): readonly string[] {
  const claimId = [...material.queryPlans.entries()]
    .find(([, plan]) => plan.claimTerms.startsWith(prefix))?.[0]
  if (claimId === undefined) return []
  return (material.gathered.get(claimId)?.documents ?? [])
    .map((document) => document.locator ?? '(no locator)')
}

// ---------------------------------------------------------------------------

check('1 · the first-light shape carries investigation anchors into a generic query', async () => {
  const { material } = await driveRun()
  const plan = genericPlan(material)
  if (plan === undefined) return 'no query was planned for the generic claim'

  // The claim is still the subject.
  if (!plan.query.terms.startsWith(GENERIC_CLAIM))
    return `the query does not lead with the claim: ${plan.query.terms}`

  // And the investigation's own context is attached.
  const origins = plan.anchors.map((anchor) => anchor.origin)
  if (plan.anchors.length === 0)
    return `no anchor reached the query (redundant: ${plan.redundant.length})`
  for (const wanted of ['SURFACE_PUBLISHER', 'SURFACE_HOST']) {
    if (!origins.includes(wanted as never))
      return `anchors were ${JSON.stringify(origins)}`
  }
  const text = said(plan.query)
  if (!text.includes('standardmedia.co.ke')) return 'the publication host is not in the query'
  if (!text.includes('the standard')) return 'the publisher is not in the query'

  /*
   * The two entities first light had are in the claim's own text, so they are
   * recorded as considered-and-not-repeated rather than dropped silently.
   */
  return plan.redundant.some((anchor) => anchor.term === 'Auditor General')
    ? null : `redundant anchors: ${JSON.stringify(plan.redundant)}`
})

check('2 · the fixture reproduces first light, and the anchors change the result', async () => {
  /*
   * Calibration, and the point of the whole slice in one check. The same
   * corpus, the same claim, the same oracle — the only difference is whether
   * the investigation's anchors reached the query.
   */
  const unanchored = planQuery(
    { id: 'C002', text: GENERIC_CLAIM, entities: ['Auditor General', 'counties'] },
    [], { maxResults: 5 })
  const found = oracleSearch(unanchored.query, 5).map((entry) => entry.locator)
  const firstLight = OFF_TOPIC.map((entry) => entry.locator)
  for (const locator of firstLight) {
    if (!found.includes(locator)) return `the unanchored query missed ${locator}`
  }

  // Now the real run.
  const { material } = await driveRun()
  const gathered = gatheredFor(material, GENERIC_CLAIM)
  if (gathered.length === 0) return 'the anchored query gathered nothing'
  const wrong = gathered.filter((locator) => firstLight.includes(locator))
  if (wrong.length > 0)
    return `the anchored query still returned ${wrong.length} off-topic record(s): ${wrong.join(', ')}`
  const right = gathered.filter((locator) =>
    ON_TOPIC.some((entry) => entry.locator === locator))
  return right.length > 0
    ? null : `the anchored query returned none of the on-topic corpus: ${gathered.join(', ')}`
})

check('3 · the same generic claim in two jurisdictions produces two queries', async () => {
  const kenyan = await driveRun()
  const ontarian = await driveRun({
    surface: {
      locator: 'https://www.thestar.com/news/ontario/auditor-general-report',
      publisher: 'Toronto Star',
      publishedAt: '2026-05-02',
      title: 'Auditor General reports on municipal spending',
    },
  })

  const a = genericPlan(kenyan.material)
  const b = genericPlan(ontarian.material)
  if (a === undefined || b === undefined) return 'one investigation planned no query'

  // Same claim, verbatim.
  if (a.claimTerms !== b.claimTerms) return 'the fixtures do not share the claim'
  // Different query.
  if (a.query.terms === b.query.terms) return `both searched for: ${a.query.terms}`
  // And no anchor in common.
  /*
   * No anchor in common — except the year, which two investigations published
   * in the same year legitimately share. A period is not a jurisdiction, and
   * the jurisdiction anchors must differ.
   */
  const place = (plan: QueryPlan) => plan.anchors
    .filter((anchor) => anchor.origin !== 'SURFACE_PERIOD')
    .map((anchor) => anchor.term.toLowerCase())
  const shared = place(a).filter((term) => place(b).includes(term))
  if (shared.length > 0) return `shared anchors: ${JSON.stringify(shared)}`

  // The Ontario investigation gets Ontario context, from its own record.
  const text = said(b.query)
  return text.includes('toronto star') && text.includes('thestar.com')
    ? null : `the Ontario query carried: ${b.query.terms}`
})

check('4 · claim specificity survives anchoring', async () => {
  /*
   * Two claims, one investigation, the same anchors. If anchoring had drowned
   * the claim, both would gather the same material.
   */
  const { material } = await driveRun()
  const audit = gatheredFor(material, GENERIC_CLAIM)
  const hospital = gatheredFor(material, 'A county hospital')
  if (audit.length === 0 || hospital.length === 0)
    return `audit ${audit.length}, hospital ${hospital.length}`

  const hospitalRecord = 'https://www.oagkenya.go.ke/reports/hospital-equipment-2025'
  if (!hospital.includes(hospitalRecord))
    return `the hospital claim gathered ${hospital.join(', ')}`
  if (audit.includes(hospitalRecord))
    return 'the audit claim gathered the hospital record'
  return null
})

check('5 · the claim leads its own query and is never displaced', () => {
  const long = 'x'.repeat(400)
  const anchors = investigationAnchors({
    focus: 'one named project',
    surfaceClaims: [
      { entities: ['County Assembly', 'Ministry of Health'] },
      { entities: ['County Assembly', 'Ministry of Health'] },
    ],
    surfaceSource: {
      publisher: SURFACE_PUBLISHER, institution: 'Office of the Auditor General',
      url: SURFACE_URL, publishedAt: SURFACE_PUBLISHED_AT,
    },
  })
  const plan = planQuery({ id: 'C001', text: long, entities: ['alpha', 'beta'] }, anchors)

  // 180 characters of claim text, then its own entities, then anchors.
  if (!plan.query.terms.startsWith(`${'x'.repeat(180)} alpha beta `))
    return `terms began: ${plan.query.terms.slice(0, 200)}`
  if (plan.claimTerms.length !== 180 + ' alpha beta'.length)
    return `claim terms were ${plan.claimTerms.length} characters`
  // The claim's own entities are in the constraints ahead of any anchor.
  return plan.query.constraints?.[0] === 'alpha' && plan.query.constraints?.[1] === 'beta'
    ? null : `constraints: ${JSON.stringify(plan.query.constraints)}`
})

check('6 · no anchors degrades to the claim query, and invents nothing', async () => {
  /*
   * A surface record with no publisher, no institution, no date, an
   * unparseable locator, and claims that name nothing. The honest result is
   * the query X-Ray built before this slice — not a guessed jurisdiction.
   */
  const anchors = investigationAnchors({
    surfaceClaims: [{ entities: [] }],
    surfaceSource: { url: 'not-a-url' },
  })
  if (anchors.length !== 0) return `anchors from nothing: ${JSON.stringify(anchors)}`

  const claim = { id: 'C002', text: GENERIC_CLAIM, entities: ['Auditor General', 'counties'] }
  const plan = planQuery(claim, anchors, { maxResults: 5 })
  const before = `${GENERIC_CLAIM} Auditor General counties`
  if (plan.query.terms !== before) return `terms: ${plan.query.terms}`
  if (JSON.stringify(plan.query.constraints) !== JSON.stringify(['Auditor General', 'counties']))
    return `constraints: ${JSON.stringify(plan.query.constraints)}`

  // Through the real run, with a surface record carrying no metadata at all.
  const { material } = await driveRun({ surface: { locator: SURFACE_URL } })
  const planned = genericPlan(material)
  if (planned === undefined) return 'no query was planned'
  const text = said(planned.query)
  // The host is present because the record has one; nothing else was invented.
  for (const invented of ['kenya', 'county government of', 'ontario', 'nairobi']) {
    if (text.includes(invented)) return `the query invented "${invented}": ${planned.query.terms}`
  }
  return null
})

check('7 · anchors mint nothing canonical', async () => {
  /*
   * `focus` is an anchor and only an anchor: no stage reads it and no artifact
   * has a field for it. So a sentinel focus is a tracer — it must appear in
   * every query and in no canonical object.
   */
  const SENTINEL = 'XRAY-ANCHOR-SENTINEL-not-a-fact-about-the-world'
  const { material, graph } = await driveRun({ focus: SENTINEL })

  const plans = [...material.queryPlans.values()]
  if (plans.length === 0) return 'no queries were planned'
  for (const plan of plans) {
    if (!plan.query.terms.includes(SENTINEL))
      return `${plan.claimId} did not carry the focus: ${plan.query.terms}`
  }

  // Now: nowhere in canonical state.
  const canonical = JSON.stringify({
    claims: graph.claims, sources: graph.sources, evidence: graph.evidence,
    findings: graph.findings, gaps: graph.gaps, discrepancies: graph.discrepancies,
    disconfirmations: graph.disconfirmations,
    sourcePositions: graph.sourcePositions ?? [],
  })
  if (canonical.includes(SENTINEL)) return 'an anchor reached canonical state'

  // And the graph is the same graph a run without the focus produced.
  const plain = await driveRun()
  const shape = (claims: readonly Claim[]) =>
    claims.map((claim) => `${claim.text}|${claim.entities.join(',')}`).sort().join(' / ')
  if (shape(graph.claims) !== shape(plain.graph.claims))
    return 'the focus changed the claims'
  const sourceShape = (sources: readonly Source[]) =>
    sources.map((source) => `${source.url ?? ''}|${source.publisher ?? ''}`).sort().join(' / ')
  return sourceShape(graph.sources) === sourceShape(plain.graph.sources)
    ? null : 'the focus changed the sources'
})

check('8 · what was searched for is inspectable run state', async () => {
  const observed: QueryPlan[] = []
  const { material, graph, queries } = await driveRun({ observed })

  if (material.queryPlans.size !== graph.claims.filter((c) => c.origin === 'SURFACE').length)
    return `${material.queryPlans.size} plans for ${graph.claims.length} claims`
  if (observed.length !== material.queryPlans.size)
    return `the observer saw ${observed.length} of ${material.queryPlans.size} plans`

  // The plan describes the search that was actually issued.
  const plan = genericPlan(material)
  if (plan === undefined) return 'no plan for the generic claim'
  if (!queries.some((query) => query.terms === plan.query.terms))
    return `no search matched the plan: ${JSON.stringify(queries.map((q) => q.terms))}`

  // It is printable without leaking anything canonical.
  const line = describeQueryPlan(plan)
  if (!line.includes(plan.claimId) || !line.includes('SURFACE_PUBLISHER'))
    return `the description is not usable: ${line}`

  // And it is run state: the graph does not carry it.
  return Object.keys(graph as object).includes('queryPlans')
    ? 'the graph carries the query plans' : null
})

check('9 · the anchor budget holds, and the rest still narrows the search', () => {
  const anchors = investigationAnchors({
    focus: 'the bypass contract',
    surfaceClaims: [
      { entities: ['County Assembly', 'Ministry of Health'], timeScope: { asOf: '2026-03-31' } },
      { entities: ['County Assembly', 'Controller of Budget'] },
      { entities: ['Ministry of Health'] },
    ],
    surfaceSource: {
      publisher: SURFACE_PUBLISHER, institution: 'Office of the Auditor General',
      url: SURFACE_URL, publishedAt: SURFACE_PUBLISHED_AT,
    },
  })
  // Recurring entities only: the Controller of Budget is named once.
  const terms = anchors.map((anchor) => anchor.term)
  if (terms.includes('Controller of Budget'))
    return `a single claim's entity became an anchor: ${JSON.stringify(terms)}`
  if (!terms.includes('County Assembly') || !terms.includes('Ministry of Health'))
    return `recurring entities missing: ${JSON.stringify(terms)}`
  if (anchors.length !== 7) return `${anchors.length} anchors: ${JSON.stringify(terms)}`

  // Rank order: focus, then what the claims keep naming, then the record.
  const origins = anchors.map((anchor) => anchor.origin)
  if (origins[0] !== 'INVESTIGATION_FOCUS') return `first anchor: ${origins[0]}`
  if (origins[origins.length - 1] !== 'SURFACE_PERIOD')
    return `last anchor: ${origins[origins.length - 1]}`

  /*
   * A claim that already names the publisher — "The Standard reported…". The
   * anchor is recorded as considered, dropped from the terms, and appears
   * once in the query rather than twice.
   */
  const plan = planQuery({
    id: 'C002',
    text: `${SURFACE_PUBLISHER} reported that the Auditor General queried county spending.`,
    entities: [],
  }, anchors)
  if (!plan.redundant.some((anchor) => anchor.term === SURFACE_PUBLISHER))
    return `the publisher was not recorded redundant: ${JSON.stringify(plan.redundant)}`
  if (plan.query.terms.split(SURFACE_PUBLISHER).length - 1 !== 1)
    return `the publisher appears twice: ${plan.query.terms}`

  if (plan.anchors.length !== 3) return `${plan.anchors.length} anchors in the terms`
  if (plan.deferred.length !== anchors.length - 3 - plan.redundant.length)
    return `${plan.deferred.length} deferred of ${anchors.length}`
  // Deferred is not discarded: it still narrows through the constraints.
  for (const anchor of plan.deferred) {
    if (!(plan.query.constraints ?? []).includes(anchor.term))
      return `${anchor.term} was dropped entirely`
  }
  return null
})

check('10 · tracing cannot re-anchor the investigation', async () => {
  /*
   * A discovered claim is evidence about the world, not context the
   * investigation was submitted with. This is the resume shape: `PLAN` runs
   * again over a graph that already holds what `TRACE` found, and first
   * light's DC001 — the Ontario Auditor General — is sitting in it. If
   * Ontario could anchor the next round of searching, one wrong result would
   * steer the rest of the run, and a run that drifted could not be pulled
   * back by anything downstream.
   */
  const material = newRunMaterial()
  const stages = liveStages({
    sourceUrl: SURFACE_URL, material, now: () => AT, retrieveLimit: 5,
  })
  const plan = stages.find((stage) => stage.stage === 'PLAN')
  if (plan === undefined) return 'no PLAN stage'

  const surfaceSource: Source = {
    id: 'SRC-001', title: SURFACE_TITLE, publisher: SURFACE_PUBLISHER,
    url: SURFACE_URL, publishedAt: SURFACE_PUBLISHED_AT, retrievedAt: AT,
    sourceType: 'NEWS', evidenceClass: 'SECONDARY', originStatus: 'UNKNOWN',
    accessibility: 'RETRIEVED',
  }
  const claim = (
    id: string, origin: 'SURFACE' | 'DISCOVERED', text: string, entities: string[],
  ) => ({
    id, origin, text, investigationId: 'XRAY-QP-002', sourcePassage: text,
    layer: 'OBSERVATION', type: 'ATTRIBUTION', priority: 'HIGH',
    entities, ambiguities: [],
  })
  const graph = createXRayGraph({
    investigation: {
      ...submittedInvestigation('XRAY-QP-002', '2026-09-19T00:00:00Z'),
      surfaceSourceId: 'SRC-001',
    },
    sources: [surfaceSource],
    evidence: [], sourcePositions: [], sourceDependencies: [], evidenceProvenance: [],
    discrepancies: [], disconfirmations: [], findings: [], gaps: [],
    claims: [
      claim('C001', 'SURFACE', GENERIC_CLAIM, ['Auditor General', 'counties']),
      claim('C002', 'SURFACE', VALUE_CLAIM, ['Auditor General', 'taxpayers']),
      // What first light actually discovered, entities and all.
      claim('DC001', 'DISCOVERED',
        "The Ontario Auditor General's mandate defines performance audits.",
        ['Ontario', 'Auditor General of Ontario']),
    ] as never,
  } as never)

  await plan.run({
    investigationId: 'XRAY-QP-002' as never,
    graph,
    ids: createIdentityAllocator(seedFrom(graph as never)),
    inputArtifactVersion: 5,
    attempt: 1,
    adapters: {},
    correlation: { investigationId: 'XRAY-QP-002' as never, stage: 'PLAN', inputArtifactVersion: 5 },
    ledger: new CorrelationLedger(),
  })

  // Every claim was planned for, the discovered one included.
  if (material.queryPlans.size !== 3) return `${material.queryPlans.size} plans for 3 claims`

  // And no query anywhere anchored on Ontario.
  for (const planned of material.queryPlans.values()) {
    const anchored = planned.anchors.concat(planned.deferred, planned.redundant)
      .map((anchor) => anchor.term.toLowerCase())
    if (anchored.some((term) => term.includes('ontario')))
      return `${planned.claimId} anchored on ${JSON.stringify(anchored)}`
    if (said(planned.query).includes('ontario') && !planned.claimTerms.toLowerCase().includes('ontario'))
      return `${planned.claimId} searched for Ontario without saying so: ${planned.query.terms}`
  }

  // The discovered claim still gets the investigation's own context.
  const discovered = material.queryPlans.get('DC001')
  return discovered !== undefined
    && discovered.anchors.some((anchor) => anchor.origin === 'SURFACE_PUBLISHER')
    ? null : `the discovered claim's anchors: ${JSON.stringify(discovered?.anchors)}`
})

check('11 · no jurisdiction is hard-coded in planning or runtime code', () => {
  /*
   * The defect this slice fixes has an obvious wrong fix: name Kenya in the
   * planner. So the scan is over the code that builds and runs queries, with
   * comments stripped — the narrative names first light's four countries
   * deliberately, and prose cannot steer a search.
   */
  const root = new URL('../../../', import.meta.url)
  const files = [
    'lib/xray/pipeline/query-plan.ts',
    'lib/xray/providers/live-stages.ts',
    'lib/xray/providers/live-runtime.ts',
    'lib/xray/providers/material.ts',
    ...readdirSync(new URL('lib/xray/providers/anthropic/', root))
      .filter((name) => name.endsWith('.ts') && !name.endsWith('-checks.ts'))
      .map((name) => `lib/xray/providers/anthropic/${name}`),
  ]
  const tokens = [
    'kenya', 'kenyan', 'nairobi', 'kisumu', 'siaya', 'migori', 'homa bay',
    'standardmedia', 'oagkenya', 'gathungu', 'co.ke', 'shilling',
    'ontario', 'michigan', 'guyana', 'toronto',
  ]
  const stripComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  const offenders: string[] = []
  for (const file of files) {
    const source = stripComments(readFileSync(new URL(file, root), 'utf8')).toLowerCase()
    for (const token of tokens) {
      if (source.includes(token)) offenders.push(`${file}: ${token}`)
    }
  }
  if (offenders.length > 0) return `hard-coded: ${offenders.join(', ')}`

  // And the planner knows no places at all: no place list to hard-code into.
  const planner = readFileSync(new URL('lib/xray/pipeline/query-plan.ts', root), 'utf8')
  return /\bconst\s+\w*(COUNTR|JURISDICTION|PLACE|COUNTY|GAZETTEER)\w*\s*[:=]/i.test(planner)
    ? 'the planner carries a place table' : null
})

// ---------------------------------------------------------------------------

let failures = 0

async function main(): Promise<void> {
  for (const { name, run } of checks) {
    let detail: string | null
    try { detail = await run() } catch (err) { detail = `threw: ${(err as Error).message}` }
    console.log(`${detail === null ? 'ok  ' : 'FAIL'}  ${name}${detail === null ? '' : ` — ${detail}`}`)
    if (detail !== null) failures += 1
  }
  console.log(`\n${checks.length - failures}/${checks.length} query plan checks passed`)
  if (failures > 0) process.exitCode = 1
}

main().catch((err: unknown) => {
  console.error(`\nFAIL  the gate itself failed: ${String(err)}`)
  process.exit(1)
})
