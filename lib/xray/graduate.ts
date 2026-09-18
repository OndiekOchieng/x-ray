/**
 * Graduation gate for XRAY-KE-001.
 *
 * The single command that answers whether the canonical benchmark is safe to
 * graduate, and reports exactly why not when it is not.
 *
 * Exit codes are meaningful, because the verdicts are:
 *
 *   0  PASS     safe to graduate
 *   1  FAIL     illegal, or a required acceptance behavior is violated
 *   2  REVISE   legal, but review raised blocking findings
 *   3  BLOCKED  nothing known to be wrong; required assurance unavailable
 *
 * BLOCKED gets its own code so CI can tell "we could not check this" from
 * "this is broken" without parsing prose.
 *
 * Run:  pnpm graduate
 */

import { xrayKe001Graph } from './fixtures/xray-ke-001/graph'
import { XRAY_KE_001_ACCEPTANCE } from './fixtures/xray-ke-001/acceptance'
import { assessGraduation, formatGraduationReport } from './acceptance'

const EXIT: Record<string, number> = { PASS: 0, FAIL: 1, REVISE: 2, BLOCKED: 3 }

const result = assessGraduation(xrayKe001Graph, {
  behaviors: XRAY_KE_001_ACCEPTANCE,
  assessedAt: new Date().toISOString(),
})

console.log()
console.log(formatGraduationReport(result))
console.log()

process.exit(EXIT[result.verdict] ?? 1)
