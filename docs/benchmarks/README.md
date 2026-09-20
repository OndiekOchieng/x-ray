# Benchmark Corpus v1

**Status:** Draft registry of real-world X-Ray pressure tests  
**Governing decision:** [ADR-0009](../adr/0009-benchmark-runs-as-acceptance-evidence.md)  
**Rule:** benchmark acceptance targets semantic behaviour, never golden prose.

## Why this exists

The repository already has two mature evidence layers:

1. **XRAY-KE-001**, the frozen and executable reference benchmark.
2. **Calibration cases CAL-001…CAL-016 / FM-001…FM-010**, which encode recurring judgment boundaries and reviewer failure modes.

Since those were forged, manual X-Ray runs have pressure-tested the method across law, public health, history, corporate reporting, systems claims, wildlife, defence and institutional power. Those runs exposed repeated epistemic behaviours that should now become a managed corpus rather than remain scattered analysis.

This registry does **not** pretend every manual run is already an executable fixture. It records what has been settled, what behaviour each case exercises, and what evidence is still needed before promotion.

## Promotion states

`SETTLED_ANALYSIS`
: The X-Ray analysis reached a stable benchmark lesson and its required distinctions are known. It may still lack frozen raw artifacts, exact source recovery, or executable assertions.

`FROZEN_BENCHMARK`
: Surface input, research cutoff/protocol, raw run artifacts and traced evidence are archived immutably. Semantic expectations are documented, but no executable fixture is required yet.

`EXECUTABLE_FIXTURE`
: The frozen benchmark has machine-checkable semantic assertions integrated with the acceptance runner. Stronger later evidence may change findings without failing the fixture so long as required reasoning behaviour is preserved.

Promotion is one-way. Historical raw artifacts are never rewritten.

## Current corpus

The machine-readable registry is [corpus-v1.json](./corpus-v1.json).

At this draft, **XRAY-KE-001 is the only executable fixture**. The later manual pressure tests are deliberately marked `SETTLED_ANALYSIS`; the registry does not manufacture missing URLs, raw runs, source sets, or fixtures.

The two newest cases are:

- **XRAY-DRC-001** — Ebola vaccination: campaign vs research cohort vs dose allocation, possible protection vs demonstrated efficacy, research-protocol vs compassionate-use category.
- **XRAY-DRC-002** — women/girls and Ebola: case share vs disproportionate risk, testimony vs prevalence, survey reach, numeric population-definition drift, mechanism vs quantified causation.

## What a benchmark assertion should test

Good benchmark assertions test graph behaviour:

- claims that must remain separate;
- dimensions that must travel with a measurement;
- provenance that must collapse repeated publications;
- evidence that must not inherit across a causal/agency chain;
- uncertainty/gaps that must remain explicit;
- findings that must not be promoted without compatible evidence.

They do **not** assert exact prose.

For example, XRAY-DRC-001 should eventually test that:

```text
20,000 BRAVO participants
    !=
50,000 frontline-worker dose allocation
```

and not that the final report contains a particular sentence.

## Promotion checklist

A settled analysis may be promoted only when all applicable items are available:

- exact surface artifact and URL/version;
- protocol version and research cutoff;
- frozen raw research/run artifacts;
- traced source set with source dependency recorded;
- known source-position / knowledge-basis expectations;
- required distinctions and forbidden collapses;
- material unresolved gaps;
- semantic assertions written as MUST / MUST NOT / MAY;
- no assertion freezes a verdict that stronger future evidence could legitimately change.

## Relationship to calibration

A **benchmark** is a real investigation pressure test.

A **calibration case** extracts a reusable judgment boundary from one or more benchmarks.

A benchmark discovery does not automatically become a new reviewer rule. Promotion path:

```text
real case
  ↓
settled benchmark lesson
  ↓
recurs independently
  ↓
generic failure mode / calibration case
  ↓
reviewer or invariant change, if architecture requires it
```

This avoids overfitting X-Ray to one article.

## Next work

See [failure-mode-matrix.md](./failure-mode-matrix.md).

The corpus is already broad enough that the next cases should be chosen to fill coverage holes rather than because a story is interesting. Current highest-value holes are:

1. statistical/base-rate manipulation;
2. image/video/geolocation evidence;
3. document-version / draft-vs-enacted legal text;
4. prediction/forecast vs observation.

Do not add all four automatically. Select cases only when they exercise a missing reasoning boundary not already covered well by the corpus.
