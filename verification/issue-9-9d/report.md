# Issue #9, slice 9d — public routes, tombstone and immutable projection cache

The public HTTP surface over the accepted 9b/9c contracts. 9e stays locked.

## Addressing — the approved move

```
/investigations/{id}      internal explorer (moved)
/xray/{slug}              public alias
/xray/{slug}/v{n}         citation-grade address
```

`app/xray/[id]` moved to `app/investigations/[id]`. The page body is unchanged — same
`getExplorerPayload(id)` seam, same `notFound()` behaviour — and a check asserts it
gained no publication semantics.

One line was added, so "only the address moved" needs qualifying honestly:
`export const instant = false`. Enabling Cache Components made prerendering fail for
every existing dynamic page, and that declaration states what the route already did
rather than changing it. The same line was added to `/investigation/[id]` and
`/gap/[id]` for the same reason. No loader, no behaviour and no semantics moved with it.

Three components' `href`s were updated; no other genuine reference existed.

## Two decisions the framework forced

**The public surface is route handlers, not pages.** A withdrawn address must answer
**410 Gone** (ADR-0014), and a Next.js `page.tsx` has no supported way to set an
arbitrary status — `notFound()` gives 404 and nothing gives 410. Route handlers control
status exactly, so the public documents are self-contained HTML with one inline
stylesheet. That is also the right shape for a cached public artifact.

**Cache Components is a global switch.** Enabling `cacheComponents: true` made every
existing dynamic page fail prerendering. Each affected route now declares
`export const instant = false`, which states what those routes already did — they
rendered per request before and still do. No behaviour changed; the #9 cache boundary
is the immutable projection, never an internal page.

## The cache boundary

`cacheLife('max')` in Next 16.3 is `revalidate: 30 days, expire: never` — the
long-lived posture ADR-0016 calls for on a value that cannot become wrong, because #7's
version tables are insert-only.

The wrappers in `version-cache.ts` are deliberately thin. All logic lives in
`public-view.ts`, which imports no bundler-only module — `next/cache` cannot be resolved
outside the Next build, so keeping the logic importable is what lets route behaviour be
proven without a running server.

The cached value is keyed on exactly `(investigationId, version)` and carries no
publication state, withdrawal state, alias target, latest-version pointer, library
membership or principal. **That is why withdrawal needs no invalidation: the thing that
changes was never in the cache.**

No response declares itself permanently immutable. Every public response sends
`cache-control: no-store`, because the same exact URL can become a tombstone.

## The cache-correctness proof

The harness installs a projection that **memoizes forever and never expires** —
stricter than `cacheLife('max')`. If withdrawal still takes effect on the next request
under that, it does so because presentation state was never cached, not because a cache
happened to be cold. The memo's hit count is asserted during the lifecycle, so the
cache is demonstrably live rather than accidentally bypassed.

```
publish v2 → 200
withdraw v2 → next request 410        (no invalidation call between them)
republish v2 → 200, cache hits only, zero recomputation
```

The same holds for the alias: 307 → 410 → 307.

## Tombstones

410 Gone, never 404. The four reasons keep their distinctions in the copy:
`ERRONEOUS` retracts and carries the recorded note; `COMPELLED` states removal under
compulsion and explicitly does not concede an error; `PRIVACY_HARM` says the decision
is about presentation, not correctness; `OUT_OF_SCOPE` is a judgment about what X-Ray
publishes. Checks assert `COMPELLED` neither concedes error nor insinuates suppression,
and that no tombstone re-serves withdrawn content.

## Principal

No public payload carries a raw principal id. The public documents never read one, and
the check verifies both the rendered output across all 39 captured responses and the
document source.

## Preserved failed verification

**`first-attempt.txt` — 26/29.** All three failures were my assertions, and two repeated
the same mistake in a new place.

