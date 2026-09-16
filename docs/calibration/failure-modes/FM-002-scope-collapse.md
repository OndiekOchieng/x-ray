# FM-002 — Scope collapse

**ID:** FM-002
**Name:** Scope collapse
**Invariant:** [XR-INV-005](../../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule)
**Demonstrated by:** [CAL-002](../cases/CAL-002-different-scope-is-not-contradiction.md)

---

## Error shape

Two figures measure the **same metric in the same unit** over **different
extents** of the same subject. They are treated as competing values for one
quantity, and one is declared wrong.

```text
figure X:   metric M over extent E₁       (core / narrow)
figure Y:   metric M over extent E₂       (package / broad)
verdict:    "X and Y conflict; one is false"      ← invalid
```

Both can be exactly correct. The conflict is manufactured by dropping the
extent qualifier — usually because the source dropped it first.

Recurring instances: core programme vs programme-plus-components; a facility vs
its catchment; one phase vs the whole build; direct staff vs staff and
contractors; a ministry's budget line vs the sector envelope; a company vs its
group.

## Why models and researchers fall into it

- **The unit matches**, so nothing trips a compatibility check. This is what
  makes scope collapse harder to catch than [FM-001](./FM-001-proxy-measure-contradiction.md).
- **Sources routinely omit the qualifier.** "The 63-kilometre highway" is how
  the figure is published; the qualifier lives in a document nobody quotes.
- **A large ratio looks like error.** Two numbers a factor of two apart feel like
  one must be a mistake, when a package containing feeder works genuinely is
  about twice its core.
- **Reconciliation looks like credulity.** Explaining why both numbers are right
  can read as defending the subject, while declaring a contradiction reads as
  scepticism.
- **The narrow figure flatters, the broad figure flatters differently.** Each
  side of a public argument has a reason to prefer one, and the researcher
  inherits the framing of whichever source they read first.

## Detection signals

- Two evidence records share `metric` and `unit` but differ in `scope`.
- A discrepancy is classified `GENUINE_CONTRADICTION` while the candidate
  classifications `DIFFERENT_SCOPE` and `DIFFERENT_DEFINITION` were never tested
  — the classification enum exists to force that test first.
- One figure is described with a qualifier ("main", "core", "phase 1") and the
  other without any.
- Component figures do not sum to either headline value — a sign that **more
  than two** scope definitions are circulating and only two are being compared.
- The reconciliation rests on a record that was never obtained.

## Harm if allowed

- A true statement is published as false, which is the most expensive kind of
  error a civic evidence engine can make.
- The inverse: a reconciliation is declared complete while unexplained figures
  are quietly dropped, so the graph looks tidier than the record.
- Scope ambiguity is frequently where the substantive question lives — *which*
  kilometres, *whose* budget, *which* phase. Collapsing it discards the
  investigation's most useful lead.
- Downstream arithmetic silently mixes extents, producing cost-per-unit and
  completion figures that are wrong in a way nobody can trace.

## Corrective behavior

1. Populate `Measurement.scope` on every claim and measured evidence record.
   An unqualified figure is a recorded ambiguity, not a default extent.
2. Before classifying any discrepancy `GENUINE_CONTRADICTION`, test
   `DIFFERENT_SCOPE`, `DIFFERENT_DEFINITION`, `DIFFERENT_PHASE`,
   `DIFFERENT_DATE` and `DIFFERENT_UNIT`, and record which were tested.
3. Look for the record that defines the extents. Planning documents, impact
   assessments and contractor scope records routinely separate core from
   components even when reporting does not — attach them as `CONTEXTUALIZES`.
4. Check that component figures **sum**. When they do not, say so rather than
   reconciling the two figures you happen to be holding.
5. Reconcile only as far as the evidence reaches. Record the residue explicitly
   and keep the gap open for the authoritative scope schedule.
6. Where the defining record was never obtained, cap confidence accordingly.

## Calibration cases demonstrating it

- [CAL-002 — Different scope is not contradiction](../cases/CAL-002-different-scope-is-not-contradiction.md)
- [CAL-006](../cases/CAL-006-unexplained-financial-bridge-remains-unresolved.md) — cost definitions collapse the same way extents do
