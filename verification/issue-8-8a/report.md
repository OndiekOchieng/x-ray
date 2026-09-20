# Issue #8 — 8a investigation command/read contract

## Delivered

- Migration `0007_investigation_submissions` adds one immutable submission-input row per investigation identity: exact trimmed HTTP(S) URL spelling, optional trimmed requested focus, and ISO `created_at`. The row is outside canonical graph/version storage. The command inserts identity and submission together in one transaction; no Source, Evidence, StageRun, workspace, or version is created.
- `InvestigationService` provides create, identity/submission read, owner-scoped execution status, candidate by explicit run ID, committed version by explicit N, and ordered version-history reads. Start/resume remain 8b work. The service uses existing persistence readers and returns labeled candidate versus committed DTOs. `latestCommittedVersion` is storage state only.
- Typed application errors distinguish invalid input, missing investigation, missing/wrong-owner run, missing workspace, and missing version. `VersionConflict` remains a distinct exported conflict. No HTTP status code enters persistence/domain types.
- URL handling trims surrounding whitespace but does not rewrite scheme, host, path, query, or fragment spelling. Only absolute HTTP(S) URLs with a host are accepted. Focus is trimmed; an explicitly blank focus is rejected.
- Execution DTO exposes persisted StageRun status/revisions/times but omits arbitrary raw error text, which remains in the internal audit. No provider prompt, secret, SQL row, or correlation ledger enters DTOs.

## Verification

The dedicated `pnpm check:investigation-service` gate applies migration 0007 up/down/up; creates two distinct investigations from different URLs; proves independent input/focus/time retention and zero graph/run/version rows; rejects mutation/deletion of submission input; checks typed invalid and missing-resource errors; checks wrong run ownership and explicit candidate run ID; reconstructs historical v1 and v2 snapshot values through the service; and proves ordered version history and exact storage latest pointer. A failed run remains inspectable without exposing its raw error. Candidate and committed reads stay distinct even after v2 exists. Timestamp serialization remains string-valued.

Also passed: `pnpm exec tsc --noEmit`, `pnpm check:persistence-schema`, `pnpm check:persistence-roundtrip`, `pnpm check:persistence-workspace`, `pnpm check:persistence-audit`, `pnpm check:persistence-graduation`, `pnpm check:fixtures`, and `git diff --check`.

## Preserved failures

- `first-attempt.txt`: the first gate hit Node's strip-only TypeScript restriction on constructor parameter properties. Constructors were rewritten with explicit fields; no behavior was relaxed.
- `missing-workspace-column-failure.txt`: a test query incorrectly assumed `candidate_workspaces` had `investigation_id`. Its ownership is through `execution_runs`; the check was corrected to join through that table. No schema/production change was made for this test error.

No pipeline start/resume, stage checkpoint callback, adapters, route handlers, UI registry replacement, publication/library, ATI orchestration, job/queue/worker, or live provider was added. Stop after 8a.
