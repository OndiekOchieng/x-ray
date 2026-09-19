# Source Position and Evidentiary Reach — Architecture Investigation

**Issue:** #13  
**Protocol input:** X-Ray Research Protocol v0.3  
**Architecture baseline:** v0.1 + accepted amendments through ADR-0011  
**Status:** Decision complete; implementation deferred to follow-up issues

---

## 1. Question

Protocol v0.3 requires X-Ray to ask, before treating a record as evidence:

> Who produced it, from what position, under what relevant power relationship, for what purpose, how could they know, and what can that record directly establish?

The current graph distinguishes Source, Evidence, SourceDependency, and EvidenceProvenance, but it cannot represent the producer's contextual position or the proposition-specific way a source could know.

The architecture must add those semantics without:

- turning source type into truth;
- creating a scalar trust/bias score;
- collapsing source position into provenance;
- letting model adapters mint canonical facts unchecked;
- breaking historical XRAY-KE-001 snapshots;
- or inventing a heavyweight actor/claim ontology before the evidence earns it.

---

## 2. Current architecture truth

### Source

`Source` is document/artifact metadata. It says what record X-Ray retrieved or attempted to retrieve.

It is deliberately not Evidence.

### Evidence

`Evidence` is one proposition extracted from a Source and connected to one or more Claims.

This proposition-level shape is already the right place to preserve evidentiary reach.

### SourceDependency

Document lineage:

> Which document depends on which other document?

### EvidenceProvenance

Proposition lineage:

> Where did this Evidence proposition originate?

These two layers remain correct and are not replaced.

---

## 3. Decisions

### D1 — Source Position is canonical graph state

Source position materially changes how evidence can be interpreted, reviewed, projected, and revisited in later versions.

It therefore cannot live only in prompt prose or Reviewer output.

Introduce a canonical relation artifact:

```ts
type SourcePositionBasis =
  | "DOCUMENTED"
  | "INFERRED"

type SourcePositionRelationship =
  | "SUBJECT"
  | "PARTICIPANT"
  | "WITNESS"
  | "GOVERNING_AUTHORITY"
  | "REGULATOR"
  | "AUDITOR"
  | "INVESTIGATOR"
  | "DETENTION_OR_ENFORCEMENT_AUTHORITY"
  | "EMPLOYER_OR_PRINCIPAL"
  | "EMPLOYEE_OR_AGENT"
  | "CONTRACTUAL_COUNTERPARTY"
  | "BENEFICIARY"
  | "ADVERSARY"
  | "INTERMEDIARY"
  | "OTHER"

interface SourcePosition {
  id: SourcePositionId

  sourceId: SourceId

  /**
   * The claims for which this producer/subject relationship is relevant.
   * Source position is contextual, not an intrinsic trust property.
   */
  claimIds: ClaimId[]

  relationship: SourcePositionRelationship
  relationshipDescription?: string

  /**
   * Observable or explicitly qualified power/dependency context.
   * Human-readable because the cross-domain vocabulary is not yet stable
   * enough for a closed ontology.
   */
  powerOrDependency: string[]

  /**
   * Why the record was produced, where established.
   * Unknown is represented by absence; motive is never invented.
   */
  productionPurpose?: string

  /** Relationship validity period, not Source.publishedAt. */
  timeScope?: TimeScope

  /**
   * DOCUMENTED means the relationship/purpose is supported directly by
   * retrieved material or explicit metadata.
   * INFERRED means X-Ray reconstructed it from evidence.
   */
  basis: SourcePositionBasis

  confidence: Confidence

  /** Evidence supporting the contextual position, when available. */
  supportingEvidenceIds: EvidenceId[]

  /**
   * Allows explicit metadata or research reasoning to be named when the
   * position does not reduce to an Evidence record.
   */
  basisDescription?: string
}
```

At least one of `supportingEvidenceIds` or `basisDescription` must explain the basis.

No `bias`, `trustScore`, `reliabilityScore`, ideology label, or moral ranking is introduced.

### D2 — Source Position is claim-scoped and time-scoped

It does not belong as flat fields on `Source`.

The same producer can be:

- detaining authority relative to one person;
- regulator relative to one company;
- contractual counterparty relative to another institution;
- adversary at T1 and interlocutor at T2.

`claimIds` and `timeScope` make that context explicit.

When the relationship changes materially over time, create separate SourcePosition records rather than overwriting one.

