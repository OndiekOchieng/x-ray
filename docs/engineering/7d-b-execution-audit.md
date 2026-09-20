# Issue #7 — 7d-b execution, validation, and review audit

Base: 7d-a `e57647e2f1b54af4a72b2703a742398a04dd2b44`.
The 7a skeleton had `execution_runs` and `candidate_workspaces`, but no independent journal, validation, or review audit tables. Migration 0005 adds only those missing durable shapes.

## Storage contract

- `run_journal_entries` has one immutable row per sequence, with a unique run ID, one of five kinds, and the exact run payload. Stage output revisions, gate inspected revisions, capability disclosures, stop transitions, and invalidation lists retain their distinct shapes.
- `run_validation_results` holds the complete `ValidationResult` for each VALIDATE gate, including its ordered violations and summary.
- `run_review_rounds` holds each complete `ReviewResult` at a stable zero-based history index. Checks, NOT_EVALUATED reasons, findings, revision requests, summary, timestamps, and graph fingerprint stay together in that round's result.
- Gate rows hold composite foreign-key references to validation or review rows. Their payload omits the `result` summary; the reader rebuilds the existing `GateRun.result` reference from the durable result. A skipped gate has neither result nor reference.
- The tagged lossless JSON codec from 7d-a is shared with these value records. Database triggers reject UPDATE/DELETE; the repository permits only a byte/semantic-equal existing prefix followed by new journal entries, validation records, and review rounds. `RunJournal.fromEntries` rechecks sequence, identity, and kinds on reload.

## Gate evidence

`pnpm check:persistence-audit` passes under PGlite. It applies migration 0005 up/down/up and proves:

1. A real FULL validator failure persists complete violations; VALIDATE is BLOCKED, REVIEW is SKIPPED, and no ReviewResult is fabricated.
2. The journal round-trips deep-equal in exact order across STAGE, GATE, CAPABILITY, STOP, and INVALIDATION. A failed stage attempt, stage revision transition, capability disclosure, STOP→RESUME, and routed invalidation survive.
3. A model-assisted blocking review round is followed by a revised clear round with a distinct graph fingerprint. Both complete rounds survive append/reload and the first is unchanged.
4. A review without ReviewerModel keeps NOT_EVALUATED reports/reasons and `fullCapability=false` after reload.
5. Gate result payloads do not duplicate full verdicts; result rows are independently queryable. UPDATE/DELETE of audit rows and rewriting an earlier journal prefix are rejected.

Regressions pass: TypeScript, `check:persistence-workspace`, `check:persistence-schema`, `check:persistence-roundtrip`, `check:persistence-versioning`, `check:source-position-versioning`, `check:source-position-review`, and `check:fixtures` (including XRAY-KE-001 replay). The first type-check failure in the new SQL assertion is preserved at `verification/issue-7-7d-b/typecheck-first-failure.txt`; casts were corrected before the passing rerun.

## Boundary

The candidate workspace remains mutable and separate from this append-only audit. No GraduationResult table, commit eligibility/linkage change, ATI lifecycle, API/publication/UI behavior, or native PostgreSQL locking claim was added. Those belong to 7d-c/d and the final #7 gate.
