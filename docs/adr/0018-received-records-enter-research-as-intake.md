# ADR-0018 — Received Records Enter Research as Intake, Not as Canonical Sources

**ADR:** 0018
**Status:** Accepted
**Date:** 2026-09-21
**Source:** Proposed decisions D5–D8 on #10, reconciled against #6/#7 execution and versioning
**Supersedes:** —

## Context

`ATIRequest.receivedSourceIds` is typed `SourceId[]`, and the product loop reads
*gap → request → response → new receipt → new version*. The temptation is to
treat "a document arrived" and "a canonical `Source` exists" as one step.

They are not one step, and the existing contracts say so from both ends.

`XR-INV-006` and [ADR-0010](./0010-research-retrieval-boundary.md) already
separate *reaching a record* from *deciding what it establishes*: a retrieval
provider reports what it reached, and `TRACE`/`PROVENANCE` decide accessibility,
evidence class, origin status and provenance. A record arriving by post from a
ministry is the same kind of event as one arriving from a search adapter. It
has no more authority for having been requested.

There is also a concrete inconsistency in the current code, recorded here
because #10 must resolve it rather than inherit it (see the conflicts section of
[the #10 plan](../engineering/issue-10-ati-plan.md)): the validator checks
`receivedSourceIds` against the sources present in the graph, while the database
column has no foreign key and #7's ATI boundary gate deliberately writes an
unresolvable id. Because snapshots exclude ATI requests entirely, the validator
rule is currently unreachable through any persisted path.

## Decision

**A response records an intake. Research decides whether it becomes evidence.**

```text
ATI response event
    ↓
received record (intake identity, owned by the response)
    ↓  INGEST → TRACE → PROVENANCE → …
candidate Source / Evidence
    ↓  VALIDATE → REVIEW → graduation
new immutable InvestigationVersion (trigger = ATI_RESPONSE_RECEIVED)
```

An intake record is not a `Source`. It has its own identity, belongs to the
response that produced it, and carries only what is actually known about
arrival. `ATIRequest.receivedSourceIds` means **canonical source ids accepted
from responses** — never raw intake identifiers, and never an id minted in
advance for a source that does not yet exist.

### One response yields zero, one, or many sources

The relationship is not one to one, and treating it as one would misreport
ordinary outcomes:

| Response | Canonical sources |
| --- | --- |
| Acknowledgement letter | possibly none |
| Archive containing contract, annex and schedule | several |
| Document already in the graph | none new |
| Partial response | some now, more later |

`RESPONDED` therefore says a response was recorded. It says nothing about how
much evidence resulted.

### Affected claims come from evidence, never from the origin gap

The gap says *why the record was requested*. It does not pre-authorise what the
returned record establishes.

After ingest and provenance, the re-evaluation set is whatever the new evidence
actually bears on — computed by #7's `changedClaimIds`, recorded per claim with
reason `EXTERNAL_RECORD_RESPONSE`, under trigger `ATI_RESPONSE_RECEIVED`. The
origin gap's claim ids may guide planning and must not decide the outcome.

`claim_reevaluation_causes` already has an `ati_response_ref` column and
`CausalReference` already has an `ATI_RESPONSE` kind, so the causal hook exists;
nothing writes it yet.

### Ingestion is a normal execution run, not a special writer

No "ATI version writer" that bypasses #6 or #7. A response bridge seeds a normal
candidate workspace from the latest committed version, adds the accepted
material, and runs the required stages and both control gates before graduation
and commit.

Which earlier stages may legitimately be skipped when a response introduces no
new claims is an implementation-planning question, subject to one rule: **no
required epistemic step may be bypassed.** A received record that is graded
without provenance or review has not been researched, whoever sent it.

## Consequences

- A document can be received, logged and audited without any claim being made
  about it — which is what "not yet evidence" has to mean in practice.
- The ATI loop inherits every guarantee #6–#9 already prove, because it uses the
  same execution path rather than a shortcut around it.
- Historical findings stay addressable: re-evaluation produces a new version and
  rewrites nothing.
- **A candidate workspace seeded from a committed version does not exist yet.**
  `GraphAccumulator` accepts a seed and `readSnapshot` produces one, so it is
  assemblable from existing parts — but no command does it, and #8's integrated
  lifecycle never needed one. This is the largest unbuilt piece of #10.

This ADR fixes the intake boundary. It authorises no schema, command, route or
runtime change.

---

## Amendment — receipt identity and integrity, without a document store

**Recorded:** 2026-09-21 · #10 slice 10c

This ADR said what an intake is *not*. Implementing the response command forced
the question of what it durably *is*, and the honest answer is smaller than it
looks.

**Durable intake state is identity + arrival metadata + optional digest.** No
body, no file, no bounded content. X-Ray has no raw-document store, and 10c
deliberately did not invent one behind this boundary — ADR-0010 already treats
retrieved content crossing into research as bounded execution material rather
than canonical state, and a record delivered by a ministry is no different for
having been formally requested.

The material therefore reaches research **explicitly**, in 10d, named against
the intake identity recorded here. That bridge must load the durable intake,
verify the supplied material corresponds to it, require a digest match where a
digest exists, and refuse to research material that cannot be tied to that
intake. Receipt identity and integrity without pretending to retention
infrastructure that does not exist.

**Intake identity is X-Ray's.** A caller describes what arrived — usually a
filename — and the command allocates `intakeId` under the request lock. A
filename is not identity: two institutions both send `scan.pdf`.

**A digest carries its provenance.** `content_hash_origin` is `COMPUTED` when
X-Ray hashed content it actually held, `SUPPLIED` when somebody else stated the
digest. The distinction is not bookkeeping: "the digest matches" means something
different in each case, and without the column a stated digest would be
silently readable as a verified one. Where content is available the command
computes and prefers its own; where both exist they must agree, and a
disagreement is a discrepancy to surface rather than something to overwrite.

**Digest equality is not epistemic identity.** Two copies of one document from
two offices are two received records. Identical bytes say nothing about whether
the second arrival is the same event, and nothing at all about what either
shows. Deciding that two records are the same record is a research judgment,
not a hash comparison.

**And still: response received ≠ Source created.** Nothing in the response
command writes a canonical id. `receivedSourceIds` stays empty until research
commits a version that introduced a source, and no application command exposes
the acceptance bridge — an operator cannot declare an intake to be `SRC-123`.

---

## Amendment — how the material actually reaches research

**Recorded:** 2026-09-21 · #10 slice 10d

The bridge this ADR described is built, and two of its consequences are worth
recording as decisions rather than as implementation detail.

**Supplied material is bound to the receipt before anything executes.** The
digest of the bytes handed over must equal the digest 10c recorded, where one
exists, and the rejection happens before any execution run or candidate
workspace is created. A `SUPPLIED` receipt digest that matches is not promoted
to `COMPUTED`: what equality establishes is correspondence to the stored receipt
claim, not that the document is authentic, complete, or shows anything at all.
No receipt row is rewritten by processing.

**A response that yields nothing produces no version.** This ADR's
zero-sources case is now an explicit terminal result, `NO_CANONICAL_CHANGE`. No
Source is manufactured, no acceptance is written, and no empty successor version
is committed to mark the intake handled — an empty version would be a false
research record. The run and its durable cause remain readable, so the outcome
is legible as a research result rather than as an absence, and the intake stays
received and unaccepted.

**Affected claims are what changed, not what was expected to change.** The
origin gap's `claimIds` are planning context. The audit set comes from
`changedClaimIds`, so a claim the response unexpectedly bore on is recorded and
a gap claim it failed to move is not. Each is recorded as
`EXTERNAL_RECORD_RESPONSE` with an exact `ATI_RESPONSE` cause, and that cause is
a foreign key to `ati_responses.id` rather than a string resembling one.