### D3 — No first-class Actor/Producer entity in this delta

The current Source already carries author, institution, and publisher metadata.

A new Actor ontology would introduce identity-resolution, aliases, organizations-vs-people, and cross-source entity reconciliation that #13 does not need to solve Source Position.

For v0.3 architecture:

- Source remains the record identity.
- SourcePosition describes the producer's contextual relation.
- `relationshipDescription` / source metadata carry producer detail.

A first-class Actor entity is deferred until a concrete product or graph requirement cannot be represented without it.

### D4 — Knowledge Basis belongs on Evidence

How a source could know varies proposition by proposition inside one document.

Therefore it does not belong on Source or SourcePosition.

Add:

```ts
type KnowledgeBasis =
  | "DIRECT_OBSERVATION"
  | "SELF_REPORT"
  | "PARTICIPANT_ACCOUNT"
  | "MEASUREMENT"
  | "ADMINISTRATIVE_RECORD"
  | "INSTITUTIONAL_CHARACTERIZATION"
  | "ATTRIBUTED_SOURCE"
  | "EXPERT_INTERPRETATION"
  | "SECONDARY_SYNTHESIS"
  | "INFERENCE"
  | "UNKNOWN"

interface Evidence {
  // existing fields...
  knowledgeBasis?: KnowledgeBasis
}
```

The field is optional in the TypeScript shape for historical compatibility.

For investigations executed under Protocol v0.3 or later, pipeline/validation must require it on material Evidence before graduation.

Historical immutable snapshots remain byte/structurally reconstructible with the field absent.

### D5 — Evidence.proposition is the direct-establishment boundary

Do not add duplicated fields such as:

- `directlyEstablishes`;
- `doesNotEstablish`;
- `truthBoundary`.

The existing Evidence proposition is the canonical proposition the source actually contributes.

Under v0.3, attribution must remain inside that proposition when attribution is the source's actual evidentiary reach.

Example:

```text
Wrong normalization:
"Kenyatta was a Mau Mau leader."

From a colonial classification record:
"Colonial authorities classified Kenyatta as a Mau Mau leader."
```

The first may be a Claim under investigation.

The second is the Evidence proposition.

`knowledgeBasis: INSTITUTIONAL_CHARACTERIZATION` and SourcePosition then explain how that Evidence was produced.

A Reviewer may flag a graph that silently promotes the second into the first.

### D6 — Source position may contain documented or explicit inference, never hidden inference

`basis: DOCUMENTED | INFERRED` keeps the graph honest about whether a contextual relationship was directly supported or reconstructed.

This does not create two truth classes.

It exposes how X-Ray knows the contextual fact.

Unknown purpose, relationship, or power remains unknown.

### D7 — Source Position is orthogonal to provenance

The four concepts remain non-overlapping:

| Concept | Question |
| --- | --- |
| SourcePosition | Where was the producer standing relative to this claim/subject? |
| KnowledgeBasis | How could this source know this Evidence proposition? |
| EvidenceProvenance | Where did this proposition-bearing information originate? |
| SourceDependency | Which documents depend on which other documents? |

Example:

```text
Lambton interview memorandum

SourcePosition:
British political actor assessing detained colonial nationalist

KnowledgeBasis:
PARTICIPANT_ACCOUNT / DIRECT_OBSERVATION
(the memorandum records the interviewer's direct participation)

EvidenceProvenance:
Kenyatta's quoted/attributed answers, where proposition-specific

SourceDependency:
later histories may quote or derive from the memorandum
```

No one layer substitutes for another.

### D8 — No new research stage

Protocol v0.3 correctly keeps the existing stage machine.

Source Position is an obligation across existing stages:

- INGEST: capture explicit producer/source metadata;
- PLAN: identify position/power questions that matter to the claim;
- TRACE: create initial SourcePosition records and Evidence.knowledgeBasis;
- PROVENANCE: refine SourcePosition where tracing changes the contextual picture and establish proposition/document lineage.

TRACE and PROVENANCE may both own SourcePosition, exactly as DECOMPOSE and CLASSIFY both own Claims.

No new `SOURCE_POSITION` ResearchStage is introduced because it has no independent stop/retry/ownership boundary worth the added orchestration cost.

### D9 — TRACE model proposals may suggest position; the stage owns canonicalization

Extend proposal semantics with a `SourcePositionProposal` and `EvidenceProposal.knowledgeBasis`.

A model may propose:

