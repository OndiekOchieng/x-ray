# 14b remediation — UNKNOWN KnowledgeBasis

The released 14b rule required v0.3+ FULL validation to reject both missing and `UNKNOWN` KnowledgeBasis on material Evidence. The latter was not enforced.

Before remediation, the new regression assertion failed:

```
pnpm check:source-position-pipeline
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
0 !== 38
at lib/xray/source-position-pipeline-checks.ts:58:8
actual: 0
expected: 38
```

All 38 historical Evidence records, when copied into a v0.3 graph and assigned `UNKNOWN`, produced zero UNKNOWN violations. The remediation adds a distinct deterministic violation under v0.3+ FULL only. STAGED and historical protocol versions remain compatible.

After remediation, the check asserts 38 missing violations for absent values and 38 distinct UNKNOWN violations for `UNKNOWN` values in v0.3 FULL; a concrete basis passes. v0.1/v0.2 FULL and v0.3 STAGED remain legal under both optionality cases.

Final gate: `pnpm exec tsc --noEmit`, `pnpm check:source-position-pipeline`, `pnpm check:fixtures` (including 6d replay 21/21), `pnpm check:source-position`, `pnpm check:source-position-review`, and `git diff --check` all passed.
