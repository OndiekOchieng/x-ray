# Issue #9, slice 9e — public library, metadata search, integrated lifecycle

The final implementation slice. Discovery moves off the frozen benchmark registry and
onto the publication boundary proven in 9b–9d.

## The rule

**Publication membership resolves before any graph read.**

```
publication history → currently discoverable published head → exact committed version → card
```

One query over publication state, grouped and replayed in memory with 9b's head rule.
Only lineages whose current head is `PUBLISHED` reach a projection. Drafts, withdrawn
heads and unpublished versions cause **zero canonical reads** — asserted by counting
them, not by inspecting the result.

## Nothing is stored

No library table, no stored card, no stored count. Every value on a card is derived
from the immutable exact-version projection at query time, so it cannot drift from the
graph it describes.

The projection behind a card is reused from 9d's cache because it cannot become wrong.
**Membership is never cached**: a withdrawal removes a lineage from discovery on the
next request, with no invalidation call.

## What changed

`getLibraryEntries` and `getFeaturedInvestigation` are gone. `publishedLibrary(query)`
and `featuredPublication()` live in `lib/xray/publication/public-library.ts` and are
**not** re-exported from `lib/xray/investigations.ts` — that module answers an internal
storage question, and the public one has its own trust boundary.

Cards link through the public namespace: `/xray/{slug}` to open, `/xray/{slug}/v{n}` to
cite. Nothing links discovery back to the internal explorer, and no card carries an
internal investigation id.

The library component's version-history disclosure was replaced with a citation
affordance. Version lineage is not a library-card field in #9, and rendering it would
have required data the card contract does not carry.

Search covers title, publisher, slug, protocol version and derived count ranges —
trimmed, case-insensitive, empty query returning everything. Ordering is current
publication act time descending with slug as a deterministic tie-breaker, never
committed version or internal id.

Featured is the first entry in that order. **An unpublished benchmark cannot become
featured merely by shipping in the repository**, which is what the old
`BENCHMARKS[0]` rule allowed.

## Two framework consequences

`app/library/page.tsx` and `app/page.tsx` call `connection()` before reading. Without
it the build prerenders them, which means asking storage a question at build time — and
a deployment with no database configured would fail the build rather than report itself
unavailable at runtime.

`version-cache.ts` needed a file-level `'use cache'` directive. Reached through a
dynamic import, the bundler could not otherwise tell it was server-only and rejected
the inline annotations.

## Preserved failed verification

**`first-attempt.txt` — 23/25.** Both failures were over-broad assertions, continuing
the pattern recorded in 9d.

**23** reported *"the library reads evidence content"*. It does not. The match was
`view.counts.claims` and `view.counts.evidence` — reading **counts**, which the card
contract requires. The check now bans prose *fields* (`.text`, `.proposition`,
`.rationale`, `.missingEvidence`) rather than the words, and the empirical probes —
searching claim, evidence, finding and gap prose, all returning nothing — were already
passing and remain the real proof.

**24/25** reported a stored display count. The column was
`disconfirmations.counter_hypothesis`, a #7 field caught by a `count_%` LIKE pattern.
The check now names any column it finds, so a future failure says which.

### A regression the accepted gates caught

Moving discovery initially re-exported `publishedLibrary` from
`lib/xray/investigations.ts`. **9c's proof 16 failed**: *"the #8 resolver acquired
publication semantics"*. It was right — the module that answers the internal storage
question had grown a public one. The fix was to correct the layering, not the check:
pages import the library from `lib/xray/publication/` directly, and 9c's assertion
passes unmodified.

## Checks

25 scenarios in `pnpm check:public-library` (`final-gate.txt`) covering all 34 released
proofs: empty library before and after a draft; the draft's deterministic slug
unsearchable; first publication producing one entry; card fields and all five counts
equal to the exact projection; a newer committed-but-unpublished version not moving the
card; publication and deliberate rollback moving it; withdrawal removing it while the
exact URL stays 410; republication restoring it; a historical non-head withdrawal
leaving the current card present; public-namespace links only; the benchmark absent and
unfeaturable; case-insensitive title, publisher and exact-slug search; empty query;
withdrawn entries unsearchable; evidence prose unsearchable; no discovery table or
stored display column; membership resolved before any canonical read; storage failure
propagating rather than emptying the library; and the full lifecycle with cache reuse.

The integrated lifecycle passes end to end:

```
publish     → alias 307, exact 200, card present
withdraw    → alias 410, exact 410, card absent
republish   → alias 307, exact 200, card present, zero recomputation
```

with no invalidation call anywhere.

## Regression

`check:public-routes`, `check:public-resolver`, `check:publication`, the five #7
persistence gates, `check:lifecycle`, `check:api-routes`, `check:inline-execution`,
`check:investigation-service`, `check:fixtures`, `tsc --noEmit` and `pnpm build`: all
pass.

## Not in 9e

No full-text evidence search, no ranking, no editorial-feature state, no
authentication, no ATI behaviour, no demo changes, no canonical library table.
