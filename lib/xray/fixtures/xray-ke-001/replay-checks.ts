/** Slice 6d acceptance: fixture adapters through real stages and gates. */
import { isDeepStrictEqual } from 'node:util'
import { assessGraduation } from '@/lib/xray/acceptance'
import { validateXRayGraph } from '@/lib/xray/validation'
import { runPipeline, RESEARCH_STAGES } from '@/lib/xray/pipeline'
import { XRAY_KE_001_ACCEPTANCE } from './acceptance'
import { claims } from './claims'
import { sources } from './sources'
import { evidence } from './evidence'
import { evidenceProvenance } from './evidence-provenance'
import { sourceDependencies } from './source-dependencies'
import { disconfirmations } from './disconfirmation'
import { discrepancies } from './discrepancies'
import { findings } from './findings'
import { gaps } from './gaps'
import { investigation } from './investigation'
import { replayXrayKe001, replayStages, ReplayResearchAdapter, ReplayResearchModel } from './replay'

type Result = { name: string; detail?: string }
const failures: Result[] = []
let checks = 0
const check = (name: string, condition: boolean, detail?: string) => {
  checks += 1
  if (!condition) failures.push({ name, detail })
}
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]),
  )
  return value
}
const same = (a: unknown, b: unknown) => isDeepStrictEqual(stable(a), stable(b))

async function main(): Promise<void> {
const run = await replayXrayKe001()
check('fresh replay completes', run.status === 'COMPLETED',
  `${run.status} ${run.failedStage ?? ''}: ${run.journal.stageEntries().at(-1)?.error ?? ''}`)

for (const [key, canonical] of Object.entries({
  claims, sources, evidence, evidenceProvenance, sourceDependencies,
  disconfirmations, discrepancies, findings, gaps,
})) {
  const actual = run.graph[key as keyof typeof run.graph]
  check(`${key} reconstructs canonical content and identity`, same(actual, canonical),
    `${Array.isArray(actual) ? actual.length : '?'} vs ${canonical.length}`)
}

check('historical saturation is active with authored leads',
  same(run.graph.investigation.researchStop, investigation.researchStop))
check('fresh path did not replay historical StageRuns',
  run.graph.investigation.stageRuns.length === 0)
check('research stages have actual successful journal records',
  same(run.journal.stageEntries().map((entry) => entry.stage), RESEARCH_STAGES) &&
  run.journal.stageEntries().every((entry) => entry.status === 'SUCCEEDED' &&
    entry.outputArtifactVersion === entry.inputArtifactVersion + 1))
check('control gates ran in order on final artifact revision',
  same(run.journal.gateEntries().map((entry) => entry.gate), ['VALIDATE', 'REVIEW']) &&
  run.journal.gateEntries().every((entry) => entry.inspectedArtifactVersion === run.artifactVersion))
check('stop is journalled as execution evidence',
  run.journal.stopEntries().at(-1)?.stop?.reason === 'SATURATION')
check('FULL validation and real REVIEW gate ran',
  run.validation?.valid === true && run.review?.status === 'REVIEWED' &&
    run.reviewHistory?.rounds.length === 1 && validateXRayGraph(run.graph).valid)

const assessed = assessGraduation(run.graph, {
  behaviors: XRAY_KE_001_ACCEPTANCE, assessedAt: '2026-09-13T00:00:00Z',
  capabilityGaps: run.capabilityGaps, staleStages: run.journal.staleStages(),
})
check('A01–A10 hold on replayed graph',
  assessed.behaviors.length === 10 && assessed.behaviors.every((item) => item.status === 'SATISFIED'),
  assessed.behaviors.filter((item) => item.status !== 'SATISFIED').map((item) => item.id).join(','))
check('default assurance remains BLOCKED, without graph accusation',
  assessed.verdict === 'BLOCKED' && assessed.reasons.length === 0 && assessed.blockers.length === 6,
  `${assessed.verdict}; reasons ${assessed.reasons.length}; blockers ${assessed.blockers.length}`)

const retried = await replayXrayKe001({ maxAttempts: 2 })
check('deterministic replay repeats canonical identity',
  same(retried.graph.evidence.map((item) => item.id), run.graph.evidence.map((item) => item.id)))

const stages = replayStages()
let failedOnce = false
const injected = stages.map((stage) => stage.stage === 'TRACE'
  ? { stage: stage.stage, run: async (ctx: Parameters<typeof stage.run>[0]) => {
    const output = await stage.run(ctx)
    if (!failedOnce) { failedOnce = true; throw new Error('replay injected failure after adapter output') }
    return output
  } } : stage)
const fresh = { ...investigation, status: 'CREATED' as const, stageRuns: [], researchStop: undefined,
  claimIds: [], sourceIds: [], evidenceIds: [], discrepancyIds: [],
  disconfirmationIds: [], findingIds: [], gapIds: [] }
const retry = await runPipeline({
  investigation: fresh, stages: injected, maxAttempts: 2,
  adapters: { research: new ReplayResearchAdapter(), model: new ReplayResearchModel() },
  stopEvidence: { saturationObserved: true,
    unresolvedHighPriorityLeads: investigation.researchStop?.unresolvedHighPriorityLeads },
  clock: () => '2026-09-13T00:00:00Z',
})
check('failed TRACE attempt is preserved and retry is identity-stable',
  retry.journal.stageEntries().some((entry) => entry.stage === 'TRACE' && entry.status === 'FAILED') &&
  same(retry.graph.evidence.map((item) => item.id), run.graph.evidence.map((item) => item.id)),
  `${retry.status}: ${retry.journal.stageEntries().find((entry) => entry.status === 'FAILED')?.error ?? ''}`)

const interrupted = await runPipeline({
  investigation: fresh,
  stages: stages.map((stage) => stage.stage === 'GAPS'
    ? { stage: stage.stage, run: () => { throw new Error('replay interrupted') } } : stage),
  adapters: { research: new ReplayResearchAdapter(), model: new ReplayResearchModel() },
  clock: () => '2026-09-13T00:00:00Z',
})
const resumed = await replayXrayKe001({ resume: {
  journal: interrupted.journal, accumulator: interrupted.accumulator,
}, startArtifactVersion: interrupted.artifactVersion })
check('resume runs only pending GAPS and preserves identities',
  interrupted.status === 'STAGE_FAILED' && resumed.status === 'COMPLETED' &&
  same(resumed.graph.evidence.map((item) => item.id), run.graph.evidence.map((item) => item.id)) &&
  resumed.journal.stageEntries().filter((entry) => entry.stage === 'GAPS').length === 2,
  `${interrupted.status} → ${resumed.status}: ${resumed.journal.stageEntries().at(-1)?.error ?? ''}`)

for (const failure of failures) console.error(`FAIL ${failure.name}: ${failure.detail ?? ''}`)
console.log(`6d replay: ${checks - failures.length}/${checks} passed; ${run.status}; ${assessed.verdict}; ${run.journal.length} journal entries`)
if (failures.length) process.exit(1)
}

void main()
