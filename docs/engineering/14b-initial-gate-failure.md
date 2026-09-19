Slice 14b initial gate, before remediation:

```
pnpm exec tsc --noEmit && pnpm check:source-position-pipeline && pnpm check:fixtures
lib/xray/pipeline/source-position.ts(26,3): error TS2322: Type ... claimIds: string[] is not assignable to ClaimId[].
lib/xray/source-position-pipeline-checks.ts(20,16): error TS1378: Top-level await expressions are only allowed with an ES module setting.
```

The first failure exposed a branded canonical-ID typing gap in stage handle resolution. The second was a check-harness module-setting mismatch. Neither was a replay or domain-validation failure.

After those fixes, `pnpm check:source-position-pipeline` passed but `pnpm check:fixtures` reported 52/54 pipeline checks. The two failures were `rebuild produces the graph createXRayGraph produces over the same arrays` and `the replayed canonical state equals the benchmark graph`. The new empty collection had moved `sourcePositions` ahead of historical fields in JSON serialization; accumulator snapshot ordering was corrected before rerunning the gate.
