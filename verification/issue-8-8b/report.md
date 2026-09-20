# Issue #8, slice 8b — inline execution start and resume

> **Remediation, 2026-09-19.** The first review of `37e6a5a` blocked on three
> contract gaps. All three are closed below, under *Remediation*. The original
> implementation sections are unchanged and still describe what shipped.

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

## Remediation — three contract gaps closed

### Gap 1 · `RevisionRequest` routing was unreachable from the command boundary

`runPipeline` accepted `revision`, but `ExecutionPlan` exposed no field for it and
`resumeExecution` never forwarded one, so the application layer could not exercise the
revision semantics that already existed.

`ExecutionPlan.revision?: RevisionRequest` now exists and is forwarded.

Reopening a run required a semantic decision, recorded here rather than left implicit:
**a completed run is reopened only by a revision, never by a bare resume.** A plain
resume continues unfinished work, and a completed run has none; a revision is a new
instruction, not unfinished work. A *committed* run stays closed to both, because it is
published history owned by #7. `ExecutionNotRetryable` now carries which of the two
refusals applied.

### Gap 2 · control transitions were durable only at the next stage or gate

`PipelineBoundary.kind` gains `CONTROL`, carrying the transition
(`INVALIDATION | RESUMED | STOPPED`) and the journal entry id it appended. A boundary
is raised immediately after each append, closing the window between mutating the
journal and making that mutation durable.

`accumulator.setResearchStop(undefined)` was moved ahead of the `INVALIDATION` append
so the state observed at that boundary is already coherent — no durable checkpoint ever
shows a run that has been invalidated while still claiming to have stopped.

### Gap 3 · nothing proved a submitted URL fabricates no Source

The harness now also drives an investigation created through the 8a submission path,
holding only an `investigation_submissions` row.

### Status semantics · `RUNNING` is now set, and is not ambiguous

The review asked for an explicit decision. `WorkspaceRunStatus` already admitted
`RUNNING` and `execution_runs.status` already allowed it; nothing set it, so an
in-flight run was observable as `PENDING` — a label meaning *not started*.

Non-terminal boundaries now report `RUNNING`. `PENDING` is retained for exactly one
state: the initial checkpoint written before execution begins. An observer therefore
sees the exact durable state, which is the rule the slice is built on.

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

### Remediation failures

Two further gate runs failed while building the new proofs. Both were the harness
asserting something untrue about the system, and in both cases the system was right.

**`revision-stop-failure.txt`** — the revision proof expected a `STOPPED` entry after a
completed revision. None appeared, because the calibration graph does not satisfy
`assessResearchStop`'s structural conditions, so `SATURATION` is correctly never
inferred from one pass (D25). The harness now asserts the truth — the first resume
records *no* stop at all — and proves the `STOPPED` transition separately with an
explicit named `MANUAL_STOP` reason. No time or cost budget was faked; the
`StopEvidence.reason` type forbids naming either, which is D27 holding.

**`ingest-resume-failure.txt`** — the fresh investigation was built with
`currentVersion: 0` and `INGEST` failed staged validation with
`STRUCTURAL/ILLEGAL_ENUM_VALUE`: *"versions are 1-based"*. The fixture was corrected to
`1`. That value is a pointer, not a claim that a version exists — the checks assert
`investigation_versions` stays empty throughout, which is the durable truth.

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
### Remediation checks

- A revision resume routes to `PLAN`: the journalled invalidation names target `PLAN`,
  request `RR-001`, and stale stages `PLAN, TRACE`. Both stale stages re-run and
  nothing else does.
- Durability at the transition point is proved directly rather than inferred. The
  revised `PLAN` is held mid-execution and an independent read of the audit already
  sees the `INVALIDATION` and `RESUMED` entries — before any stage attempt boundary has
  fired, so nothing but the control boundary can have persisted them. The run is
  observable as `RUNNING` at that moment.
- `STOPPED` is proved durable at its own boundary by failing the *next* one: an injected
  failure on the validation-result insert leaves the `STOPPED` entry durable, with zero
  validations and zero gate entries recorded. Had the stop waited for the gate, it
  would have been lost.
- A bare resume of a completed run is refused; the same run reopens under a revision.
- A submitted URL alone: zero rows in `sources`, `evidence`, `claims` and
  `investigation_versions`; the candidate graph holds no sources and no evidence; the
  capability gap is recorded and the stage run is `PENDING`, not `FAILED`.
- After a real `INGEST` result, the candidate holds exactly the one returned `Source`,
  and `investigation_versions` is *still* empty — execution creates no version.
- `pnpm check:inline-execution`: PASS, nine scenarios (`final-gate.txt`).
- `pnpm check:fixtures`, `check:persistence-workspace`, `check:persistence-audit`,
  `check:persistence-durable-integration`, `check:persistence-graduation`,
  `check:investigation-service`, and `pnpm exec tsc --noEmit`: PASS.

`check:persistence-postgres-concurrency` was **not run**: it requires
`XRAY_POSTGRES_URL` and no native PostgreSQL server is available in this environment.
It calls `saveCandidateCheckpoint` without the new option, so it takes the unchanged
default path, but that is reasoning from the diff rather than an executed result.
It remains an issue #7 closeout check.
