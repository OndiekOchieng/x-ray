# Issue #7, slice 7d-c — graduation audit and commit linkage

## Contract and implementation

- Migration 0006 adds immutable, indexed `run_graduations` rows. The full tagged `GraduationResult` is stored as a lossless value, beside investigation identity, verdict, graph fingerprint, exact candidate digest and assessment time.
- Each assessment is appended against the current durable workspace. A changed workspace requires a new assessment. An identical retry returns the existing record.
- `commitNextVersion` requires an eligible PASS or graph-clean capability BLOCKED result, a completed or capability-blocked run, its latest persisted assessment, and an unchanged, nonstale workspace. It atomically links the execution run to the committed version and assessment index, writes the immutable snapshot and audit, and advances the predecessor pointer.
- Snapshot reconstruction still reads the immutable version tables. No 7d-d ATI behavior, publication, API, UI, native PostgreSQL lock claim, or new domain concept was added.

## Preserved failed verification

Initial reruns of the 7c and 15c version checks failed because their migration setup stopped before migration 0006. The original output is retained in `versioning-pre-migration-failure.txt` and `source-position-pre-migration-failure.txt`. The checks were updated to create real durable workspace and graduation evidence. No production behavior was changed to accommodate the test setup failure.

## Checks

- Migration 0006 up/down/up on empty PGlite; immutable UPDATE/DELETE and cross-investigation FK rejection: PASS.
- Full result read-back; append after candidate change; latest assessment identity: PASS.
- REVISE, FAIL, missing graduation audit, incomplete run, changed workspace and fingerprint mismatch: rejected before version creation.
- Capability-blocked graph-clean BLOCKED v2 commit: PASS; exact `(committed_version=2, committed_graduation_index=0)` link and assessment read-back; v1 unchanged.
- Deferred FK failure after snapshot rows: no v2 rows, audit, pointer advance or run link. Stale predecessor: `VersionConflict`.
- `pnpm check:persistence-schema`, `check:source-position-schema`, `check:persistence-roundtrip`, `check:persistence-versioning`, `check:source-position-versioning`, `check:persistence-workspace`, `check:persistence-audit`, `check:source-position`, `check:fixtures`, and `pnpm exec tsc --noEmit`: PASS.

PGlite verifies transaction and constraint behavior in this slice. Native PostgreSQL concurrent locking remains an issue #7 closeout check.
