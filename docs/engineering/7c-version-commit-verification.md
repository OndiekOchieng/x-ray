# 7c — Immutable v2 and expected-predecessor commit

**Date:** 2026-09-19  
**Decision:** A documented re-assessment is listed in `reEvaluatedClaimIds` even when the finding stays unchanged. Each listed claim has exactly one version-scoped reason audit row; semantic graph changes touching an existing claim must also be listed.

## Implementation

- Migration 0003 adds immutable, version-scoped claim re-evaluation reason and ordered causal-reference rows. Source/evidence causes have composite version-scoped FKs. Optional absent versus explicitly empty causes are preserved. Review/ATI-response references remain textual until their owning slices provide durable targets.
- The v1 writer's complete snapshot insertion was reused by v2. Existing claim, source and evidence IDs must carry forward. Additions are canonical IDs absent from the predecessor, in candidate order; revised content under an existing ID is represented by that ID's new version-scoped row, not as an added receipt.
- Before the transaction, the repository reads immutable v1, checks the v2 metadata and semantic affected-claim diff, and receives the already-run graduation result. Inside one pinned-client transaction it locks the investigation identity with `SELECT ... FOR UPDATE`, compares `latest_committed_version` to the expected predecessor, rechecks candidate identity/committability and unchanged in-memory graph, requires a completed producing run, inserts the complete v2 snapshot and audit, links the run, and advances the pointer. It does not call a validator, model, or provider inside the transaction.
- Eligible `BLOCKED` requires a completed research graph, SATURATION, valid assessment, no failure/revision reasons, and capability blockers only. Stale and research-incomplete blockers are rejected. `REVISE`, `FAIL`, and incomplete candidates cannot commit.

## Verification and preserved failures

`pnpm check:persistence-versioning` passes under PGlite:
1. v1 commits and reconstructs deep-equal to the frozen graph;
2. a deferred invalid causal-source FK fails after all v2 writes, rolling back v2, child rows, audit, run link and pointer, while v1 stays deep-equal;
3. a valid v2 with a new Source/Evidence and changed FND-C001 commits; v2 reconstructs deep-equal, v1 remains deep-equal, pointer advances 1→2, and the same FND-C001 canonical ID has different immutable content in v1/v2;
4. supersession, added IDs, re-evaluated C001 and unchanged-but-reassessed C002, reasons/details/causes round-trip;
5. a stale expected-v1 attempt after v2 raises `VersionConflict` and changes neither snapshot.

The first type/runtime failures and two candidate-assessment failures were preserved in `7c-initial-failing-verification.txt`, `7c-first-runtime-output.txt`, `7c-second-runtime-output.txt`, `7c-post-cutoff-failure.txt`, and `7c-acceptance-cutoff-failure.txt`. The assessment failures showed the synthetic new receipt was post-cutoff, then that moving the historical cutoff invalidated A06. The test now adds a previously omitted, pre-cutoff receipt without altering the frozen v1 benchmark.

`pnpm check:persistence-schema` applies/rolls back/reapplies 0003 on an empty database; `pnpm check:persistence-roundtrip` retains the 7b proof; `pnpm check:fixtures` retains the existing fixture/replay checks.

## Native PostgreSQL gate

PGlite executes PostgreSQL SQL/constraints but does not establish competing-backend row-lock behavior. Before #7 closes, run two independent native PostgreSQL connections both expecting v1: exactly one may commit v2, and the loser must receive a version/serialization conflict with no partial rows. Verify behavior at the application's intended transaction isolation level. The `SnapshotDatabase` argument must be a pinned connection, not a pool that routes each query independently.

No 7d workspace/resume or full run/journal/gate audit persistence, API, publication, or ATI lifecycle was added.
