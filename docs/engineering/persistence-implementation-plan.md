# Persistence Implementation Plan — 7a to 7d

**Status:** Contract gate, before schema mutation  
**Date:** 2026-09-19  
**Issue:** #7 · P1–P12 and StageRun mapping  
**Baseline:** `fe85483` (#6 complete)

This Level-3 plan implements [ADR-0003](../adr/0003-relational-store-first.md)
and the [ADR-0006 persistence amendment](../adr/0006-immutable-investigation-versions.md).
The [versioning contract](../architecture/investigation-versioning.md#persistence-contract)
defines the selected snapshot, candidate workspace, audit and ATI boundaries.
Each slice ends with a rollback and a verification gate. Schema and runtime
work starts only after these durable contracts have been reviewed.

## Constraints carried into every slice

- PostgreSQL with normalized, version-scoped canonical artifacts and ordered
  relationship rows; no graph database, mutable shared artifact row or derived
  count column as canonical truth.
- A committed version is completed research, not public publication. `PASS`
  and eligible `BLOCKED` may commit; `REVISE`, `FAIL`, and incomplete execution
  may not. XRAY-KE-001 v1 is committed research that remains `BLOCKED` by
  ReviewerModel capability absence.
- The storage identity's `latestCommittedVersion` is distinct from snapshot
  `Investigation.currentVersion = selected vN`; #9 owns the public pointer.
- #6 artifact revisions, retry identity, stage ownership, stale scaffolding,
  journal ordering and separate control gates remain intact. #5 validation,
  review and graduation semantics are not redefined by SQL.
- Version-snapshot `Investigation.stageRuns` and producing execution journal
  are stored separately; historical XRAY-KE-001 entries are not rewritten.
- ATI lifecycle transitions and response ingestion belong to #10. API,
  publication and caching belong to #8/#9.

## 7a — Version/ownership schema

**Deliver:** migrations for investigation identity and latest committed pointer;
immutable version metadata and frozen investigation fields; version-scoped
claims, sources, evidence, source dependencies, evidence provenance,
discrepancies, disconfirmations, findings and gaps; ordered memberships/edges;
version-snapshot StageRuns; ATI request origin reference; and the execution,
audit and candidate-workspace *skeleton*. Canonical ids remain domain values;
private keys, if used, are storage-only. Apply keys, composite FKs, row-local
checks and version immutability safeguards without moving epistemic rules into
SQL.

**Checkpoint:** schema can represent every XRAY-KE-001 field, including
date-only retrieval values, optional value objects, both provenance layers,
the seven unresolved stop leads, and its legacy StageRuns. No API or live
provider is introduced.

**Rollback:** migration rollback on an empty development database; existing
in-memory domain/pipeline behavior is unchanged.

**Verification gate:** migrate up/down/up on a clean PostgreSQL instance;
exercise version-scoped FK, uniqueness, ordinal and immutability constraints;
show that Source and Evidence cannot collapse into one row and that a v2 row
cannot edit v1.

## 7b — Lossless v1 snapshot round-trip

**Deliver:** graph→store and store→graph mapping for immutable v1; ordered
relations and optional-field serialization; canonical deep-equivalence tests
using the frozen XRAY-KE-001 graph. Persist its v1 snapshot StageRuns exactly,
without substituting 6d replay audit. Persist no fabricated ATI request.

**Checkpoint:** reconstructed XRAY-KE-001 has the same entity values, IDs,
membership/list order, date/time precision, discriminated unions,
Measurement/TimeScope shape, SourceDependency, EvidenceProvenance,
ResearchStop, selected `currentVersion = 1`, and historical StageRuns. A01–A10
and FULL validation still hold; graduation remains `BLOCKED` with six
capability blockers and zero graph reasons.

**Rollback:** remove additive mapper and test code without modifying the
frozen fixture or #6 runtime.

**Verification gate:** canonical deep equivalence plus targeted optional vs
absent, date-only, array-order and provenance checks. IDs, review fingerprints
and derived counts alone do not pass this gate.

## 7c — Immutable v2 and atomic commit

**Deliver:** candidate-to-version commit with expected-predecessor check,
complete immutable snapshot insertion, audit link and atomic
`latestCommittedVersion` advance. Record `supersedesVersion`, added source and
evidence IDs, re-evaluated claim IDs, and a structured per-claim reason/detail
with optional causal references. The candidate is assessed against its
intended vN before the short transaction so its review/graduation evidence
binds to the graph that will be stored. A conflict requires re-evaluation.

**Checkpoint:** v2 adds a receipt and changes only affected conclusions;
loading v1 still yields byte/semantic-equivalent canonical state and its
original stop/StageRuns. A correction without a new receipt has an explicit
reason rather than a fabricated evidence edge.

**Rollback:** failed insertion, constraint error or predecessor conflict
leaves no partial vN and does not move the latest committed pointer.

**Verification gate:** concurrent expected-v1 commits yield one winner and
one version conflict; injected failure at each write boundary rolls back;
reloading v1 and v2 proves immutable history, supersession, additions and
re-evaluation explanations. No transaction calls a model/provider.

## 7d — Durable workspace and audit

**Deliver:** durable `execution_run_id`; ordered persistence of all five #6
journal kinds; mutable checkpoint of accumulator, stage-owned output sets,
artifact revision, semantic correlation ledger, stale state, capability gaps
and current execution status; linked full validation, ReviewHistory and
graduation records. Keep active ResearchStop in workspace, STOP/RESUME history
append-only, and freeze only the active stop on version commit. Persist ATI
request payload/current state outside versions, referencing its immutable
origin gap snapshot; do not implement #10 transitions.

**Checkpoint:** a process restart resumes a failed/revised candidate without
renumbering artifacts, losing stale markers or erasing failed review evidence.
An incomplete run has audit and workspace records but no version. A completed
eligible `BLOCKED` snapshot can commit without being marked public.

**Rollback:** aborting/checkpointing a candidate never changes an existing
version or its latest committed pointer. Audit entries already committed stay
inspectable; no partial snapshot is promoted.

**Verification gate:** restart-and-resume, retry and revision identity checks;
exact journal sequence and GateRun→full-result links; `ReviewHistory` round
preservation; active versus historical stop checks; capability blockers remain
separate; incomplete `CAPABILITY_BLOCKED`/failed/stale candidates cannot appear
as versions; ATI lifecycle mutation leaves the originating gap snapshot
unchanged.

## Completion gate

Run the existing fixture, validation, review, graduation, pipeline, adapter
and replay checks together with PostgreSQL round-trip, v2, concurrency,
rollback and restart checks. Record any failed verification before repair.
Do not begin #8 API, #9 publication/cache, or #10 ATI lifecycle in #7.
