# Issue #9, slice 9f — public version lineage

Exists only to deliver the final undelivered scope item: *surface version lineage and
what changed between versions.*

## The design choice, and why it matters

Lineage lives at its own address:

```
/xray/{slug}/history
```

**Not** folded into the exact-version document. If it were, `/xray/{slug}/v2` would
gain a row the day v3 is published, and *"creating version N+1 cannot change the
rendered content of version N"* — a parent acceptance criterion — would stop being
true.

So the history surface is explicitly mutable and says so on the page: *"This page
reflects publication history and changes as new versions are published or withdrawn.
The version documents it links to do not."*

Proof 15 asserts it mechanically: the v2 document is captured, v3 is published, and the
v2 document is compared byte-for-byte. It is identical — while history did pick up v3.

## Routing, verified before assuming

Section B asked for the static `history` child to be verified against the dynamic
version matcher on a real build rather than assumed. It was, before any other mutation:

```
├ ƒ /xray/[slug]
├ ƒ /xray/[slug]/[version]
└ ƒ /xray/[slug]/history
```

## Publication first, as everywhere else

Only versions with at least one `PUBLISH` event appear. A committed v3 that was never
published is invisible **and costs no version read** — the reader never enumerates
committed versions and filters afterwards, so its absence is not inferable from a gap.

Unknown slug and a lineage with no public history produce the same not-found, so the
surface cannot be used as an oracle for draft existence.

## What a row says

Exact version and its citation URL, current presentation state, first publication date,
the immutable trigger, and counts: added sources, added evidence, re-evaluated claims,
plus recorded re-evaluation reason categories.

**No canonical ids.** Proof 7 probes for `SRC-NEW-2`, `EV-NEW-2`, `C001`, `C002`, the
investigation id and the run id in both the lineage object and the rendered page. The
public question is what changed, not which database keys moved.

## Withdrawal, rollback, republication

A withdrawn version stays in history marked `WITHDRAWN` and still links to its exact
URL, which resolves to the 410 tombstone — withdrawal does not erase that a version was
once published. `ERRONEOUS` notes are not copied here; the exact address remains the
authoritative tombstone.

The current indicator follows the presentation head from event replay, never
`MAX(version)`, so a deliberate rollback to v1 marks v1 as currently presented while v2
remains in history. Republishing the same version returns its existing row to
`PUBLISHED` rather than fabricating a second one.

## Cache posture

The history route is never cached — a publication or withdrawal shows on the next
request with no invalidation (proof 16). The per-version change summary is immutable and
may be cached by `(investigationId, version)`; membership and ordering are not part of
it.

## Checks

15 scenarios in `pnpm check:version-lineage` (`final-gate.txt`) covering all 22 released
proofs. It passed on the first run, so there is no preserved failure for this slice —
`first-attempt.txt` records that first run.

## Regression

`check:public-library`, `check:public-routes`, `check:public-resolver`,
`check:publication`, the five #7 persistence gates, `check:lifecycle`,
`check:api-routes`, `check:inline-execution`, `check:investigation-service`,
`check:fixtures`, `tsc --noEmit` and `pnpm build`: all pass.

## Not in 9f

No generated diff prose, no full-text search, no ranking, no auth, no ATI, no demo
changes, no publication schema change, no stored lineage table.
