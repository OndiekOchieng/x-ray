/**
 * Retrieval query construction (#20 first-light Finding 3).
 *
 * WHAT WENT WRONG
 * ===============
 * First light searched for a generic surface claim —
 *
 *   "The Auditor General has highlighted wastage of public funds by counties."
 *
 * — and got back the Auditor General of Ontario, a Michigan subsidy audit, a
 * commentator on Guyana's Auditor General, and a US Senate hearing on the
 * Defense Contract Audit Agency. Every receipt was real and no invariant was
 * violated. The research was simply about the wrong four countries, because
 * the query was built from the claim alone and a claim decomposed out of an
 * article does not repeat the article's context.
 *
 * THE RULE
 * ========
 *   query = claim-specific terms + investigation anchors the surface record
 *           actually carries
 *
 * Both halves are load-bearing. Anchors without claim terms would search for
 * the investigation instead of the claim; claim terms without anchors is what
 * produced Ontario.
 *
 * WHAT AN ANCHOR IS NOT
 * =====================
 * Query context, and nothing else. An anchor mints no `Claim`, no `Source`, no
 * `Evidence`, no `SourceDependency` and no `Finding`; it decides no
 * independence and no origin. It exists to tell a search engine which
 * jurisdiction, institution and period the investigation is about, and the
 * only thing it may affect is which documents come back. Everything a document
 * then becomes is decided by the stages, from the document.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ===========================
 *   - **No planning model.** Anchors are read off the surface record and the
 *     claims decomposed from it. There is no `plan` method on the model port
 *     (#6 D17) and this does not add one.
 *   - **No relevance score.** Nothing here ranks a returned document or
 *     decides whether it is on topic. That judgement belongs to the stages and
 *     to the reviewer, and a score computed here would be X-Ray grading its
 *     own search.
 *   - **No gazetteer, no classifier, no jurisdiction table.** An anchor is not
 *     labelled `COUNTRY` or `COUNTY`, because deciding that "Kisumu" is a
 *     county requires knowledge this module would have to hard-code — and a
 *     hard-coded place list is exactly the defect that would make X-Ray work
 *     for one country. `AnchorOrigin` records **which field the anchor was
 *     read from**, which is checkable, instead of what it supposedly means.
 *   - **No title dump.** The surface title is not an anchor. Appending a
 *     headline to every query drowns the claim's own terms, which is the other
 *     way to lose claim specificity.
 *
 * PURITY: pure. No clock, no I/O, no provider, no fixtures. Given the same
 * surface record and claim it returns the same query, which is what makes a
 * run's searches reproducible and inspectable.
 */

import type { Claim, Source } from '@/lib/xray/domain'
import type { RetrievalQuery } from './retrieval-port'

/**
 * Which field of the investigation an anchor was read from.
 *
 * Provenance of the anchor, not a claim about what it denotes. `SURFACE_HOST`
 * says "this came from the surface record's hostname" — it does not say the
 * host implies a country, and nothing here draws that inference.
 *
 * The order of this union is the rank order: an anchor read from a more
 * specific field is carried into the search terms before a broader one.
 */
export type AnchorOrigin =
  /** `Investigation.focus` — an operator's explicit narrowing. */
  | 'INVESTIGATION_FOCUS'
  /**
   * An entity more than one of the surface record's claims names.
   *
   * Recurring, deliberately. An entity a single claim names is that claim's
   * own subject, and it is already in that claim's terms — carrying it into
   * every *other* claim's query is the "dump every entity into every query"
   * failure, and it is not hypothetical: the gate caught it here. With one
   * claim naming an auditor and another naming a hospital, the audit claim's
   * search came back with the hospital record.
   *
   * An entity two claims name is context the record keeps returning to, which
   * is what an investigation anchor is.
   */
  | 'SURFACE_RECURRING_ENTITY'
  /** `Source.institution` of the surface record. */
  | 'SURFACE_INSTITUTION'
  /** `Source.publisher` of the surface record. */
  | 'SURFACE_PUBLISHER'
  /** The hostname of the surface record's locator. */
  | 'SURFACE_HOST'
  /** A year the surface claims are scoped to, or the record was published in. */
  | 'SURFACE_PERIOD'

const RANK: readonly AnchorOrigin[] = [
  'INVESTIGATION_FOCUS',
  'SURFACE_RECURRING_ENTITY',
  'SURFACE_INSTITUTION',
  'SURFACE_PUBLISHER',
  'SURFACE_HOST',
  'SURFACE_PERIOD',
]

