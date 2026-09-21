/**
 * 20e — the first live X-Ray run.
 *
 * One fresh public civic-news URL, through the real application path, against
 * a real PostgreSQL, with real Anthropic providers. Nothing is stubbed and
 * nothing is seeded: this database contains no benchmark content, so a
 * proposition that looks like XRAY-KE-001's could only have come from the web.
 *
 * It captures, it does not assert. A live first light is an observation.
 */

import { hostDatabase, hostDatabaseConfigured } from '@/lib/xray/host/database'
import { migrateHost } from '@/lib/xray/host/demo-seed'
import { InvestigationService } from '@/lib/xray/application/investigation-service'
import { InlineExecutionService } from '@/lib/xray/application/inline-execution'
import {
  setDatabaseProvider, setExecutionRuntimeProvider, setReviewerModelProvider,
  getExecutionRuntime, getReviewerModel,
} from '@/lib/xray/application/runtime'
import { registerLiveProviders, composeLiveRuntime } from '@/lib/xray/providers/live-runtime'
import { loadCandidateCheckpoint } from '@/lib/xray/persistence/workspace'
import { readExecutionAudit } from '@/lib/xray/persistence/execution-audit'

const URL_UNDER_INVESTIGATION = process.argv[2]
if (!URL_UNDER_INVESTIGATION) throw new Error('usage: first-light.ts <url>')

const line = (label: string, value: unknown) =>
  console.log(`${label.padEnd(30)} ${typeof value === 'string' ? value : JSON.stringify(value)}`)

