# 7a — Version/ownership schema verification

**Date:** 2026-09-19  
**Contract:** #7 P1–P12; ADR-0003; amended ADR-0006; committed 7a→7d plan.

## Schema decisions applied

- Every canonical artifact row and every ordered canonical ID link is scoped by `(investigation_id, version_number)`. Source dependency and evidence provenance remain separate entities, each with its own array ordinal.
- The identity row holds only the storage-level `latest_committed_version`. The selected `Investigation.currentVersion` is reconstructed from the immutable version key. No public pointer or derived count is stored.
- Canonical date-only and timestamp values use checked text domains so exact string precision and offsets survive reconstruction. Optional scalars use SQL NULL for absence; optional nested value objects use nullable JSONB objects; required ordered string arrays use checked JSONB arrays. Ordered canonical ID lists use ordinal relationship rows with composite foreign keys.
- Snapshot `Investigation.researchStop` and `InvestigationVersion.researchStop` have separate nullable column pairs. Version-snapshot StageRuns are separate from execution-run/candidate-workspace skeleton tables. ATI requests refer to the immutable eligible origin gap and remain outside version snapshots.
- A version insert must advance the latest committed pointer in the same transaction. Pointer updates advance by exactly one. All snapshot rows and ordered links reject update/delete, and reject inserts after their version has committed. This enforces the 7a version ownership boundary without adding 7c commit orchestration.

## Migration and constraint evidence

`pnpm check:persistence-schema` uses PGlite (PostgreSQL in WebAssembly) on an empty disposable database. It applies `0001_version_ownership.up.sql`, rolls it back, reapplies it, then tests v1/v2 and constraints. Result: **PASS**, 66 foreign keys, zero failed assertions. It confirms a canonical source ID can recur with different content in v2; duplicate IDs within one version, cross-version source and ordered-link references, invalid claim namespace/source enum/date format/gap eligibility/ATI origin/JSON string array, bad ordinals, late snapshot inserts, pointer rewind, and orphan version creation are rejected. It also checks that no latest-public pointer or derived-count column was added.

The first constraint run failed because a pointer rewind was accepted. The original output is preserved in [7a-initial-failing-verification.txt](./7a-initial-failing-verification.txt). The pointer and post-commit insert guards were added, then the full check passed. The local Docker daemon was unavailable; PGlite executed the migration SQL. A native PostgreSQL service remains a deployment migration check for 7b or CI.

## Boundary

The 7b deep round-trip exposed a 7a representation error: the frozen sources record date-only `retrievedAt`, while the initial migration required a date-time. Migration 0002 broadens that column to the existing date-or-date-time domain without normalizing the recorded value. The schema can then represent the frozen graph, including optional/absent values, both provenance layers, ordered ID lists, the SATURATION stop and legacy StageRuns. The original 7a check was a representation/constraint check, not the 7b graph→store→graph proof. No v2 commit flow, durable resume, API, publication, or ATI lifecycle was implemented.
