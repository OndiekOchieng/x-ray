# Issue #7 — 7d-a durable candidate workspace

Base: #15 closeout `07186ad918087170298b7a7d88de2b2d2f70f4af`.
This slice implements checkpoint/reload for mutable candidate execution state only.

## Storage envelope

The existing `candidate_workspaces.state` JSONB object stores format `1` with a tagged, lossless value tree. The tag distinguishes an explicitly present `undefined` property from an absent property; null, object entries, and array order also survive. The payload contains:

- accumulator base Investigation, optional version, canonical collections, stage-owned output ID sets, and active ResearchStop;
- in-run artifact revision;
- ordered semantic correlation key→canonical ID bindings;
- complete ordered RunJournal entries of all five kinds.

`execution_runs` owns execution identity, start time, status, and optional committed-version link. A checkpoint updates its status and the workspace in one transaction. Reload reconstructs `GraphAccumulator`, `CorrelationLedger`, and `RunJournal` instances. Stale stages and active capability gaps are computed from the restored journal, not stored in parallel columns. No immutable `InvestigationVersion` is created by checkpointing.

## Restart proof

`pnpm check:persistence-workspace` passes under PGlite:

1. A v0.3 candidate executes INGEST successfully and fails TRACE. The checkpoint includes SourcePosition, concrete KnowledgeBasis, stage ownership, a semantic correlation binding, a capability record, an invalidation, active SATURATION, and a STOP transition.
2. After discarding the first run objects, reload reconstructs the graph, accumulator state, complete journal, ledger, artifact revision `1`, stale TRACE marker, active capability gap, ResearchStop, and `STAGE_FAILED` status. A stage-owned replacement probe proves ownership was restored. The incomplete run has no version row or latest pointer.
3. A resumed TRACE failure leaves the stale marker and capability gap active. After another checkpoint and reload, a successful TRACE rerun clears both. INGEST is not rerun, the two failed TRACE attempts remain in the journal, STOP→RESUME survives, no run ID is reused, the correlation binding and SourcePosition/KnowledgeBasis survive, and the artifact revision advances exactly `1→2`.
4. The final workspace status/revision and both actual gate entries reload correctly. No immutable version row was created by the resumed candidate.

Regression checks pass: `pnpm exec tsc --noEmit`, `pnpm check:fixtures`, `pnpm check:persistence-schema`, `pnpm check:source-position-schema`, `pnpm check:persistence-versioning`, `pnpm check:persistence-roundtrip`, and `pnpm check:source-position-versioning`.

The first TypeScript run found two query-result casts in the new check; its output is preserved in `verification/issue-7-7d-a/typecheck-first-failure.txt`. The casts were corrected, then the gate passed. No other meaningful failure occurred.

## Boundary

This slice adds no normalized execution journal, validation/review/graduation audit tables or repository methods, ATI lifecycle, API, publication, UI, or native PostgreSQL locking claim. Those remain with 7d-b/c/d and the separate final #7 PostgreSQL gate.
