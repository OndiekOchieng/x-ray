# Issue #11 slice 11c — make the evidence story legible

**Released from:** `13dc139`
**Gate:** `pnpm check:legibility` — **20/20**
**Rendered evidence:** `rendered-evidence.txt` (production build against the seeded PostgreSQL)
**Canonical data:** unchanged, and asserted unchanged

---

## What changed, and where

Presentation and projection only. Every user-visible sentence added here is
authored in a projection rather than in JSX, so the wording is testable — which
is the whole reason §L-style rules can be gates at all.

| Concern | Where the copy lives |
| --- | --- |
| origin vs provenance | `provenance-cluster.tsx`, `pipeline-stage.tsx`, `app/page.tsx` |
| the two axes | `provenance-view.ts` → `lineageLabel`, `independence.originLabel` |
| claim layer | `labels.ts` → `claimLayerLabel`, `claimLayerNote` |
| evidentiary reach | `receipt-view.ts` → `reachNote` |
| reversible finding | `finding-view.ts` → `reversibilityNote` |
| gap next step | `gap-view.ts` → `nextStep`, `offersRecordsRequest`, `searchNote` |
| public version | `public-html.ts` |

---

## A · origin for readers, provenance for the machine

`Origin` on screen; `provenance` in the domain, the schema, the invariants and
the projection type. `EvidenceProvenance`, `evidence_provenance` and
`ProvenanceView` are untouched — this was a wording rule, not a symbol rename,
and check 2 asserts all four survive.

**One real instance I had missed until the gate found it.** The landing hero read
*"…the claims, receipts, provenance, contradictions and missing evidence
underneath it"* — the single most-read sentence in the product. Now `origin`.

### How item 1 is actually decided, after two wrong attempts

The honest version of this is worth recording, because I got it wrong twice.

Extracting JSX text nodes and searching them produced false positives in both
directions: `'./provenance-cluster'` (a module path) and
`{ provenance }` (a destructured prop) read as copy, while
`{count} publications trace to 1 record` was invisible because braces broke the
text-node match. Stripping expressions innermost-out until stable was worse
still — once a ternary's inner expressions are gone, the outer one swallows the
text between the tags and **real copy disappears from the gate's view**, which
silently turned six checks green-to-red.

So item 1 is answered directly instead. The technical name is legitimate as a
module path, a prop, a field or a type, and illegitimate as prose, and those are
distinguishable by what sits beside it:

```text
./provenance-cluster     preceded by /              → identifier
provenance.sourceCount   followed by .              → identifier
provenance={…}           followed by =              → identifier
ProvenanceView           followed by a word char    → identifier
{ provenance }           destructured parameter     → identifier
{ provenance: View }     type annotation            → identifier
"…receipts, provenance, contradictions…"            → PROSE
"…provenance is recorded…"                          → PROSE
```

`visibleCopy` survives for the prose-matching checks, with a comment saying why
it is a single pass and must stay one.

---

## B · C001 without the numeric contradiction

11a's finding was that these two sentences sat adjacent and unlabelled:

```text
8 records traced · 3 repeat another record
8 independent originating observations
```

Now:

```text
Document lineage — 8 records traced · 3 of them repeat another record
Evidence origin — 8 independent originating observations for this claim
```

**Neither count changed**, and check 4 pins C001 at exactly
`[8, 3, 8, resolved]` — the values 11a measured. Check 5 pins C002 at
`[9, 5, 4]` and asserts its labels carry its own numbers.

The axes are genuinely different questions: the first counts **documents**
reproducing one another, the second counts **propositions** whose own origin
resolved. A publication that reproduces another record can still carry a
proposition whose origin resolves independently — which is why C001's two
numbers coincide and C002's differ.

### Why C001 was the wrong opening example, precisely

Adversarial variant **W2** collapses the two counts by feeding `sourceCount`
into the origin label. **C001 cannot detect it** — both its numbers are 8, so
the substitution is invisible there. Only C002 catches it.

