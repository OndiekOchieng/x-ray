# ADR-0015 — Public Retrieval Is a Separate Trust Boundary

**ADR:** 0015
**Status:** Accepted
**Date:** 2026-09-20
**Source:** Human decision D7 recorded in #9
**Supersedes:** —

## Context

#8 built `getInvestigationGraph(id)` and gave it a tri-state resolution:
committed graph, known-without-committed-version, or unknown in storage. That
answers an internal question — *does this investigation have a committed graph
I may inspect?*

A public request asks something else entirely: *has an attributable publication
event made this exact public address presentable, and what is its current
presentation state?*

The tempting shortcut was to add `PUBLISHED` as a fourth branch to #8's
algebra. That would make one function answer two different trust questions.

## Decision

**Keep #8's committed-state resolver internal. Add a separate public
resolver.**

```text
public address
    ↓
publication history / public-address resolution
    ├─ never published / unknown      → NOT_PUBLIC
    ├─ currently withdrawn            → WITHDRAWN + tombstone metadata
    └─ currently published version N  → read immutable committed N
                                           ↓
                                      public projection
```

### The ordering is an invariant

**Publication authorization comes first.** A committed graph is never
reconstructed and then tested for publication.

Reversed, the public seam would have already crossed the draft boundary before
deciding the caller was not entitled to the graph. A committed-but-unpublished
v3 must stay completely invisible while the public alias still presents v2.

### Public non-leakage

At the public boundary these are deliberately indistinguishable, all producing
`NOT_PUBLIC`:

- the investigation does not exist;
- it exists but has never been published;
- a committed version exists but has never been published;
- the requested slug or version was never published.

A public caller cannot use the resolver as an oracle for draft existence. The
HTTP mapping may later choose a status code; the semantic rule is settled here.

Withdrawal is different, because publication history is itself public history.
An address that was published and is now withdrawn resolves `WITHDRAWN` and
presents the [ADR-0014](./0014-withdrawal-is-a-presentation-event.md)
tombstone. Canonical withdrawn content is not loaded for presentation under
`COMPELLED` or `PRIVACY_HARM`.

### Neither path consults commit arithmetic

Alias and exact-version lookups both resolve publication event history.
Neither reads `latestCommittedVersion` to decide what is public.

### Internal reads are unchanged and not widened

Research and administrative tooling may still inspect candidates,
committed-but-unpublished versions, execution state and historical versions.
That capability is not granted to anything merely because the public resolver
exists.

## Consequences

| #8 internal committed resolver | #9 public resolver |
| --- | --- |
| storage existence | publication eligibility |
| committed version | publication event history |
| candidate/admin capable | never candidate-capable |
| may see unpublished | cannot reveal unpublished |

- Public retrieval is **additive beside** #8, not a mutation of it. The
  tri-state resolution accepted in 8c keeps its meaning.
- Draft non-leakage is enforceable end to end, because nothing downstream ever
  receives an unpublished graph to filter.
- The same ordering binds the library and any future search index
  ([publication-and-cache.md](../architecture/publication-and-cache.md)).

Table shape, route syntax and cache mechanism are not decided here.
