# The Evidence Graph

**Source:** `X-Ray System Architecture v0.1` §2, §7–§10, XR-INV-004, XR-INV-005
**Architecture version:** 0.1
**Status:** Proposed

The canonical state of an X-Ray investigation is this graph. Everything a
citizen reads is a projection of it
([publication-and-cache.md](./publication-and-cache.md)).

See [ADR-0001](../adr/0001-evidence-graph-canonical-state.md).

---

## The canonical graph

The canonical state of an X-Ray investigation is **not generated prose**.

It is a versioned evidence graph composed of structured artifacts.

```text
Surface Source
      │
      ▼
    Claims
      │
      ▼
 Evidence Requirements
      │
      ▼
    Evidence ◄──────── Sources
      │                  │
      │             Provenance
      │                  │
      ├──────── Source Dependencies
      │
      ▼
 Discrepancies
      │
      ▼
Disconfirmation
      │
      ▼
   Findings
      │
      ▼
     Gaps
      │
      ▼
Resolution Paths
      │
      ├── PUBLIC_RECORD_REQUEST ──► ATI Draft
      ├── WAIT_FOR_RECORD
      ├── FIELD_VERIFICATION
      ├── DATASET_QUERY
      ├── SOURCE_CLARIFICATION
      ├── EXPERT_INTERPRETATION
      └── OTHER
```

Citizen-facing synthesis is a **projection of this graph**.

It MUST NOT become the canonical research record.

---

## Source is not Evidence

This is the distinction the whole graph turns on.

A **Source** is a retrieved artifact: a Treasury record, a ministry
statement, a news report. It has a publisher, a retrieval status, an
evidence class, an origin status.

**Evidence** is a *material proposition extracted from* a Source and
connected to one or more Claims. It has a relationship, a strength, and
optionally its own measurement.

One Source can yield several pieces of Evidence bearing on different Claims
in different directions:

```text
Source
   │
   ├── Evidence A ──supports────► C001
   │
   ├── Evidence B ──challenges──► C002
   │
   └── Evidence C ──context─────► C005
```

