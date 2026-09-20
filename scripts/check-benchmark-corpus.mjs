import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const corpusPath = new URL('../docs/benchmarks/corpus-v1.json', import.meta.url)
const calibrationPath = new URL('../docs/calibration/index.json', import.meta.url)

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'))
const calibration = JSON.parse(readFileSync(calibrationPath, 'utf8'))

const allowedStates = new Set(['SETTLED_ANALYSIS', 'FROZEN_BENCHMARK', 'EXECUTABLE_FIXTURE'])
const knownFailureModes = new Set(calibration.failureModes.map((item) => item.id))

assert.equal(corpus.governingDecision, 'ADR-0009')
assert.equal(corpus.principle, 'Acceptance targets semantic behavior, not prose.')
assert.deepStrictEqual(corpus.promotionStates, [
  'SETTLED_ANALYSIS',
  'FROZEN_BENCHMARK',
  'EXECUTABLE_FIXTURE',
])
assert.ok(Array.isArray(corpus.benchmarks) && corpus.benchmarks.length > 0)

const ids = new Set()
for (const benchmark of corpus.benchmarks) {
  assert.match(benchmark.id, /^XRAY-[A-Z]+-[0-9]{3}$/)
  assert.ok(!ids.has(benchmark.id), `duplicate benchmark id: ${benchmark.id}`)
  ids.add(benchmark.id)

  assert.ok(allowedStates.has(benchmark.state), `${benchmark.id}: invalid promotion state`)
  assert.ok(Array.isArray(benchmark.domain) && benchmark.domain.length > 0, `${benchmark.id}: domain required`)
  assert.ok(Array.isArray(benchmark.requiredDistinctions) && benchmark.requiredDistinctions.length > 0,
    `${benchmark.id}: required distinctions missing`)
  assert.ok(Array.isArray(benchmark.forbiddenCollapses) && benchmark.forbiddenCollapses.length > 0,
    `${benchmark.id}: forbidden collapses missing`)
  assert.ok(Array.isArray(benchmark.materialGaps), `${benchmark.id}: materialGaps must be an array`)
  assert.ok(Array.isArray(benchmark.promotionNeeds), `${benchmark.id}: promotionNeeds must be an array`)

  for (const failureMode of benchmark.existingFailureModes ?? []) {
    assert.ok(knownFailureModes.has(failureMode),
      `${benchmark.id}: unknown failure mode ${failureMode}`)
  }

  if (benchmark.state === 'SETTLED_ANALYSIS') {
    assert.ok(benchmark.promotionNeeds.length > 0,
      `${benchmark.id}: settled analysis must say what is missing for promotion`)
  }

  if (benchmark.state === 'EXECUTABLE_FIXTURE') {
    assert.equal(benchmark.promotionNeeds.length, 0,
      `${benchmark.id}: executable fixture cannot retain promotion needs`)
    const fixtureDir = benchmark.id.toLowerCase()
    const acceptance = new URL(`../lib/xray/fixtures/${fixtureDir}/acceptance.ts`, import.meta.url)
    const benchmarkReadme = new URL(`../docs/benchmarks/${benchmark.id}/README.md`, import.meta.url)
    assert.ok(existsSync(acceptance), `${benchmark.id}: missing executable acceptance fixture`)
    assert.ok(existsSync(benchmarkReadme), `${benchmark.id}: missing frozen benchmark README`)
  }
}

const executable = corpus.benchmarks.filter((item) => item.state === 'EXECUTABLE_FIXTURE')
assert.ok(executable.some((item) => item.id === 'XRAY-KE-001'),
  'XRAY-KE-001 must remain represented as the reference executable fixture')

console.log(`benchmark corpus: ${corpus.benchmarks.length} cases, ${executable.length} executable fixture(s), registry integrity PASS`)
