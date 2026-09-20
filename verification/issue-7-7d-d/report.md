# Issue #7 — 7d-d integrated closeout

Branch: `issue-7-7d-d`. This slice adds verification only: no migration, production runtime, API, publication, UI, or ATI orchestration change.

## ATI origin boundary

The existing `ati_requests` composite FK `(investigation_id, origin_version, gap_id, origin_ati_eligible)` already enforces an existing ATI-eligible immutable gap snapshot. The new gate accepts an eligible v1 origin; rejects wrong investigation, version, gap, and ineligible gap; changes only lifecycle fields; then deep-compares the v1 graph. A later `received_source_ids` value creates neither Evidence nor a new InvestigationVersion. This is a storage-boundary proof, not #10 request submission, response ingestion, evidence creation, or lifecycle orchestration.

## Durable execution path

A v0.3 candidate with changed SourcePosition context and KnowledgeBasis is seeded into the real pipeline. PLAN succeeds and records a semantic correlation; TRACE fails. The failed run, revision, ledger, journal and candidate are checkpointed. After discarding in-memory run objects, the check reloads them, resumes TRACE without rerunning PLAN, records FULL validation and real review gates, appends independently readable validation/ReviewHistory audit, persists a graph-clean BLOCKED graduation assessment, and commits v2 through `commitNextVersion`. The final v2 snapshot deep-equals the final candidate; v1 remains unchanged. Run/version/graduation index linkage is exact. Removing the mutable workspace after commit leaves immutable v2 reconstruction unchanged. A separate STAGE_FAILED run retains its workspace/journal audit and has no commit link or version of its own.

## Preserved failures

- `ati-typescript-first-failure.txt`: first ATI gate passed at runtime; TypeScript rejected four untyped row-field reads. Fixed with a test-local row type, no production change.
- `integration-first-attempt.txt`: explicit `undefined` fields in the synthetic calibration seed were omitted by pipeline accumulation, causing the test's initial deep-equivalence assertion to fail. The test input now uses the canonical JSON-shaped v0.3 fixture representation used by existing versioning checks. No runtime or mapper behavior changed.

## Integrated gate

PASS: `pnpm exec tsc --noEmit`, `pnpm check:fixtures`, `check:source-position`, `check:source-position-pipeline`, `check:source-position-review`, `check:persistence-schema`, `check:source-position-schema`, `check:persistence-roundtrip`, `check:persistence-versioning`, `check:source-position-versioning`, `check:persistence-workspace`, `check:persistence-audit`, `check:persistence-graduation`, `check:persistence-ati`, and `check:persistence-durable-integration`. `git diff --check` also passed.

## Final 7d contract audit

1. Candidate workspace is mutable working state, never canonical history: verified by checkpoint/reload and postcommit workspace removal.
2. Immutable versions reconstruct from snapshot tables alone: v1/v2 deep equality before and after workspace removal.
3. STAGE, GATE, CAPABILITY, STOP, INVALIDATION are durable and append-only: 7d-b gate remains green.
4. Full validation and ReviewHistory live separately from GateRun summaries: 7d-b and integrated gates green.
5. Earlier review rounds remain intact: 7d-b two-round check green.
6. Capability gaps remain distinct from stage failure and ResearchStop: 7d-a/b checks green.
7. Current ResearchStop is distinct from append-only STOP/RESUME history: 7d-a/b checks green.
8. Graduation records are immutable and bound to exact candidate state: 7d-c and integrated gates green.
9. Incomplete, failed, REVISE, FAIL and stale candidates cannot become versions: 7d-c checks and noncommitting integrated run green.
10. Graph-clean capability BLOCKED remains eligible under P1: 7d-c check green.
11. SourcePosition and KnowledgeBasis survive restart through commit: integrated v2 deep equality green.
12. ATI lifecycle state cannot mutate origin graph: ATI boundary graph deep equality green.
13. No #8 API, #9 publication, or #10 ATI orchestration entered 7d: diff is verification only.
14. Native PostgreSQL two-connection predecessor locking/conflict proof remains the final separate #7 gate; PGlite cannot establish production row-lock behavior.
