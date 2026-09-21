/**
 * Presenting offered material to the provider (#20 slice 20b).
 *
 * WHY THE PROVIDER NEVER SEES A CANONICAL ID
 * ==========================================
 * `model-port.ts` says it plainly: a provider "sees the artifact's content and
 * answers about `ref`. It never learns a canonical id it could later assert,
 * which is what keeps XR-INV-012's reserved namespaces inside the trust
 * boundary."
 *
 * `Offered<T>` carries the whole canonical artifact, id included, so honouring
 * that sentence is this file's job. Every function below names the content
 * fields it presents and omits identity: `id`, `investigationId`, and every
 * cross-reference array, all of which are canonical ids. The stage decides
 * which relationships to expose, and it does so by choosing what to offer —
 * not by the provider reading them off an artifact.
 *
 * Nothing is spread. A `...value` here would put every future field of every
 * domain type on the wire, including whatever identity a later slice adds.
 * Naming fields means a new field is invisible until someone decides it should
 * be visible, which is the right default for a trust boundary.
 *
 * THE REVIEWER IS DIFFERENT, AND DELIBERATELY SO
 * ==============================================
 * `ReviewerModelQuery` hands over real artifacts, because `ModelJudgment`
 * targets are canonical ids — a reviewer that could not name what it flagged
 * would be useless. So the reviewer path presents ids and `decode.ts` checks
 * every returned target against the ids that query actually contained. Two
 * ports, two boundaries; blurring them would weaken the stricter one.
 *
 * PURITY: pure functions over domain values. No I/O, no SDK, no prompt text.
 */

import type {
  Claim, Evidence, Finding, Gap, Source,
} from '@/lib/xray/domain'
import type { Offered } from '@/lib/xray/pipeline/model-port'
import type { BoundedExtract, RetrievedDocument } from '@/lib/xray/pipeline/retrieval-port'

/** A handle and the content behind it, ready to serialise. */
type Presented = Record<string, unknown> & { handle: string }

/** Include a key only when it has a value, so no `null` reaches the provider. */
function some<T>(key: string, value: T | undefined | null): Record<string, T> {
  return value === undefined || value === null ? {} as Record<string, T> : { [key]: value }
}

function someList(key: string, value: readonly unknown[] | undefined): Record<string, unknown> {
  return value === undefined || value.length === 0 ? {} : { [key]: value }
}

export function presentClaim(offered: Offered<Claim>): Presented {
  const claim = offered.value
  return {
    handle: offered.ref,
    text: claim.text,
    ...some('sourcePassage', claim.sourcePassage),
    layer: claim.layer,
    type: claim.type,
    priority: claim.priority,
    ...someList('entities', claim.entities),
    ...someList('ambiguities', claim.ambiguities),
    ...some('measurement', claim.measurement),
    ...some('timeScope', claim.timeScope),
  }
}

export function presentEvidence(offered: Offered<Evidence>): Presented {
  const evidence = offered.value
  // `sourceId` and `claimIds` are omitted: they are canonical ids, and the
  // relationships they describe are the stage's to expose through what it
  // offers.
  return {
    handle: offered.ref,
    proposition: evidence.proposition,
    relationship: evidence.relationship,
    strength: evidence.strength,
    ...some('knowledgeBasis', evidence.knowledgeBasis),
    ...some('measurement', evidence.measurement),
    ...some('timeScope', evidence.timeScope),
  }
}

export function presentFinding(offered: Offered<Finding>): Presented {
  const finding = offered.value
  return {
    handle: offered.ref,
    status: finding.status,
    confidence: finding.confidence,
    rationale: finding.rationale,
    ...someList('wouldChangeFinding', finding.wouldChangeFinding),
  }
}

export function presentGap(offered: Offered<Gap>): Presented {
  const gap = offered.value
  // `atiEligible` is not presented. A provider that could see it could learn
  // to reproduce the stage's XR-INV-009 decision and offer it back.
  return {
    handle: offered.ref,
    missingEvidence: gap.missingEvidence,
    whyItMatters: gap.whyItMatters,
    status: gap.status,
    resolutionPath: gap.resolutionPath,
    ...someList('resolvingEvidence', gap.resolvingEvidence),
    ...someList('searchAlreadyAttempted', gap.searchAlreadyAttempted),
    ...some('likelyHolder', gap.likelyHolder),
  }
}

/**
 * The surface record under investigation.
 *
 * `originStatus` and `evidenceClass` are omitted: both are X-Ray's
 * classifications of the record, and echoing them invites a provider to treat
 * them as given rather than reading the document.
 */
export function presentSource(offered: Offered<Source>): Presented {
  const source = offered.value
  return {
    handle: offered.ref,
    title: source.title,
    ...some('publisher', source.publisher),
    ...some('institution', source.institution),
    ...some('author', source.author),
    ...some('url', source.url),
    ...some('publishedAt', source.publishedAt),
    sourceType: source.sourceType,
    accessibility: source.accessibility,
  }
}

/**
 * A retrieved document.
 *
 * `outcome` is presented because it is the whole point: a provider must be
 * able to tell material it may draw on from a record that was identified but
 * never obtained. XR-INV-006 turns on that distinction, and a document whose
 * extract is absent must look absent.
 */
export function presentDocument(document: RetrievedDocument): Presented {
  return {
    handle: document.ref,
    outcome: document.outcome,
    ...some('locator', document.locator),
    ...some('title', document.observed.title),
    ...some('publisher', document.observed.publisher),
    ...some('institution', document.observed.institution),
    ...some('author', document.observed.author),
    ...some('publishedAt', document.observed.publishedAt),
    ...some('content', presentExtract(document.extract)),
  }
}

function presentExtract(extract: BoundedExtract | undefined): Record<string, unknown> | undefined {
  if (extract === undefined) return undefined
  return {
    text: extract.text,
    truncated: extract.truncated,
    ...some('locator', extract.locator),
  }
}

/**
 * The body of one request.
 *
 * JSON rather than prose: the material is already structured, and re-narrating
 * it would be a second place where a field could be reworded into something
 * the artifact does not say. `researchCutoffAt` is stated in words as well,
 * because FM-005 is the failure mode a silently ignored date produces.
 */
export function requestBody(
  sections: Readonly<Record<string, unknown>>, researchCutoffAt?: string,
): string {
  const parts: string[] = []
  if (researchCutoffAt !== undefined) {
    parts.push(
      `Evidence dated after ${researchCutoffAt} is out of scope for this investigation.`
      + ' Do not propose anything that depends on material published after that date.',
    )
  }
  parts.push(JSON.stringify(sections, null, 2))
  return parts.join('\n\n')
}
