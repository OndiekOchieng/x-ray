/**
 * Public address resolution for the two routes, and the projection seam.
 *
 * WHY THE PROJECTION IS BEHIND A SEAM
 * ===================================
 * The cached wrappers import `next/cache`, which only the bundler resolves. A
 * plain harness cannot load them, so it would be unable to exercise the routes
 * at all — and the route behaviour is precisely what needs proving.
 *
 * The seam lets a check substitute its own projection. A test that installs a
 * **permanently memoizing** one proves something stronger than the real cache
 * could: withdrawal still takes effect on the next request even when the
 * projection is cached forever and never invalidated.
 *
 * With nothing installed, the real Cache Components wrappers are loaded lazily,
 * so importing this module never drags `next/cache` into a non-bundler context.
 */

import { PublicResolver, type PublicPresentation } from '@/lib/xray/application/public-resolver'
import { getDatabase } from '@/lib/xray/application/runtime'
import type { AssuranceDisclosure, PublicVersionView } from './public-view'
import type { XRayGraphInput } from '@/lib/xray/selectors'

export interface PublicProjections {
  versionGraph(investigationId: string, version: number): Promise<XRayGraphInput>
  versionProjection(investigationId: string, version: number): Promise<PublicVersionView>
  assurance(executionRunId: string, graduationIndex: number): Promise<AssuranceDisclosure>
}

let installed: PublicProjections | null = null

export function setPublicProjections(projections: PublicProjections | null): void {
  installed = projections
}

async function projections(): Promise<PublicProjections> {
  if (installed) return installed
  const cache = await import('./version-cache')
  return {
    versionGraph: cache.cachedVersionGraph,
    versionProjection: cache.cachedVersionProjection,
    assurance: cache.cachedAssuranceDisclosure,
  }
}

export const publicProjections = projections

/** The installed projections, for checks that need to observe cache keying. */
export function installedProjections(): PublicProjections {
  if (!installed) throw new Error('No projections installed')
  return installed
}

/** A version segment is `v{n}`; anything else is not an address we serve. */
export function parseVersionSegment(segment: string): number | undefined {
  return /^v[1-9]\d*$/.test(segment) ? Number(segment.slice(1)) : undefined
}

/**
 * Resolve a public address.
 *
 * The resolver's canonical read is the cached version graph, so a warm version
 * costs nothing — while the publication lookup that authorizes it is never
 * cached and runs on every request.
 */
export async function resolvePublicAddress(
  slug: string, version?: number,
): Promise<PublicPresentation> {
  const { versionGraph } = await projections()
  const resolver = new PublicResolver(await getDatabase(), {
    read: (investigationId, exact) => versionGraph(investigationId, exact),
  })
  return version === undefined
    ? resolver.resolveAlias(slug)
    : resolver.resolveExactVersion(slug, version)
}