That is the same property that made C001 read as a contradiction in the first
place, stated exactly: at C001 the two axes are numerically indistinguishable,
so nothing but the label tells them apart. Hence labelling rather than
reordering, per §D — the generic `claims[0]` ordering is untouched and no claim
id is hardcoded anywhere.

---

## C · the six calibration behaviours, and one mapping discrepancy to record

**The release's §C list and `docs/calibration/index.json` disagree on three
ids.** Recorded rather than silently resolved:

| id | `index.json` title | release §C description |
| --- | --- | --- |
| CAL-001 | Different measurement is not contradiction | observation / interpretation / meaning separation |
| CAL-004 | Not located is not nonexistent | institutional authority at actual evidentiary strength |
| CAL-005 | Scheduled is not occurred | missing evidence is not negative evidence |

I implemented the **union of behaviours** rather than choosing a reading. Item
13 forbids showing CAL ids anyway, so what matters is that each behaviour is
visible, and all of them now are:

| Behaviour | Where a judge sees it | Check |
| --- | --- | --- |
| layer separation | `Observation.` + *"A statement about something that can be checked against a record — not a reading of what it means."* beside the claim | 7 |
| measurement / scope mismatch | `Different scope` under *Discrepancies around this claim* | 8 |
| repetition is not corroboration | *"2 publications trace to 1 apparent originating record"* under `Evidence origin` | 9 |
| authority ≠ evidentiary strength | per-receipt reach note: *"A publication reporting on a record rather than the record itself"* vs *"The originating record itself, obtained and read."* | 10 |
| missing ≠ negative | *"X-Ray looked in 5 places without locating it. Not finding a record is not evidence that it does not exist."* | 11 |
| unresolved financial bridge | GAP-001, with what would settle it and why it matters | 12 |

### Two data limitations, stated rather than worked around

**Layer separation is explainable but not contrastable.** All six claims in the
corpus are `OBSERVATION`. The layer is now named and explained where a claim is
shown, so a reader learns the distinction — but no `INTERPRETATION` or `MEANING`
claim exists to contrast it against. Fixing that means changing the fixture,
which the stop line forbids.

**The sharpest authority-vs-strength case has nothing to render.** All 38
evidence records were `RETRIEVED`, and the corpus's four
`ATTRIBUTED_ORIGIN_NOT_RETRIEVED` sources carry no evidence point — so *"a
figure attributed to a record nobody obtained"* cannot appear. What the corpus
does carry is `SECONDARY` (28) / `PRIMARY_ADJACENT` (3) / `PRIMARY` (7), which
is the same behaviour at lower contrast. Wording for all four unobtained cases
(`NOT_LOCATED`, `NOT_RETRIEVED`, `DEAD_LINK`,
`ATTRIBUTED_ORIGIN_NOT_RETRIEVED`) **is authored and asserted present**, so the
day a corpus carries one it reads correctly. Check 10's own comment carries this
limitation.

---

## E · one h1

The explorer's sole `<h1>` is the article title; the selected claim became an
`<h2>`. Verified on the served page: **1 `h1`**, reading *"Inside Ruto's
five-day tour of Kisumu, Siaya, Migori and Homa Bay"*. Check 14/15 asserts both
the count and that the h1 is the title rather than whichever heading happens to
be first.

## F · findings read as reversible

The status box is now headed *Where the evidence stands* rather than *Finding*,
and carries: *"This is what the evidence supported when the research stopped,
not a verdict. It names below what would change it."*

Check 16 additionally refuses `X-Ray confirms`, `proven`, `verdict`, `truth
score`, `debunk` and `false claim` anywhere in the panel's copy, and requires
*What would change this finding* to be present — so the panel cannot pass by
removing the framing along with the claim.

## G · gaps state what happens now

Three questions, all three answered, with the third authored **per resolution
path** rather than as a binary:

| | |
| --- | --- |
| What is missing | `gap.missingEvidence` |
| What would settle it | `gap.recordsSought[0]` |
| What happens now | `gap.nextStep`, one sentence per path |

`PUBLIC_RECORD_REQUEST` → *"A public body should hold this record, so it can be
requested. X-Ray can draft the request; a person files it."* and the action
reads `Draft records request →`.

