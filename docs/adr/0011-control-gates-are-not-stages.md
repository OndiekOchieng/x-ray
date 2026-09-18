# ADR-0011 — Control Gates Are Not Pipeline Stages

**ADR:** 0011
**Status:** Accepted
**Date:** 2026-09-18
**Source:** Human decision recorded in #6, "Human decision — stage vocabulary vs control gates" (D15)
**Supersedes:** —

## Context

Four authorities named the pipeline's steps, and they disagreed.

| Authority | Named steps |
|---|---|
| `PipelineStage` (domain) | INGEST … GAPS, VALIDATE, SYNTHESIZE, RESOLVE |
| Architecture §16 diagram | the same, **plus `PERSIST`** |
| Issue #6's pipeline line | the same, **plus `REVIEW`** |
| Issue #1's v1 definition | the same, **plus `REVIEW` and `PERSIST`** |
| Protocol v0.1 | INGEST … GRADE, **IDENTIFY GAPS**, SYNTHESIZE, **ACT** — no `PROVENANCE`, no `VALIDATE` |

The disagreement was not cosmetic. `StageRun.stage` is typed to
`PipelineStage`, so a `REVIEW` or `PERSIST` stage run could not be recorded at
all — a type error, not a gap — while #6's scope required a StageRun-compatible
output for every step on its pipeline line.

The enum was also internally inconsistent about what a stage is. `VALIDATE` was
a member and produced no canonical artifact. `REVIEW` likewise produced none
and was not a member. Nothing distinguished the two cases.

## Decision

**Three kinds of step, with disjoint vocabularies.**

1. **Research stages** (`ResearchStage`) transform investigation state and may
   own canonical artifacts: `INGEST DECOMPOSE CLASSIFY PLAN TRACE PROVENANCE
   DISCONFIRM RECONCILE GRADE GAPS`.
2. **Control gates** (`ControlGate`) inspect current state and decide whether
   execution may continue, minting nothing: `VALIDATE`, `REVIEW`.
3. **Lifecycle boundaries** — persistence, publication, synthesis — belong to
   later issues and are not part of the pre-persistence research pipeline.

Consequences:

- `REVIEW` is **not** added to `PipelineStage`. `ReviewHistory` remains the
  durable record of review execution; a `REVIEW` StageRun would duplicate it.
- `PERSIST` is **not** added. #7 owns persistence.
- `VALIDATE`'s membership in `PipelineStage` is **legacy, not endorsement**. It
  is a gate, and new contracts treat it as one.
- The gates still appear in executable order — between the artifact-producing
  stages and graduation — but as gates, recorded as `GateRun`.
- `RevisionRequest.stage` is narrowed to `ResearchStage`. A reviewer finding
  never routes to `REVIEW`: the Reviewer is the inspector, not the repair step.

**Migration rule.** `PipelineStage` is frozen at the members it already had and
documented as the legacy vocabulary. XRAY-KE-001 records `VALIDATE`,
`SYNTHESIZE` and `RESOLVE` as `PENDING` stage runs — historical evidence of
what the frozen benchmark did and did not execute. Those observations stay
readable and are not rewritten to make the new model look cleaner.

**Protocol v0.1.** D12 means *execute the v0.1 research method using the
architecture refinements that make it executable* — not that v0.1's literal
stage list is the only authorised runtime vocabulary. `PROVENANCE` stays an
explicit stage because the architecture deliberately split proposition-level
origin work out of `TRACE`. `GAPS` is the executable name for `IDENTIFY GAPS`.
`ACT` is #10. This resolves the conflict without authoring Protocol v0.2.

## Consequences

A gate cannot be scheduled as a stage, because the types are disjoint. A gate
cannot claim an artifact revision, because `GateRun` has no output-revision
field to write one into. A record id alone says which kind of step produced it:
`SR-…` is a stage run, `GR-…` is a gate run.

The rejected alternative was one record type with an optional output version,
set for stages and left empty for gates. It would have made "did this step
change canonical state?" a runtime question about whether a field happened to
be populated — on exactly the records an auditor reads to answer it.

The cost is two record shapes in the run journal instead of one, and #7 must
persist both. That is the honest shape of the thing being recorded.
