# Issue #8, slice 8d — integrated investigation lifecycle gate

Verification and integration only. No publication endpoint, no ATI flow, no worker, no
live provider, no new domain concept.

## What is proved, and what is not

Twenty-one scenarios in `pnpm check:lifecycle`, driven through exported route handlers
with real `Request` objects wherever a route exists. The path is proved in **two
segments**, because #7 has no route-created-first-version path and 8d does not invent
one.

**Segment 1 — creation continuity, on one route-created identity:**

```
POST /api/investigations → POST execution → candidate → (no version)
```

**Segment 2 — the successor lifecycle, on a seeded-v1 identity:**

```
seed committed v1 → execute successor → inspect → candidate → revise/resume
→ validate/review → graduate → commit v2 → version/history → UI projection
```

An earlier version of this report described the whole thing as a single
`create → … → commit` path. That was too strong: the subject of segment 2 is
established by `writeInitialSnapshot`, not by the route.

### The creation boundary, recorded as an executable fact

`writeInitialSnapshot` inserts the `investigations` row itself, so an identity
`POST /api/investigations` has already created cannot receive a first version through
it — and `commitNextVersion` structurally requires a predecessor of at least 1. There
is therefore no path from a brand-new submission to a first committed version.

Check **C0** asserts this rather than assuming it: the write is rejected on the primary
key and the pointer does not move. **First-version creation from a new submission is
not integrated in this slice and is outside the proven path.** Nothing was weakened to
make it look otherwise.

### The subjects

**Segment 1:** an identity minted by the route. It executes the corpus through the same
stage ports, accumulates a candidate carrying its own id, and reports
`latestCommittedVersion: null` with empty history — research happened, nothing was
published by it.

**Segment 2:** `XRAY-LIFECYCLE-001`, holding the XRAY-KE-001 corpus **under its own
id** — every `Claim.investigationId` and `StageRun.investigationId` remapped. Storage
is provably not the fixture: the frozen benchmark is never consulted, and the committed
v2 contains a record the benchmark does not have. Version 1 is seeded as prior history
through `writeInitialSnapshot`, which is how #7 creates a first version, and which is
**not graduation-gated**. Graduation gating begins at v2, which is the path carrying
eligibility, run linkage, predecessor conflict and immutability.

### The stages are deterministic, and they are the real ports

Stage stubs replay the corpus through the same `StageDefinition` contract production
orchestration uses. No research is claimed. To make the committed result a genuine
successor rather than a duplicate, `TRACE` also contributes one newly located record
(`SRC-LIFECYCLE-01`) and widens one claim's recorded ambiguity.

The run reaches `SATURATION` legitimately: `assessResearchStop` finds the structural
conditions met over this corpus and the run supplies `saturationObserved`. Nothing
fabricated a stop, and a run that recorded none would have been refused by
`assertCommittable`.

## Creation continuity

| | |
|---|---|
| C1 | The identity `POST /api/investigations` mints is the same one that executes, holds its own candidate carrying its own id, and reports empty history with no pointer. |
| C0 | That identity cannot be given a first version through `writeInitialSnapshot`: rejected on the primary key, pointer unmoved. |

## Successor lifecycle

| | |
|---|---|
| L1 | A run traverses all ten stages and both gates, and commits nothing by itself. |
| L2 | Status exposes ten persisted `SUCCEEDED` stage runs. |
| L3 | Candidate is retrievable, labelled `CANDIDATE`, carries the new record, and still reads `currentVersion: 1` — working state does not pre-announce a version. |
| L4 | A revision payload reopens the completed run through the route; `GRADE` runs twice. |
| L5 | The journal holds a `STOPPED` transition with reason `SATURATION`, a passing validation and a review round — with `fullCapability: false`, because no reviewer model is wired. |
| L6 | The promoted candidate assesses as `BLOCKED` with zero reasons against the graph and at least one capability blocker: eligible, and honest about what could not be checked. |
| L7 | The eligible assessment commits **v2**, links the exact run (`committed_version = 2`, `committed_graduation_index = 0`), and advances the pointer once. |
| L8 | `GET /versions/2` is labelled `COMMITTED_VERSION`, reads `currentVersion: 2`, supersedes 1, and round-trips the new record and the re-evaluated claim. |
| L9 | v1 is byte-identical after v2, still reconstructs as `currentVersion: 1`, and history is ordered `[1, 2]` with the pointer at 2. |
| L10 | The UI query path serves v2 from storage. |

