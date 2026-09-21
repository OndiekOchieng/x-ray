# 20 — Source identity and Surface Source Isolation

Branch `feat/live-provider-composition`, from `6700013` (first light).
Fixes only the defect first light exposed as Finding 4. No other behaviour
changed.

## The rule, as decided

**Same normalised locator + same stage-computed content hash, in one run = one
canonical `Source`.** A search rediscovery is a retrieval fact, not a second
canonical identity.

| | |
|---|---|
| locator differs | two `Source`s — never collapsed on hash alone |
| same locator, hash differs | two `Source`s — a changed record is a new observation |
| either hash missing | two `Source`s — identity is established, never assumed |

## Why this was an invariant defect, not a tidiness one

This is the part worth stating first, because it changes how serious Finding 4
was. `validateEpistemics` enforces XR-INV-001 like this:

```ts
for (const e of graph.evidence) {
  if (e.sourceId !== surfaceSourceId) continue
  …  // Evidence drawn from the surface source bearing on a SURFACE claim
}
```

First light had `surfaceSourceId = 'SRC-001'` and all three evidence items
citing `SRC-006` — **the same artifact under a second id**. So the duplicate
did not merely waste a row: it **laundered the surface record past a
DETERMINISTIC invariant**. The article became evidence for a claim decomposed
out of itself, and validation was structurally unable to see it.

One artifact, one id, is what makes that comparison sound. **Nothing in the
validator changed** — the fix restores the precondition the invariant was
always written against.

## What was changed

Two decisions turn on identity, and they answer different questions:

- **`sameArtifact()`** — *"have I already got this?"* Consulted before minting,
  against `ctx.graph.sources` **and** the `Source`s this stage minted a moment
  ago, so two claims whose searches both find the same corroborating record
  share one identity.
- **`isSurfaceArtifact()`** — *"is this the article under investigation?"* The
  surface artifact is **withheld from the material offered** for a `SURFACE`
  claim, so it cannot be cited because it is never shown.

Prevention at the material boundary, not repair afterwards — and never repair
by `PROVENANCE`, which decides lineage and is not an identity-fixing stage.

`contentHash` is now the **stage-computed** digest (`hashExtract` over the
extract actually held) rather than the adapter's advisory one, in both `INGEST`
and `TRACE`. The port already says the stage's value is authoritative; identity
relies on it, so the stage computes it.

### Withholding survives a resume

`RunMaterial` is per-plan and in memory, so a resumed run has no surface
document in hand. Withholding therefore consults the **graph's** surface
`Source` as well — it carries the locator and the stage-computed hash, which is
all the comparison needs. Without that, withholding would quietly stop working
exactly on resume, while the graph still holds `SRC-001` and a search can still
rediscover it.

### The rediscovery stays visible

The search *did* find the article, and that remains recorded — as
**non-canonical run material**, not as a second `Source`:

- `GatheredMaterial.rediscovered` — locators discovery returned that the run
  already held;
- `stats.reused` — records satisfied from material in hand;
- `RunMaterial.withheldSurfaceOffers` — how many times the surface artifact was
  withheld from a `SURFACE` claim.

That last one matters for honesty: *"we did not use the article as evidence for
its own claim"* is a research decision, not an absence.

### No second fetch

A rediscovered locator already in hand is satisfied from that material rather
than re-fetched. First light paid for a 28 KB document twice; it now fetches it
once. The handle stays discovery's, so a proposal citing it still means what
the search found.

## Gate

`pnpm check:live-runtime` — **34/34**.

| Check | |
|---|---|
| **26** | the exact first-light shape: one `Source` for the identical artifact, no `SURFACE`-claim evidence from it, `XR-INV-001` clean under `STAGED` validation, rediscovery recorded, one fetch, and corroborating material still got through |
| **26b** | the changed-content rule, at the predicate |
| **26c** | two mirrored URLs serving identical bytes stay two `Source`s, with no dependency inferred |
| **26d** | one corroborator found by two claims' searches yields one `Source` |
| **26e** | a resumed run still withholds the surface artifact, *and withholding is what did it* |

