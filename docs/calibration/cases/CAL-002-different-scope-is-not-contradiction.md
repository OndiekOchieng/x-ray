# CAL-002 — Different scope is not contradiction

**ID:** CAL-002
**Name:** Different scope is not contradiction
**Anchor claim:** `C001`
**Governing invariant:** [XR-INV-005](../../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule)
**Related failure mode:** [FM-002](../failure-modes/FM-002-scope-collapse.md)

---

## Why this case exists

CAL-001 concerns two different *metrics*. This case concerns one metric —
kilometres — measured over two different *extents*.

It is the easier error to make, because the unit matches. Two numbers in the
same unit describing the same road look like a contradiction, and an automatic
reconciliation check that only compares units will wave them through as
comparable.

Both benchmark runs reconciled it, independently, and the architecture's
acceptance fixture makes the reconciliation mandatory:
`mustNotClassifyAs: GENUINE_CONTRADICTION`.

## Fixture references

| Kind | Ids |
| --- | --- |
| Claim | `C001` |
| Finding | `FND-C001` |
| Supporting evidence | `EV-001`, `EV-002`, `EV-003`, `EV-004` |
| Challenging evidence | `EV-005`, `EV-008`, `EV-009` |
| Contextual evidence | `EV-006`, `EV-007` |
| Discrepancy | `DISC-001` |
| Gap | `GAP-004` |
| Disconfirmation | `DCF-001` |

## Situation

The surface source describes a **63-kilometre** highway (`C001`).

Government publications describe the same works as **122 kilometres**
(`EV-005`). Published per-lot lengths sum to **100.8 km** (`EV-009`). A regional
office separately gave **about 44 km** (`EV-008`).

Four numbers, one unit, one road.

## Wrong instinct

> These cannot all be true. 63 and 122 are nearly a factor of two apart.
> The government says 122, so 63 is wrong — grade `C001` as `CONTRADICTED`.

## Expected judgment

```text
FND-C001    status:     SUPPORTED
            confidence: MEDIUM

DISC-001    classification: DIFFERENT_SCOPE
            resolved:       true
```

`DIFFERENT_SCOPE` (or `DIFFERENT_DEFINITION` — both are acceptable
classifications under the architecture's acceptance fixture; the runs split
between them and reached the same reconciliation). What is **not** acceptable is
`GENUINE_CONTRADICTION`.

## Why the expected judgment follows

The numbers measure different extents of the same project:

```text
63 km    principal / main carriageway
122 km   main carriageway + feeder roads + spur works + related sections
```

This is not inference. A ministry statement says so explicitly (`EV-001`):
*about 63 kilometres of the main carriageway earmarked for upgrading*, with
feeder roads and related sections bringing total project scope to approximately
122 kilometres.

Two independent records corroborate that main-road length and total
construction kilometres are separately counted:

- the project ESIA programmes **54 km of spur roads** distinctly from the road
  being reconstructed (`EV-006`);
- the Lot 3 contractor counts **~23 km of main road plus ~19.5 km of feeder
  works**, totalling 42.5 km for that lot alone (`EV-007`, `EV-003`).

Both are `CONTEXTUALIZES` — neither argues for 63 or for 122. They establish
that the two figures are answering different questions, which is precisely what
makes the reconciliation credible rather than convenient. This is why
`contextualEvidenceIds` exists as a first-class finding list.

The mainline arithmetic then holds independently: Lot 2 chainage gives 27.4 km
(`EV-002`, from the primary award record), Lot 3 main road ~23 km (`EV-003`),
Lot 1 ~12.6 km — roughly 63 km.

### What is *not* reconciled

`SUPPORTED / MEDIUM`, not `ESTABLISHED`, and `GAP-004` stays open:

- the published lot lengths total **100.8 km**, not 122 (`EV-009`);
- the **44 km** figure matches nothing and no located source explains it
  (`EV-008`);
- the one record that states the definition (`SRC-009`) was **never obtained** —
  it is reachable only through press reproduction and is classified
  `ATTRIBUTED_ORIGIN_NOT_RETRIEVED`.

A reconciliation that explains the *main* tension is not a reconciliation that
explains everything. Reconciling 63 against 122 does not license quietly
dropping 44 and 100.8.

## What evidence would change the judgment

- A current KeNHA scope schedule showing the main carriageway is materially
  different from ~63 km → `C001` becomes `CONTRADICTED`, legitimately.
- The same schedule confirming ~63 km mainline with a stated feeder/spur
  breakdown → `C001` becomes `ESTABLISHED` and `GAP-004` closes.
- A record explaining the 44 km or 100.8 km figures → `DISC-001`'s residue
  resolves.
- Evidence that 63 km is a pre-2021 design figure superseded by redesign → the
  finding changes direction entirely (this was `DCF-001`'s counter-hypothesis;
  it survived, weakened).

## Related failure modes

- [FM-002 — Scope collapse](../failure-modes/FM-002-scope-collapse.md)
- [FM-006 — Premature numeric reconciliation](../failure-modes/FM-006-premature-numeric-reconciliation.md) (the opposite error: inventing a bridge instead of leaving one open)
