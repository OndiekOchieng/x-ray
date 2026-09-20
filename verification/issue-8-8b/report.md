# Issue #8, slice 8b — inline execution start and resume

## Contract and implementation

- `runPipeline` gains one optional `onBoundary` callback, awaited after every stage
  attempt, after each control gate, and once before returning. `PipelineBoundary`
  carries the journal, accumulator, ledger and artifact revision as they stand, plus
  the validation result and review history where the boundary has them. Nothing about
  stage execution, identity, retry, gates or verdicts changed.
- The stage-attempt boundary is raised from a `finally`, outside the attempt's own
  error handler. A persistence failure at a boundary therefore aborts the run as a
  persistence failure, and is never recorded as a failed research attempt.
- `saveCandidateCheckpoint` and `appendExecutionAudit` gain an `inTransaction` opt-out.
  Omitted, both behave exactly as before and own their own `BEGIN`/`COMMIT`. Supplied,
  the caller owns the transaction, which is what lets one boundary write the checkpoint
  and the audit atomically.
- `InlineExecutionService` exposes `startExecution` and `resumeExecution` against one
  durable `execution_run_id`. `ExecutionRuntime` is a provider-neutral plan factory:
  the harness stubs supply stages through the same ports a live adapter would.
- Resume refuses a completed or committed run, requires the candidate workspace to
  exist, and refuses to start when the stored workspace journal and the audit journal
  disagree.
- No route, no worker, no live provider, no schema change, no new domain concept.

## Preserved failed verification

The first gate run failed while seeding the synthetic calibration graph:

```
new row for relation "claims" violates check constraint "claims_check1"
Failing row contains (XRAY-KE-001, 1, DC003, ..., DISCOVERED, ...)
```

Migration 0001 declares `CHECK (origin <> 'DISCOVERED' OR source_passage IS NULL)`.
The calibration graph gave a `DISCOVERED` claim a `sourcePassage`, which the schema
correctly rejects: a discovered claim was not read off the surface record, so it has
no passage there to quote. The original output is retained in
`fixture-constraint-failure.txt`.

The harness was moved to the persistence-compatible calibration shape already used by
the versioning checks. **No production schema or domain behaviour was changed to
accommodate the test fixture.**

## Checks

- A paused `TRACE` attempt: an independent read sees the durable `PLAN` success, the
  candidate at artifact revision 1, and the ledger binding already persisted — while
  the run is still in flight and still `PENDING`.
- The interrupted attempt is durable: `PLAN SUCCEEDED, TRACE FAILED`, revision held at
  1, two stage entries journalled, and no validation recorded, so no gate fabricated a
  verdict over incomplete state.
- A fresh service instance resumes from the stored candidate, ledger and audit alone:
  `PLAN` is not re-run (1 call), `TRACE` runs a second time (2 calls), the correlation
  binding survives at the same id, revision advances to 2, and the v0.3 source-position
  and knowledge-basis fields round-trip unchanged.
- The audit's historical prefix is unchanged by the resume; one validation is appended,
  one review round exists, gates are recorded `VALIDATE, REVIEW`, and
  `fullCapability` is `false` — the model port is still unwired, so the run does not
  claim assurance it does not have.
- No version is committed by execution: `committedVersion` is null, snapshot v1 is
  byte-identical to the pre-run read, and `investigation_versions` still holds one row.
- An injected failure on the journal insert, after the workspace write, rolls the whole
  boundary back: the run stays at its initial `PENDING` checkpoint, revision 0, with an
  empty journal and empty audit, and remains retryable.
- An unavailable adapter stays capability-blocked rather than stage-failed or committed.
- `pnpm check:inline-execution`: PASS (`final-gate.txt`).
- `pnpm check:fixtures`, `check:persistence-workspace`, `check:persistence-audit`,
  `check:persistence-durable-integration`, `check:persistence-graduation`,
  `check:investigation-service`, and `pnpm exec tsc --noEmit`: PASS.

`check:persistence-postgres-concurrency` was **not run**: it requires
`XRAY_POSTGRES_URL` and no native PostgreSQL server is available in this environment.
It calls `saveCandidateCheckpoint` without the new option, so it takes the unchanged
default path, but that is reasoning from the diff rather than an executed result.
It remains an issue #7 closeout check.
