# ADR-0014 — Withdrawal Is a Presentation Event, Not an Erasure

**ADR:** 0014
**Status:** Accepted
**Date:** 2026-09-20
**Source:** Human decisions recorded in #9, "9a decisions — publication and withdrawal semantics"
**Supersedes:** —

## Context

X-Ray will publish statements about public spending, public records and named
institutions. Some of them will need to come down — because they were wrong,
because removal was compelled, because a person would be harmed, or because
they should not have been published under X-Ray's own rules.

Nothing in the system addressed this. `publication-and-cache.md` described how
a version is served and how versions accumulate; it never described a published
X-Ray ceasing to be presented.

Two existing constraints rule out the obvious answers before any design starts.
Version tables are insert-only, so withdrawal cannot delete canonical state.
And published URLs get cited, so a withdrawn address that stops resolving turns
a citation into ambiguity a reader will fill in themselves.

## Decision

**Withdrawal is an append-only publication event that changes what a reader is
shown. It never changes what happened.**

Like publication, it names a `Principal` ([ADR-0013](./0013-publication-is-an-attributed-event.md)).

### Withdrawal reasons are a closed, named set

```text
ERRONEOUS | COMPELLED | PRIVACY_HARM | OUT_OF_SCOPE
```

| Reason | What X-Ray is saying |
| --- | --- |
| `ERRONEOUS` | The published artifact contains a material error warranting retraction. X-Ray owns it. |
| `COMPELLED` | Removed under legal or platform compulsion. X-Ray is **not** conceding error. |
| `PRIVACY_HARM` | Removed to prevent harm to a person. Not a statement about the evidence. |
| `OUT_OF_SCOPE` | Should not have been published under X-Ray's own rules. |

A single undifferentiated "withdrawn" state was rejected. Collapsing
`ERRONEOUS` and `COMPELLED` is dishonest in both directions at once: it lets
X-Ray disown work it still stands behind, or concede an error it has not found.
A system whose entire thesis is that distinct epistemic states must stay
distinct cannot have one undifferentiated takedown.

`ERRONEOUS` is scoped to the **published artifact containing a material error
warranting retraction** — not specifically to a finding being wrong. A material
error in framing, attribution or presentation warrants retraction just as a
mistaken grade does.

### Superseding is not withdrawal

Publishing v2 leaves v1 historically addressable. That is
[investigation-versioning](../architecture/investigation-versioning.md) working
as designed, and *"what accumulates across versions is the evidence, not the
conclusion"*. Marking v1 withdrawn because v2 exists would present ordinary
research progress as a problem.

`SUPERSEDED` is therefore **not** a withdrawal reason.

### A withdrawn address stays resolvable

A withdrawn version responds **410 Gone with a tombstone**, never 404.

The tombstone carries that the X-Ray was withdrawn, when, and the reason class.
For `ERRONEOUS` it carries what was wrong. It does **not** re-serve the
withdrawn content under `COMPELLED` or `PRIVACY_HARM`, which would defeat the
withdrawal it is announcing.

A 404 was rejected: it pretends the statement never existed, and a reader
holding a citation is left to conclude whatever they like.

### The alias does not fall back

Withdrawing the latest published version sends the alias to the tombstone. It
does **not** silently fall back to the previous published version — that would
resurrect an older statement the principal may also not stand behind, and under
`ERRONEOUS` or `PRIVACY_HARM` the predecessor likely shares the defect.

Re-pointing the alias at an earlier version is a separate, deliberate act.

### Withdrawal is reversible, and both events remain

A withdrawal that is later resolved is followed by a republication event. Every
event is retained; none is rewritten. A precautionary withdrawal should be
visible as exactly that.

### Withdrawal is never automatic

No assessment, re-graduation, validation result or capability gap may withdraw
a published version.

The specific hazard is worth naming. With no reviewer model wired, every
re-assessment returns `BLOCKED`. An automatic rule would mean an unconfigured
adapter silently retracts published civic evidence — which is #5's
`BLOCKED`-is-not-`FAIL` distinction failing at the one tier where the public can
see it.

### The tombstone is a synthesis surface

A withdrawal notice is generated prose about an investigation and often about a
named institution or person, so it sits below the projection boundary with
share cards and ATI drafts.

It is bound by the same rule: a withdrawal must not become an accusation by
implication. `COMPELLED` in particular must be worded so that it neither
concedes error nor insinuates suppression.

## Consequences

- Canonical state is untouched by withdrawal, so #7's immutability guarantees
  and #8's version reconstruction are unaffected.
- A citation to a withdrawn X-Ray resolves to an honest account of what
  happened, rather than to nothing.
- The reason set is public vocabulary. Adding to it is a decision about what
  X-Ray is willing to say, not a schema change.
- An operator can take a page down quickly without the system inferring that
  the research was wrong.

Schema, routes, tombstone copy and cache invalidation are deliberately not
decided here.