async function main(): Promise<void> {
  console.log('=== 1 · configuration actually selected ===')
  const composition = await composeLiveRuntime()
  line('composition', composition.status)
  line('summary', composition.summary)
  if (composition.status !== 'COMPOSED') {
    for (const { slot, reason } of composition.missing) line(`  ${slot}`, reason)
    throw new Error('not configured; refusing to pretend a live run happened')
  }
  line('database configured', hostDatabaseConfigured())

  console.log('\n=== 2 · host registration through the real seams ===')
  const db = await hostDatabase()
  const applied = await migrateHost(db)
  line('migrations applied', applied.length)
  setDatabaseProvider(async () => db)
  const registration = await registerLiveProviders({
    setExecutionRuntime: setExecutionRuntimeProvider,
    setReviewerModel: setReviewerModelProvider,
  })
  line('registered', registration.registered)
  const reviewer = await getReviewerModel()
  line('reviewer resolved', reviewer?.name ?? 'undefined')

  console.log('\n=== 3 · proof this database holds no benchmark content ===')
  for (const table of ['investigations', 'claims', 'sources', 'evidence', 'findings']) {
    const rows = (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows
    line(`  ${table}`, rows[0]?.n ?? 'n/a')
  }

  console.log('\n=== 4 · submission ===')
  line('url', URL_UNDER_INVESTIGATION)
  const investigations = new InvestigationService(db)
  const submitted = await investigations.createInvestigation({ sourceUrl: URL_UNDER_INVESTIGATION })
  line('investigationId', submitted.investigationId)

  console.log('\n=== 5 · live execution ===')
  const execution = new InlineExecutionService(db, await getExecutionRuntime())
  const startedAt = Date.now()
  const status = await execution.startExecution(submitted.investigationId)
  const elapsed = Math.round((Date.now() - startedAt) / 1000)
  line('executionRunId', status.executionRunId)
  line('status', status.status)
  line('wall clock (s)', elapsed)

  console.log('\n=== 6 · stage journal ===')
  for (const run of status.stageRuns) {
    console.log(`  ${run.stage.padEnd(12)} ${run.status.padEnd(12)} in=${run.inputArtifactVersion} out=${run.outputArtifactVersion ?? '-'}`)
  }

  console.log('\n=== 7 · durable candidate ===')
  const checkpoint = await loadCandidateCheckpoint(db, status.executionRunId)
  const graph = checkpoint.accumulator.rebuild()
  for (const [name, collection] of [
    ['sources', graph.sources], ['claims', graph.claims], ['evidence', graph.evidence],
    ['sourcePositions', graph.sourcePositions], ['sourceDependencies', graph.sourceDependencies],
    ['evidenceProvenance', graph.evidenceProvenance], ['discrepancies', graph.discrepancies],
    ['disconfirmations', graph.disconfirmations], ['findings', graph.findings],
    ['gaps', graph.gaps],
  ] as const) line(`  ${name}`, collection.length)

  console.log('\n=== 8 · retrieval receipts (external URLs actually reached) ===')
  for (const source of graph.sources) {
    console.log(`  ${source.id}  ${source.accessibility.padEnd(14)} ${source.evidenceClass.padEnd(10)} ${source.originStatus.padEnd(12)} ${source.url ?? '(no url)'}`)
    console.log(`      title: ${source.title.slice(0, 96)}`)
  }

  console.log('\n=== 9 · claims ===')
  for (const claim of graph.claims) {
    console.log(`  ${claim.id}  ${claim.layer.padEnd(14)} ${claim.type.padEnd(12)} ${claim.text.slice(0, 96)}`)
  }

  console.log('\n=== 10 · evidence ===')
  for (const item of graph.evidence) {
    console.log(`  ${item.id}  ${item.relationship.padEnd(14)} ${item.strength.padEnd(16)} src=${item.sourceId} claims=${item.claimIds.join(',')}`)
    console.log(`      ${item.proposition.slice(0, 110)}`)
  }

  console.log('\n=== 11 · findings ===')
  for (const finding of graph.findings) {
    console.log(`  ${finding.id}  ${finding.status.padEnd(22)} ${finding.confidence}  claim=${finding.claimId}`)
    console.log(`      ${finding.rationale.slice(0, 110)}`)
    for (const would of finding.wouldChangeFinding) console.log(`      would change: ${would.slice(0, 96)}`)
  }

  console.log('\n=== 12 · gaps ===')
  for (const gap of graph.gaps) {
    console.log(`  ${gap.id}  ${gap.status.padEnd(12)} ${gap.resolutionPath.padEnd(22)} atiEligible=${gap.atiEligible}`)
    console.log(`      missing: ${gap.missingEvidence.slice(0, 96)}`)
  }

  console.log('\n=== 13 · capability gaps and adapter failures ===')
  const audit = await readExecutionAudit(db, status.executionRunId)
  const entries = audit?.journal.entries ?? checkpoint.journal.entries
  for (const entry of entries) {
    if (entry.kind === 'CAPABILITY') {
      const gap = (entry.run as { unavailable: { operation: string; reason: string; detail: string; resolvedBy: string } }).unavailable
      console.log(`  CAPABILITY  ${gap.operation}  [${gap.reason}]`)
      console.log(`      ${gap.detail}`)
      console.log(`      resolvedBy: ${gap.resolvedBy}`)
    }
    if (entry.kind === 'STAGE') {
      const run = entry.run as { stage: string; status: string; error?: string }
      if (run.status === 'FAILED') console.log(`  FAILED      ${run.stage}: ${run.error}`)
    }
    if (entry.kind === 'STOP') {
      const stop = entry.run as { action: string; stop?: { reason?: string } }
      console.log(`  STOP        ${stop.action} ${stop.stop?.reason ?? ''}`)
    }
  }

  console.log('\n=== 14 · gates: validation and review ===')
  for (const entry of entries) {
    if (entry.kind !== 'GATE') continue
    const run = entry.run as {
      gate: string; outcome: string; inspectedArtifactVersion: number
      result?: { kind: string }
    }
    console.log(`  ${run.gate.padEnd(10)} ${run.outcome.padEnd(12)} artifact=${run.inspectedArtifactVersion} result=${run.result?.kind ?? '-'}`)
  }
  for (const validation of audit?.validations ?? []) {
    const v = validation as unknown as { scope?: string; valid?: boolean; violations?: unknown[] }
    console.log(`  validation scope=${v.scope ?? '?'} valid=${String(v.valid)} violations=${v.violations?.length ?? 0}`)
  }

  console.log('\n=== 15 · provider diagnostics (non-canonical) ===')
  /*
   * The adapters expose `diagnostics()` on the class, not on the port, so only
   * the instances this process composed can be asked. The reviewer is the one
   * this script holds directly; the research model and retrieval adapter live
   * inside the runtime's plan and are not reachable from here without widening
   * a port, which 20e must not do. Recorded as a limitation rather than faked.
   */
  const diagnosticsOf = (value: unknown): readonly unknown[] =>
    typeof value === 'object' && value !== null && 'diagnostics' in value
      ? (value as { diagnostics: () => readonly unknown[] }).diagnostics() : []
  const reviewerCalls = diagnosticsOf(reviewer)
  line('reviewer calls recorded', reviewerCalls.length)
  for (const call of reviewerCalls) console.log(`  ${JSON.stringify(call)}`)

  console.log('\n=== 16 · graduation path for a fresh initial run ===')
  console.log('  (determined by reading the application surface; see report)')

  await closeAll()
}

async function closeAll(): Promise<void> {
  const { closeHostDatabase } = await import('@/lib/xray/host/database')
  await closeHostDatabase()
}

main().catch((err: unknown) => {
  console.error(`\nFIRST LIGHT ABORTED: ${String(err)}`)
  if (err instanceof Error && err.stack) console.error(err.stack.split('\n').slice(1, 6).join('\n'))
  process.exitCode = 1
})
