/**
 * 20e — read the durable first-light run back out of PostgreSQL.
 *
 * No provider call. Everything here comes from what the run already wrote, so
 * the capture can be re-read as often as needed without spending anything.
 */
import { hostDatabase, closeHostDatabase } from '@/lib/xray/host/database'
import { loadCandidateCheckpoint } from '@/lib/xray/persistence/workspace'
import { readExecutionAudit } from '@/lib/xray/persistence/execution-audit'

async function main(): Promise<void> {
  const db = await hostDatabase()
  const runRows = (await db.query(
    'SELECT id FROM execution_runs ORDER BY started_at DESC LIMIT 1')).rows
  const runId = String(runRows[0]!['id'])
  console.log(`execution run: ${runId}\n`)

  const checkpoint = await loadCandidateCheckpoint(db, runId)
  const audit = await readExecutionAudit(db, runId)
  const entries = audit?.journal.entries ?? checkpoint.journal.entries

  console.log('=== full journal ===')
  for (const entry of entries) {
  if (entry.kind === 'STAGE') {
    const r = entry.run as { stage: string; status: string; attempt?: number; error?: string }
    console.log(`  [${entry.sequence}] STAGE ${r.stage.padEnd(12)} ${r.status.padEnd(10)} attempt=${r.attempt ?? '-'}`)
    if (r.error) console.log(`        error: ${r.error}`)
  } else if (entry.kind === 'GATE') {
    const r = entry.run as { gate: string; outcome: string; inspectedArtifactVersion: number }
    console.log(`  [${entry.sequence}] GATE  ${r.gate.padEnd(12)} ${r.outcome} artifact=${r.inspectedArtifactVersion}`)
  } else if (entry.kind === 'CAPABILITY') {
    const g = (entry.run as { unavailable: { operation: string; reason: string } }).unavailable
    console.log(`  [${entry.sequence}] CAPABILITY ${g.operation} [${g.reason}]`)
  } else if (entry.kind === 'STOP') {
    const r = entry.run as { action: string; stop?: { reason?: string } }
    console.log(`  [${entry.sequence}] STOP  ${r.action} ${r.stop?.reason ?? ''}`)
  } else {
    console.log(`  [${entry.sequence}] ${entry.kind}`)
  }
  }

  console.log('\n=== recorded validations ===')
  for (const v of audit?.validations ?? []) {
  const val = v as unknown as {
    scope?: string; valid?: boolean
    violations?: readonly { code: string; severity: string; message: string }[]
  }
  console.log(`  scope=${val.scope ?? '?'} valid=${String(val.valid)} violations=${val.violations?.length ?? 0}`)
  for (const violation of val.violations ?? []) {
    console.log(`    ${violation.severity.padEnd(8)} ${violation.code}`)
    console.log(`      ${violation.message.slice(0, 150)}`)
  }
  }

  console.log('\n=== review history ===')
  const history = audit?.reviewHistory as unknown as {
  rounds?: readonly { roundIndex?: number; result?: { status: string; summary: Record<string, unknown> } }[]
  } | undefined
  console.log(`  rounds: ${history?.rounds?.length ?? 0}`)
  for (const round of history?.rounds ?? []) {
  console.log(`    ${JSON.stringify(round.result?.summary ?? round)}`)
  }

  console.log('\n=== the surface extract actually obtained ===')
  const graph = checkpoint.accumulator.rebuild()
  const surface = graph.sources[0]
  console.log(`  ${surface?.id} contentHash=${surface?.contentHash ?? '(none)'}`)
  console.log(`  retrievedAt=${surface?.retrievedAt}`)

  console.log('\n=== every source, with accessibility ===')
  for (const s of graph.sources) {
  console.log(`  ${s.id} ${s.accessibility.padEnd(13)} hash=${(s.contentHash ?? '-').slice(0, 26).padEnd(26)} ${s.url ?? ''}`)
  }

  await closeHostDatabase()
}

main().catch((e: unknown) => { console.error(String(e)); process.exitCode = 1 })
