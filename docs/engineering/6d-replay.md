# Slice 6d — XRAY-KE-001 replay evidence

The replay starts with an empty artifact accumulator and no active stop or
StageRuns. `ReplayResearchAdapter` implements `ResearchAdapter` and returns
retrieved material. `ReplayResearchModel` implements `ResearchModel` and
returns id-free proposals. Fixture-scoped stages turn those responses into
canonical artifacts, including stage-owned source classification, provenance,
and finding-to-gap links. Generic pipeline runtime imports no fixture module.

The frozen `Investigation.researchStop` supplies affirmative historical replay
evidence for `SATURATION` and preserves its seven authored unresolved leads.
The run does not infer saturation from one pass. The default graduation check
reports `BLOCKED`: six unevaluated ReviewerModel checks, zero graph reasons.

## Fixture versus runtime

- The historical fixture's StageRuns describe the two source research runs as
  structural version 0→1 observations and leave VALIDATE, SYNTHESIZE and
  RESOLVE pending. The executable journal records ten actual research-stage
  transitions, 0→10, followed by VALIDATE and REVIEW GateRuns. These are
  different evidence, so replay does not copy historical StageRuns.
- The validator requires `Investigation.currentVersion` to be 1-based. Fresh
  replay empties artifact arrays and StageRuns but retains the frozen value 1;
  the pipeline never increments it. In-run artifact revisions remain separate.
- The corpus is the deterministic adapter transcript. It carries no claim of
  production model or retrieval capability. ReviewerModel remains unconfigured.

## Failed evidence retained

The [initial replay failure](./6d-initial-replay-failure.json) stopped at
INGEST: the fresh investigation used `currentVersion: 0`, which the structural
validator rejects. The [second replay failure](./6d-second-replay-failure.json)
stopped at DECOMPOSE: the fixture transcript's clone helper attempted to JSON
parse an absent optional field. Both failures were recorded before repair.

## Verification

`pnpm check:replay`: 21/21. Every canonical collection matches the frozen
fixture in content, IDs, references and provenance. All ten stages succeeded,
both real gates ran, A01–A10 are satisfied, and the stop is journalled.
An injected failure after TRACE adapter output remains in the journal and
retry reproduces canonical IDs. Resume runs only pending GAPS and preserves
the upstream identities.

`pnpm check:fixtures`: fixture 66/66, query 56/56, validation 52/52,
review 32/32, acceptance 32/32, pipeline 54/54, adapters 45/45, replay
21/21. All 358 checks passed. No live provider, persistence, API or UI work
is part of this slice.
