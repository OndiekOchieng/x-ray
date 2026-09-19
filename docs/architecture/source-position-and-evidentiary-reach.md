# Source Position and Evidentiary Reach

**Architecture status:** Accepted delta to Architecture v0.1  
**Protocol driver:** X-Ray Research Protocol v0.3  
**Decision:** [ADR-0012](../adr/0012-source-position-and-evidentiary-reach.md)  
**Investigation:** [source-position-architecture-investigation.md](../engineering/source-position-architecture-investigation.md)

---

## Why this exists

Source lineage and proposition provenance are not enough to explain what a record can establish.

X-Ray also needs to represent:

1. **where the producer stood relative to the subject or event;**
2. **how the source could know the proposition it contributes.**

These are separate from truth, trust, bias, document lineage, and proposition origin.

---

## Four orthogonal questions

| Layer | Question | Canonical representation |
| --- | --- | --- |
| Source dependency | Where did the document come from? | `SourceDependency` |
| Proposition provenance | Where did this proposition-bearing information originate? | `EvidenceProvenance` |
| Source position | Where was the producer standing relative to this claim/subject? | `SourcePosition` |
| Knowledge basis | How could the source know this proposition? | `Evidence.knowledgeBasis` |

None substitutes for another.

---

## SourcePosition

`SourcePosition` is a contextual relation, not a Source quality score.

It is scoped to:

- one Source;
- one or more Claims;
- an optional time period.

It records:

- the producer/subject relationship;
- relevant power or dependency context;
- production purpose where established;
- whether the position is documented or inferred;
- confidence in the contextual relation;
- supporting evidence or an explicit basis description.

Relationships can change over time. Separate records preserve T1 and T2 rather than rewriting one into the other.

No `biasScore`, `trustScore`, or `reliabilityScore` exists.

---

## KnowledgeBasis

Knowledge basis belongs on Evidence because one document can contain propositions learned in different ways.

The approved vocabulary is:

```text
DIRECT_OBSERVATION
SELF_REPORT
PARTICIPANT_ACCOUNT
MEASUREMENT
ADMINISTRATIVE_RECORD
INSTITUTIONAL_CHARACTERIZATION
ATTRIBUTED_SOURCE
EXPERT_INTERPRETATION
SECONDARY_SYNTHESIS
INFERENCE
UNKNOWN
```

Historical Evidence may omit the field. New v0.3 investigations must populate it for material Evidence before FULL graduation.

---

## Direct-establishment boundary

The Evidence proposition itself remains the boundary.

Example:

```text
Claim:
"Kenyatta operationally led Mau Mau."

Evidence from colonial classification record:
"Colonial authorities classified Kenyatta as a Mau Mau leader."

KnowledgeBasis:
INSTITUTIONAL_CHARACTERIZATION
```

The graph does not add a duplicate `directlyEstablishes` field.

A Reviewer decides whether the narrower institutional characterization has been improperly promoted into the broader underlying claim.

---

## Stage ownership

No new research stage exists.

```text
INGEST
  explicit producer/source metadata

PLAN
  identify relevant source-position / power questions

TRACE
  initial SourcePosition + Evidence.knowledgeBasis

PROVENANCE
  refine SourcePosition + establish EvidenceProvenance / SourceDependency
```

TRACE and PROVENANCE may both write SourcePosition, just as DECOMPOSE and CLASSIFY may both write Claims.

Model adapters may propose source-position semantics; stages own validation and canonical identity.

---

## Validation boundary

Deterministic validation handles:

- referential integrity;
- structural requirements;
- SourcePosition basis visibility;
- v0.3 KnowledgeBasis presence at FULL graduation.

Reviewer/calibration handles:

- source-position collapse;
- institutional characterization promoted to underlying fact;
- power-sensitive archive absence;
- T1/T2 relationship collapse;
- proposition-dimension drift;
- causal inheritance;
- common-outcome coordination inference;
- unfalsifiable system narratives.

---

## Historical preservation

SourcePosition is additive.

Historical committed versions are never backfilled.

`Evidence.knowledgeBasis` may remain absent on historical snapshots.

If an old investigation is revisited under v0.3, the enrichment appears in a **new InvestigationVersion**.

---

## Deferred

The following are deliberately not introduced in this delta:

- first-class Actor/Producer ontology;
- universal ClaimDimensions ontology;
- source trust/bias scoring;
- SOURCE_POSITION executable stage.

They require separate evidence and decisions.
