# Publication Implementation Plan — 9b to 9e

**Status:** Committed
**Date:** 2026-09-20
**Issue:** #9 · semantics closed in slice 9a
**Baseline:** `55bab7f`

9a closed the semantics and recorded them as durable contract. This plan
sequences the persistence and runtime work that follows, in slices that each
end green and leave the repository worth keeping.

---

## What 9a settled

| Decision | Recorded in |
| --- | --- |
| Publication is an attributed append-only event; commit never publishes | [ADR-0013](../adr/0013-publication-is-an-attributed-event.md) |
| `Principal`, not `Actor`; attribution never enters the evidence graph | ADR-0013 |
| `PASS`, or eligible `BLOCKED` with blockers disclosed | ADR-0013 |
| Withdrawal changes presentation, never canonical state | [ADR-0014](../adr/0014-withdrawal-is-a-presentation-event.md) |
| `ERRONEOUS \| COMPELLED \| PRIVACY_HARM \| OUT_OF_SCOPE`; no `SUPERSEDED` | ADR-0014 |
| 410 tombstone, no predecessor fallback, never automatic | ADR-0014 |
| Publication resolves before any canonical read; draft existence unobservable | [ADR-0015](../adr/0015-public-retrieval-is-a-separate-trust-boundary.md) |
| Cache the version projection, never the route response | [ADR-0016](../adr/0016-cache-the-version-projection-not-the-response.md) |
| Slug per investigation lineage, no jurisdiction segment; alias is the presentation head | [publication-and-cache.md](../architecture/publication-and-cache.md) |
| Library projects published versions only; search over card fields only | publication-and-cache.md |

Deliberately still open, and owned by the slice that needs them: slug minting
algorithm and collision handling (9b), and public display of a principal
label (9d).

---

## 9b — Publication event store

**Delivers** the durable publication history and the slug namespace. No routes,
no cache, no UI.

- Migration adding an append-only publication event table keyed to
  `(investigation, version)`, carrying act, principal, time and reason.
  Insert-only, in the same discipline as the #7 version tables.
- Slug allocation: minted at first publication, unique, immutable, owned by the
  lineage, never freed by withdrawal.
- A command layer that records publish, withdraw and republish, refusing any
  act with no attributable principal.
- Derived resolution of the **current presentation head** from event history —
  never stored beside it, never `max(version)`.

**Checkpoint.** The example sequence in publication-and-cache.md replays through
the store and produces the stated head at every step, including the rollback
and republication tail.

**Rollback.** Additive migration plus one new module. Nothing existing changes.

**Verification gate.** Append-only enforced against UPDATE and DELETE; a
withdrawn slug cannot be reused or inherited; an act without a principal is
rejected; `commitNextVersion` still passes untouched.

---

## 9c — Public resolver

**Delivers** the ADR-0015 boundary as executable code, beside #8's resolver.

- A public resolver that takes a public address and resolves publication state
  first, reading canonical version state only when presentation permits.
- `NOT_PUBLIC` collapses never-existed, never-published and
  committed-but-unpublished into one indistinguishable outcome.
- `WITHDRAWN` carries tombstone metadata and does **not** load canonical
  content under `COMPELLED` or `PRIVACY_HARM`.
- `getInvestigationGraph` is untouched; no `PUBLISHED` branch is added to it.

**Checkpoint.** A committed-but-unpublished v3 is invisible to the public
resolver while the alias still presents v2.

**Rollback.** Additive module.

**Verification gate.** An adversarial check proves the ordering: instrument the
canonical read and assert it is never reached for a `NOT_PUBLIC` address. Prove
the four non-leakage cases are indistinguishable in the resolver's output.

---

## 9d — Public routes, projection cache and tombstone

**Delivers** the public surface and the ADR-0016 cache posture.

- `/xray/{slug}` and `/xray/{slug}/v{n}`.
- Version projection cached by `(investigationId, version)` via `use cache` /
  `cacheLife`; presentation state resolved fresh on every request.
- Published alias issues a **temporary** redirect to the exact version.
- Withdrawn addresses return 410 with a tombstone carrying act, date and reason
  class — and, for `ERRONEOUS`, what was wrong.
- The tombstone is written as a synthesis surface under the responsible-sharing
  rule.

**Checkpoint.** Withdrawing a published version changes the next request
without any invalidation firing.

**Rollback.** New routes plus a cached projection function; the existing
`/xray/[id]` internal route is unaffected.

**Verification gate.** Serve a version, withdraw it, and prove the very next
request is a tombstone. Prove no cached artifact carries presentation state.
Prove the alias redirect is temporary. Sweep every public payload for draft
leakage, SQL, prompts, principal identity and internal error text.

---

## 9e — Library, search and integrated gate

**Delivers** the public discovery surface and the slice's integrated proof.

- `getLibraryEntries` and featured selection move from the benchmark registry
  to published versions, resolving publication before reading any graph.
- Search and filter over library-card fields only.
- Withdrawn versions leave ordinary library membership; republication restores
  it; no re-graduation or capability state moves membership.
- Integrated gate: publish → appear in library → cite the exact version →
  withdraw → tombstone and disappear from discovery → republish → return.

**Checkpoint.** The benchmark remains reachable by its explicit path and never
appears as a published investigation it is not.

**Rollback.** Touches `lib/xray/investigations.ts` library/featured functions;
the tri-state committed resolver from 8c is not modified.

**Verification gate.** A committed-but-unpublished investigation contributes
nothing to the library or to search. No stored library card exists. Full
regression: the #7, #8 and fixture gates plus `tsc --noEmit` and `pnpm build`.

---

## Sequencing

```text
9b ──► 9c ──► 9d ──► 9e
```

Strictly sequential. 9c cannot resolve publication state without the event
store, 9d cannot cache a projection it cannot authorise, and 9e's integrated
gate exercises all three.

## Out of scope for #9

ATI lifecycle (#10), the demo path (#11), authentication, accounts, sessions,
roles or permissions, free-text search over evidence content, and any read
model or search index beyond the derived-infrastructure allowance recorded in
publication-and-cache.md.