Collapsing the two into a single "receipt" object makes this unrepresentable
and silently forces one relationship per source. Full definitions:
[Source](./domain-model.md#source), [Evidence](./domain-model.md#evidence).

---

## Relationship semantics

Evidence attaches to a Claim under exactly one of four relationships:

| Relationship | Meaning |
| --- | --- |
| `SUPPORTS` | The proposition makes the claim more established. |
| `CHALLENGES` | The proposition weakens the claim without refuting it. |
| `CONTRADICTS` | The proposition is incompatible with the claim. |
| `CONTEXTUALIZES` | The proposition bears on interpretation without supporting or opposing. |

Strength is separate from direction:

```text
DIRECT | STRONG_INDIRECT | CONTEXTUAL | WEAK
```

`CONTRADICTS` is the constrained one. It may not be asserted on the strength
of evidence that measures something else — see
[measurement compatibility](#measurement-compatibility) below.

### How relationships reach a Finding

A Finding does not restate relationships; it indexes evidence by them. The
mapping is total — every Evidence record bearing on the claim lands in exactly
one list:

| `Evidence.relationship` | Finding list |
| --- | --- |
| `SUPPORTS` | `supportingEvidenceIds` |
| `CHALLENGES` | `challengingEvidenceIds` |
| `CONTRADICTS` | `challengingEvidenceIds` |
| `CONTEXTUALIZES` | `contextualEvidenceIds` |

`CHALLENGES` and `CONTRADICTS` share a list on purpose, and there is no
`contradictingEvidenceIds`. The canonical distinction lives on the Evidence;
a second copy on the Finding would be a second thing to keep in sync.

`CONTEXTUALIZES` has its own list rather than none. Evidence that neither
supports nor opposes a claim is often what makes a finding legible — the record
establishing that two figures measure different quantities does not argue for
either figure. Without the list, that evidence would be reachable only by
scanning every Evidence record for a matching `claimId`, and
[XR-INV-007](./validation-and-invariants.md#xr-inv-007--findings-must-be-reversible)
asks a finding to account for its own reasoning.

### When an observation is true of

Relationship and strength describe how evidence bears on a claim. **When** it
bears is separate: `Evidence.timeScope` records the period the observation or
measurement is scoped to, which is not its source's publication date.

A November 2025 Treasury report recording completion as at 30 June 2025 is one
record with two dates — `Source.publishedAt` and `Evidence.timeScope.asOf` —
and collapsing them would make a fifteen-month-old measurement look current.

Temporal scope MUST NOT be hidden inside `Measurement.definition`; see
[measurement compatibility](#measurement-compatibility).

---

## Provenance and dependency semantics

Provenance is represented as **edges between Sources**, not as a property of
a source and not as a display grouping.

Source provenance is represented as graph edges.

```ts
interface SourceDependency {
  id: string;

  sourceId: string;
  dependsOnSourceId?: string;

  originDescription?: string;

  relationship:
    | "REPRODUCES"
    | "QUOTES"
    | "ATTRIBUTES_TO"
    | "DERIVED_FROM"
    | "SAME_EVENT"
    | "PROBABLE_COMMON_ORIGIN"
    | "UNKNOWN";

  confidence:
    | "HIGH"
    | "MEDIUM"
    | "LOW";
}
```

This prevents repetition from becoming false corroboration.

The rule this enforces:

## XR-INV-004 — Source Independence

Multiple publications derived from the same originating record MUST NOT be treated as multiple independent confirmations.

Example:

```text
                    Ministry status dataset
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        People Daily   Radio47     The Star

independent observations = 1
publications = 3
```

Counting publications is not counting observations. A dependency edge is what
lets the engine compute the second number.

Full definition: [SourceDependency](./domain-model.md#sourcedependency).

---

## Measurement compatibility

Measurement is a first-class concept because two true statements about the
same project can measure entirely different quantities.

Measurement compatibility is a first-class system concept.

```ts
interface Measurement {
  metric?: string;

  value?: number;
  unit?: string;

  denominator?: string;

  scope?: string;

  definition?: string;
}
```

Example A:

```json
{
  "metric": "physical_project_completion",
  "value": 28,
  "unit": "percent",
  "denominator": "contractual_work",
  "scope": "three-lot project"
}
```

Example B:

```json
{
  "metric": "surfaced_length",
  "unit": "percent",
  "denominator": "mainline_length",
  "scope": "Mamboleo-Kipsitet main carriageway"
}
```

These measurements are not automatically compatible.

The rule this enforces:

## XR-INV-005 — Same-Measure Contradiction Rule

A finding MUST NOT be graded `CONTRADICTED` solely from evidence measuring a materially different quantity, scope, denominator, definition, or time period.

Before contradiction, the engine MUST evaluate measurement compatibility.

Example:

```text
Claim:
"Most road sections are tarmacked."

Evidence:
"Project is 28% complete."

measurementCompatible = false
```

The latter may challenge or contextualize the former.

It does not logically contradict it without additional evidence.

This invariant is introduced because of the Claude/GPT XRAY-KE-001 disagreement.

This invariant exists because of an observed disagreement between two
independent benchmark runs — see
[benchmarks/XRAY-KE-001](../benchmarks/XRAY-KE-001/README.md) and the
regression fixture in
[engineering/acceptance-fixtures.md](../engineering/acceptance-fixtures.md#same-measure-acceptance-fixture).

`Measurement.definition` carries measurement semantics only — what the metric
means, what it is a proportion of, under whose definition. It does **not**
carry dates. When a measurement was taken is `Evidence.timeScope`.

Evaluating compatibility is a **referential and epistemic validation**
concern, not a prompt instruction —
[validation-and-invariants.md](./validation-and-invariants.md#epistemic).

Full definition: [Measurement](./domain-model.md#measurement).

---

## Related

- [Domain model](./domain-model.md)
- [Validation and invariants](./validation-and-invariants.md)
- [ADR-0001 — Evidence graph is canonical state](../adr/0001-evidence-graph-canonical-state.md)