export interface QueryAnchor {
  readonly term: string
  readonly origin: AnchorOrigin
}

/**
 * What was searched for, and why — run state, never canonical.
 *
 * Recorded so that a run can show what X-Ray actually asked, rather than
 * leaving "why did this document come back?" to be guessed from the results.
 * First light could report the four wrong countries but not the query that
 * found them; that is what this fixes.
 */
export interface QueryPlan {
  readonly claimId: string
  /** The claim's own terms. Always present, always first in `terms`. */
  readonly claimTerms: string
  /** Anchors carried into `terms`, in rank order. */
  readonly anchors: readonly QueryAnchor[]
  /** Anchors the claim already names, so they were not repeated. */
  readonly redundant: readonly QueryAnchor[]
  /** Anchors past the term budget. Still narrowing, via `constraints`. */
  readonly deferred: readonly QueryAnchor[]
  /** What the stage will hand the adapter. */
  readonly query: RetrievalQuery
}

/** How much of a claim's text is search terms. */
const CLAIM_TEXT_LENGTH = 180
/** How many of the claim's own entities are appended to its text. */
const CLAIM_ENTITY_TERMS = 3
/**
 * How many anchors reach `terms`.
 *
 * Three, not all of them. The budget is what keeps the claim the subject of
 * its own query: an unbounded anchor list would turn every search into a
 * search for the investigation, and every claim's query into the same one.
 * Anchors past the budget still narrow the search through `constraints`.
 */
const ANCHOR_TERMS = 3

/** The investigation state anchors are read from. Nothing else is consulted. */
export interface AnchorInput {
  /** `Investigation.focus`, where the submission narrowed the investigation. */
  readonly focus?: string
  /**
   * The claims the surface record itself made.
   *
   * `SURFACE` origin only. A claim discovered during tracing is evidence about
   * the world, not context the investigation was submitted with, and letting
   * discovered entities anchor later searches is how a run drifts into
   * whatever it happened to find first — Ontario anchoring the search that
   * follows Ontario.
   */
  readonly surfaceClaims: readonly Pick<Claim, 'entities' | 'timeScope'>[]
  /** The canonical surface `Source`, once `INGEST` has minted it. */
  readonly surfaceSource?: Pick<Source, 'publisher' | 'institution' | 'url' | 'publishedAt'>
}

const YEAR = /\b(19|20)\d{2}\b/

/**
 * Entities named by more than one surface claim, in order of first mention.
 *
 * The count is per claim, not per mention: a claim listing the same entity
 * twice has still only named it once, and would otherwise anchor the whole
 * investigation on its own subject.
 */
function recurringEntities(
  claims: readonly Pick<Claim, 'entities'>[],
): readonly string[] {
  const count = new Map<string, number>()
  const spelling = new Map<string, string>()
  for (const claim of claims) {
    for (const key of new Set(claim.entities.map((entity) => entity.trim().toLowerCase()))) {
      if (key === '') continue
      count.set(key, (count.get(key) ?? 0) + 1)
      if (!spelling.has(key)) {
        spelling.set(key, claim.entities.find(
          (entity) => entity.trim().toLowerCase() === key)!.trim())
      }
    }
  }
  return [...count.entries()]
    .filter(([, times]) => times > 1)
    .map(([key]) => spelling.get(key)!)
}

/** The hostname of a locator, without `www.`. Absent if it will not parse. */
function hostOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  try {
    const host = new URL(url).hostname
    return host === '' ? undefined : host.replace(/^www\./, '')
  } catch { return undefined }
}

/** The first year the surface claims are scoped to, or were published in. */
function periodOf(input: AnchorInput): string | undefined {
  for (const claim of input.surfaceClaims) {
    const scope = claim.timeScope
    if (scope === undefined) continue
    for (const value of [scope.asOf, scope.to, scope.from]) {
      const found = value === undefined ? null : YEAR.exec(value)
      if (found !== null) return found[0]
    }
  }
  const published = input.surfaceSource?.publishedAt
  const found = published === undefined ? null : YEAR.exec(published)
  return found === null ? undefined : found[0]
}

