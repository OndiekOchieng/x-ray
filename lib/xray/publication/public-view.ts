/**
 * The immutable public version projection, and its cache (ADR-0016).
 *
 * WHAT IS CACHED, AND WHY IT IS NOT THE RESPONSE
 * ==============================================
 * A committed version is immutable as canonical research state. Its
 * *presentation* state is not: the same address becomes a 410 tombstone the
 * moment a principal withdraws it. Caching the route response would cache the
 * one thing that can change.
 *
 * So the cached unit is keyed on exactly `(investigationId, version)` and
 * contains no publication state, no withdrawal state, no alias target, no
 * latest-version pointer, no library membership and no principal. Presentation
 * state is resolved outside it, fresh, on every request.
 *
 * That is why withdrawal takes effect on the next request with no invalidation
 * call: nothing that can change was ever cached.
 *
 * PURITY: no HTTP, no route state, no publication history.
 */

import {
  createXRayGraph, graphCounts, type GraphCounts, type XRayGraph,
} from '@/lib/xray/selectors'
import { claimSummaryViews, type ClaimSummaryView } from '@/lib/xray/projections'
import { InvestigationService } from '@/lib/xray/application/investigation-service'
import { readLatestGraduation } from '@/lib/xray/persistence/graduation-audit'
import { getDatabase } from '@/lib/xray/application/runtime'
import type { XRayGraphInput } from '@/lib/xray/selectors'

// NOTE: this module must not import `next/cache`. The cached wrappers live in
// `version-cache.ts`, which the bundler resolves and a plain Node harness
// cannot. Keeping the logic importable is what lets the route behaviour be
// tested without a running server.

/**
 * What a published X-Ray shows.
 *
 * Note what is absent: the internal investigation id. The public address is the
 * slug, so exposing the id would hand out an internal handle the page does not
 * need — and section K of the release treats that as leakage.
 */
export interface PublicVersionView {
  /** Exact version. A citation is to this, never to "current". */
  version: number
  protocolVersion: string
  /** Evidence after this date was not considered. */
  researchCutoffAt?: string
  /** When the research was recorded as complete. */
  completedAt?: string
  focus?: string
  surface: {
    title: string
    publisher?: string
    url?: string
    publishedAt?: string
  }
  /** Derived at projection time, never stored. */
  counts: GraphCounts
  claims: ClaimSummaryView[]
}

export function projectPublicVersion(graph: XRayGraph): PublicVersionView {
  const investigation = graph.investigation
  const surface = graph.sources.find((source) => source.id === investigation.surfaceSourceId)
  return {
    version: investigation.currentVersion,
    protocolVersion: investigation.protocolVersion,
    ...(investigation.researchCutoffAt ? { researchCutoffAt: investigation.researchCutoffAt } : {}),
    ...(investigation.completedAt ? { completedAt: investigation.completedAt } : {}),
    ...(investigation.focus ? { focus: investigation.focus } : {}),
    surface: {
      title: surface?.title ?? 'Untitled source',
      ...(surface?.publisher ? { publisher: surface.publisher } : {}),
      ...(surface?.url ? { url: surface.url } : {}),
      ...(surface?.publishedAt ? { publishedAt: surface.publishedAt } : {}),
    },
    counts: graphCounts(graph),
    claims: claimSummaryViews(graph),
  }
}

/**
 * The exact committed version.
 *
 * Immutable by construction: #7's version tables are insert-only, so this value
 * can never become wrong — which is what makes it safe to cache indefinitely
 * in `version-cache.ts`.
 */
export async function loadVersionGraph(
  investigationId: string,
  version: number,
): Promise<XRayGraphInput> {
  const service = new InvestigationService(await getDatabase())
  return (await service.getCommittedVersion(investigationId, version)).graph
}

/**
 * The immutable public projection for one exact committed version.
 *
 * Semantic input is exactly `(investigationId, version)` — the narrow key
 * ADR-0016 calls for. It carries no publication state, no withdrawal state, no
 * alias target, no latest-version pointer and no principal, which is why
 * caching it cannot keep a withdrawn X-Ray alive.
 */
export async function loadPublicVersionProjection(
  investigationId: string,
  version: number,
): Promise<PublicVersionView> {
  return projectPublicVersion(createXRayGraph(await loadVersionGraph(investigationId, version)))
}

// ---------------------------------------------------------------------------
// Assurance disclosure
// ---------------------------------------------------------------------------

/**
 * What could not be checked when this version was assessed.
 *
 * A published eligible `BLOCKED` is honest about incomplete assurance or it is
 * not publishable at all (ADR-0013). This reads the persisted graduation record
 * through the linkage the publication event carries — never recomputed, and
 * never copied into publication state, so what is shown cannot drift from what
 * was assessed.
 *
 * Only check titles cross the boundary. The recorded `reason` and `resolvedBy`
 * describe our own wiring — "no implementation is wired", "configure a reviewer
 * model" — which is implementation detail a reader cannot act on and section K
 * keeps off the page.
 */
export interface AssuranceDisclosure {
  verdict: 'PASS' | 'BLOCKED' | 'REVISE' | 'FAIL'
  /** Checks that exist but could not run. Titles only. */
  unavailableChecks: readonly string[]
}

export async function loadAssuranceDisclosure(
  executionRunId: string,
  graduationIndex: number,
): Promise<AssuranceDisclosure> {
  const record = await readLatestGraduation(await getDatabase(), executionRunId)
  if (record === undefined || record.assessmentIndex !== graduationIndex)
    return { verdict: 'BLOCKED', unavailableChecks: [] }
  return {
    verdict: record.result.verdict,
    unavailableChecks: record.result.blockers.map((blocker) => blocker.title),
  }
}
