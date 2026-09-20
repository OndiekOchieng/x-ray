# Issue #14 — Slice 14d integrated verification

Date: 2026-09-19. Scope: verification and closeout audit only. No #15 work.

## Implementation chain and changed files

| Slice | Commit | Files / contract |
| --- | --- | --- |
| 14a | `42d07e7a0333a80d14d7e5e0848434b14790537a` | `lib/xray/domain/{primitives,source-position,evidence,investigation,index}.ts`; `lib/xray/selectors/{graph,source-positions,index}.ts`; `lib/xray/source-position-checks.ts`; `package.json`. Contextual SourcePosition and optional Evidence knowledge basis; historical graph compatibility. |
| 14b | `0d418e39e00129895ff7c4cdb695667363b4ef44` | `lib/xray/pipeline/{accumulator,identity,index,model-port,proposals,source-position,stages}.ts`; `lib/xray/validation/{index,referential,structural,violations}.ts`; `lib/xray/source-position-pipeline-checks.ts`; `docs/engineering/14b-initial-gate-failure.md`; `package.json`. Stage ownership, canonicalization, identity, and deterministic validation. |
| 14c | `87b77cda5dbbd8337a2467d8bb6e261579512af1` | `lib/xray/review/{deterministic,index,judgments,port,types}.ts`; `lib/xray/fixtures/kenyatta-maralal-calibration.ts`; `lib/xray/source-position-review-checks.ts`; `docs/calibration/` CAL-007…016 and FM-007…010; `docs/engineering/14c-initial-gate-failure.md`; `package.json`. v0.3 model-assisted review and synthetic executable calibration. |
| 14b remediation | `231f84d1118202ddf3ed092971cebdbfadd44b5c` | `lib/xray/validation/{structural,violations}.ts`; `lib/xray/source-position-pipeline-checks.ts`; `docs/engineering/14b-unknown-knowledge-basis-remediation.md`. v0.3 FULL rejects missing and UNKNOWN KnowledgeBasis. |

## Contract audit

1. `SourcePosition` is claim/time contextual canonical state, not a flat Source rating. `Evidence.knowledgeBasis` is proposition-specific. `Evidence.proposition` remains the direct-establishment boundary.
2. TRACE owns initial SourcePosition and PROVENANCE may revise one only through a stage-issued handle; the stage assigns canonical identity. SourceDependency and EvidenceProvenance remain separate collections with their existing independence semantics.
3. v0.3+ FULL rejects missing and UNKNOWN KnowledgeBasis on material Evidence. Concrete values pass. v0.1/v0.2 FULL and v0.3 STAGED preserve historical optionality.
4. T1/T2 SourcePositions remain separate and validator-legal. Historical XRAY-KE-001 review has no v0.3 checks or false positives. The synthetic calibration mutation promotes an institutional characterization into underlying fact and receives a blocking routed review finding. Actor/agency, retrospective-intent, and inadequate-falsifier mutations are likewise caught by the fixture-scoped ReviewerModel adapter. The adapter proves the typed review seam and routing, not the accuracy of an unspecified future model.
5. No trust/bias/reliability score, Actor ontology, ClaimDimensions ontology, or ClaimDependency schema entered #14. `git diff --name-only 5d68495..231f84d` contains no persistence/schema, API, publication, or UI files.

## Exact checks and results

| Command | Result |
| --- | --- |
| `pnpm check:fixtures` | PASS: TypeScript; fixture integrity 66/66; query 56/56; validator 52/52; Reviewer 32/32; graduation adversarial 32/32; pipeline 54/54; adapter 45/45; 6d replay 21/21. |
| `pnpm check:source-position` | PASS: historical optionality, contextual T1/T2 positions and orthogonal provenance. |
| `pnpm check:source-position-pipeline` | PASS: retry ID, PROVENANCE revision, referential/structural checks, missing/UNKNOWN/concrete version and mode cases. |
| `pnpm check:source-position-review` | PASS: clean historical and synthetic fixtures, four required mutation families, revision history and routing. |
| `pnpm check:persistence-roundtrip` | PASS: historical v1 deep reconstruction, distinct Source/Evidence and provenance, FULL validation, A01–A10. No persistence code changed by #14. |
| `pnpm graduate` | Expected `BLOCKED`, exit 3: six genuine ReviewerModel capability blockers; graph not accused of an error. |

## Preserved failures and remaining blocker

- `docs/engineering/14b-initial-gate-failure.md`: branded-ID typing, check-harness module setting, and historical serialization order failures before fixes.
- `docs/engineering/14c-initial-gate-failure.md`: synthetic ID collisions, a validator-rejected empty falsifier, TypeScript stage/gate comparison, and calibration heading mismatch before fixes.
- `docs/engineering/14b-unknown-knowledge-basis-remediation.md`: 0 UNKNOWN violations against 38 expected before the narrow validator fix, followed by the passing gate.
- No new code/test failure arose in 14d. Visibility is the remaining closeout blocker: local `main` is eleven commits ahead of `origin/main`. A sandboxed `git push origin HEAD:refs/heads/issue-14-evidence` could not resolve `github.com`; an elevated retry was rejected by automatic approval review because remote ownership/destination authorization for code export was not established. No remote ref changed. Independent GitHub diff inspection and issue closure must wait for explicit authorization and a successful push.
