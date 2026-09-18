# 6c verification record

The first `pnpm check:fixtures` run after stop integration failed **1/50**
pipeline checks: benchmark replay no longer reproduced canonical state because
the runner cleared its historical `SATURATION` record without new stop
evidence. The runner now retains an existing explicit stop on an unchanged
replay and clears it when revision or resume begins.

The first revision check failed: GRADE re-ran while GAPS was stale and the
STAGED validator reported three `XR-INV-008/UNRESOLVED_FINDING_WITHOUT_GAP`
errors. The check also mutated the shared replay fixture used by later checks,
causing three secondary harness failures. The harness now uses an isolated run;
the validator exemption applies only to this GRADE→stale GAPS transition.

The next full suite failed **1/45** adapter checks because a D20 assertion
still expected `inputArtifactVersion` to change a correlation key. D31 expressly
reverses that expectation; the assertion now proves the key stays stable.

Final `pnpm check:fixtures`: fixture 66/66, query 56/56, validation 52/52,
review 32/32, acceptance 32/32, pipeline 54/54, adapters 45/45. The canonical
benchmark remains `BLOCKED` with six capability blockers and zero graph
reasons. This is a 6c result; no 6d replay capability is claimed.
