# Issue #15, Slice 15a — additive v0.3 schema

Base: `issue-14-evidence` at `1312cf0f149168866b4b76c4ad03ba70dfa2ca35`.

## Schema decisions

- Migration `0004_source_position_knowledge_basis` adds version-scoped `source_positions`, `source_position_claims`, `source_position_supporting_evidence`, and `investigation_source_positions`. The last three carry zero-based ordinals and composite investigation/version FKs. Canonical relationships are relational rows, not JSON.
- `power_or_dependency` uses the existing JSON string-array domain; `time_scope` uses the existing JSON object domain. Optional text and time fields use SQL NULL. These are value/list fields under the established 7a convention.
- `evidence.knowledge_basis` is nullable and enum-constrained. Historical absence remains SQL NULL, distinct from the canonical `UNKNOWN` enum. No old row is backfilled.
- `investigation_versions.source_position_membership_present` distinguishes an absent historical `sourcePositionIds` from a present empty list. Ordered membership rows carry nonempty lists.
- The four new tables reuse 7a's immutable update/delete and committed-version insert rejection triggers. Existing `evidence` and `investigation_versions` triggers protect their new columns.

## Verification

| Command | Result |
| --- | --- |
| `pnpm check:source-position-schema` | PASS, 29/29: up/down/up; migration over committed historical v1; full value/list representation; cross-version and cross-investigation Source/Claim/Evidence FKs; membership FK; enum/JSON checks; immutable update/delete and late insert on every new table; old-row column immutability. |
| `pnpm check:persistence-schema` | PASS: base migrations plus 0004 up/down/up, 77 FKs, no publication/derived-count columns, 0 failures. |
| `pnpm check:persistence-roundtrip` | PASS: historical v1 deep equality, provenance separation, FULL validation and A01–A10. |
| `pnpm exec tsc --noEmit` | PASS. |
| `pnpm check:fixtures` | PASS, including 6d replay 21/21. |
| `git diff --check` | PASS. |

No meaningful verification failure occurred before remediation. Checks ran on PGlite; native PostgreSQL concurrency/locking proof remains outstanding under #7. This slice changes no repository mapper, version commit flow, durable workspace behavior, API, publication, or UI code. The v0.3 round-trip and rollback proofs belong to 15b/15c.
