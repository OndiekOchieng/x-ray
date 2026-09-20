Slice 14c first calibration-fixture validation, before remediation:

```
CLEAN false [STRUCTURAL/DUPLICATE_ID, STRUCTURAL/DUPLICATE_ID]
CHARACTERIZATION_PROMOTED false [STRUCTURAL/DUPLICATE_ID, STRUCTURAL/DUPLICATE_ID]
ACTOR_LAUNDERED false [STRUCTURAL/DUPLICATE_ID, STRUCTURAL/DUPLICATE_ID]
RETROSPECTIVE_INTENT false [STRUCTURAL/DUPLICATE_ID, STRUCTURAL/DUPLICATE_ID]
UNFALSIFIABLE_SYSTEM false [STRUCTURAL/DUPLICATE_ID, STRUCTURAL/DUPLICATE_ID, XR-INV-007/FINDING_NOT_REVERSIBLE]
```

The synthetic source and evidence identifiers collided with frozen XRAY-KE-001 identifiers. The unfalsifiable variant also had an empty overturn-condition list, which the validator already rejects. The fixture must carry a non-empty but semantically inadequate condition to test the Reviewer boundary.

The first TypeScript pass over the new calibration check also rejected comparisons between `ResearchStage` and gate literals `REVIEW`/`VALIDATE` (TS2367). The runtime routing assertion was changed to check membership in the stage vocabulary instead.

The first historical fixture gate after adding CAL-007…CAL-016 passed 65/66 checks. Its one failure was `every calibration case states what would change the judgment`: all ten new cases used the heading “What would change the judgment,” while the established corpus checker requires the explicit phrase “what evidence would change the judgment.” The headings were aligned without changing case meaning.

Post-gate residual contract observation outside 14c scope: a v0.3 graph with every Evidence.knowledgeBasis set to `UNKNOWN` passes FULL validation (`valid: true`, `0` errors). The #14 14b release comment explicitly said `UNKNOWN` must not be a loophole. No validator code was changed in 14c; this requires a separately authorized 14b correction before #14 can close.