- relationship;
- documented/inferred basis;
- contextual power/dependency text;
- production purpose;
- relevant claim refs;
- time scope.

It may not:

- assign canonical ids;
- create bias/trust scores;
- declare source independence;
- promote position into underlying truth.

The TRACE stage validates references/shape, assigns identity, and mints canonical SourcePosition records.

PROVENANCE may revise those records after lineage work.

This does not reverse ADR-0010: provenance origins and independence remain stage-owned.

### D10 — Validator gets only deterministic source-position rules

Add deterministic structural/referential rules:

1. every SourcePosition references an existing Source;
2. every SourcePosition claim id exists;
3. every supportingEvidenceId exists;
4. every supporting Evidence belongs to the same investigation;
5. a SourcePosition has at least one claim id;
6. at least one of supportingEvidenceIds or basisDescription is present;
7. INFERRED position is never silently serialized as DOCUMENTED;
8. v0.3+ material Evidence must have a KnowledgeBasis before FULL validation/graduation.

Do **not** make the deterministic validator decide:

- whether "adversary" is the best historical interpretation;
- whether a colonial file's characterization is accurate;
- whether an institution had enough power to bias the record;
- whether common outcomes imply coordination;
- whether a systems explanation is persuasive.

Those remain Reviewer/calibration judgment.

### D11 — Reviewer gets the semantic v0.3 delta

Add calibrated checks for:

- source-position collapse;
- primary-source overreach;
- institutional characterization promoted to underlying fact;
- record-producing-power blindness;
- relationship-at-T1 projected across T2;
- proposition-dimension drift;
- causal-link inheritance;
- contribution promoted to primary cause / necessity / sufficiency;
- common outcome promoted to coordination;
- authentic record attached to wrong scope/category/denominator;
- aggregate/component inheritance;
- system explanation with no observable falsifier.

These findings remain non-canonical review audit, consistent with #4.

### D12 — Do not add a generalized ClaimDimensions ontology yet

Protocol v0.3 makes proposition dimensions explicit methodologically.

The current graph already carries some dimensions structurally:

- `Measurement`;
- `TimeScope`;
- Claim entities;
- atomic claim text.

A universal actor/category/modality/causal-role schema would be a second major ontology decision and the manual corpus is not yet sufficient to choose stable controlled vocabularies.

For this delta:

- proposition-dimension preservation is a Reviewer/calibration responsibility;
- existing Measurement/TimeScope deterministic checks remain;
- no `ClaimDimensions` object is introduced.

Revisit only when repeated implementation failures show natural-language + existing structure is insufficient.

### D13 — Record-producing power is context, not a negative inference rule

SourcePosition can record relevant documented/inferred power or dependency.

The system may use that context to review claims based on archival absence.

It must never deterministically infer:

`powerful archive owner → concealed/destroyed record`

or:

`under-recorded actor → their claim is true`.

The only hard rule remains:

> absence is not non-existence.

Power-sensitive absence is Reviewer judgment.

### D14 — Historical compatibility is mandatory

XRAY-KE-001 and already committed InvestigationVersions must reconstruct exactly.

Therefore:

- `Evidence.knowledgeBasis` is optional at the base TypeScript shape;
- `SourcePosition[]` is an additive graph collection defaulting to empty when absent;
- any Investigation membership index addition must be optional for historical snapshots or reconstructed only for v0.3+ snapshots according to the migration contract;
- no backfill may manufacture source positions or knowledge bases for historical versions.

Historical enrichment requires a **new InvestigationVersion**, not silent mutation.

---

## 4. Kenyatta/Maralal representation check

The architecture can represent the disputed example without assigning truth by source type.

### Claim

```text
Cxxx:
"Kenyatta operationally led Mau Mau."
```

### Source

Colonial intelligence/administrative record.

### Evidence

```text
Exxx.proposition:
"Colonial authorities classified/alleged Kenyatta as a Mau Mau leader."

knowledgeBasis:
INSTITUTIONAL_CHARACTERIZATION

relationship:
SUPPORTS or CONTEXTUALIZES
strength:
claim-specific judgment
```

### SourcePosition at T1

```text
relationship:
DETENTION_OR_ENFORCEMENT_AUTHORITY

timeScope:
1952–...

basis:
DOCUMENTED
```

### SourcePosition at T2

A later record may separately establish:

```text
relationship:
INTERMEDIARY / OTHER ("political assessor/interlocutor")

timeScope:
1961

basis:
DOCUMENTED
```