**17** reported *"the projection carries a principal"*. It does not. `/principal/i` hit
the claim text again — *"The principal/main road corridor is approximately 63 km"* —
exactly the 9c false positive, in a new check. It now inspects field **names** and
publication-only values.

**22** reported a permanent redirect status in the route. The route sends 307; the match
was its own doc comment, *"307, never 308"*. Comment-stripped, like the 9c fix.

**18** asserted that two lineages project differently. They do not, and should not: the
projection deliberately carries no investigation id, so two lineages built from the same
corpus project identically by content. Content equality proves nothing about keying, so
the check now observes the cache key directly — a new `(investigation, version)` pair
misses, a repeat hits.

Repeating the prose-versus-field-name error twice is worth recording: the fix is to
assert over structure, not over rendered text, whenever canonical content is in scope.

## Remediation — the assurance lookup was not exact

Review found a real defect, and it was the worst kind: it invented assurance.

`loadAssuranceDisclosure` called `readLatestGraduation(runId)` and then checked whether
that latest row *happened* to carry the requested index. Two things follow, and both
were reproduced before fixing (`exact-assessment-failure.txt`):

```
FAIL  a later appended assessment cannot displace the authorizing one
        -> the later assessment displaced the authorizing one (0 blockers)
FAIL  a missing authorizing assessment is a failure, not invented assurance
        -> produced {"verdict":"BLOCKED","unavailableChecks":[]} instead of failing
```

Assessments are append-only, so "latest" and "the one that authorized this publication"
diverge the moment another is appended. When the index did not match, the fallback
returned `BLOCKED` **with an empty blocker list** — which renders as no disclosure
section at all. A published version whose assurance could not be accounted for would
have been shown as though there were nothing to report, and then cached under
`cacheLife('max')`.

That is the exact failure this system exists to prevent, arriving through a defensive
default. 9b bound publication to an exact `(executionRunId, graduationIndex)` pair
precisely so a reader gets the assessment that actually authorized what they are
looking at.

**The fix.** `readGraduation(db, runId, index)` is added beside `readLatestGraduation`
as an exact lookup, and the disclosure uses it. A missing exact row now throws
`MissingAuthorizingAssessment`, which the route turns into a generic 503 — an integrity
failure, never invented assurance and never a cached empty disclosure.

No schema change was needed, as the review expected.

**The proof.** Assessment 0 authorizes publication and records blockers; assessment 1 is
then appended to the same run carrying none. The page must still disclose assessment 0's
blockers, and a request for an absent assessment must fail rather than answer.

## Checks

31 scenarios in `pnpm check:public-routes` (`final-gate.txt`), covering every released
proof: not-found with no draft hint and the real would-be draft slug behaving
identically; temporary redirect ignoring a newer committed-but-unpublished version;
exact published rendering; never-published and malformed segments not-found; withdrawn
exact and withdrawn head; historical withdrawal leaving the alias alone; all four reason
copies; no principal anywhere; `BLOCKED` disclosure read from the persisted graduation
record with nothing copied into publication state; cached projection free of
presentation state and keyed exactly; the withdraw/republish lifecycle with no
invalidation; temporary-redirect semantics; canonical link at the version URL; cutoff,
protocol and version context; newer versions not mutating older rendered ones; outage
producing a generic failure rather than not-found; the internal route unchanged; no
fixture reachable from any public path; and no permanently-immutable response.

## Regression

`check:public-resolver`, `check:publication`, `check:persistence-versioning`,
`check:persistence-graduation`, `check:persistence-workspace`,
`check:persistence-audit`, `check:persistence-durable-integration`, `check:lifecycle`,
`check:api-routes`, `check:inline-execution`, `check:investigation-service`,
`check:fixtures`, `tsc --noEmit` and `pnpm build` all pass. Both public routes build as
dynamic handlers.

## Not in 9d

No library or featured source change, no search or filter, no publication event schema
change, no slug semantics change, no authentication or roles, no ATI behaviour.
