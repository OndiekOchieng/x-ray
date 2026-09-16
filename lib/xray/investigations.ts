/**
 * The application's single retrieval seam for investigations.
 *
 * Everything above this line — pages and components — asks for investigations
 * by id and receives view models. Nothing above it imports a fixture module,
 * traverses the graph, or knows how an investigation is stored.
 *
 * TODAY this resolves one investigation from the frozen XRAY-KE-001 fixture.
 * When a real API and store exist, the replacement is confined to this file:
 * the registry becomes a client call and the exported functions become async.
 * No component should need to change.
 *
 * NOT IMPLEMENTED HERE, deliberately: no network, no database, no research.
 */

import { createXrayKe001Graph } from './fixtures/xray-ke-001/graph'
import type { XRayGraph } from './selectors'
import { claimById, gapById } from './selectors'
import {
  claimSummaryViews,
  claimView,
  claimViewById,
  gapView,
  investigationView,
  libraryEntryView,
  type ClaimSummaryView,
  type ClaimView,
  type GapView,
  type InvestigationView,
  type LibraryEntryView,
} from './projections'

/**
 * Known investigations.
 *
 * A registry of graph factories keyed by id. The only entry is the frozen
 * benchmark; adding a second requires nothing but another factory.
 */
const REGISTRY: Record<string, () => XRayGraph> = {
  'XRAY-KE-001': createXrayKe001Graph,
}

/** Ids this build can resolve. */
export function knownInvestigationIds(): string[] {
  return Object.keys(REGISTRY)
}

/**
 * The canonical graph for an investigation, or `null` if unknown.
 *
 * Returns `null` rather than falling back to a default. An unknown id must
 * surface as not-found, never as some other investigation's evidence.
 */
export function getInvestigationGraph(id: string): XRayGraph | null {
  const factory = REGISTRY[id]
  return factory ? factory() : null
}

export function getInvestigationView(id: string): InvestigationView | null {
  const graph = getInvestigationGraph(id)
  return graph ? investigationView(graph) : null
}

/** Everything the completed-X-Ray explorer needs, in one serializable payload. */
export interface ExplorerPayload {
  investigation: InvestigationView
  claims: ClaimView[]
  navigator: ClaimSummaryView[]
}

export function getExplorerPayload(id: string): ExplorerPayload | null {
  const graph = getInvestigationGraph(id)
  if (!graph) return null
  return {
    investigation: investigationView(graph),
    claims: graph.claims.map((c) => claimView(graph, c)),
    navigator: claimSummaryViews(graph),
  }
}

/** Progress-screen payload for one investigation. */
export interface ProgressPayload {
  investigation: InvestigationView
  claims: ClaimSummaryView[]
}

export function getProgressPayload(id: string): ProgressPayload | null {
  const graph = getInvestigationGraph(id)
  if (!graph) return null
  return { investigation: investigationView(graph), claims: claimSummaryViews(graph) }
}

/** One claim within one investigation. */
export function getClaimView(investigationId: string, claimId: string): ClaimView | null {
  const graph = getInvestigationGraph(investigationId)
  if (!graph) return null
  return claimViewById(graph, claimId) ?? null
}

/**
 * A gap, found by searching known investigations.
 *
 * Gap ids are globally addressable in the UI (`/gap/GAP-001`), so the seam
 * resolves which investigation holds one. With a real store this becomes a
 * single lookup.
 */
export interface GapPayload {
  gap: GapView
  investigationId: string
  investigationTitle: string
}

export function getGapPayload(gapId: string): GapPayload | null {
  for (const id of knownInvestigationIds()) {
    const graph = getInvestigationGraph(id)
    if (!graph) continue
    const gap = gapById(graph, gapId)
    if (!gap) continue
    return {
      gap: gapView(graph, gap),
      investigationId: id,
      investigationTitle: investigationView(graph).surface.title,
    }
  }
  return null
}

/** Every cached investigation, for the public library. */
export function getLibraryEntries(): LibraryEntryView[] {
  return knownInvestigationIds()
    .map((id) => getInvestigationGraph(id))
    .filter((g): g is XRayGraph => g !== null)
    .map(libraryEntryView)
}

/** The investigation featured on the home page, if any. */
export function getFeaturedInvestigation(): LibraryEntryView | null {
  return getLibraryEntries()[0] ?? null
}

// ---------------------------------------------------------------------------
// Demo source resolution
// ---------------------------------------------------------------------------

/**
 * DEMO BEHAVIOUR — explicitly isolated.
 *
 * Arbitrary URL research is not implemented (see docs/engineering/v0-scope.md:
 * the pipeline, model adapter and research adapter are not built). This
 * function exists so the home-page input does something honest rather than
 * pretending a new investigation was researched.
 *
 * It recognises the frozen benchmark's surface source and routes to it. Any
 * other URL is reported as unsupported; the submitted value is returned to the
 * caller so it can be shown back to the user rather than discarded.
 */
export type SourceSubmission =
  | { kind: 'KNOWN_DEMO_SOURCE'; investigationId: string; submittedUrl: string }
  | { kind: 'UNSUPPORTED'; submittedUrl: string; reason: string }
  | { kind: 'INVALID_URL'; submittedUrl: string }

/** Hosts whose articles the frozen benchmark already covers. */
const DEMO_SOURCE_HOSTS = ['citizen.digital', 'citizendigital.com']

export function resolveSourceSubmission(rawUrl: string): SourceSubmission {
  const submittedUrl = rawUrl.trim()
  let host: string
  try {
    host = new URL(submittedUrl).hostname.replace(/^www\./, '')
  } catch {
    return { kind: 'INVALID_URL', submittedUrl }
  }

  if (DEMO_SOURCE_HOSTS.includes(host)) {
    return { kind: 'KNOWN_DEMO_SOURCE', investigationId: 'XRAY-KE-001', submittedUrl }
  }

  return {
    kind: 'UNSUPPORTED',
    submittedUrl,
    reason:
      'Live research is not available in this build. X-Ray can currently open the one benchmark investigation it has already completed.',
  }
}
