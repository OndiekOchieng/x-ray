# Issue #7 — native PostgreSQL predecessor-lock closeout

## Server and connection

PostgreSQL 17.11 (Homebrew), aarch64 macOS. The gate used an isolated, trust-authenticated cluster initialized with `/opt/homebrew/opt/postgresql@17/bin/initdb -D /private/tmp/xray-7dd-pg -A trust --no-instructions` and started with `pg_ctl -D /private/tmp/xray-7dd-pg -o '-h 127.0.0.1 -p 55432' -l /private/tmp/xray-7dd-pg.log start`. The harness connected through `XRAY_POSTGRES_URL=postgresql://oochieng@127.0.0.1:55432/postgres` using independent `pg.Client` sessions. It created and dropped a separate schema for each scenario, applied migrations 0001–0006, and committed XRAY-KE-001 v1 first. This is a real PostgreSQL server, not PGlite.

## Race: two graduated v2 candidates

A and B were independently constructed, graph-clean, capability-BLOCKED v2 candidates with distinct canonical content and independently persisted workspaces/graduation results. Both expected predecessor 1 and ran `commitNextVersion` concurrently on separate connections. Backend IDs were A=10405 and B=10406. The harness paused A after it acquired the investigation row lock, started B, and used `pg_stat_activity` to observe B waiting on `Lock/transactionid` before releasing A.

Saved timing evidence in `native-postgres-pass.txt`: A lock at +258 ms; B request/wait at +280 ms; A COMMIT at +333 ms; B then acquired the lock, observed predecessor 2, and ROLLBACK completed at +333 ms. B raised `VersionConflict(expected=1, actual=2)`. Exactly one v2 exists, pointer is 2, and v2 deep-equals A. The re-evaluation audit equals A's record. B's graduation evidence remains independently readable, while both `committed_version` and `committed_graduation_index` on B's execution run remain NULL. A links to v2 and graduation index 0. v1 is deep-equal before/after; no duplicate v2, partial source row, waiting lock, silent rebase, overwrite, or deadlock remained.

## Rollback while holding the lock

In a fresh schema, A acquired the lock and B waited. An injected error at the claim re-evaluation audit insert (after snapshot rows had been written in A's transaction) forced A to roll back. Backend IDs were A=10411 and B=10412. A lock at +608 ms; B request at +625 ms and observed lock wait at +630 ms; A ROLLBACK at +670 ms; B then acquired the row lock and observed predecessor 1; B COMMIT at +716 ms. Exactly one v2 exists and deep-equals B, with B's re-evaluation audit and graduation link. A's execution run has NULL commit linkage; A's partial snapshot/audit rows were rolled back. No waiting lock remains. v1 is unchanged.

## Failures preserved and checks

- `first-typescript-failure.txt`: the first harness compile used `.push` on readonly graph arrays. Fixed in the harness only.
- `native-first-attempt.txt`: the sandbox denied the loopback connection (`EPERM`). The same harness passed when allowed to connect to the isolated local server; no production code was changed.
- The first sandboxed `initdb` attempt failed at shared-memory creation (`shmget ... Operation not permitted`); initialization succeeded with the required local execution permission.

PASS: `pnpm check:persistence-postgres-concurrency`, `pnpm exec tsc --noEmit`, `pnpm check:persistence-versioning`, `pnpm check:persistence-roundtrip`, `pnpm check:persistence-graduation`, and `git diff --check`.

This closeout changes only a dedicated verification harness, package scripts/dev PostgreSQL client dependency, and evidence. Production locking and persistence semantics are unchanged. No #8 work started.
