# Issue #8, slice 8c — investigation API routes

## Contract and implementation

Seven routes, all thin: parse, call a service, serialize, map a typed error.

| Route | Method |
|---|---|
| `/api/investigations` | POST |
| `/api/investigations/{id}/executions` | POST |
| `/api/investigations/{id}/executions/{runId}` | GET |
| `/api/investigations/{id}/executions/{runId}/resume` | POST |
| `/api/investigations/{id}/candidate?executionRunId=…` | GET |
| `/api/investigations/{id}/versions/{version}` | GET |
| `/api/investigations/{id}/versions` | GET |

No SQL, fixture registry, provider SDK, prompt or pipeline logic in any handler.
`next build` lists all seven as dynamic route handlers.

### Host seams, not infrastructure

`lib/xray/application/runtime.ts` holds two settable providers — a database and an
execution runtime. Neither is this slice's to build: wiring a pool, a live provider or
a worker is out of scope, so the routes ask for both by name and the host supplies
them.

**The two seams behave differently when unconfigured, on purpose.**

An unconfigured *database* throws `HostNotConfigured` and the route answers **503**.
There is no honest answer to a retrieval question without storage; a route that
answered from nothing would report an empty investigation as though it had been
researched.

An unconfigured *execution runtime* does **not** throw and never produces a 503.
`getExecutionRuntime()` falls back to a runtime whose every research stage returns a
capability gap, so the run starts, journals its gaps and blocks. That is 8b's model
holding: a missing adapter is incomplete capability, not a broken request, and the
caller gets a real run id and a durable blocked status rather than an error. It is not
a stub provider and produces nothing.

### HTTP mapping

`lib/xray/application/http.ts` maps only types this codebase defines:

| Condition | Status | Code |
|---|---|---|
| Unknown investigation / run / wrong-owner run / missing candidate / missing version | 404 | `NOT_FOUND` |
| Invalid submission, malformed body, query or version | 400 | `INVALID_INPUT` |
| Resume refused on a completed or committed run | 409 | `EXECUTION_NOT_RETRYABLE` |
| Stale predecessor | 409 | `VERSION_CONFLICT` |
| Database seam unconfigured | 503 | `SERVICE_UNAVAILABLE` |
| Anything else | 500 | `INTERNAL_ERROR`, fixed sentence |

The default branch is deliberately uninformative. An error we did not anticipate is, by
definition, one whose message we have not reviewed for what it might contain.

### Resume payload

A bare `{}` or absent body continues unfinished work. A `revision` object reopens a
completed run. Only public fields are parsed — `stage`, `findingId`, `action`, optional
`id` and `targets`. `RevisionRequest` is the Reviewer's own object, and accepting it
wholesale would let a caller assert review findings it never made. A revision naming a
control gate is a 400: the Reviewer is the inspector, not the repair step (ADR-0011).

`InlineExecutionService.resumeExecution` gained an explicit `revision` option that
takes precedence over the runtime's plan. The caller asking for a revision is a
decision about this run; the runtime only knows how to execute stages.

### Candidate versus committed

Candidate requires an explicit `executionRunId` and stays labelled `CANDIDATE`. There
is no "latest run": guessing would serve one execution's evidence under another's name.
A missing candidate is a 404, never a substituted committed version — published state
is not an answer to a question about working state.

Committed responses stay labelled `COMMITTED_VERSION` at an explicit version N.
`latestCommittedVersion` is reported as storage records it, never relabelled public,
published or current; what is public is #9's question.

### Registry replacement

`lib/xray/investigations.ts` now resolves investigation-specific reads through the
application/query path: a stored investigation is reconstructed from its latest
committed version, exactly as the API serves it. Storage wins; the benchmark answers
only for its own id and only after storage declines, so a stored investigation can
never be shadowed by a fixture and a fixture can never stand in for a stored one. An
unknown id is `null` and the page is not-found.

An investigation with no committed version resolves to `null` rather than to working
state, because showing working state would require picking a run — which the candidate
contract forbids.

Library, featured and gap-search reads still come from the benchmark corpus. Which
investigations are public is a publication decision, and publication is #9.

**Not moved into 8c:** library/featured/global-gap behaviour, publication or cache
lifecycle, ATI lifecycle, live provider wiring, worker or queue, search or discovery.

## Remediation — storage failure could fall through to the benchmark

The first review blocked on this. `readStoredGraph` used `.catch(() => null)` and
`getInvestigationGraph` treated any `null` as permission to consult the benchmark, so
three materially different states collapsed into one:

1. storage says the investigation does not exist;
2. storage says it exists but has committed no version;
3. the storage read failed.

Only the first may reach a fixture. As written, a database failure could silently
become benchmark data, and a stored `XRAY-KE-001` with nothing committed could be
shadowed by the frozen fixture — so the claim that a stored investigation can never be
shadowed was not yet true.

Storage resolution is now tri-state — `COMMITTED_GRAPH`,
`KNOWN_WITHOUT_COMMITTED_VERSION`, `UNKNOWN_IN_STORAGE` — and only the typed
`InvestigationResourceNotFound('INVESTIGATION', …)` produces the third. Every other
error propagates. There is no catch-all, and a check asserts the source contains none.