### Negative controls

| Control | Result |
|---|---|
| AN · dedup removed from the minting loop | FAIL 26d — `2 Sources: SRC-002, SRC-003` |
| AO · the surface artifact no longer withheld | FAIL 26 |
| AP · identity collapses on locator alone | FAIL 26b |
| AQ · identity collapses on hash alone | FAIL 26b, 26c |
| AR · rediscovered material re-fetched not reused | FAIL 26 |
| AT · withholding consults only in-memory material | FAIL 26e |
| **AS · the XR-INV-001 backstop removed** | **no check fails** |

**AS is reported as a gap, not hidden.** Withholding always wins, so no check
distinguishes the backstop's absence. It is kept deliberately as defence in
depth — the cost of being wrong is an invariant breach that validation cannot
see — and AT is the evidence it is *functional*: with graph-based withholding
removed, 26e's failure message reads *"only the backstop caught it"*, which is
the backstop firing and preventing the violation. Per the 20d lesson about
untested recovery paths I considered removing it, and kept it with this fact
recorded rather than claiming coverage it does not have.

## Defects found while fixing this

- **Check 26 passed while dedup was not implemented.** The minting-loop edit
  was a silent `.replace()` no-op — the fourth in this project — and I did not
  notice, because withholding alone satisfies the first-light shape. Check
  **26d** exists specifically to isolate the dedup mechanism from the
  withholding one, and control AN proves it does.
- **`DECOMPOSE` identified the surface record positionally.** It read
  `ctx.graph.sources[0]`, which is correct only for a fresh run; a seeded or
  resumed run carries the predecessor's sources and index 0 is then whichever
  record came first. Now resolved by `investigation.surfaceSourceId` — the same
  class of mistake as Finding 4 itself: an artifact identified by something
  other than its id.
- **Two fixtures that tested nothing.** 26b's first version could not reproduce
  the changed-content case at all (reuse means one locator yields one set of
  bytes within a run; and a seeded *initial* run fails INGEST with
  `DANGLING_REFERENCE`, because `submittedInvestigation` fixes
  `surfaceSourceId` to `SRC-001` while a seeded allocator mints a different
  first id). 26e's first version ran `DECOMPOSE`, which reported a capability
  gap for want of the surface document, so there were no claims and `TRACE`
  never ran.
- **Check 13's exclusion rule lagged the convention again.** The 20e
  first-light runner in `verification/` composes providers on purpose and was
  flagged as application code. Excluded, and named in the source — this is the
  third such exclusion in this project, after the `DOES_NOT_EXIST` comment scan
  and the `checks.ts` filename.

## Regression

Typecheck clean, **40 gates green**, including `check:validation` and
`check:acceptance` over the invariant this fix restores the precondition for.
`check:providers` 22/22, `check:anthropic-adapters` 28/28,
`check:anthropic-retrieval` 29/29.

## What this does not do

- **No independence is inferred.** Two mirrored URLs stay two `Source`s and no
  `SourceDependency` is written (check 26c). Collapsing on content alone would
  be a lineage judgement, which is `PROVENANCE`'s and which it still cannot
  make for want of printed attribution.
- **XR-INV-001 and XR-INV-004 are untouched.** No validator changed.
- **The changed-content case is proven at the predicate, not end to end.** The
  scenario that produces it is a re-evaluation seeded from a committed
  predecessor, and `liveRuntime` deliberately does not implement
  `reevaluation` (20d). Recorded as unreachable until re-evaluation is
  composed, rather than asserted with a fixture that does not reach it.
- **First light's other findings stand.** Query construction (Finding 3),
  the missing initial-run graduation path and reviewer reachability (Finding 5),
  and the schema-strictness policy (Finding 1) are untouched.
