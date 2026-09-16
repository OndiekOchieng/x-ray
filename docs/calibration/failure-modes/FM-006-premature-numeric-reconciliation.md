# FM-006 — Premature numeric reconciliation

**ID:** FM-006
**Name:** Premature numeric reconciliation
**Invariants:** [XR-INV-006](../../architecture/validation-and-invariants.md#xr-inv-006--missing-evidence-is-not-negative-evidence), [XR-INV-007](../../architecture/validation-and-invariants.md#xr-inv-007--findings-must-be-reversible)
**Demonstrated by:** [CAL-006](../cases/CAL-006-unexplained-financial-bridge-remains-unresolved.md)

---

## Error shape

Several values are on the record for one quantity. Rather than recording that
the relationship between them is unestablished, the investigation **picks one**,
or **invents the bridge** between them.

```text
V₁ ──?── V₂ ──?── V₃

resolved by preference:   "V₁ is primary, so V₂ and V₃ are wrong"
resolved by arithmetic:   "V₁ + plausible-unfound-component = V₃, so V₃ holds"
```

Both replace a missing record with a choice. The second is more dangerous
because it produces a number that survives review — the arithmetic checks out,
and the component that makes it work was never located.

Recurring instances: contract sum vs revised sum vs programme envelope;
headline cost vs cost-per-unit vs lifetime cost; reported vs restated financials;
census vs survey vs administrative counts; nominal vs real vs PPP figures.

## Why models and researchers fall into it

- **Both resolutions feel principled.** Preferring the primary record feels like
  rigour; preferring the current official figure feels like realism. Each has a
  respectable-sounding justification.
- **A near-miss is magnetic.** When a candidate explanation lands within a few
  percent, the residual reads as rounding rather than as the thing that is
  missing.
- **Unresolved reads as failure.** A finding that names four numbers and settles
  none looks like the investigation did not finish, so there is pressure to
  produce *a* number.
- **Downstream surfaces demand a scalar.** Cards, summaries and headlines have
  one slot for project value, and the slot pulls the finding toward a single
  figure.
- **Roundings inflate the apparent conflict.** Four published values may be two
  real ones, and treating all four as distinct invites reconciling something
  that was never in disagreement.

## Detection signals

- A finding selects among competing values without citing a record that states
  the relationship.
- A rationale contains "which would account for" or "consistent with" followed
  by a component that appears in the gap ledger rather than the evidence ledger.
- A discrepancy is marked `resolved: true` while the gap naming its resolving
  record is still `OPEN`.
- Values that are roundings of one another are counted as separate discrepant
  values.
- The reconciliation runs in the direction the investigator's prior favoured,
  and the opposite reconciliation was never tested.
- A finding asserts a figure is wrong purely because an older primary record
  gives a different one — a temporal error ([FM-005](./FM-005-temporal-promotion.md))
  wearing the clothes of rigour.

## Harm if allowed

- A fabricated figure enters the record with an audit trail that looks sound,
  and is then cited by others.
- The missing record stops being requested, because the question appears closed.
  This is the specific harm: the gap was the actionable output.
- Both error directions damage differently — declaring the official figure
  inflated is an unsupported accusation; accepting it via an unfound component
  launders it.
- It destroys reversibility. A finding built on an invented bridge cannot state
  what would overturn it, because what would overturn it is the record that was
  assumed.

## Corrective behavior

1. Collapse roundings **before** counting discrepancies. Establish how many
   distinct values are actually in play.
2. Name the real gap precisely — usually one step, between two specific values —
   rather than treating every pairing as disputed.
3. State what **is** established with its scope: "awarded works totalled X at
   award" and "Y is the figure in official use" are both establishable, and
   neither is "the project is worth Y".
4. Record candidate explanations as `CONTEXTUALIZES` evidence and as
   hypotheses in the disconfirmation record — never as findings.
5. Keep the discrepancy `resolved: false` and the gap `OPEN` until an
   authoritative record states the relationship.
6. Grade `UNRESOLVED` with `HIGH` confidence **in the insufficiency**. That is a
   definite finding, not a hedge, and it should read as one.
7. Require `wouldChangeFinding` to name the specific record. If it cannot, the
   reconciliation was a preference.
8. Let the gap drive the action layer — an eligible gap becomes a public-record
   request, which is how the question actually gets answered.

## Calibration cases demonstrating it

- [CAL-006 — Unexplained financial bridge remains unresolved](../cases/CAL-006-unexplained-financial-bridge-remains-unresolved.md)
- [CAL-004](../cases/CAL-004-not-located-is-not-nonexistent.md) — completing a bridge with an unfound record is absence-to-existence
- [CAL-002](../cases/CAL-002-different-scope-is-not-contradiction.md) — reconciling the main tension does not license dropping the residue
