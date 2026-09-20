# Investigation Versioning

**Source:** `X-Ray System Architecture v0.1` §22, XR-INV-010
**Architecture version:** 0.1
**Status:** Proposed

> **Verdicts expire. Receipts compound.**

This document is the implementation meaning of that sentence.

See [ADR-0006](../adr/0006-immutable-investigation-versions.md).

---

## Immutable snapshots

Completed investigations are immutable snapshots.

```text
XRAY-KE-001
│
├── v1
│    ├── evidence
│    ├── findings
│    └── gaps
│
├── new source received
│
▼
v2
     ├── inherited receipts
     ├── new receipt
     ├── affected claims re-evaluated
     ├── updated findings
     └── resolved/open gaps
```

The graph therefore accumulates evidence instead of overwriting history.

This is the implementation meaning of:

> **Verdicts expire. Receipts compound.**

---

## New receipts and affected-claim re-evaluation

A new source does not edit the existing investigation. It produces the next
version, which:

- **inherits** the receipts already gathered;
- **adds** the new receipt;
- **re-evaluates only the claims the new evidence bears on**;
- **updates** the findings for those claims;
- **resolves or leaves open** the gaps affected.

Claims untouched by the new evidence carry their prior findings forward
unchanged. Re-evaluation is scoped by the graph, not by rerunning everything.
The `CORRECTION` and `RE_EVALUATION` triggers may have a reason other than a
new receipt; per-claim reason audit records make that difference explicit.

