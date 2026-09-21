/**
 * The deployment's database, as one connection per server process (#11 11b).
 *
 * WHY ONE CONNECTION AND NOT A POOL
 * =================================
 * `SnapshotDatabase` is a single method — `query(sql, params)` — and every
 * transactional operation in #7, #9 and #10 brackets itself with literal
 * `BEGIN` / `COMMIT` / `ROLLBACK` strings sent through it. That contract is
 * **incompatible with a connection pool**: `pg.Pool.query` may serve each
 * statement from a different connection, so a `BEGIN` on one and an `INSERT` on
 * another would silently discard the transaction — version commits,
 * publication events and ATI action history would all lose their atomicity
 * without raising anything.
 *
 * So the host holds one dedicated client per process and reuses it: `pg.Client`,
 * not `pg.Pool`. No connection is created per render.
 *
 * THE LIMITATION THIS LEAVES, STATED PLAINLY
 * ==========================================
 * One shared connection is safe for **one writer at a time**. Two concurrent
 * requests can interleave statements inside one another's open transaction,
 * and nothing here prevents that.
 *
 * An earlier version of this file claimed to prevent it, with an
 * `AsyncLocalStorage` guard meant to tell the transaction's owning flow apart
 * from any other. The 11b gate caught it not working: `enterWith` mutates the
 * shared context it is called from, so every flow saw the same token,
 * recognised itself as the owner, and wrote straight through somebody else's
 * transaction. A guard that does not guard is worse than none, so it is gone.
 *
 * The real fix is a transaction **scope** on `SnapshotDatabase` —
 * `withTransaction(fn)` handing a bound connection to its callback — which
 * makes pooling safe and makes this file's compromise unnecessary. That is a
 * change across every persistence module and is not this slice's; it is
 * recorded in the 11b report as required follow-up before the demo has
 * concurrent writers.
 */

import type { SnapshotDatabase } from '@/lib/xray/persistence/snapshot'

/** Minimal shape both `pg.Client` and PGlite satisfy. */
export interface RawConnection {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  /** PGlite only. Multi-statement scripts; `pg.Client.query` handles them itself. */
  exec?(sql: string): Promise<unknown>
}

/**
 * A database that can also run a migration script.
 *
 * `SnapshotDatabase` is deliberately one parameterized statement at a time,
 * which a migration file is not. Rather than widen that contract for every
 * consumer, the host adds `exec` for the one caller that needs it.
 */
export interface HostDatabase extends SnapshotDatabase {
  exec(sql: string): Promise<void>
}

/** Adapt a driver connection to what the application expects. */
export function hostConnection(connection: RawConnection): HostDatabase {
  return {
    async exec(sql: string) {
      if (connection.exec) { await connection.exec(sql); return }
      await connection.query(sql)
    },
    async query(sql: string, params?: unknown[]) {
      return connection.query(sql, params)
    },
  }
}

// ---------------------------------------------------------------------------
// Connecting
// ---------------------------------------------------------------------------

export class DemoHostMisconfigured extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DemoHostMisconfigured'
  }
}

let connected: Promise<HostDatabase> | null = null
let disconnect: (() => Promise<void>) | null = null

/**
 * The process's database, connected once.
 *
 * `XRAY_POSTGRES_URL` selects PostgreSQL, which is what a deployed demo should
 * use: #10's action history has to survive between requests, and process-local
 * state does not. `XRAY_DEMO_PGLITE=1` selects an in-process PGlite instead,
 * for local and offline reproduction only — it is explicitly opt-in, so a
 * deployment cannot fall into it by forgetting to set a URL.
 *
 * Missing configuration stays a typed failure. `getDatabase()` already reports
 * `HostNotConfigured`, and nothing here returns an empty database to paper over
 * an unconfigured host.
 */
export function hostDatabase(): Promise<HostDatabase> {
  connected ??= connect()
  return connected
}

async function connect(): Promise<HostDatabase> {
  const url = process.env.XRAY_POSTGRES_URL
  if (url) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: url })
    await client.connect()
    disconnect = () => client.end()
    return hostConnection(client as unknown as RawConnection)
  }

  if (process.env.XRAY_DEMO_PGLITE === '1') {
    const { PGlite } = await import('@electric-sql/pglite')
    const pglite = new PGlite()
    disconnect = () => pglite.close()
    return hostConnection(pglite as unknown as RawConnection)
  }

  throw new DemoHostMisconfigured(
    'Set XRAY_POSTGRES_URL for a deployment, or XRAY_DEMO_PGLITE=1 for local reproduction')
}

/** Whether this process is configured to reach a database at all. */
export const hostDatabaseConfigured = (): boolean =>
  Boolean(process.env.XRAY_POSTGRES_URL) || process.env.XRAY_DEMO_PGLITE === '1'

/**
 * Close the connection and forget it.
 *
 * For provisioning commands and the gate. A route never calls this: the server
 * holds one connection for its lifetime, and an open client is why a seed
 * script that forgot to close hung instead of exiting.
 */
export async function closeHostDatabase(): Promise<void> {
  const close = disconnect
  connected = null
  disconnect = null
  if (close) await close()
}