### The promotion seam

A run accumulates artifacts; it does not decide they are a *version*. The pipeline
never writes `currentVersion` (§17, ADR-0006), so `GraduationService.promote` puts the
two together — version number from the predecessor, added artifacts by comparison,
re-evaluated claims from `changedClaimIds`, research stop from what the run recorded.
It is arithmetic over recorded state, not judgment, and every durable effect below it
is an existing #7 function with its own rules intact.

## Failure paths

| | |
|---|---|
| F1 | A committed run cannot be resumed — 409 `EXECUTION_NOT_RETRYABLE` — yet stays inspectable, still reporting its commit, with its working state readable. Inspectable, not active. |
| F2 | A second commit against the same predecessor is rejected and the pointer does not move. No silent rebase. |
| F3 | A run with no adapters is retrievable, never reports `COMPLETED`, never graduates to `PASS`, and commits nothing. |
| F4 | A stage failure is retrievable as a `FAILED` stage run and commits nothing. |
| F5 | A completed-but-uncommitted run reports `committedVersion: null`, does not advance the pointer, and does not reach the UI path — working state cannot masquerade as committed state. |
| F6 | Unknown investigation, unknown run, wrong-owner run, unknown version and unknown candidate are all typed 404s. |
| F7 | The subject resolves to itself with its v2 content; an investigation with no committed version is `null`; an unknown id is `null`. No benchmark fallback anywhere. |
| F8 | All 24 captured responses swept for SQL, connection strings, prompts, correlation-ledger keys, ledger internals, stack traces and environment configuration: none present. |

## Preserved failed verification

**`first-attempt.txt` — 3/19.** Every failure cascaded from one: `INGEST` introduced
thirteen `REFERENTIAL/DANGLING_REFERENCE` errors.

```
StageRun SR-001 names investigation "XRAY-KE-001" but sits on "XRAY-LIFECYCLE-001".
```

The subject remap changed the investigation id, the claims and the version envelope,
but not `Investigation.stageRuns[].investigationId`. Thirteen stage runs, thirteen
errors. The validator was right and the harness was wrong; the remap now covers stage
run ownership. **No production code was changed to accommodate it.**

**`status-error-text-failure.txt` — 18/19.** The remaining check asserted that a stage
failure's reason appears in the status payload. It does not, and must not:
`ExecutionStatusDto` carries no `error` field, so an exception message cannot reach a
caller through the status route. The failure is retrievable as a `FAILED` stage run;
the reason stays in the run journal, where an operator reads it and a stranger does
not.

The check was rewritten to assert both halves — the raw text is absent from the
payload, and the journal does hold `synthetic ingest failure` — which is a stronger
statement than the one it replaced.

## Regression gate

| Gate | Result |
|---|---|
| `check:lifecycle` | PASS, 21 scenarios (`final-gate.txt`) |
| `check:api-routes` | PASS |
| `check:inline-execution` | PASS |
| `check:investigation-service` | PASS |
| `check:fixtures` | PASS |
| `check:persistence-workspace` | PASS |
| `check:persistence-audit` | PASS |
| `check:persistence-durable-integration` | PASS |
| `check:persistence-graduation` | PASS |
| `tsc --noEmit` | PASS |
| `pnpm build` | PASS — seven dynamic API routes |

`check:persistence-postgres-concurrency` was **not rerun**: no native PostgreSQL server
is available in this environment and `XRAY_POSTGRES_URL` is unset. The existing #7
native proof is carried forward unchanged and is not claimed as re-executed here.