Because a finding records `supportingEvidenceIds`, `challengingEvidenceIds`,
`gapIds` and `wouldChangeFinding`
([Finding](./domain-model.md#finding)), the set of claims a new receipt can
affect is computable rather than guessed.

---

## Historical preservation

## XR-INV-010 — Historical Preservation

New evidence MUST NOT destroy previous investigation state.

An X-Ray is versioned.

```text
Investigation v1
     │
new receipt
     ▼
Investigation v2
```

The system retains what was known, missing, and concluded at each version.

What was known, what was missing, and what was concluded **at each version**
remains retrievable. A superseded finding is not deleted; it is superseded.

This is what makes the gap → request → new receipt → better X-Ray loop
compounding rather than destructive
([system-overview.md](./system-overview.md#5-architectural-north-star)).

Historical versions remain addressable in the public interface —
[publication-and-cache.md](./publication-and-cache.md).

---

## Persistence contract

**Recorded 2026-09-19 · #7 P1–P12.**

### Identity and ownership

A committed version is an immutable **completed research snapshot**. It is not
publication. The investigation identity row owns the storage-level
`latestCommittedVersion`; #9 owns any public/latest-published pointer. Loading
vN reconstructs `Investigation.currentVersion = N`, even when storage has a
later committed version. All investigation fields required to reconstruct vN
are frozen with vN rather than read from mutable identity state. A candidate
workspace is mutable execution state and is never a version.

`PASS` may commit. `BLOCKED` may commit only when the graph has no revision or
failure reason and the run has produced a complete candidate whose blocker is
incomplete assurance/capability. `REVISE`, `FAIL`, and incomplete/in-progress
runs do not commit. A #6 capability-limited execution that has not completed
research is not made complete merely because graduation calls its absence a
blocker. XRAY-KE-001's completed v1 research snapshot remains `BLOCKED` by
six ReviewerModel capability checks; this does not publish it.

### Versioned graph shape

V1 storage uses full immutable, normalized rows scoped to
`(investigation_id, version_number)` for the investigation snapshot and each
canonical collection:

| Canonical collection | Relational representation required |
| --- | --- |
| Claims and Sources | Version-scoped entity rows; source and claim identities remain distinct. |
| Evidence | Separate version-scoped proposition rows; source and claim relationships remain explicit. |
| SourceDependency and EvidenceProvenance | Independent version-scoped edge/entity rows; proposition origin cannot be inferred solely from document lineage. |
| Discrepancy and Disconfirmation | Version-scoped rows plus ordered claim/evidence relationships. |
| Finding and Gap | Version-scoped rows plus ordered support/challenge/context, discrepancy, gap and claim relationships. |
| InvestigationVersion | Version metadata and ordered added-source, added-evidence, re-evaluated-claim, finding and gap membership. |

All other ordered canonical ID lists and nested string lists retain order through
ordinal columns or ordered relationship rows. `Measurement`, `TimeScope` and
other embedded value objects may use columns or lossless JSONB; their shape,
optional fields and discriminated unions must reconstruct exactly. Canonical
IDs remain domain values stable within an investigation. A later version may
reuse one with changed content; database uniqueness for versioned rows is at
least `(investigation_id, version_number, canonical_id)`. Private surrogate
keys never enter the reconstructed graph. V1 does not reuse mutable artifact
rows across versions as a storage optimization.

`Investigation.stageRuns` remains embedded in the reconstructed domain
aggregate but is normalized as an ordered **version-snapshot StageRun** set in
storage. It is not the execution audit journal. In particular, the historical
XRAY-KE-001 `VALIDATE`/`SYNTHESIZE`/`RESOLVE` PENDING StageRuns remain exactly
as recorded, while its 6d replay's StageRuns and GateRuns remain separate
execution evidence. No gate is fabricated as an artifact-producing StageRun.

### Candidate commit and concurrency

Research execution and review run outside the short commit transaction against
the intended candidate version number; this gives assessment and committed
graph the same selected-version identity. The pipeline's artifact revision
remains in-run bookkeeping and never advances `latestCommittedVersion`.

In one transaction, lock/verify the expected predecessor; verify the candidate
and its assessment are committable; insert every version-scoped artifact,
ordered relationship and immutable version record; link its producing
execution/audit; then advance `latestCommittedVersion`. A competing commit
causes a version conflict and rollback, followed by re-evaluation against the
new predecessor. Never silently rebase or overwrite. The transaction changes
no #9 publication state.

Each durable execution has a storage `execution_run_id` and links to zero or
one committed version. Persist all five ordered #6 journal entry kinds and
full validation, ReviewHistory, and graduation results separately from their
GateRun summary references. A mutable candidate workspace persists the
accumulator, stage-owned output sets, artifact revision, correlation ledger,
journal/staleness, capability gaps and current execution status so retry,
revision and resume survive restart. Failed/incomplete runs remain audit and
workspace records without a version. Historical graph reconstruction reads
only the immutable snapshot.

The active `ResearchStop` is nullable and replaceable in a workspace; all
STOP/RESUME transitions remain journal history. Commit freezes its then-current
value in vN. Capability gaps are separate audit/blocker records. A
`supersedesVersion` edge says which snapshot preceded vN. For each
`reEvaluatedClaimId`, a version-scoped audit record adds a structured reason
(`NEW_EVIDENCE`, `CORRECTION`, `REVIEW_REVISION`,
`EXTERNAL_RECORD_RESPONSE`, or `OTHER`), optional detail and causal references
when available. This explains change without substituting audit prose for a
Finding or Evidence item.

ATI requests are persisted outside immutable snapshots, referencing the
originating `(investigation, version, gap)` snapshot. #7 stores the existing
request payload and current lifecycle state; #10 owns transitions and response
ingestion. An ATI status change cannot rewrite vN.

### Integrity and round-trip

PostgreSQL owns local and relational constraints: keys, composite versioned
foreign keys, positive 1-based versions, enums/checks, claim origin/namespace,
ATI eligibility, ordered-link uniqueness and committed-row immutability where
practical. Application validation/review owns measurement compatibility,
provenance independence, finding completeness/reversibility, calibration,
graduation behavior and semantic diffs across versions.

For **every** committed vN, graph → store → graph preserves canonical IDs,
entity fields, list order, optional-versus-present and null/absence semantics,
date-only values without timezone conversion, documented timestamp precision,
union/value-object shapes, both provenance layers, stop, version metadata,
selected `currentVersion`, and embedded StageRuns. Canonical deep equivalence
and targeted serialization checks prove this; review fingerprints and derived
counts do not.

---

## Related

- [Domain model](./domain-model.md#investigation) — `currentVersion`
- [Publication and cache](./publication-and-cache.md) — serving versions publicly
- [ADR-0006 — Immutable investigation versions](../adr/0006-immutable-investigation-versions.md)
