# CAL-006 — Unexplained financial bridge remains unresolved

**ID:** CAL-006
**Name:** Unexplained financial bridge remains unresolved
**Anchor claim:** `C002`
**Governing invariants:** [XR-INV-006](../../architecture/validation-and-invariants.md#xr-inv-006--missing-evidence-is-not-negative-evidence), [XR-INV-007](../../architecture/validation-and-invariants.md#xr-inv-007--findings-must-be-reversible)
**Related failure mode:** [FM-006](../failure-modes/FM-006-premature-numeric-reconciliation.md)

---

## Why this case exists

Four values for one project sit on the public record. Every instinct — editorial,
analytical, and conversational — is to pick one.

The pressure comes from both directions. Choosing the **primary** figure feels
rigorous: the award notice is the best record, so 15.88bn is the "real" number
and 16.7bn is inflated. Choosing the **current** figure feels practical: the
implementing authority uses 16.7bn, so that is the project's value.

Both resolve an unresolved question by preference. This case is the worked
example of holding the line.

## Fixture references

| Kind | Ids |
| --- | --- |
| Claim | `C002` |
| Finding | `FND-C002` (`UNRESOLVED / HIGH`) |
| Supporting evidence | `EV-013` (`STRONG_INDIRECT`), `EV-014`, `EV-015`, `EV-016` (`WEAK`) |
| Challenging evidence | `EV-010` (`DIRECT`), `EV-017`, `EV-018`, `EV-019` |
| Contextual evidence | `EV-011`, `EV-012` |
| Discrepancy | `DISC-002` — `UNRESOLVED`, `resolved: false` |
| Gap | `GAP-001` — `PUBLIC_RECORD_REQUEST`, `atiEligible: true` |
| Disconfirmation | `DCF-002` (`CHANGED`) |

## Situation

| Value | Source | Fixture |
| --- | --- | --- |
| KSh 15.7bn | Government publication, May 2025 | `EV-017` |
| **KSh 15,880,008,733** | KeNHA award notice — the only primary financial record recovered | `EV-010` |
| KSh 15.87bn | KeNHA on the record 2022; ministry data Sept 2026 | `EV-019`, `EV-018` |
| KSh 16.385bn | Treasury estimated project costs | `EV-012` |
| **KSh 16.7bn** | KeNHA's own regional office, and the surface source | `EV-013` |

Two contextual records matter disproportionately. The award notice also records
supervision consultancies for Lots 1 and 2 totalling KSh 505,284,864 (`EV-011`);
**awarded works plus those consultancies reach 16.385bn** — the same figure
Treasury arrives at by an entirely independent route (`EV-012`).

Neither route reaches 16.7bn. A Lot 3 supervision contract, which would narrow
the gap further, was not located.

## Wrong instinct

> **(a)** The primary award record says 15.88bn. That is the contract value.
> 16.7bn is inflated — grade `C002` `CONTRADICTED`.
>
> **(b)** Two independent routes both land on 16.385bn, and a missing Lot 3
> supervision contract of roughly 0.3bn would bring it to 16.7bn. That explains
> it — grade `C002` `SUPPORTED`.

## Expected judgment

```text
FND-C002     status:     UNRESOLVED
             confidence: HIGH

DISC-002     classification: UNRESOLVED
             resolved:       false

GAP-001      derivation of KSh 16.7bn — OPEN
```

`HIGH` confidence **that the located evidence does not settle the derivation**.
Not confidence that the figure is wrong; not confidence that it is right.

## Why the expected judgment follows

**Against (a):** awarded works and current project value are different
quantities. Contracts get varied, prices adjusted, scope added — two bridges
were to be redesigned and an interchange was planned, both on the record without
values. A 2021 award sum is not a 2026 project value, and treating the primary
record as automatically current is a temporal error dressed as rigour.

The figure also cannot simply be dismissed: KeNHA's *own* regional office uses
it (`EV-013`). Grading `CONTRADICTED` would mean asserting the implementing
authority misstates its own project, on the strength of a five-year-old
document.

**Against (b):** the supervision explanation is a *hypothesis*, and the fixture
records it as one. The arithmetic works only if a Lot 3 supervision contract of
roughly the right size exists — and it was not located. Completing the bridge
with an unfound record is exactly the inference
[CAL-004](./CAL-004-not-located-is-not-nonexistent.md) forbids, running in the
optimistic direction. That the 16.385bn coincidence is striking makes it a
better lead, not a finding.

**What is actually established** is narrower and worth stating precisely:

- awarded works totalled KSh 15,880,008,733 at award — `ESTABLISHED`;
- KSh 16.7bn is the figure in official use in 2026 — `ESTABLISHED` **as a fact
  about usage**, not about value;
- the relationship between them — **unknown**.

`DCF-002` records the disconfirmation result as `CHANGED`: the preliminary
hypothesis that 16.7bn was authoritative did not survive, and neither did its
opposite.

### The rounding trap

15.7 / 15.87 / 15.88 / 15.9 are **not four discrepancies**. They are roundings
of one number, and `DISC-002` says so. Treating a rounding as a discrepancy
inflates apparent disagreement and then invites a "reconciliation" of something
that was never in conflict. The real gap is one step: 15.88 → 16.7, about
KSh 0.82bn.

## What evidence would change the judgment

- Approved variation schedules or revised contract-price schedules totalling
  ~16.7bn → `SUPPORTED` or `ESTABLISHED`; `GAP-001` closes.
- A located Lot 3 supervision award that completes the arithmetic → the
  hypothesis becomes a finding.
- A current authoritative KeNHA project-cost record stating the composition →
  resolves whichever way it states.
- An Auditor-General or Treasury record giving current contract value per lot →
  same.
- A custodian record confirming **no variation was approved** → `CONTRADICTED`
  becomes available, from positive evidence rather than failed search.

## Related failure modes

- [FM-006 — Premature numeric reconciliation](../failure-modes/FM-006-premature-numeric-reconciliation.md)
- [FM-004 — Absence to nonexistence](../failure-modes/FM-004-absence-to-nonexistence.md)
- [FM-002 — Scope collapse](../failure-modes/FM-002-scope-collapse.md) (cost definitions collapse the same way extents do)
