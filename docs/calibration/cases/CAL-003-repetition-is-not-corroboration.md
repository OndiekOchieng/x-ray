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
| Multi-origin publication | `SRC-018` — `SD-001` to `SRC-017`, `SD-010` to `SRC-002` |
| Evidence provenance | `EP-012`–`EP-017` split `SRC-018`'s propositions between its two origins |
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

## The second boundary: one publication, several origins

Discovered while migrating the UI, and it is the sharper half of this case.

The counting above collapses three publications into one origin. The inverse
also happens: **a single publication can carry propositions from more than one
originating record.**

`SRC-018` (People Daily, 11 September 2026) does both at once. It reproduces
the ministry status release — and its lot contract values repeat the 2021
procurement award exactly, unrevised. Two dependency edges, correctly recorded:

```text
SRC-002  procurement award (2021)  ◄── DERIVED_FROM ── SRC-018 ── REPRODUCES ──► SRC-017  ministry release
```

Both edges are true of the **document**. Neither is true of every
**proposition** in it:

| Evidence | Proposition | Origin |
| --- | --- | --- |
| `EV-020`–`EV-022`, `EV-029` | lot progress 20.2% / 34% / 28% | `SRC-017` |
| `EV-009` | lot lengths 12.9 / 43.4 / 44.5 km | `SRC-017` |
| `EV-018` | lot values 5.19 / 4.96 / 5.72 bn | `SRC-002` |

### The wrong instinct, second form

> The publication depends on two originating records. Any claim drawing on it
> therefore rests on two independent observations.

### What went wrong

`DC001` rests on the progress figures alone (`EV-029`). Resolving its
independence from document lineage credited it with the procurement notice as
well — a record that never bore on it. The result:

```text
DC001    4 sources  →  5 "independent origins"
```

More origins than sources, which is impossible for genuinely independent
observations, and wrong in the direction that **overstates** corroboration.

### Expected judgment

Independence is evaluated **per proposition**, not per document:

```text
DC001    4 sources  →  3 confirmed independent origins  (SRC-017, SRC-015, SRC-005)
                    →  1 evidence point unresolved      (EV-032, origin unknown)
```

`SRC-002` no longer appears, because nothing DC001 rests on came from it. The
document-lineage view still shows both edges, which is correct for documents.

So the three quantities are all different, and only the last measures
corroboration:

```text
source count  ≠  publication count  ≠  independent evidence-origin count
```

### And unknown is not independent

`EV-032` comes from a source whose origin status is `UNKNOWN`, with no
provenance record. It is not counted as an independent observation — absence of
provenance is not evidence of originality, exactly as absence of a record is not
evidence of non-existence ([CAL-004](./CAL-004-not-located-is-not-nonexistent.md)).

Where any origin is unresolved or merely unidentified, **no independence count
is reported at all**. A partially-resolved number would be falsely precise.
`C004` illustrates the other form: both its origins trace to an itinerary
nobody identified, so it has zero *confirmed* independent observations and the
interface says "origin independence unresolved" rather than "0".

---

## What evidence would change the judgment

- Identifying the itinerary behind `C004`'s evidence → its `UNIDENTIFIED`
  origins resolve and an independence count becomes reportable.
- Establishing provenance for `EV-032` → `DC001`'s independence becomes fully
  resolved.
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
