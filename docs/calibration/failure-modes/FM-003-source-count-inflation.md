# FM-003 — Source-count inflation

**ID:** FM-003
**Name:** Source-count inflation
**Invariant:** [XR-INV-004](../../architecture/validation-and-invariants.md#xr-inv-004--source-independence)
**Demonstrated by:** [CAL-003](../cases/CAL-003-repetition-is-not-corroboration.md)

---

## Error shape

The number of **publications** carrying an assertion is treated as the number of
**independent observations** supporting it. Confidence scales with a count that
measures distribution, not verification.

```text
one originating observation
        │
   ┌────┼────┐
   ▼    ▼    ▼
  P₁   P₂   P₃          reported as "three independent sources"
```

Recurring instances: a press release syndicated across outlets; a wire story
rewritten; a dataset republished by aggregators; a spokesperson quoted at one
briefing by everyone present; a figure that entered circulation once and is now
"widely reported"; several studies re-analysing one cohort.

### The multi-origin variant

The same error runs backwards. One publication carries propositions from
several originating records, and a claim resting on **one** of them is credited
with **all** of them:

```text
        origin A          origin B
             \              /
              publication P
                    │
          proposition drawn from A
                    │
                    ▼
                 claim X          ← credited with A *and* B
```

The tell is arithmetically impossible output: **more independent origins than
sources**. Genuinely independent observations cannot outnumber the records
carrying them.

This is why provenance has to be modelled at the proposition level for
corroboration purposes. Document lineage is correct about documents and
insufficient about claims:

```text
source count  ≠  publication count  ≠  independent evidence-origin count
```

## Why models and researchers fall into it

- **Independence of publisher is real and irrelevant.** Separate mastheads,
  separate bylines, no shared ownership — all true, and none of it means two
  measurements happened.
- **Counting is cheap; tracing is expensive.** Establishing that three reports
  share an origin means reading all three for attribution and often failing to
  obtain the origin itself.
- **Repetition creates familiarity**, and familiarity is experienced as
  corroboration. The fourth time a figure appears it simply feels established.
- **Attribution is frequently vague.** "According to officials" gives nothing to
  trace, so the dependency is invisible rather than absent.
- **Volume reads as diligence.** A finding citing eight sources looks better
  researched than one citing two, regardless of how many observations it rests
  on.

## Detection signals

- Several sources publish the **same distinctive values** — the same decimals,
  the same rounding, the same ordering. Independent measurements do not agree to
  one decimal place by accident.
- Publication dates cluster within days of one event.
- Sources attribute to the same actor, briefing, release or dataset.
- No source describes its own method of obtaining the figure.
- The evidence set contains multiple `STRONG_INDIRECT` or `DIRECT` records whose
  sources are marked `REPEATING`.
- An `ORIGINATING` source exists in the graph with **no** dependency edges
  pointing at it, while several publications carry its figures.
- **Independent origins outnumber sources for a claim.** Always a bug; the
  usual cause is resolving claim independence from document lineage while a
  source is multi-origin.
- A source with two or more outgoing dependency edges whose evidence carries no
  proposition-level provenance — its origins cannot be apportioned.

## Harm if allowed

- Confidence inflates without any increase in evidence. A finding reaches `HIGH`
  on one unverified observation.
- **Correlated failure.** If the origin is wrong, every dependent publication is
  wrong identically — which is the precise risk independent corroboration is
  supposed to eliminate, so the inflated count removes the protection while
  appearing to provide it.
- Effort is misdirected: the investigation collects more repetitions instead of
  pursuing the origin, and the gap that matters never gets opened.
- Errors become self-reinforcing. A figure with many citations resists
  correction long after its origin is shown to be mistaken.

## Corrective behavior

1. Model provenance as **edges between sources**, not as a grouping in a view.
   `REPRODUCES`, `QUOTES`, `ATTRIBUTES_TO`, `DERIVED_FROM`, `SAME_EVENT`,
   `PROBABLE_COMMON_ORIGIN`.
2. Mark `originStatus` on every source. A `REPEATING` source is a publication,
   not an observation.
3. Let **at most one** publication in a dependency cluster carry evidence above
   `WEAK` — normally the most detailed reproduction. The rest record that they
   reproduce.
4. Cap strength at the origin. Where the originating record was never obtained,
   nothing derived from it can be `DIRECT`.
5. Open a gap for the originating record and name it.
6. Record **unconfirmed** dependency as unconfirmed: `PROBABLE_COMMON_ORIGIN` at
   `LOW` confidence, with `originDescription` and no `dependsOnSourceId` when the
   origin was never identified as a record. Suspected provenance is neither
   promoted to fact nor dropped.
7. Resolve claim-level independence from **proposition-level** provenance, not
   from document lineage. Keep both: lineage answers document questions and
   drives cluster display; proposition provenance answers corroboration.
8. Never let absence stand for independence. Evidence with no provenance is
   independent only if its own source originates; otherwise its independence is
   unresolved, and an unidentified origin is not an independent one.
9. Where any origin is unresolved, report **no count** rather than a
   partially-resolved one. "Origin independence unresolved" is honest; a
   precise-looking number is not.
10. Report "N publications, M independent origins" rather than "N sources"
    wherever a count is surfaced.

## Calibration cases demonstrating it

- [CAL-003 — Repetition is not corroboration](../cases/CAL-003-repetition-is-not-corroboration.md), including its multi-origin boundary
- [CAL-004](../cases/CAL-004-not-located-is-not-nonexistent.md) — the unobtained origin is unobtained, not nonexistent
