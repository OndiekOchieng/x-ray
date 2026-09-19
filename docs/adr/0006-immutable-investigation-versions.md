# ADR-0006 — Immutable Investigation Versions

**ADR:** 0006 (v0.1: ADR-006)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-006; see also §22, XR-INV-010)
**Supersedes:** —

## Context

A civic claim's evidence changes over time. Records are published late,
requests are answered, projects complete.

If new evidence rewrites the investigation in place, the system silently
destroys what was known and missing at the time of the original research — and
with it any ability to show that a conclusion was reasonable when it was made.

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** New receipts create new investigation versions rather than rewriting historical state.

New receipts create new investigation versions rather than rewriting
historical state. Completed investigations are immutable snapshots.

## Consequences

- The graph accumulates evidence instead of overwriting history. This is the
  implementation meaning of *"Verdicts expire. Receipts compound."*
- What was known, missing and concluded at each version remains retrievable
  ([XR-INV-010](../architecture/validation-and-invariants.md#xr-inv-010--historical-preservation)).
- When a new receipt triggers re-evaluation, only claims it bears on are
  re-evaluated; other findings carry forward unchanged. Corrections and other
  recorded triggers may also require scoped re-evaluation
  ([investigation-versioning.md](../architecture/investigation-versioning.md)).
- A committed research version is not automatically public. Publication and
  public latest-version resolution belong to #9
  ([publication-and-cache.md](../architecture/publication-and-cache.md)).
- Cost: storage grows monotonically, and every artifact needs version
  affiliation.

## Amendment — 2026-09-19 · persistence and version ownership

**Status:** Accepted. **Source:** #7, “Human decisions — persistence/versioning
contract” (P1–P12 and the StageRun mapping). This specifies storage and does
not change the canonical artifact types or #6 execution vocabulary.

### Committed snapshot, candidate, and publication

An `InvestigationVersion` is an immutable **completed research snapshot**, not
a publication marker. A `PASS` candidate may commit. A `BLOCKED` candidate may
commit only when its graph has no `FAIL` or `REVISE` reason and the blockage is
incomplete assurance/capability. `REVISE`, `FAIL`, and incomplete/in-progress
execution never create a version. Eligibility requires more than reading the
verdict word alone: the execution and its active stop/stale/capability state
must establish that a complete candidate exists. XRAY-KE-001 v1 can therefore
remain committed and `BLOCKED` without being represented as published.

An investigation identity has a storage-level `latestCommittedVersion`. It is
distinct from a public pointer, which #9 owns. In a reconstructed graph for
vN, `Investigation.currentVersion` is **N**, the selected snapshot version;
it does not mean the latest version across storage. This keeps historical vN
coherent with its attached `InvestigationVersion` after vN+1 commits.

### Immutable relational representation

PostgreSQL stores complete normalized rows for each version's investigation
fields and every canonical graph artifact. Artifact uniqueness is scoped by
`(investigation_id, version_number, canonical_id)`. The same canonical id may
appear in a later version with different immutable content. Private database
keys may aid joins but never replace or surface as canonical ids. Ordered
relationships preserve canonical list order. Embedded value objects must
reconstruct exactly, including optional/absent fields and date-only values.
V1 does not deduplicate mutable artifact rows across versions to save space.
No derived count is stored as canonical truth.

`Investigation.stageRuns` stays embedded in the **reconstructed domain
snapshot**, while storage normalizes its ordered rows. These version-snapshot
StageRuns are distinct from a producing run's append-only execution journal.
The historical XRAY-KE-001 StageRuns remain unchanged; a 6d replay journal
cannot replace them or turn legacy `VALIDATE` into a research StageRun.

### Commit and audit boundary

Execution, validation, review, and graduation occur before a short commit
transaction. The candidate is assessed against its intended snapshot version
so the committed graph and assessment refer to the same graph state. Inside
one transaction the store locks/verifies the expected latest committed
predecessor, rechecks committability, writes the complete immutable snapshot
and ordered relationships, links the producing audit, and advances
`latestCommittedVersion`. A predecessor conflict aborts; the candidate must
be re-evaluated against the new predecessor. The transaction does not advance
publication state.

Each durable execution has a storage-level `execution_run_id` and may link to
zero or one committed version. The five #6 journal entry kinds retain their
sequence. Full validation results, ReviewHistory rounds/findings/revision
requests, and graduation results/reasons/blockers/behaviors are stored as
separate linked audit records; a GateRun's summary reference does not stand in
for its full result. Mutable candidate workspaces retain accumulator state,
stage-output ownership, artifact revision, semantic correlation ledger,
journal/staleness, active capability gaps, and execution status for resume.
Canonical reconstruction reads the immutable snapshot, never a workspace.

The workspace's current `ResearchStop` is replaceable; STOP/RESUME journal
transitions are append-only. Commit freezes only the candidate's current stop
in the version. Capability gaps stay separate. Per-version claim re-evaluation
audit records carry a structured reason, optional detail and causal references;
they explain a change without replacing canonical evidence or findings.

ATI requests are separate lifecycle records keyed to the originating immutable
gap snapshot `(investigation, version, gap)`. #7 stores their existing domain
payload and current state; #10 owns transitions, submission and response
ingestion. ATI lifecycle mutation never edits an earlier graph version.

PostgreSQL enforces row-local and relational facts: keys, version-scoped foreign
keys, version numbering, enum/check constraints, claim namespace consistency,
ATI eligibility, ordered-link uniqueness and committed-row immutability where
practical. Application validation/review retains cross-artifact epistemic
judgment and semantic historical diffs. Round-trip proof uses canonical deep
equivalence plus targeted ordering, optionality, date/precision and union
checks; review fingerprints or derived counts alone are insufficient.
