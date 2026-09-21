/**
 * The cross-realm error gate (#20, 20k). Runs against a real build.
 *
 * WHY A BUILD
 * ===========
 * The Eastleigh Voice run retried a `PERMANENT` provider failure twice while
 * every in-process suite was green — 32 adapter checks, 35 runtime checks, 58
 * pipeline checks. They could not have caught it: Next compiles
 * `instrumentation.ts` separately from the route handlers, so a built
 * application holds two copies of `lib/xray/capability.ts` and therefore two
 * `AdapterFailure` classes, and `instanceof` is false across them. One Node
 * process with one module graph has one class and cannot reproduce it.
 *
 * So this gate builds the application, starts it, and asks. A same-module test
 * does not count here, and that is the point of the file.
 *
 * WHAT IT PROVES
 * ==============
 *   1. the two bundles really are separate — the premise, not an assumption;
 *   2. `instanceof` is false for a host-built failure, and the branded
 *      predicate is true;
 *   3. a `PERMANENT` failure built in the host bundle produces **exactly one
 *      attempt**;
 *   4. the control — `isPermanent` reverted to constructor identity —
 *      reproduces **two**.
 *
 * (4) is a source mutation, applied and reverted around its own rebuild. A
 * control that only re-implemented the old check inside the route would be
 * testing the gate's copy of the bug rather than the production decision.
 *
 * It also scans, statically and for free, which error-defining modules the
 * host bundle can reach at all. That is what licenses every *other*
 * `instanceof` in the codebase to stay as it is.
 *
 * Run:  pnpm check:realms          (~3 minutes: three production builds)
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(new URL('../../../', import.meta.url).pathname)
const PORT = 3117

type Check = { name: string; run: () => string | null | Promise<string | null> }
const checks: Check[] = []
const check = (name: string, run: Check['run']) => { checks.push({ name, run }) }

// ---------------------------------------------------------------------------
// Static half: what the host bundle can reach
// ---------------------------------------------------------------------------

/**
 * Value imports only.
 *
 * `import type` and `import { type X }` are erased, so they put no class in a
 * bundle. Counting them would make the host bundle look far larger than it is
 * and would condemn error types it cannot actually construct.
 */