Neither position overwrites the other.

The graph can then preserve:

- colonial classification;
- detention;
- later political engagement;
- evidence for/against operational Mau Mau leadership;
- unresolved questions about accommodation/co-option/selection;

without converting any one institutional record into the voice of reality.

---

## 5. Other source-type checks

### Company annual report

Can directly establish reported audited/accounting figures at their actual scope.

`KnowledgeBasis: ADMINISTRATIVE_RECORD` or `MEASUREMENT`.

It does not automatically establish that management caused performance.

### Police statement

Can directly establish the police institution's formal account or recorded action.

`KnowledgeBasis: INSTITUTIONAL_CHARACTERIZATION` or `ADMINISTRATIVE_RECORD`.

It does not automatically establish contested underlying events.

### Activist/witness account

Can directly establish that person's account and may provide direct observation where the field of observation supports it.

`KnowledgeBasis: DIRECT_OBSERVATION | PARTICIPANT_ACCOUNT | SELF_REPORT`.

It is not automatically true because the speaker lacks institutional power.

The architecture privileges no source type by fiat.

---

## 6. Persistence impact

#7 requires an additive canonical persistence delta.

This should **not** be hidden inside the existing 7d durable-workspace slice.

Reason:

- SourcePosition is a new immutable version-scoped canonical artifact collection.
- Evidence gains a new versioned canonical field.
- exact historical round-trip must preserve field absence on old versions;
- the new collection needs ordered/version-scoped storage and referential constraints;
- candidate workspace persistence later needs to know the final artifact collection set.

Therefore sequence:

```text
#13 architecture
  ↓
v0.3 epistemic runtime/domain implementation
  ↓
v0.3 canonical persistence migration
  ↓
#7d durable workspace/audit
  ↓
native PostgreSQL locking proof
  ↓
#7 closes
  ↓
#8 API
```

The original 7a–7c mechanics remain valid.

The persistence delta must be a distinct scoped implementation task before 7d, not a rewrite of 7a–7c.

---

## 7. Implementation split

### Follow-up A — Canonical epistemic delta

Implement:

- SourcePosition domain artifact;
- KnowledgeBasis on Evidence;
- graph/index/selectors;
- TRACE/PROVENANCE ownership;
- proposal changes;
- validator structural/referential checks;
- Reviewer/check/calibration delta;
- fixture(s) proving institutional characterization does not become underlying fact;
- historical fixture compatibility.

No database mutation.

### Follow-up B — Persistence delta

Implement:

- version-scoped SourcePosition storage;
- Evidence knowledge-basis storage preserving absence;
- exact v0.1 historical round-trip;
- new v0.3 round-trip fixture;
- workspace schema awareness of the new collection;
- rollback/referential tests.

Then resume original #7d.

---

## 8. Rejected alternatives

### Put fields directly on Source

Rejected. Relationship/power is subject-, claim-, and time-relative.

### Put KnowledgeBasis on Source

Rejected. One source can contain direct observation, quoted claims, institutional characterizations, and secondary synthesis simultaneously.

### Add a bias/trust score

Rejected. It would convert contextual epistemics into an unsupported ranking.

### Create Actor as a first-class entity now

Deferred. It solves a larger identity-resolution problem not required for v0.3.

### Add SOURCE_POSITION as an executable stage

Rejected. It would add orchestration without a distinct artifact lifecycle; existing stages already have natural ownership points.

### Store "doesNotEstablish" prose on Evidence

Rejected. It duplicates the proposition boundary and would drift. Reviewer/projections can explain limits from proposition, KnowledgeBasis, SourcePosition, and claim relationship.

### Backfill historical versions

Rejected. Historical preservation forbids manufacturing context that was not canonical when the version was committed.

---

## 9. Architecture consequence

The evidence graph now distinguishes four questions that previously looked like one:

```text
WHERE DID THE DOCUMENT COME FROM?
  SourceDependency

WHERE DID THIS PROPOSITION COME FROM?
  EvidenceProvenance

WHERE WAS THE SPEAKER/PRODUCER STANDING?
  SourcePosition

HOW COULD THIS SOURCE KNOW THIS PROPOSITION?
  Evidence.knowledgeBasis
```

Together they let X-Ray reconstruct not merely the receipt, but the epistemic conditions under which the receipt was produced.

That is the architectural meaning of Protocol v0.3.
