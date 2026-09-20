# Issue #16 — Benchmark Corpus v1 closeout

## Scope completed

- Added a real-world benchmark registry governed by ADR-0009.
- Defined promotion states:
  - `SETTLED_ANALYSIS`
  - `FROZEN_BENCHMARK`
  - `EXECUTABLE_FIXTURE`
- Catalogued 12 benchmark cases with:
  - domains/jurisdictions;
  - existing failure-mode mappings;
  - required distinctions;
  - forbidden collapses;
  - material gaps;
  - explicit promotion needs.
- Added a cross-case failure-mode coverage matrix.
- Identified four genuine remaining coverage holes:
  - G1 denominator/base-rate manipulation;
  - G2 visual/geolocation evidence;
  - G3 document-version / operative-text drift;
  - G4 forecast/prediction vs observation.
- Added `check:benchmark-corpus` to validate registry integrity against the calibration failure-mode index and executable-fixture paths.

## Verification

Connector-level integrity verification against the branch head confirms:

- benchmark count: 12;
- executable fixtures: exactly `XRAY-KE-001`;
- promotion states present: `EXECUTABLE_FIXTURE`, `SETTLED_ANALYSIS`;
- known failure-mode vocabulary: `FM-001` through `FM-010`;
- unknown failure-mode references: 0;
- duplicate benchmark IDs: 0;
- settled analyses without explicit promotion needs: 0;
- executable fixtures retaining promotion needs: 0;
- XRAY-KE-001 benchmark README and executable acceptance fixture are present.

The dedicated `check:benchmark-corpus` script encodes those checks for normal repository execution.

## Deliberate non-promotions

XRAY-DRC-001 and XRAY-DRC-002 remain `SETTLED_ANALYSIS`.

Their reasoning lessons are stable enough to catalogue, but their raw surface/run/source artifacts are not yet archived as immutable repository evidence. Promoting them merely because the analysis is convincing would violate the corpus promotion model.

The same rule applies to the other historical/manual cases with missing exact surface artifacts or frozen source sets.

## Architecture result

The corpus now has three clearly separated evidence layers:

```text
real-world benchmark
    ↓
settled semantic lesson
    ↓ recurrence
calibration / failure mode
    ↓ if architecture requires
reviewer / invariant
```

One benchmark observation cannot silently become a generic reviewer rule.

## Commit discipline

Issue #16 uses semantic commits:

- `docs(benchmarks): establish corpus v1 baseline`
- `test(benchmarks): validate corpus registry`
- `docs(benchmarks): record corpus v1 closeout`

No #8 runtime/API implementation, protocol mutation, reviewer change, or validator change entered this issue.
