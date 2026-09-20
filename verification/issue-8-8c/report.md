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
them. Unconfigured is a typed error, never a silent default; a route that answered from
nothing would report an empty investigation as though it had been researched.

The default execution runtime is not a stub provider and produces nothing. Every
research stage returns a capability gap, so a run started with no adapters records its
gaps and blocks, which is the honest answer for a build with no provider wired.

### HTTP mapping

`lib/xray/application/http.ts` maps only types this codebase defines:

| Condition | Status | Code |
|---|---|---|
| Unknown investigation / run / wrong-owner run / missing candidate / missing version | 404 | `NOT_FOUND` |
| Invalid submission, malformed body, query or version | 400 | `INVALID_INPUT` |
| Resume refused on a completed or committed run | 409 | `EXECUTION_NOT_RETRYABLE` |
| Stale predecessor | 409 | `VERSION_CONFLICT` |
| Seam unconfigured | 503 | `SERVICE_UNAVAILABLE` |
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
- An unconfigured deployment returns 503, not a defect in the request.
- The UI query path reads the stored investigation by id, returns `null` for an unknown
  id, returns `null` for a submitted investigation with no committed version, and still
  reaches the benchmark by its own id.

`pnpm check:api-routes`: PASS (`final-gate.txt`). `pnpm build` compiles all seven
routes. `check:fixtures`, `check:inline-execution`, `check:investigation-service`, the
four persistence gates and `tsc --noEmit`: PASS.

`check:persistence-postgres-concurrency` remains unrun for want of `XRAY_POSTGRES_URL`,
unchanged by this slice.

## Also done

The stale sentence in the 8b report describing the paused `TRACE` run as `PENDING` is
corrected to `RUNNING`, as the 8b re-review asked.