| Resolution | Result |
|---|---|
| `COMMITTED_GRAPH` | the stored graph |
| `KNOWN_WITHOUT_COMMITTED_VERSION` | `null`; the benchmark is not consulted |
| `UNKNOWN_IN_STORAGE` | the benchmark may answer, for its own id only |
| unexpected read error | propagates |

### Remediation proof

- A stored `XRAY-KE-001` identity with no committed version resolves to `null`. The
  frozen benchmark does not shadow it.
- A submitted investigation with no committed version is likewise `null`; working state
  is not served as a committed graph.
- A storage read that throws `connection terminated unexpectedly` propagates that
  error. It becomes neither `null` nor benchmark data.
- A typed unknown leaves the benchmark reachable by its exact id.
- `XRAY-DOES-NOT-EXIST`, `xray-ke-001`, `XRAY-KE-002` and `../XRAY-KE-001` all stay
  `null` — the benchmark answers to one spelling of one id.
- A source-text check fails if a catch-all returns, or if the typed unknown case stops
  being distinguished.

## Preserved failed verification

The first route gate run was 12/16 (`first-attempt.txt`). All four were the harness
asserting something untrue; in every case the system was right.

**F2 expected `CAPABILITY_BLOCKED`, got `GATE_BLOCKED`.** With no adapter, `INGEST`
produces no surface `Source`, so the `surfaceSourceId` the investigation declares has
nothing to resolve against and FULL validation stops the run at the gate. Blocked
either way, never completed or committed. The check now asserts what the contract
actually asks — a real run id and the durable status — rather than one particular label.

*Noted, not changed:* when capability gaps also leave the graph invalid, the run
reports `GATE_BLOCKED` rather than `CAPABILITY_BLOCKED`. The gaps are still journalled
and retrievable. Changing that precedence is pipeline verdict work, outside a slice
scoped to routes and retrieval.

**F5 completed run ended `STAGE_FAILED`.** The trivial runtime ran `PLAN` and `TRACE`
with no `INGEST`, so staged validation rightly rejected the dangling surface source.
The runtime now ingests a source first — the same shape 8b proved.

**F7 compared against a badly re-serialized copy** rather than the graph itself.
Rewritten to compare artifact ids per collection plus the v0.3 source positions and
knowledge bases.

### A proof that could not be written

A second propagation proof was intended: a `latest_committed_version` pointer naming a
version with no rows, to show that inconsistency reaches the caller rather than a
fixture. The state turns out to be unreachable. The advance trigger rejected an
arbitrary number — *"latest committed version must advance exactly once"* — and the
`latest_committed_fk` foreign key rejected a plausible one. Both rejections are in
`pointer-constraint-failure.txt`.

The check was kept and inverted: it now asserts that storage refuses the state, because
the reason the propagation path cannot be exercised is itself worth holding in place.

**F11 rejected `publishedAt: "2020-10"`.** Month precision is deliberate: a source
published in a month X-Ray cannot narrow is stored as recorded, not padded to a day it
never claimed. The assertion was too strict; all three precisions are ISO 8601.

## Checks

Sixteen scenarios, every one through an exported route handler with a real `Request`
and real route params.

- Two submitted URLs create two distinct investigations; neither is the benchmark, and
  neither claims a committed version.
- Starting an execution returns the real run id and a durable blocked status, with a
  scheduled-but-unrun stage recorded and no version committed.
- Status exposes persisted `StageRun` progress.
- A bare resume continues unfinished work; a bare resume of a completed run is a typed
  409; the same run reopens under a revision payload and `PLAN` runs a second time.
- A revision naming a control gate is a 400 that names the offending field.
- Candidate without `executionRunId` is a 400; with one it is labelled `CANDIDATE` and
  serves that run.
- Version 1 is labelled `COMMITTED_VERSION` and reconstructs every collection exactly,
  including v0.3 source positions and knowledge bases.
- History is ordered, reports storage's `latestCommittedVersion`, and does not relabel
  it as published or current.
- Unknown investigation, unknown run, wrong-owner run, unknown version and missing
  candidate are all 404 with a `NOT_FOUND` code — never a substitute.
- Absent body, array body, missing `sourceUrl`, a non-URL, a blank focus, and versions
  `0`, `-1`, `abc`, `1.5` are all 400 naming the offending field.
- Every timestamp in all 30 captured responses is an ISO string at its recorded
  precision.
- All 30 responses swept for SQL, connection strings, prompts, correlation-ledger keys,
  ledger internals, stack traces and environment configuration: none present.
- An injected database failure carrying a host, port and password returns a fixed
  sentence and a 500; none of the secret text reaches the caller.
- An unconfigured database seam returns 503, not a defect in the request. An
  unconfigured execution runtime deliberately does not: it blocks the run instead.
- The UI query path reads the stored investigation by id, returns `null` for an unknown
  id, returns `null` for a submitted investigation with no committed version, and still
  reaches the benchmark by its own id.

`pnpm check:api-routes`: PASS, 23 scenarios (`final-gate.txt`). `pnpm build` compiles all seven
routes. `check:fixtures`, `check:inline-execution`, `check:investigation-service`, the
four persistence gates and `tsc --noEmit`: PASS.

`check:persistence-postgres-concurrency` remains unrun for want of `XRAY_POSTGRES_URL`,
unchanged by this slice.

## Also done

The stale sentence in the 8b report describing the paused `TRACE` run as `PENDING` is
corrected to `RUNNING`, as the 8b re-review asked.