function valueImports(source: string): readonly string[] {
  const out: string[] = []
  for (const match of source.matchAll(/import\s+(type\s+)?([^'"]*?)\s*from\s*'([^']+)'/g)) {
    if (match[1] !== undefined) continue
    const clause = (match[2] ?? '').trim()
    if (/^\{[^}]*\}$/.test(clause)) {
      const names = clause.slice(1, -1).split(',').map((name) => name.trim()).filter(Boolean)
      if (names.length > 0 && names.every((name) => name.startsWith('type '))) continue
    }
    out.push(match[3]!)
  }
  for (const match of source.matchAll(/import\s*\(\s*'([^']+)'/g)) out.push(match[1]!)
  return out
}

function resolveSpecifier(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(root, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec)
  else return null
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function hostBundle(): ReadonlySet<string> {
  const seen = new Set<string>()
  const stack = [join(root, 'instrumentation.ts')]
  while (stack.length > 0) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of valueImports(readFileSync(file, 'utf8'))) {
      const resolved = resolveSpecifier(spec, file)
      if (resolved !== null) stack.push(resolved)
    }
  }
  return seen
}

check('1 · only two error-defining modules reach the host bundle', () => {
  /*
   * The audit that licenses every other `instanceof`. An error type can only
   * be built in the wrong realm if the module that builds it is *in* the host
   * bundle — so the branded types are exactly the ones this set contains, and
   * the rest stay as plain `instanceof` because nothing in the host can
   * construct them.
   *
   * If a future import drags, say, `version-commit.ts` in here, this fails —
   * and it should, because `VersionConflict` would then be able to cross a
   * boundary that `http.ts` classifies by identity.
   */
  const bundle = hostBundle()
  const holds = (file: string) => bundle.has(join(root, file))

  const branded = ['lib/xray/capability.ts', 'lib/xray/providers/anthropic/strict-schema.ts']
  for (const file of branded) {
    if (!holds(file)) return `${file} is no longer in the host bundle`
  }

  /*
   * Each of these defines or throws an error some production `instanceof`
   * reads. None may be reachable from the host entry.
   *
   *   version-commit.ts      VersionConflict, CandidateNotEligible  -> http.ts, assessment.ts
   *   graduation-service.ts  GraduationNotEligible                  -> assessment.ts
   *   assessment.ts          catches both                           -> graduation
   *   http.ts                BadRequest, HostNotConfigured, …       -> status codes
   *   ati-service.ts         ATIActionRejected, IntakeProcessing…   -> ati-routes.ts
   *   investigation-service  InvalidSubmissionInput, ExecutionNot…  -> http.ts
   *   inline-execution.ts    VersionConflict                        -> http.ts
   *   investigations.ts      InvestigationResourceNotFound          -> read paths
   */
  const mustNotReach = [
    'lib/xray/persistence/version-commit.ts',
    'lib/xray/application/graduation-service.ts',
    'lib/xray/application/assessment.ts',
    'lib/xray/application/http.ts',
    'lib/xray/application/ati-service.ts',
    'lib/xray/application/ati-routes.ts',
    'lib/xray/application/investigation-service.ts',
    'lib/xray/application/inline-execution.ts',
    'lib/xray/investigations.ts',
  ]
  const reached = mustNotReach.filter(holds)
  return reached.length === 0
    ? null : `the host bundle now reaches ${reached.join(', ')}`
})

check('2 · the branded predicate is a brand, not a name', () => {
  /*
   * A name check would also cross a bundle boundary — and would also be true
   * of anything that set the string, including decoded provider output. The
   * brand is a symbol only our constructor sets.
   */
  // Comments stripped: this file explains *why* it is not a name check, and a
  // scan that read its own prose would fail on the explanation.
  const stripComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const source = stripComments(readFileSync(join(root, 'lib/xray/capability.ts'), 'utf8'))
  if (!/Symbol\.for\('xray\.error\.AdapterFailure'\)/.test(source))
    return 'the AdapterFailure brand is not a registered symbol'
  if (/name === 'AdapterFailure'/.test(source))
    return 'the predicate falls back to a name check'

  // And the decision sites read the predicate rather than the class.
  for (const [file, pattern] of [
    ['lib/xray/pipeline/run.ts', /isPermanent\(err\)/],
    ['lib/xray/providers/material.ts', /isAdapterFailure\(err\)/],
  ] as const) {
    if (!pattern.test(stripComments(readFileSync(join(root, file), 'utf8'))))
      return `${file} does not use the branded predicate`
  }
  for (const file of ['lib/xray/pipeline/run.ts', 'lib/xray/providers/material.ts']) {
    if (/instanceof AdapterFailure/.test(stripComments(readFileSync(join(root, file), 'utf8'))))
      return `${file} still classifies by constructor identity`
  }
  return null
})

// ---------------------------------------------------------------------------
// Built half: a real application, started and asked
// ---------------------------------------------------------------------------

function build(): void {
  execFileSync('pnpm', ['exec', 'next', 'build'], {
    cwd: root, stdio: 'pipe', env: { ...process.env, XRAY_REALM_CHECK: '1' },
  })
}

/** Whether anything is still answering on the check port. */
async function answering(): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${PORT}/api/realm-check`, { signal: AbortSignal.timeout(2_000) })
    return true
  } catch { return false }
}

/**
 * Stop the server and **wait for the port**.
 *
 * `next start` runs the server in a child of the child, so killing the process
 * we spawned does not necessarily free the port — and the control run then
 * queries the previous build and reports that the mutation changed nothing.
 * That happened. Hence the process group, and hence the wait.
 */
async function stop(server: ChildProcess | undefined): Promise<void> {
  if (server?.pid !== undefined) {
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
  }
  const deadline = Date.now() + 20_000
  while (await answering()) {
    if (Date.now() > deadline) throw new Error('the check server would not stop')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

async function ask(): Promise<Record<string, unknown>> {
  if (await answering()) throw new Error(`something is already serving port ${PORT}`)
  let server: ChildProcess | undefined
  try {
    server = spawn('pnpm', ['exec', 'next', 'start', '--port', String(PORT)], {
      cwd: root, stdio: 'ignore', detached: true,
      env: { ...process.env, XRAY_REALM_CHECK: '1', PORT: String(PORT) },
    })
    const deadline = Date.now() + 60_000
    for (;;) {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/api/realm-check`, {
          signal: AbortSignal.timeout(5_000),
        })
        if (response.ok) return await response.json() as Record<string, unknown>
        if (Date.now() > deadline) return { error: `HTTP ${response.status}` }
      } catch {
        if (Date.now() > deadline) return { error: 'the server never answered' }
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  } finally {
    await stop(server)
  }
}

