/**
 * The application's single retrieval seam for investigations.
 *
 * Everything above this line — pages and components — asks for investigations
 * by id and receives view models. Nothing above it imports a fixture module,
 * traverses the graph, or knows how an investigation is stored.
 *
 * The investigation-specific reads now resolve through the application/query
 * path: a stored investigation is reconstructed from its latest committed
 * version, exactly as the API serves it.
 *
 * XRAY-KE-001 remains reachable through its own explicit fixture path, keyed by
 * its own id. It is **not** a fallback. An unknown id resolves to `null` and
 * the page is not-found; it never quietly becomes the benchmark's evidence.
 *
 * Library, featured and gap-search reads still come from the fixture path.
 * Which investigations are public is a publication decision, and publication
 * is #9 — answering it here would make a cache lifecycle out of a registry.
 */

import { createXRayGraph, type XRayGraph } from './selectors'
import { createXrayKe001Graph } from './fixtures/xray-ke-001/graph'
import { claimById, gapById } from './selectors'
import { InvestigationService } from './application/investigation-service'
import { databaseConfigured, getDatabase } from './application/runtime'
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
 * Benchmark investigations available from the frozen corpus.
 *
 * Keyed by their own ids only. Nothing resolves through this table by
 * accident: a caller asking for some other id gets `null`.
 */
const BENCHMARKS: Record<string, () => XRayGraph> = {
  'XRAY-KE-001': createXrayKe001Graph,
}

/** Benchmark ids this build ships. Not "every investigation that exists". */
export function benchmarkInvestigationIds(): string[] {
  return Object.keys(BENCHMARKS)
}

/**
 * A stored investigation, reconstructed from its latest committed version.
 *
 * `null` when the investigation is unknown, or known but has committed no
 * version yet. An investigation whose research has not yet produced a version
 * has nothing to display, and showing working state here would require picking
 * a run — which the candidate contract forbids, because guessing "latest run"
 * serves one execution's evidence under another's name.
 */
async function readStoredGraph(id: string): Promise<XRayGraph | null> {
  const service = new InvestigationService(await getDatabase())
  const identity = await service.getInvestigation(id).catch(() => null)
  if (!identity || identity.latestCommittedVersion === null) return null
  const committed = await service.getCommittedVersion(id, identity.latestCommittedVersion)
  return createXRayGraph(committed.graph)
}

/**
 * The canonical graph for an investigation, or `null` if unknown.
 *
 * Stored data wins. The benchmark answers only for its own id, and only after
 * storage has declined — so a stored investigation can never be shadowed by a
 * fixture, and a fixture can never stand in for a stored one.
 */
export async function getInvestigationGraph(id: string): Promise<XRayGraph | null> {
  if (databaseConfigured()) {
    const stored = await readStoredGraph(id)
    if (stored) return stored
  }
  const benchmark = BENCHMARKS[id]
  return benchmark ? benchmark() : null
}

export async function getInvestigationView(id: string): Promise<InvestigationView | null> {
  const graph = await getInvestigationGraph(id)
  return graph ? investigationView(graph) : null
}

/** Everything the completed-X-Ray explorer needs, in one serializable payload. */
export interface ExplorerPayload {
  investigation: InvestigationView
  claims: ClaimView[]
  navigator: ClaimSummaryView[]
}

export async function getExplorerPayload(id: string): Promise<ExplorerPayload | null> {
  const graph = await getInvestigationGraph(id)
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

export async function getProgressPayload(id: string): Promise<ProgressPayload | null> {
  const graph = await getInvestigationGraph(id)
  if (!graph) return null
  return { investigation: investigationView(graph), claims: claimSummaryViews(graph) }
}

/** One claim within one investigation. */
export async function getClaimView(investigationId: string, claimId: string): Promise<ClaimView | null> {
  const graph = await getInvestigationGraph(investigationId)
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
  for (const id of benchmarkInvestigationIds()) {
    const graph = BENCHMARKS[id]()
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
  return benchmarkInvestigationIds().map((id) => libraryEntryView(BENCHMARKS[id]()))
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
