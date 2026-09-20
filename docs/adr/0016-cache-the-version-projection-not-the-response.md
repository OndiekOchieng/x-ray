# ADR-0016 — Cache the Version Projection, Not the Public Response

**ADR:** 0016
**Status:** Accepted
**Date:** 2026-09-20
**Source:** Human decision D4 recorded in #9
**Supersedes:** —

## Context

#9 says not to restore static generation by reflex, and to use the immutability
model instead: immutable version, cache aggressively; alias, revalidate
deliberately.

Withdrawal changes the obvious reading of that. An investigation version is
immutable **as canonical research state** — #7's tables are insert-only and #8
proved v1 is byte-identical after v2 commits. Its *presentation state* is not
immutable at all: `/xray/{slug}/v{n}` can go from serving content to serving a
410 tombstone the moment a principal withdraws it
([ADR-0014](./0014-withdrawal-is-a-presentation-event.md)).

Caching the route response would therefore cache the one thing that can change,
and keep serving a withdrawn X-Ray after it was taken down.

## Decision

**The cached unit is the version projection keyed by
`(investigationId, version)` — never the public route response.**

Presentation state is resolved fresh on every request; the expensive immutable
part is what gets reused.

### v1 posture

| Surface | Posture |
| --- | --- |
| Exact immutable projection `(investigationId, version)` | Next.js function cache, long-lived |
| Alias `/xray/{slug}` | fresh resolution every request |
| Published alias | **temporary** redirect to the exact version address |
| Withdrawn alias | tombstone; no predecessor fallback |
| Exact-version route `/xray/{slug}/v{n}` | fresh publication-state check, then the cached projection **only if still publishable** |
| Library and search membership | fresh; may reuse the cached version projection internally |

The redirect is temporary on purpose. A permanent redirect is cached by clients
and intermediaries and would outlive a withdrawal, which is the same failure as
caching the response.

### Mechanism, for Next.js 16.3

- `use cache` with `cacheLife` is the stable Cache Components mechanism and is
  what carries the long-lived version projection.
- `revalidateTag(..., 'max')` is stale-while-revalidate. It is a poor fit for
  withdrawal correctness: "stale" here means a withdrawn X-Ray still being
  served while revalidation happens.
- `updateTag()` gives immediate expiry but is Server-Action-only, so it cannot
  be the general invalidation path for every publication-state change.

This is why the design does not lean on tag invalidation to make withdrawal
correct. Freshness of the *decision* is structural, not a race against a cache.

## Consequences

- A withdrawal takes effect on the next request, without depending on any
  invalidation firing.
- The costly work — reconstructing and projecting an immutable version — is
  still cached hard, so the posture is not "cache nothing".
- The same cached projection can serve the exact-version route, the alias
  target and the library entry, because it carries no presentation state.
- Public surfaces must not embed presentation state into the cached projection.
  Anything that can change on withdrawal belongs outside the cached unit.
- If tag invalidation is added later it is an optimisation, never the mechanism
  that makes withdrawal correct.
