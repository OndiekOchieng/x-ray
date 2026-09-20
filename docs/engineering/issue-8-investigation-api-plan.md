# Issue #8 — investigation-only API slice

**Baseline:** #7 complete at `966cf92`  
**Scope:** investigation creation, execution, candidate and committed-version retrieval only. No publication, library, ATI, queue, worker, or live provider is implied by this plan.

## Decision: application commands over durable execution runs

Use a thin application orchestration service with synchronous commands over the existing repositories, pipeline, and `execution_runs` identity. `executionRunId` is already the stable run handle: it owns status, a mutable candidate checkpoint, append-only journal/validation/review/graduation evidence, and an optional committed-version link. A second Job/Run entity above it would duplicate identity and status without adding a capability. A command may execute inline and return only when its requested work reaches a durable boundary; it must never reply as if background work will continue after the request when no worker exists. A later worker could call the same command service with the same `executionRunId` without changing the API identity.

The API service, not route handlers, coordinates repositories, pipeline, adapters, validation/review, graduation and optional commit. Route handlers validate input, call the service, serialize public DTOs, and map errors. They do not import fixture registries, provider SDKs, raw prompts, or SQL.

## Operations

| Operation | Proposed boundary | Source of truth |
| --- | --- | --- |
| Create investigation | `POST /api/investigations` with civic `sourceUrl` and optional `focus`; returns distinct investigation id | New investigation identity plus retained pre-INGEST submission input, not a fabricated Source/Evidence or committed version |
| Start execution | `POST /api/investigations/{id}/executions`; returns `executionRunId` and durable status after the inline command reaches a checkpoint/terminal state | `execution_runs` and `candidate_workspaces` |
| Get execution status | `GET /api/investigations/{id}/executions/{runId}` | Run status plus ordered journal and linked validation/review summaries; failed attempts remain visible |
| Resume/retry execution | `POST /api/investigations/{id}/executions/{runId}/resume` with an explicit retry/revision request when needed | Restore checkpoint/ledger/journal; preserve semantic IDs, successful stages and failed evidence |
| Get candidate/current state | `GET /api/investigations/{id}/candidate?executionRunId=...`; investigation summary may include `latestCommittedVersion` separately | Named run's mutable candidate checkpoint; never silently substitute a committed version or choose an ambiguous run |
| Get committed version | `GET /api/investigations/{id}/versions/{version}` | `readSnapshot` and existing selectors/projections; historical `currentVersion` equals selected N |
| List version history | `GET /api/investigations/{id}/versions` | `investigation_versions` metadata plus storage-level latest committed pointer, with no public/published meaning |

Unknown investigation/run/version IDs return 404; mismatched run ownership also returns 404. A stale expected predecessor is a conflict, not an automatic rebase. Validation/review/graduation failures remain explicit run outcomes and never become complete committed versions. All domain times cross the boundary as ISO strings. Candidate and committed responses must be labeled distinctly; no `latestPublic` or library semantics enter #8.

## Two implementation seams to make explicit

1. **Pre-INGEST input.** The existing `investigations` identity row stores only id and latest committed pointer. A submitted URL cannot be recovered from it, and a URL alone does not justify minting canonical Source details. Add a small durable submission-input record owned by the investigation identity (URL, optional requested focus, creation timestamp) before execution. This is command input, not canonical evidence. INGEST later constructs the surface Source from an actual retrieval outcome through the existing adapter contract. Do not substitute the XRAY-KE-001 fixture or fabricate retrieval success.
2. **Truthful progress/checkpointing.** `runPipeline` currently returns a complete in-memory result; #7 persistence can checkpoint and resume it, but no production orchestration checkpoints each stage attempt automatically. Add a narrow stage/gate-boundary callback or equivalent orchestration seam that durably saves workspace and appends audit before progress is reported. A process interruption may repeat only work after the last durable boundary, retaining existing retry/correlation semantics. `RUNNING` is reported only while a command is genuinely executing, never as a simulated animation.

## Bounded sequence

- **8a — contract and command service:** durable pre-INGEST input; create/status/read service interfaces and error semantics; no public library or ATI. Prove two distinct URLs create distinct identities without a canonical graph or committed version.
- **8b — inline execution/resume:** wire the pipeline to durable checkpoints and audit through the command service; prove status and stage-specific retry after restart, capability-blocked honesty, and no fabricated progress. Use deterministic adapters implementing the same ports; do not claim live research.
- **8c — investigation retrieval/API:** expose the seven routes above, map candidate versus committed views through existing selectors/projections, preserve 404s and ISO strings, and replace only investigation-specific fixture reads. Existing library/featured/gap-global behavior is outside this slice.
- **8d — integrated gate:** create → execute → inspect → retry → candidate → eligible commit → version/history on a stored investigation, plus failed run and unknown-id checks. Inspect route payloads for provider secrets/prompts. Leave public publication/cache to #9 and ATI lifecycle to #10.

A separate job system becomes justified only by measured request-duration, scheduling, cancellation, or multi-host ownership requirements. None is established by the current `execution_runs` contract. If inline execution exceeds the host request limit, stop at the last durable boundary and report that limitation; do not launch untracked background work or invent a queue.
