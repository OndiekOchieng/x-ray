# CAL-001 — Different measurement is not contradiction

**ID:** CAL-001
**Name:** Different measurement is not contradiction
**Anchor claim:** `C003`
**Governing invariant:** [XR-INV-005](../../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule)
**Related failure mode:** [FM-001](../failure-modes/FM-001-proxy-measure-contradiction.md)

---

## Why this case exists

This is the disagreement the invariant was written from.

Two independent executions of the same protocol against the same article, with
access to the same records, graded `C003` differently:

| Run | Status | Confidence |
| --- | --- | --- |
| Claude | `CONTRADICTED` | MEDIUM |
| GPT | `INSUFFICIENT_EVIDENCE` | HIGH |

Both identified the *same* underlying problem, and neither made an arithmetic
error. The divergence was not noise — it was an unspecified rule. That rule
became XR-INV-005, and this case is the worked example of applying it.

## Fixture references

| Kind | Ids |
| --- | --- |
| Claim | `C003` |
| Contrast claim | `DC001` |
| Finding | `FND-C003` (and `FND-DC001` for contrast) |
| Challenging evidence | `EV-020`, `EV-021`, `EV-022`, `EV-023`, `EV-024`, `EV-025` |
| Contextual evidence | `EV-026`, `EV-027`, `EV-028` |
| Discrepancy | `DISC-003` |
| Gaps | `GAP-002`, `GAP-005` |
| Disconfirmation | `DCF-003` |

## Situation

The surface source asserts that **most sections of the road have already been
tarmacked** (`C003`).

Two days earlier, ministry-attributed status data put the three lots at
**20.2%**, **34%** and **28%** (`EV-020`, `EV-021`, `EV-022`). Three months
before that, KeNHA told a parliamentary committee the project stood at **28%
overall** (`EV-023`).

Separately, asphalt laying was documented as actively underway on the corridor
in the same month (`EV-026`), and a resident engineer described Dense Bitumen
Macadam being laid earlier in the year (`EV-027`).

No located record states how many kilometres carry tarmac.

## Wrong instinct

> Every official figure is at or below 34%. "Most" means more than half.
> Therefore the claim is false — grade it `CONTRADICTED`.

The arithmetic is impeccable and the conclusion does not follow.

## Expected judgment

```text
FND-C003   status:     INSUFFICIENT_EVIDENCE
           confidence: HIGH
```

`HIGH` confidence **in the insufficiency** — not high confidence that the claim
is false. The fixture carries **no evidence with `relationship: 'CONTRADICTS'`
against C003**, and `DISC-003` is classified `DIFFERENT_DEFINITION`, not
`GENUINE_CONTRADICTION`.

## Why the expected judgment follows

The two sides measure different quantities:

```text
claim C003        metric: surfaced_length
                  denominator: road_sections

evidence EV-020   metric: physical_project_completion
                  denominator: contractual_work
```

Physical project completion is weighted across earthworks, drainage, bridges,
shoulders, interchanges, utilities and finishing. A corridor can carry a
bituminous layer over a substantial linear distance while overall completion
stays low, because the expensive structural work is outstanding. Conversely a
project can be well advanced in value terms with little surfacing laid.

So the percentages neither prove nor disprove the claim. They are not a weaker
version of the same measurement — they are a **different measurement**, and the
conversion factor between them is exactly what no record supplies.

The insufficiency runs in both directions, which is what makes
`INSUFFICIENT_EVIDENCE` correct rather than a hedge:

- nothing located describes most of the road as surfaced; **and**
- surfacing was demonstrably active (`EV-026`, `EV-027`), so the opposite is not
  established either.

`DCF-003` records that the two benchmark runs framed the preliminary hypothesis
in *opposite* directions and both arrived here.

### The contrast that proves it is not a hedge

`DC001` — *the project remained substantially incomplete immediately before the
tour* — rests on the **same figures** (`EV-029`, `EV-030`, `EV-031`) and is
graded `SUPPORTED / HIGH`.

The difference is measurement compatibility. `DC001` is stated in
`physical_project_completion` against `contractual_work`, which is the metric
the evidence carries. The same numbers settle one claim and cannot touch the
other.

A researcher who grades `C003` as `INSUFFICIENT_EVIDENCE` and stops has done
half the job. The other half is noticing that a claim the evidence *can* settle
is sitting right there, and decomposing it out — which is where `DC001` came
from.

## What evidence would change the judgment

- A KeNHA or resident-engineer progress report giving **kilometres surfaced per
  lot** against total mainline kilometres (`GAP-002`).
- Certified surfaced-kilometre data showing more than half the relevant mainline
  had reached bitumen standard by 2026-09-13 → `C003` becomes `SUPPORTED`.
- The same data showing materially less than half → `C003` becomes
  `CONTRADICTED`, **legitimately**, because the measurement would finally be
  compatible.

XR-INV-005 does not forbid `CONTRADICTED` on this claim forever. It forbids
reaching it from the wrong measure.

## Related failure modes

- [FM-001 — Proxy-measure contradiction](../failure-modes/FM-001-proxy-measure-contradiction.md)
- [FM-002 — Scope collapse](../failure-modes/FM-002-scope-collapse.md) (the same error over extent rather than metric)