let observed: Record<string, unknown> = {}

check('3 · a permanent failure built in the host bundle is not retried', async () => {
  build()
  observed = await ask()
  if (observed['error'] !== undefined) return String(observed['error'])

  // The premise: two bundles, two classes. If this ever becomes false the
  // defect is gone for a different reason and this gate should be re-read.
  if (observed['hostBundleIsSeparate'] !== true)
    return 'the host bundle shares this one; the check proves nothing'
  if (observed['hostFailureIsAppInstance'] !== false)
    return 'instanceof now succeeds across the bundles'
  if (observed['appFailureIsAppInstance'] !== true)
    return 'instanceof fails within one bundle'

  // The fix: the brand crosses where the class does not.
  if (observed['brandedPredicateSeesHostFailure'] !== true)
    return 'the branded predicate did not recognise a host-built failure'
  if (observed['permanentPredicateSeesHostFailure'] !== true)
    return 'isPermanent did not recognise a host-built PERMANENT failure'

  // The consequence, which is the thing that actually matters.
  const attempts = observed['attempts'] as string[]
  return attempts.length === 1 && attempts[0] === 'DECOMPOSE:FAILED'
    ? null : `${attempts.length} attempt(s): ${JSON.stringify(attempts)}`
})

check('4 · control — constructor identity reproduces the two attempts', async () => {
  /*
   * The mutation is applied to the production predicate, not to a copy of it
   * inside this file: the question is whether the shipped decision depends on
   * class identity, and only the shipped decision can answer it.
   */
  const file = join(root, 'lib/xray/capability.ts')
  const original = readFileSync(file, 'utf8')
  const mutated = original.replace(
    "export const isPermanent = (err: unknown): boolean =>\n  isAdapterFailure(err) && err.disposition === 'PERMANENT'",
    "export const isPermanent = (err: unknown): boolean =>\n  err instanceof AdapterFailure && err.disposition === 'PERMANENT'")
  if (mutated === original) return 'the control could not be applied; isPermanent has changed shape'

  try {
    writeFileSync(file, mutated)
    build()
    const control = await ask()
    if (control['error'] !== undefined) return String(control['error'])
    const attempts = control['attempts'] as string[]
    if (control['permanentPredicateSeesHostFailure'] !== false)
      return 'the control still recognised the host-built failure'
    return attempts.length === 2
      ? null
      : `the control produced ${attempts.length} attempt(s): ${JSON.stringify(attempts)}`
  } finally {
    writeFileSync(file, original)
    // Leave a build that matches the source on disk.
    build()
  }
})

// ---------------------------------------------------------------------------

let failures = 0

async function main(): Promise<void> {
  for (const { name, run } of checks) {
    let detail: string | null
    try { detail = await run() } catch (err) { detail = `threw: ${(err as Error).message}` }
    console.log(`${detail === null ? 'ok  ' : 'FAIL'}  ${name}${detail === null ? '' : ` — ${detail}`}`)
    if (detail !== null) failures += 1
  }
  console.log(`\n${JSON.stringify(observed, null, 2)}`)
  console.log(`\n${checks.length - failures}/${checks.length} realm checks passed`)
  if (failures > 0) process.exitCode = 1
}

main().catch((err: unknown) => {
  console.error(`\nFAIL  the gate itself failed: ${String(err)}`)
  process.exit(1)
})
