# ADR-0013 — Publication Is an Attributed Event

**ADR:** 0013
**Status:** Accepted
**Date:** 2026-09-20
**Source:** Human decisions recorded in #9, "9a decisions — publication and withdrawal semantics"
**Supersedes:** —

## Context

Nothing in the system knew what "published" meant. Across forty-seven tables
there was no publication record, no slug and no public state. The only
candidate was `investigations.latest_committed_version`, and #8 deliberately
refused to relabel it: that column reports what storage committed, never what
a reader may see.

That refusal left a real question open. #7 makes versions immutable and #8's
lifecycle ends at commit, so a graduated version is a *candidate* for
publication and nothing more. Something has to say that a particular version
is now a public statement — and a public evidence artifact that cannot say who
made it public, or when, is asking to be trusted without saying by whom.

## Decision

**Publication is an append-only event that names a principal, not a flag on an
investigation.**

- A publication event targets an exact `(investigation, version)`. An
  investigation is ongoing activity; a version is a dated statement. Publishing
  "the investigation" would mean publishing whatever it later becomes.
- Committing a version never publishes it. Publication is a separate,
  deliberate act, or there is no moment at which a person takes responsibility
  for what goes out.
- Every publish, withdraw and republish event carries a **`Principal`** — a
  stable identifier of who performed the administrative act.
- `latest_published_version` is derived from the event history. It is never
  stored beside it, for the same reason the library derives its counts: a
  stored answer drifts from the record that produced it.

### Principal, and why it is not called Actor

`Actor` already means something in X-Ray. It is a claim dimension in Protocol
v0.3 — part of proposition identity, alongside scope, measure, time, category,
modality and causal role — and the protocol turns on keeping actors in the
*world being investigated* distinct from one another. Reusing the word for
whoever pressed publish would put an operational identity into the same
vocabulary as the subjects of research.

`Principal` therefore names the administrative party, and the separation is
enforced by where it lives:

**Principal attribution lives in the publication event history and never in
the evidence graph.** No canonical artifact gains a principal field. Who
published an X-Ray is not evidence about anything the X-Ray says.

### What #9 owns, and what it does not

#9 owns **attribution**. It does not own login, accounts, sessions, roles or
permissions, and does not import an authentication system.

The trusted host or auth boundary supplies the principal. #9 records what it
is given.

**If no attributable principal is available, the administrative act is
invalid.** There is no fallback to "the operator" and no anonymous default. An
unattributed publication would be a public statement nobody had made, which is
worse than no publication at all.

### Eligibility

A version assessed `PASS` may be published. A version assessed an eligible
`BLOCKED` may also be published, **provided its capability blockers are carried
onto the published page.**

`REVISE` and `FAIL` may not be published.

The `BLOCKED` allowance is not a relaxation. #8's integrated gate showed
`BLOCKED` is the honest normal state while no reviewer model is wired, so a
rule of "publish only `PASS`" would either publish nothing or quietly redefine
`PASS`. But publishing incomplete assurance while hiding what could not be
checked is worse than not publishing, so the disclosure is the condition rather
than a courtesy.

## Consequences

- The event history can express "published, withdrawn, republished" without
  losing the middle. A flag cannot, which is why it was rejected.
- Every public statement has a time, a principal and a version, so a reader can
  ask when it was made and by whom.
- Commit stays a storage fact and publication stays a human one, which is the
  distinction #8 established and this ADR extends to the public tier.
- An actor concept for the *research* domain remains unaffected and unclaimed.
- Withdrawal is the same kind of event with a different meaning; see
  [ADR-0014](./0014-withdrawal-is-a-presentation-event.md).

Schema, addressing, alias resolution and cache behaviour are deliberately not
decided here. They follow from these meanings and are specified separately.
