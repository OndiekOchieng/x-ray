# Benchmark Corpus v1 — Failure-mode coverage

This matrix answers one question:

> What reasoning boundary does each real-world benchmark actually exercise?

It is not a scorecard. A checkmark means the case contains that pressure point; it does not rank benchmark quality.

## Coverage by failure mode

| Failure mode / pressure point | Covered by |
| --- | --- |
| Scope collapse | XRAY-KE-001, XRAY-DRC-001 |
| Proxy/different measurement treated as contradiction | XRAY-KE-001 |
| Repeated publications treated as independent corroboration | XRAY-KE-001, XRAY-US-001, XRAY-DRC-001 |
| Missing/not-located evidence promoted to nonexistence | XRAY-KE-001 |
| Scheduled/planned promoted to occurred | XRAY-KE-001, XRAY-DRC-002 |
| Numeric bridge reconciled without authoritative derivation | XRAY-KE-001 |
| Legal/category drift | XRAY-BF-001, XRAY-DRC-001 |
| Recovery dimensions collapsed | XRAY-KE-002 |
| Evidence inherited across a causal chain | XRAY-US-001, XRAY-KE-003, XRAY-AFR-001, XRAY-DRC-002 |
| Authentic record treated as authentic interpretation | XRAY-HIST-001 |
| Source-position / evidentiary-reach overclaim | XRAY-HIST-001, XRAY-AFR-002, XRAY-DRC-002 |
| Aggregate treated as component | XRAY-KE-004 |
| Time basis drift (annual vs recurring, dated warning vs current condition) | XRAY-KE-004, XRAY-DRC-001 |
| Stewardship/association treated as causation | XRAY-KE-004 |
| Contribution treated as primary/sole/necessary cause | XRAY-AFR-001 |
| Continuity treated as control | XRAY-KE-005, XRAY-AFR-002 |
| Common outcome treated as common/coordinate actor | XRAY-KE-005, XRAY-AFR-002 |
| Later effect/benefit projected backward as intent | XRAY-KE-005, XRAY-AFR-002 |
| System narrative lacks falsifier | XRAY-KE-005 |
| Program / cohort / allocation collapsed | XRAY-DRC-001 |
| Possible protection treated as demonstrated efficacy | XRAY-DRC-001 |
| Individual testimony generalized to population policy/prevalence | XRAY-DRC-001, XRAY-DRC-002 |
| Case composition treated as disproportional risk without denominator | XRAY-DRC-002 |
| Survey sample result generalized to whole population | XRAY-DRC-002 |
| Measurement value detached from population definition | XRAY-DRC-002 |
| Exposure mechanism treated as quantified causal contribution | XRAY-DRC-002 |

## Existing calibration mapping

Most recurring pressure points already fit the existing calibration taxonomy:

- **FM-001** proxy-measure contradiction
- **FM-002** scope collapse
- **FM-003** source-count inflation
- **FM-004** absence → nonexistence
- **FM-005** temporal promotion
- **FM-006** premature numeric reconciliation
- **FM-007** context/source-position overreach
- **FM-008** proposition-dimension laundering
- **FM-009** causal/agency inheritance
- **FM-010** unfalsifiable system narrative

The newer DRC runs expose candidate refinements inside those families, not automatically new FM ids.

For example:

- program/cohort/allocation collapse is currently a proposition-dimension/category problem;
- case-share-without-denominator is currently a measurement/population-identity problem;
- anecdote-to-population and survey-reach inflation are evidentiary-reach problems.

They should receive new generic failure-mode IDs only after recurrence shows that the existing families are too coarse for reliable reviewer behaviour.

## Real gaps in corpus coverage

The current corpus is strong on textual and documentary civic claims. It is materially weaker in four areas.

### G1 — Base-rate / denominator manipulation

Need a case where the central error is not simply "wrong number" but a change in denominator or comparison base, such as:

- percentage increase without absolute baseline;
- rate vs count;
- per-capita vs absolute totals;
- subgroup share vs subgroup risk.

XRAY-DRC-002 touches this but does not fully exercise a deliberately misleading statistical comparison.

**Promotion target:** one benchmark with explicit denominator identity and a semantic assertion that the denominator must travel with the measure.

### G2 — Visual evidence

Need a case where image/video itself is load-bearing:

- old footage relabelled as current;
- correct event but wrong location;
- geolocation contradicts caption;
- image proves presence but not cause/intent.

**Promotion target:** benchmark must preserve media provenance, capture time/location uncertainty, and prevent visual authenticity from laundering narrative interpretation.

### G3 — Document-version / operative-text drift

XRAY-BF-001 exercises category drift, but we still need a clean case where:

```text
draft / proposal / prior regulation
        !=
operative enacted text
```

**Promotion target:** exact document version, effective date and amended clause become proposition identity.

### G4 — Forecast / prediction vs observation

Scheduled-vs-occurred is covered, but a probabilistic forecast has a different semantics:

```text
model forecasts X
        !=
X happened
        !=
model was certain X would happen
```

Useful domains include disease projections, fiscal forecasts, climate projections or polling.

**Promotion target:** modality/probability and forecast timestamp survive into the claim/evidence graph.

## Selection rule for the next benchmark

Do not select the next case by country, topic, virality or ideological interest.

Select it only if:

1. it fills G1–G4 or exposes a genuinely new repeatable boundary;
2. the surface artifact can be frozen;
3. primary/independent evidence is realistically retrievable;
4. its expected behaviour can be expressed semantically rather than as a desired verdict.

Once G1–G4 have adequate coverage, stop expanding the corpus and use it as a regression suite.
