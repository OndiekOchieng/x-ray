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
import { InvestigationResourceNotFound, InvestigationService } from './application/investigation-service'
import { databaseConfigured, getDatabase } from './application/runtime'
import {
  claimSummaryViews,
  claimView,
  claimViewById,
  gapView,
  investigationView,
  type ClaimSummaryView,
  type ClaimView,
  type GapView,
  type InvestigationView,
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
 * What storage had to say about an id.
 *
 * Three states, kept apart on purpose. Collapsing them into one `null` is what
 * lets a fixture answer a question storage was supposed to answer: a failed
 * read and an absent record become indistinguishable, and the frozen benchmark
 * quietly stands in for whichever it was.
 */
type StorageResolution =
  | { kind: 'COMMITTED_GRAPH'; graph: XRayGraph }
  /** The investigation exists; its research has produced no version yet. */
  | { kind: 'KNOWN_WITHOUT_COMMITTED_VERSION' }
  /** Storage answered, and holds no such investigation. */
  | { kind: 'UNKNOWN_IN_STORAGE' }

/**
 * Ask storage about an id.
 *
 * Only the typed `INVESTIGATION` not-found means "storage has no such id".
 * Every other error propagates: a connection failure, a query error or a
 * missing version behind a pointer that claims one are all conditions the
 * caller must see, and none of them is evidence that an investigation does not
 * exist. A catch-all here would turn an outage into a silent fixture read.
 */
async function readStoredGraph(id: string): Promise<StorageResolution> {
  const service = new InvestigationService(await getDatabase())

  let identity
  try {
    identity = await service.getInvestigation(id)
  } catch (error) {
    if (error instanceof InvestigationResourceNotFound && error.resource === 'INVESTIGATION')
      return { kind: 'UNKNOWN_IN_STORAGE' }
    throw error
  }

  if (identity.latestCommittedVersion === null) return { kind: 'KNOWN_WITHOUT_COMMITTED_VERSION' }

  const committed = await service.getCommittedVersion(id, identity.latestCommittedVersion)
  return { kind: 'COMMITTED_GRAPH', graph: createXRayGraph(committed.graph) }
}

/**
 * The canonical graph for an investigation, or `null` if there is nothing to show.
 *
 * Storage decides first, and its answer is final in two of the three cases:
 *
 *   COMMITTED_GRAPH                    the stored graph
 *   KNOWN_WITHOUT_COMMITTED_VERSION    `null` — the benchmark is not consulted
 *   UNKNOWN_IN_STORAGE                 the benchmark may answer, for its own id
 *
 * A stored investigation therefore cannot be shadowed by a fixture even when it
 * has committed nothing yet, and an unexpected read failure reaches the caller
 * instead of being answered with somebody else's evidence.
 *
 * Working state is deliberately not shown for a known investigation with no
 * version: displaying it would require picking a run, and guessing "latest run"
 * serves one execution's evidence under another's name.
 */
export async function getInvestigationGraph(id: string): Promise<XRayGraph | null> {
  if (databaseConfigured()) {
    const resolution = await readStoredGraph(id)
    if (resolution.kind === 'COMMITTED_GRAPH') return resolution.graph
    if (resolution.kind === 'KNOWN_WITHOUT_COMMITTED_VERSION') return null
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

/*
 * Public discovery is NOT here.
 *
 * The library and featured selection moved to the publication boundary in #9
 * slice 9e and live in `lib/xray/publication/public-library.ts`. They are not
 * re-exported from this module, because this module answers an internal
 * storage question and the public one has its own trust boundary (ADR-0015).
 * A benchmark that ships in this repository is not public merely by existing.
 */

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
