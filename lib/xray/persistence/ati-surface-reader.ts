/**
 * Read the ATI action surfaces for one investigation (#10 slice 10e).
 *
 * Storage only. A benchmark fixture ships no action history, and inventing one
 * would put a request on the screen that nobody made.
 *
 * Every request is presented against the gap **its own origin version**
 * recorded, which is why this reads a snapshot per distinct origin version
 * rather than the latest one. A request anchored to v2 must never be described
 * by v4's gap.
 */

import { atiRequestSurface, type ATIRequestSurface } from '@/lib/xray/projections/ati-surface'
import { readRequestLifecycle } from './ati-lifecycle'
import { readSnapshot, type SnapshotDatabase } from './snapshot'

export async function readAtiActionSurfaces(
  db: SnapshotDatabase, investigationId: string,
): Promise<readonly ATIRequestSurface[]> {
  const rows = (await db.query(
    'SELECT id FROM ati_requests WHERE investigation_id=$1 ORDER BY ordinal', [investigationId]))
    .rows.map((row) => row.id as string)
  if (rows.length === 0) return []

  const found = (await db.query(
    'SELECT latest_committed_version FROM investigations WHERE id=$1', [investigationId])).rows
  const latestCommittedVersion = found.length === 1
    ? found[0].latest_committed_version as number | null : null

  const surfaces: ATIRequestSurface[] = []
  // One snapshot read per distinct origin version, reused across its requests.
  const snapshots = new Map<number, Awaited<ReturnType<typeof readSnapshot>>>()
  for (const requestId of rows) {
    const lifecycle = await readRequestLifecycle(db, requestId)
    if (lifecycle === undefined) continue
    let snapshot = snapshots.get(lifecycle.originVersion)
    if (snapshot === undefined) {
      snapshot = await readSnapshot(db, investigationId, lifecycle.originVersion)
      snapshots.set(lifecycle.originVersion, snapshot)
    }
    const gap = snapshot.index.gap.get(lifecycle.gapId)
    if (gap === undefined) continue
    surfaces.push(atiRequestSurface(lifecycle, {
      originGap: {
        gapId: gap.id, resolutionPath: gap.resolutionPath,
        atiEligible: gap.atiEligible, status: gap.status,
      },
      latestCommittedVersion,
    }))
  }
  return surfaces
}
