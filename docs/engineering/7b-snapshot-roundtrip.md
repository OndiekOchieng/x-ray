# 7b — XRAY-KE-001 v1 snapshot round-trip

**Date:** 2026-09-19  
**Scope:** one immutable v1 snapshot; no v2 creation, candidate resume, audit persistence, API, publication, or ATI lifecycle.

## Readiness correction

The initial 7a schema could not represent two recorded source precisions in the frozen corpus. `retrievedAt` is date-only (`2026-09-13`) for the historical sources, and some `publishedAt` values are month-only (`2020-10`, `2026-09`). The 7a plan already called out date-only retrieval. Migration `0002_source_retrieval_precision` accepts the observed month/date/date-time publication forms and date/date-time retrieval forms as checked text, preserving the exact values. The domain source annotation and documentation now state the recorded precision. No benchmark value was normalized or edited.

The initial failing TypeScript output and the first two failing SQL round-trip outputs are preserved in `7b-initial-failing-verification.txt`, `7b-first-roundtrip-output.txt`, and `7b-second-roundtrip-output.txt`. The SQL failures identify the exact source rows and domains that rejected them.

## Repository behavior

`writeInitialSnapshot` writes an investigation identity, version metadata and full canonical artifact/relationship rows in one transaction, then advances `latest_committed_version`. It accepts only a coherent initial v1 graph and rejects ATI lifecycle records, which live outside immutable snapshots. `readSnapshot` loads version-scoped rows and ordered links, restores optional fields only when present, reconstructs the selected `currentVersion = 1`, and builds `XRayGraph` from those canonical arrays. It reads neither a stored derived count nor a review fingerprint.

SourceDependency and EvidenceProvenance remain separate rows and reconstruction paths. The investigation's legacy StageRuns come from `version_stage_runs`, not the 6d journal. Investigation and version ResearchStop fields are loaded independently.

## Evidence

- `pnpm check:persistence-schema`: PASS, including 0001 and 0002 migration up/down/up on an empty PGlite database and the existing constraint checks.
- `pnpm check:persistence-roundtrip`: PASS. `assert.deepStrictEqual(restored, canonical)` compares the complete `XRayGraph` (canonical arrays and derived query indexes), beyond IDs/counts/fingerprints. Explicit checks cover currentVersion, ordered collection IDs, historical StageRuns, SATURATION, separate Source/Evidence lookup, both provenance structures and queries, FULL validation, and A01–A10.
- `pnpm check:fixtures`: PASS, including the existing query, validation, review, acceptance, pipeline, adapter, and 6d replay suites (replay 21/21).

PGlite runs PostgreSQL in WebAssembly. A native PostgreSQL service was unavailable locally; native deployment migration verification remains a later environment gate. This is the 7b v1 representation proof, not a 7c version-creation or concurrency proof.
