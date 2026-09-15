# Acceptance Fixtures

**Source:** `X-Ray System Architecture v0.1` §24–§35
**Status:** Design document — **no executable fixtures exist yet**

This document specifies what the XRAY-KE-001 acceptance suite must assert. It
is not a test harness and does not describe one that exists.

See [ADR-0009](../adr/0009-benchmark-runs-as-acceptance-evidence.md) and the
[benchmark README](../benchmarks/XRAY-KE-001/README.md).

**Contents:** [Strategy](#strategy) · [Fixture input](#fixture-input) ·
[Core claims](#core-claim-acceptance-fixture) ·
[Reconciliation](#required-reconciliation-fixture) ·
[Financial discrepancy](#financial-discrepancy-fixture) ·
[Source dependency](#source-dependency-fixture) ·
[Same-measure](#same-measure-acceptance-fixture) ·
[Scheduled vs occurred](#scheduled-vs-occurred-fixture) ·
[Gaps](#gap-fixture) · [Forbidden inferences](#forbidden-inferences) ·
[Evaluation](#fixture-evaluation) · [First suite](#first-acceptance-suite)

---

## Strategy

The two XRAY-KE-001 runs become **architecture acceptance fixtures**, not golden prose outputs.

The system is NOT required to reproduce either report word-for-word.

It MUST reproduce their important epistemic behavior.

Fixture directory:

```text
fixtures/
└── XRAY-KE-001/
    ├── README.md
    ├── input.json
    ├── expected-invariants.json
    ├── expected-core-claims.json
    ├── expected-evidence-patterns.json
    ├── expected-discrepancies.json
    ├── expected-gaps.json
    ├── forbidden-inferences.json
    └── raw/
        ├── claude-run.md
        └── gpt-run.md
```

---

## Fixture input

```json
{
  "fixture": "XRAY-KE-001",
  "surfaceSource": {
    "publisher": "Citizen Digital",
    "url": "https://citizen.digital/article/inside-rutos-five-day-tour-of-kisumu-siaya-migori-and-homa-bay-n390083"
  },
  "focus": "Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet road",
  "researchCutoff": "2026-09-13",
  "protocolBaseline": "0.1.0"
}
```

The research cutoff is important.

The fixture MUST NOT expect post-cutoff evidence.

---

## Core claim acceptance fixture

At minimum the engine must recover independently testable propositions equivalent to:

```json
[
  {
    "semanticKey": "road_length",
    "expectedValue": 63,
    "unit": "km"
  },
  {
    "semanticKey": "project_value",
    "expectedValue": 16.7,
    "unit": "KES_BILLION"
  },
  {
    "semanticKey": "most_sections_tarmacked"
  },
  {
    "semanticKey": "presidential_inspection_scheduled"
  }
]
```

Exact claim IDs and wording are not asserted.

Semantic equivalence is.

---

# Required reconciliation behaviors

The next four fixtures specify reconciliation the engine MUST perform.

## Required reconciliation fixture

The engine MUST discover that:

```text
63 km

and

122 km
```

are not automatically contradictory.

Acceptance:

```json
{
  "case": "road_length_scope",
  "mustNotClassifyAs": "GENUINE_CONTRADICTION",
  "acceptableClassifications": [
    "DIFFERENT_SCOPE",
    "DIFFERENT_DEFINITION"
  ],
  "requiredConcepts": [
    "main carriageway",
    "feeder or spur roads"
  ]
}
```

Both benchmark runs independently reached this reconciliation.

---

## Financial discrepancy fixture

The engine MUST preserve materially different project-value representations rather than silently selecting one.

Expected evidence neighborhood includes approximately:

```text
KSh15.7B
KSh15.87/15.88B
KSh16.385B
KSh16.7B
```

Acceptance:

```json
{
  "case": "project_value",
  "requiredStatus": "UNRESOLVED",
  "forbiddenStatuses": [
    "ESTABLISHED"
  ],
  "mustIdentifyMissingBridge": true
}
```

The engine need not locate every number on every run.

It MUST NOT claim that KSh16.7B has been established unless a primary/revised-cost record actually supports it.

---

## Source dependency fixture

Given multiple September publications carrying the same lot progress figures, the engine MUST detect likely common provenance.

Acceptance:

```json
{
  "case": "september_progress_reporting",
  "publicationCountMinimum": 2,
  "independentOriginCountMaximum": 1,
  "mustNotTreatAsIndependentCorroboration": true
}
```

Enforces [XR-INV-004](../architecture/validation-and-invariants.md#xr-inv-004--source-independence).

---

## Same-measure acceptance fixture

This is the critical regression fixture introduced by the benchmark disagreement.

Input evidence:

```text
Claim:
Most sections of the road have already been tarmacked.

Evidence:
Lot progress = approximately 20.2%, 34%, 28%.
```

Expected:

```json
{
  "measurementCompatible": false,
  "forbiddenAutomaticFinding": "CONTRADICTED",
  "acceptableFindings": [
    "INSUFFICIENT_EVIDENCE",
    "UNRESOLVED",
    "PARTIALLY_SUPPORTED"
  ],
  "requiredGap": "surfaced kilometres or equivalent direct surfacing measurement"
}
```

A future run MAY legitimately return `CONTRADICTED` only if it retrieves measurement-compatible evidence showing that most relevant road sections were not tarmacked.

The fixture tests reasoning behavior, not a permanently frozen verdict.

Enforces [XR-INV-005](../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule).
This is the fixture the benchmark disagreement produced — see the
[benchmark README](../benchmarks/XRAY-KE-001/README.md#why-two-models-were-run).

---

## Scheduled vs occurred fixture

Acceptance:

```json
{
  "case": "presidential_inspection",
  "researchCutoff": "2026-09-13",
  "mayEstablish": "scheduled_or_expected",
  "mustNotEstablish": "occurred"
}
```

The research date precedes the expected inspection.

Future evidence MUST NOT leak into this historical fixture.

---

## Gap fixture

The engine MUST expose at least the following unresolved evidence needs if they remain unlocated:

```text
derivation/current basis of KSh16.7B

current authoritative mainline vs feeder/spur scope

kilometres actually surfaced/tarmacked

originating recent project-status record

post-event proof of presidential inspection
```

Not every run must phrase them identically.

The semantic gaps must remain representable.

Enforces [XR-INV-008](../architecture/validation-and-invariants.md#xr-inv-008--gap-preservation).

---

# Forbidden inferences

XRAY-KE-001 MUST fail acceptance if the engine performs any of these transformations without new evidence:

```text
28% project completion
    →
28% of road tarmacked
```

```text
three newspapers repeat figure
    →
three independent confirmations
```

```text
record not located
    →
record does not exist
```

```text
scheduled inspection
    →
inspection occurred
```

```text
KSh15.88B original works contracts
    →
KSh16.7B is false
```

```text
122 km project scope
    →
63 km mainline figure is false
```

These are regression tests for epistemic behavior.

Each forbidden transformation maps to an invariant:

| Forbidden inference | Invariant |
| --- | --- |
| 28% project completion → 28% of road tarmacked | [XR-INV-005](../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule) |
| three newspapers repeat figure → three independent confirmations | [XR-INV-004](../architecture/validation-and-invariants.md#xr-inv-004--source-independence) |
| record not located → record does not exist | [XR-INV-006](../architecture/validation-and-invariants.md#xr-inv-006--missing-evidence-is-not-negative-evidence) |
| scheduled inspection → inspection occurred | [XR-INV-001](../architecture/validation-and-invariants.md#xr-inv-001--surface-source-isolation) |
| KSh15.88B original works contracts → KSh16.7B is false | [XR-INV-005](../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule) |
| 122 km project scope → 63 km mainline figure is false | [XR-INV-005](../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule) |

---

## Fixture evaluation

Acceptance is semantic rather than textual.

```ts
interface FixtureResult {
  structuralPass: boolean;
  invariantPass: boolean;
  semanticPass: boolean;

  violations: FixtureViolation[];
}
```

A model can discover additional legitimate evidence without failing the fixture.

A later model may produce a stronger finding if it retrieves stronger evidence.

Therefore fixtures distinguish:

```text
MUST
MUST NOT
MAY
```

rather than freezing every conclusion.

---

## First acceptance suite

```text
XRAY-KE-001-A01
Surface source does not self-prove claims.

XRAY-KE-001-A02
63 km / 122 km undergo scope reconciliation.

XRAY-KE-001-A03
KSh16.7B remains unresolved absent missing bridge.

XRAY-KE-001-A04
Repeated September reports collapse toward common origin.

XRAY-KE-001-A05
Project completion % is not treated as surfaced-length %.

XRAY-KE-001-A06
Scheduled presidential inspection is not converted to occurred event.

XRAY-KE-001-A07
Missing primary record remains an explicit gap.

XRAY-KE-001-A08
Every load-bearing finding records evidence that could change it.

XRAY-KE-001-A09
Discovered claims remain separate from controlled claims.

XRAY-KE-001-A10
No citizen-facing synthesis mutates evidence state.
```

---

## Related

- [Validation and invariants](../architecture/validation-and-invariants.md)
- [Build order](./build-order.md) — the suite is step 6, and step 12 is making it green
- [Benchmark XRAY-KE-001](../benchmarks/XRAY-KE-001/README.md)
