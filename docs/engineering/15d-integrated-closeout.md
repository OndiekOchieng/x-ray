# Issue #15 — 15d integrated persistence closeout

Base: `issue-15-15c` at `cd6969df94ead972d2e66bbfe6b0b42d4a519546`.
This slice records verification only; it adds no schema, mapper, commit, workspace runtime, API, publication, or UI behavior.

## Integrated gate

All commands passed on the 15d branch:

| Command | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` | PASS |
| `pnpm check:fixtures` | PASS; historical integrity, validation, review, acceptance, pipeline, adapters, and XRAY-KE-001 replay |
| `pnpm check:source-position` | PASS; domain and historical optionality |
| `pnpm check:source-position-pipeline` | PASS; v0.3 FULL/STAGED, referential, retry identity |
| `pnpm check:source-position-review` | PASS; characterization and T1/T2 calibration |
| `pnpm check:persistence-schema` | PASS; migrations up/down/up, 77 FKs, no publication/derived-count columns, zero failures |
| `pnpm check:source-position-schema` | PASS; 29/29 including cross-version FKs and immutability |
| `pnpm check:persistence-roundtrip` | PASS; historical v1 and v0.3 deep equality, FULL read-back, present-empty membership |
| `pnpm check:persistence-versioning` | PASS; 7c v1/v2, audit, rollback, stale predecessor |
| `pnpm check:source-position-versioning` | PASS; 15c claim impact, workspace shape, rollback, v2, stale predecessor |

No new verification failure occurred in 15d. Earlier meaningful failures and remediation output remain under `verification/issue-15-15b/` and `verification/issue-15-15c/`.

## Contract audit

1. Historical XRAY-KE-001 v1 reconstructs deep-equal. Evidence without `knowledgeBasis` stays absent, not `UNKNOWN`; `sourcePositionIds` stays absent and the query collection is empty. Migration 0004 does not backfill it.
2. The v0.3 snapshot reconstructs deep-equal with deliberately reversed SourcePosition membership order, distinct T1/T2 contexts, ordered links, and concrete KnowledgeBasis. Present-empty `sourcePositionIds: []` is separately proved.
3. SourceDependency, EvidenceProvenance, SourcePosition, and KnowledgeBasis remain independently represented and queried. The new position layer does not manufacture added Source/Evidence IDs or provenance.
4. Composite foreign keys reject cross-version and cross-investigation SourcePosition references. Immutable-version triggers cover the new tables and columns.
5. A v2 containing new/changed SourcePositions and changed KnowledgeBasis round-trips deep-equal while v1 remains immutable. SourcePosition and KnowledgeBasis changes each identify their affected existing claims for re-evaluation.
6. An injected failure after snapshot writes rolls back SourcePosition rows, their links and membership, KnowledgeBasis-bearing Evidence, version/audit rows, and the latest pointer. A stale predecessor raises `VersionConflict` without overwrite.
7. The existing `candidate_workspaces.state` JSON object losslessly carries the complete candidate graph shape. No 7d repository, checkpoint/resume, journal, ReviewHistory, or graduation persistence behavior was added.
8. There is no API, publication, or UI work in the #15 diff.

## Remaining #7 requirement

These checks use PGlite. They do not prove native PostgreSQL two-connection row-lock/concurrent-commit behavior. That gate remains open under #7 before #7 can close. Original #7d durable workspace/audit work has not started here.
