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

## Related

- [Domain model](./domain-model.md#investigation) — `currentVersion`
- [Publication and cache](./publication-and-cache.md) — serving versions publicly
- [ADR-0006 — Immutable investigation versions](../adr/0006-immutable-investigation-versions.md)