/**
 * The anchors this investigation actually has.
 *
 * Every one is read from a field that is either present or absent — there is
 * no inference step and no default. An investigation whose surface record
 * carries no publisher, no institution, no locator, no dated claim and no
 * focus yields an empty list, and the query is then the claim's own terms,
 * exactly as before. **Missing context degrades to less context, never to
 * invented context.**
 */
export function investigationAnchors(input: AnchorInput): readonly QueryAnchor[] {
  const anchors: QueryAnchor[] = []
  const seen = new Set<string>()
  const add = (term: string | undefined, origin: AnchorOrigin) => {
    const trimmed = term?.trim()
    if (trimmed === undefined || trimmed === '') return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    anchors.push({ term: trimmed, origin })
  }

  add(input.focus, 'INVESTIGATION_FOCUS')
  for (const entity of recurringEntities(input.surfaceClaims)) {
    add(entity, 'SURFACE_RECURRING_ENTITY')
  }
  add(input.surfaceSource?.institution, 'SURFACE_INSTITUTION')
  add(input.surfaceSource?.publisher, 'SURFACE_PUBLISHER')
  add(hostOf(input.surfaceSource?.url), 'SURFACE_HOST')
  add(periodOf(input), 'SURFACE_PERIOD')

  return anchors.sort((a, b) => RANK.indexOf(a.origin) - RANK.indexOf(b.origin))
}

/** The claim's own search terms: its text, plus the entities it names. */
function claimTermsFor(claim: Pick<Claim, 'text' | 'entities'>): string {
  const entities = claim.entities.slice(0, CLAIM_ENTITY_TERMS).join(' ')
  return [claim.text.slice(0, CLAIM_TEXT_LENGTH), entities].filter(Boolean).join(' ')
}

/**
 * One claim's query: its own terms first, then the investigation's context.
 *
 * An anchor the claim already names is dropped rather than repeated — it is
 * recorded as `redundant` so the plan shows the anchor was considered. The
 * claim's terms are never trimmed to make room: whatever the anchor budget
 * does, the search is still for this claim.
 */
export function planQuery(
  claim: { readonly id: string } & Pick<Claim, 'text' | 'entities'>,
  anchors: readonly QueryAnchor[],
  options: { readonly researchCutoffAt?: string; readonly maxResults?: number } = {},
): QueryPlan {
  const claimTerms = claimTermsFor(claim)
  const alreadySaid = claimTerms.toLowerCase()

  const redundant: QueryAnchor[] = []
  const usable: QueryAnchor[] = []
  for (const anchor of anchors) {
    if (alreadySaid.includes(anchor.term.toLowerCase())) redundant.push(anchor)
    else usable.push(anchor)
  }
  const carried = usable.slice(0, ANCHOR_TERMS)
  const deferred = usable.slice(ANCHOR_TERMS)

  const terms = [claimTerms, ...carried.map((anchor) => anchor.term)].join(' ')

  /*
   * `constraints` is where the whole anchor set goes, redundant ones included.
   * The port documents it as "narrowing the stage applied, e.g. a jurisdiction
   * or publisher", and a provider that honours it gets the full context even
   * though only the budgeted anchors are free terms.
   */
  const constraints: string[] = []
  const held = new Set<string>()
  for (const term of [...claim.entities, ...anchors.map((anchor) => anchor.term)]) {
    const trimmed = term.trim()
    if (trimmed === '' || held.has(trimmed.toLowerCase())) continue
    held.add(trimmed.toLowerCase())
    constraints.push(trimmed)
  }

  return {
    claimId: claim.id,
    claimTerms,
    anchors: carried,
    redundant,
    deferred,
    query: {
      terms,
      ...(constraints.length === 0 ? {} : { constraints }),
      ...(options.researchCutoffAt === undefined
        ? {} : { researchCutoffAt: options.researchCutoffAt }),
      ...(options.maxResults === undefined ? {} : { maxResults: options.maxResults }),
    },
  }
}

/** One line per plan, for a run log. Non-canonical, and safe to print. */
export function describeQueryPlan(plan: QueryPlan): string {
  const anchors = plan.anchors.length === 0
    ? 'no anchors'
    : plan.anchors.map((anchor) => `${anchor.term} [${anchor.origin}]`).join(', ')
  return `${plan.claimId}: ${plan.query.terms} — ${anchors}${
    plan.deferred.length === 0 ? '' : `; deferred ${plan.deferred.length}`}${
    plan.redundant.length === 0 ? '' : `; claim already named ${plan.redundant.length}`}`
}
