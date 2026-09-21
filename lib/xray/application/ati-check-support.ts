/**
 * Shared harness for the ATI command gates (10b, 10c).
 *
 * One piece: a database wrapper that produces the interleaving a single PGlite
 * connection cannot. Both gates need it, and a second copy would drift.
 */

import type { PGlite } from '@electric-sql/pglite'

import type { SnapshotDatabase } from '@/lib/xray/persistence/snapshot'

/**
 * A database that lets another command's commit land at the exact moment this
 * one acquires the request lock.
 *
 * This is the interleaving a single PGlite connection cannot produce for real:
 *
 *   B decides                    (stale, if the decision came before the lock)
 *   A appends and commits        ← injected here, right after B's FOR UPDATE
 *   B appends                    (acting on state it read before A ran)
 *
 * The injection sits immediately AFTER the `FOR UPDATE` statement and before
 * anything else, so a command that re-reads history under the lock must see it
 * and a command that decided beforehand cannot. Which side of the lock the
 * lifecycle checks run on is exactly what that discriminates.
 */
export class LockInterleavingDatabase implements SnapshotDatabase {
  private fired = false
  readonly interleaved: string[] = []
  private readonly inner: PGlite
  private readonly requestId: string
  private readonly other: (db: SnapshotDatabase) => Promise<void>

  constructor(
    inner: PGlite, requestId: string, other: (db: SnapshotDatabase) => Promise<void>,
  ) {
    this.inner = inner
    this.requestId = requestId
    this.other = other
  }

  async query(sql: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
    const isRequestLock = /FROM ati_requests WHERE id=\$1 FOR UPDATE/.test(sql)
      && params[0] === this.requestId
    if (isRequestLock && !this.fired) {
      this.fired = true
      const locked = await this.inner.query(sql, params)
      await this.other(this.inner)
      this.interleaved.push(sql)
      return locked as { rows: Record<string, unknown>[] }
    }
    return (await this.inner.query(sql, params)) as { rows: Record<string, unknown>[] }
  }
}
