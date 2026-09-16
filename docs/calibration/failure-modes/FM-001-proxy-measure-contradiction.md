# FM-001 — Proxy-measure contradiction

**ID:** FM-001
**Name:** Proxy-measure contradiction
**Invariant:** [XR-INV-005](../../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule)
**Demonstrated by:** [CAL-001](../cases/CAL-001-different-measurement-is-not-contradiction.md)

---

## Error shape

A claim asserts something about quantity **A**. The located evidence measures
quantity **B**, which correlates with A but is not A. The evidence is used to
refute the claim as though it measured A.

```text
claim:      metric M₁ / denominator D₁
evidence:   metric M₂ / denominator D₂        M₁ ≠ M₂  or  D₁ ≠ D₂
verdict:    CONTRADICTED                      ← invalid
```

The tell is that the refutation requires an unstated conversion between M₁ and
M₂, and no record supplies it.

Recurring instances: budget executed vs work delivered; headcount vs capacity;
doses procured vs doses administered; enrolment vs attendance; permits issued vs
construction started; cases filed vs cases resolved.

## Why models and researchers fall into it

- **The units often match.** Both sides are percentages, or both are currency,
  so a compatibility check that compares units alone passes them.
- **The correlation is real.** B genuinely tracks A most of the time, so using B
  feels like a reasonable proxy rather than a substitution.
- **The proxy is the available number.** A is unmeasured; B is published
  quarterly. Reaching for the measured thing is a strong pull.
- **Refutation feels like rigour.** Declining to refute an official-sounding
  claim on available data reads as timidity, and the confident-sceptic register
  is rewarded.
- **The direction of error is flattering.** Proxy-based refutations usually
  point at the powerful, so they feel like accountability rather than
  overreach.

## Detection signals

- A claim's measurement and its challenging evidence's measurement differ in
  `metric`, `denominator`, `scope` or `definition`.
- A finding is graded `CONTRADICTED` while its claim carries **no** measurement,
  or while no evidence shares the claim's metric.
- The rationale contains a silent conversion — "only 28% complete, so most of it
  cannot be surfaced" — with no record establishing the ratio.
- The gap ledger names the direct measurement as missing **and** the finding is
  graded as though it were present. This is the loudest signal: the graph is
  contradicting itself.
- Evidence relationship `CONTRADICTS` on a claim whose denominator appears
  nowhere in the evidence set.

## Harm if allowed

- A false finding published with high confidence, on arithmetic that looks
  checkable and is not.
- The *real* question disappears. Once the claim is "refuted", nobody requests
  the direct measurement, and the gap that would settle it is closed by
  assertion.
- Asymmetric damage: the subject can disprove the finding by producing the
  direct measure, and the investigation cannot defend it. One such reversal
  costs more credibility than the finding ever bought.
- Systematically, it trains the engine to prefer the available number over the
  right one — the exact habit X-Ray exists to break.

## Corrective behavior

1. Record the claim's measurement at decomposition — metric, value, unit,
   denominator, scope, definition. A claim with no measurement cannot be
   contradicted by a measured one.
2. Record the evidence's measurement alongside it.
3. Compare **denominator and metric**, not units, before permitting
   `CONTRADICTS`.
4. On incompatibility, use `CHALLENGES` or `CONTEXTUALIZES`, grade the finding
   `INSUFFICIENT_EVIDENCE` or `UNRESOLVED`, and open a gap naming the direct
   measurement.
5. **Then look for the claim the evidence does settle.** Proxy data is usually
   excellent evidence for *something*; decompose that proposition out as a
   discovered claim rather than discarding it. In CAL-001 this produced `DC001`,
   graded `SUPPORTED / HIGH` on the very figures that could not touch `C003`.
6. State the insufficiency as two-directional in the rationale, so it reads as a
   finding rather than a hedge.

## Calibration cases demonstrating it

- [CAL-001 — Different measurement is not contradiction](../cases/CAL-001-different-measurement-is-not-contradiction.md)
- [CAL-002](../cases/CAL-002-different-scope-is-not-contradiction.md) — the same error over extent rather than metric
