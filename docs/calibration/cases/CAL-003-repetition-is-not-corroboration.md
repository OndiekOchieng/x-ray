# CAL-003 — Repetition is not corroboration

**ID:** CAL-003
**Name:** Repetition is not corroboration
**Anchor:** the September 2026 status cluster (`SRC-017` → `SRC-018`, `SRC-019`, `SRC-020`)
**Governing invariant:** [XR-INV-004](../../architecture/validation-and-invariants.md#xr-inv-004--source-independence)
**Related failure mode:** [FM-003](../failure-modes/FM-003-source-count-inflation.md)

---

## Why this case exists

Corroboration is how confidence is supposed to be earned. Counting is how it is
most easily faked — usually without anyone intending to fake anything.

Three respectable outlets publishing the same figure *feels* like three
confirmations. It is one confirmation with three delivery vans. The distinction
is invisible unless provenance is modelled as structure, which is why
`SourceDependency` is an edge type and not a display grouping.

## Fixture references

| Kind | Ids |
| --- | --- |
| Originating record | `SRC-017` — Ministry of Interior project-status release, `ATTRIBUTED_ORIGIN_NOT_RETRIEVED` / `NOT_RETRIEVED` / `ORIGINATING` |
| Publications | `SRC-018` (People Daily), `SRC-019` (Radio47), `SRC-020` (The Star) — all `SECONDARY` / `REPEATING` |
| Dependency edges | `SD-001`, `SD-002`, `SD-003` — all `REPRODUCES`, confidence `HIGH` |
| Evidence | `EV-020`, `EV-021`, `EV-022` (`STRONG_INDIRECT`) vs `EV-024`, `EV-025` (`WEAK`) |
| Gap | `GAP-005` |
| Second cluster | `SRC-011` → `SRC-012`, `SRC-013`, `SRC-014` (`SD-004`…`SD-006`) |

## Situation

Between 9 and 11 September 2026, three separate newsrooms published the same
three lot progress figures — 20.2%, 34%, 28% — and the same three contract
values.

All three attribute the data to the same ministry project-status release. That
release itself was never obtained by either benchmark run.

The same pattern appears a second time in the corpus: a single KeNHA regional
briefing on 8 May 2026 (`SRC-011`) is the origin of the "KSh 16.7 billion",
"44 km" and "July 2027" figures carried by three further publications.

## Wrong instinct

> Three independent outlets report the same numbers. That is strong
> corroboration — grade the evidence `DIRECT` and raise confidence.

## Expected judgment

```text
publications                        = 3
independent originating observations = 1
```

Structurally:

- `SRC-017` is `ORIGINATING`; `SRC-018`, `SRC-019`, `SRC-020` are `REPEATING`.
- Three `REPRODUCES` edges (`SD-001`, `SD-002`, `SD-003`) point at the one origin.
- **At most one** publication carries evidence above `WEAK`. `SRC-018` — the most
  detailed reproduction — yields `EV-020`/`EV-021`/`EV-022` at
  `STRONG_INDIRECT`. `SRC-019` and `SRC-020` yield `EV-024` and `EV-025` at
  `WEAK`, recording that they reproduce rather than confirm.
- `GAP-005` stays open for the originating release.

## Why the expected judgment follows

Three newsrooms typing the same numbers is three acts of transcription, not
three acts of measurement. Nothing in the chain re-measured the road. If the
originating dataset is wrong, all three are wrong together and identically —
which is exactly the correlation independent corroboration is supposed to rule
out.

Marking the duplicates `WEAK` is not a slight on the outlets. It records what
their evidence *is*: attestation that the ministry said this, which is real and
worth having, and which is not the same as attestation that the figure is right.

The strength of the figures is therefore capped by the origin, not multiplied by
the number of publications. Since `SRC-017` was never obtained, the strongest
available grade for those figures is `STRONG_INDIRECT` — never `DIRECT`.

### Independent publication is not independent evidence

`SRC-019` and `SRC-020` *are* independent publications: separate newsrooms,
separate editorial decisions, no shared byline. That independence is real and
irrelevant. The question is not whether the publishers are independent of each
other but whether their **observations** are — and here there is one
observation.

### Dependency you cannot confirm

Provenance is not always knowable, and the fixture models that honestly:
`SD-011` and `SD-012` record a *suspected* shared itinerary behind `SRC-001` and
`SRC-022` at confidence `LOW`, with **no** `dependsOnSourceId`, because the
itinerary was never identified as a record.

An unconfirmed dependency is recorded as unconfirmed. It is neither promoted to
a fact nor dropped for being inconvenient.

## What evidence would change the judgment

- Retrieving the originating release (`GAP-005`) → the figures can be graded
  against the origin directly, and `SRC-017` becomes `RETRIEVED`.
- Evidence that one outlet independently verified the figures — its own site
  measurement, its own engineer's data — → that outlet becomes a second
  originating observation, and its evidence strength rises accordingly.
- Evidence that the outlets drew on *different* ministry releases → the
  dependency edges are wrong and independent-origin count rises.

## Related failure modes

- [FM-003 — Source-count inflation](../failure-modes/FM-003-source-count-inflation.md)
- [FM-004 — Absence to nonexistence](../failure-modes/FM-004-absence-to-nonexistence.md) (`SRC-017` is unobtained, not nonexistent)