`WAIT_FOR_RECORD` → *"This needs a record of something that has not been
documented yet, so there is nothing to request."* and the action reads
`See what would settle this →`. Verified on GAP-003's served page: `Draft
records request` **absent**.

The action is gated on `gap.offersRecordsRequest`, which reads the domain's own
`resolutionPath` and never recomputes eligibility. Check 19/20 asserts the
gating is on the flag rather than on prose. All seven paths have authored copy,
not just the two the demo uses.

## H · the public exact version

It was missing the origin/independence distinction entirely — `Sources` with no
independence figure. Now:

```text
Claims · Records traced · Independent origins · Evidence · Open gaps

Records traced counts the publications read. Independent origins counts how many
times an assertion was observed independently — repetition is not corroboration,
so the second number is the one that says how well a claim is supported.
```

Claim rows already carried finding status, confidence band and open-gap count.
Check 22 asserts the page carries no ATI token and **no action control at all**
— no `<button>`, no `<form>`, no `onclick`. A published version is a document.

## I · source position

Unchanged. No fixture invention; the existing stored data carries no source
position for this lineage, so it stays outside the primary demo as D2 decided.

---

## Verification

| # | Item | Check |
| --- | --- | --- |
| 1 | no demo-facing `provenance` | 1 |
| 2 | internal terminology unchanged | 2 |
| 3 | C001 no longer a numeric contradiction | 3 · rendered §3 |
| 4 | C001 counts unchanged | 4 |
| 5 | C002 correct and legible | 5 |
| 6 | repetition and origin visibly distinct | 6 |
| 7–12 | the six behaviours visibly explainable | 7, 8, 9, 10, 11, 12 · rendered §2–§7 |
| 13 | no CAL identifiers displayed | 13 · rendered (0 occurrences across four pages) |
| 14 | explorer has exactly one h1 | 14/15 · rendered §2 |
| 15 | heading order coherent | 14/15 |
| 16 | findings not verdict badges | 16 · rendered §5 |
| 17 | gap states what is missing | 17/18 |
| 18 | gap states what would settle it | 17/18 · rendered §7 |
| 19 | `PUBLIC_RECORD_REQUEST` exposes the action | 19/20 · rendered §7 |
| 20 | `WAIT_FOR_RECORD` does not, and explains | 19/20 · rendered §8 |
| 21 | public version preserves the distinctions | 21 · rendered §9 |
| 22 | public version has no mutable ATI state | 22 · rendered §9 |
| 23 | canonical graph bytes unchanged | 23/24 |
| 24 | publication/version history unchanged | 23/24 · `check:publication`, `check:version-lineage` |
| 25 | #9/#10/11b regressions green | `final-gate.txt` |
| 26, 27 | typecheck, production build | `final-gate.txt` |

### The gate bites

`gate-bites.txt`, six variants:

| Variant | Caught by |
| --- | --- |
| **W1** flatten origin into vague `sources` | 1 and 3 |
| **W2** collapse traced into independent | 5 (**not** 4 — see above) |
| **W3** finding says *X-Ray confirms this claim* | 16 |
| **W4** missing-evidence says *No evidence exists* | 11 |
| **W5** `WAIT_FOR_RECORD` offers a records request | 19/20 |
| **W6** the claim becomes a second page-level h1 | 14/15 |

---

## One existing gate assertion changed

`check:ati-surface` (10e) asserted a hand-written sentence in `gap-detail.tsx`
that 11c replaced with authored per-path copy. It now asserts over
`gapView.nextStep` and `gapView.offersRecordsRequest` instead — that the two
paths state *different* next steps and that the waiting path's does not read as
a request. Stronger than before, and 18/18 after it.

## Stop line respected

No canonical data changes, no calibration fixture mutation, no source-position
invention, no responsive or focus pass (11d), no demo script or tagging (11e).

## Files

- `verification/issue-11-11c/rendered-evidence.txt` — the nine required surfaces, from the served HTML
- `verification/issue-11-11c/gate-bites.txt` — six adversarial wording variants
- `verification/issue-11-11c/final-gate.txt` — 20/20 plus the regression sweep
