/**
 * The Cache Components wrappers (ADR-0016).
 *
 * Thin on purpose. All logic lives in `public-view.ts`, which imports no
 * bundler-only module and can therefore be exercised without a running server.
 * What is here is the cache declaration itself.
 *
 * `cacheLife('max')` in Next 16.3 means `revalidate: 30 days, expire: never` —
 * the long-lived posture for a value that cannot become wrong, because #7's
 * version tables are insert-only.
 *
 * **Nothing cached here can change.** Publication state, withdrawal state, the
 * alias target, the latest-version pointer, library membership and the
 * principal are all resolved outside these functions, on every request. That is
 * why a withdrawal takes effect immediately with no invalidation call: the
 * thing that changed was never in the cache.
 */

import { cacheLife } from 'next/cache'

import {
  loadAssuranceDisclosure, loadPublicVersionProjection, loadVersionGraph,
  type AssuranceDisclosure, type PublicVersionView,
} from './public-view'
import type { XRayGraphInput } from '@/lib/xray/selectors'

export async function cachedVersionGraph(
  investigationId: string, version: number,
): Promise<XRayGraphInput> {
  'use cache'
  cacheLife('max')
  return loadVersionGraph(investigationId, version)
}

export async function cachedVersionProjection(
  investigationId: string, version: number,
): Promise<PublicVersionView> {
  'use cache'
  cacheLife('max')
  return loadPublicVersionProjection(investigationId, version)
}

export async function cachedAssuranceDisclosure(
  executionRunId: string, graduationIndex: number,
): Promise<AssuranceDisclosure> {
  'use cache'
  cacheLife('max')
  return loadAssuranceDisclosure(executionRunId, graduationIndex)
}
