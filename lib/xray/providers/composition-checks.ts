/**
 * Provider composition checks (#20 slice 20a).
 *
 * Composition only. No network call is made here, because none is possible:
 * 20a registers no factory, so nothing can be constructed even by accident.
 *
 * The gate has two halves. One drives `composeProviders` over supplied
 * environments — never `process.env`, so a check cannot pass or fail because
 * of what happens to be exported in a shell. The other reads source, to prove
 * two negatives that only source can prove: that the pipeline layer imports no
 * provider and reads no provider setting, and that no runtime is registered
 * yet.
 *
 * Run:  pnpm check:providers
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { ResearchAdapter } from '@/lib/xray/pipeline/retrieval-port'
import type { ResearchModel } from '@/lib/xray/pipeline/model-port'
import type { ReviewerModel } from '@/lib/xray/review'
import { PROVIDER_ENV, readProviderSelections, type Environment } from './config'
import {
  composeProviders, describeResolution, fullyAvailable,
  DEFAULT_REGISTRY, type ProviderRegistry,
} from './registry'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

function check(name: string, fn: () => string | null): void {
  let detail: string | null
  try { detail = fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

/*
 * A sentinel standing in for a secret value. It is deliberately NOT shaped
 * like a real key: the committed-secret scan below searches by key shape
 * across every tracked file, and a realistic-looking sentinel would have
 * forced that scan to exempt this file — exempting the one file whose whole
 * subject is secret handling.
 */
const SECRET = 'XRAY-SENTINEL-standing-in-for-a-secret-value'

const ANTHROPIC_CONFIGURED: Environment = { ANTHROPIC_API_KEY: SECRET }

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

const root = (path: string) => new URL(`../../../${path}`, import.meta.url).pathname

/** Every `.ts`/`.tsx` under a directory, recursively. */
function sources(directory: string): string[] {
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (/\.tsx?$/.test(entry)) out.push(full)
    }
  }
  walk(root(directory))
  return out
}

const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

main()

function main(): void {
  // === parsing ==========================================================

  check('1 · an empty environment selects no provider', () => {
    const composed = composeProviders({})
    if (Object.keys(composed.selections).length !== 0)
      return `selections ${JSON.stringify(composed.selections)}`
    for (const slot of ['research', 'reviewer', 'retrieval'] as const) {
      if (composed[slot].status !== 'NOT_SELECTED')
        return `${slot} resolved ${composed[slot].status}`
    }
    // And an empty-string selection is absence, not a provider named "".
    const blank = composeProviders({
      [PROVIDER_ENV.researchModel]: '   ', [PROVIDER_ENV.retrieval]: '',
    })
    return blank.research.status === 'NOT_SELECTED' && blank.retrieval.status === 'NOT_SELECTED'
      ? null : 'a blank selection was treated as a provider name'
  })

  check('2 · an Anthropic research selection with no model id is incomplete', () => {
    const composed = composeProviders({
      ...ANTHROPIC_CONFIGURED, [PROVIDER_ENV.researchModel]: 'anthropic',
    })
    if (composed.research.status !== 'MODEL_ID_REQUIRED')
      return `resolved ${composed.research.status}`
    if (composed.research.variable !== PROVIDER_ENV.researchModelId)
      return `named ${composed.research.variable}`
    // The point of the state: no model was chosen on the operator's behalf.
    const described = describeResolution(composed.research)
    return /implies no model/.test(described) ? null : `described as "${described}"`
  })

  check('3 · an Anthropic reviewer selection with no model id is incomplete', () => {
    const composed = composeProviders({
      ...ANTHROPIC_CONFIGURED, [PROVIDER_ENV.reviewerModel]: 'anthropic',
    })
    if (composed.reviewer.status !== 'MODEL_ID_REQUIRED')
      return `resolved ${composed.reviewer.status}`
    return composed.reviewer.variable === PROVIDER_ENV.reviewerModelId
      ? null : `named ${composed.reviewer.variable}`
  })

  check('4 · a retrieval selection requires no model id', () => {
    const composed = composeProviders({
      ...ANTHROPIC_CONFIGURED, [PROVIDER_ENV.retrieval]: 'anthropic',
    })
    // Recognised, configured, and awaiting 20c's adapter — not incomplete.
    if (composed.retrieval.status !== 'NOT_IMPLEMENTED')
      return `resolved ${composed.retrieval.status}`
    const custom = composeProviders({ [PROVIDER_ENV.retrieval]: 'custom' })
    return custom.retrieval.status === 'NOT_IMPLEMENTED'
      ? null : `custom resolved ${custom.retrieval.status}`
  })

  // === unknown names ====================================================

  check('5/6/7 · an unknown provider is rejected in every slot, and named', () => {
    const composed = composeProviders({
      ...ANTHROPIC_CONFIGURED,
      [PROVIDER_ENV.researchModel]: 'mystery', [PROVIDER_ENV.researchModelId]: 'x',
      [PROVIDER_ENV.reviewerModel]: 'mystery', [PROVIDER_ENV.reviewerModelId]: 'x',
      [PROVIDER_ENV.retrieval]: 'mystery',
    })
    for (const slot of ['research', 'reviewer', 'retrieval'] as const) {
      const resolution = composed[slot]
      if (resolution.status !== 'UNKNOWN_PROVIDER') return `${slot} resolved ${resolution.status}`
      if (resolution.requested !== 'mystery') return `${slot} requested ${resolution.requested}`
      if (resolution.known.length === 0) return `${slot} lists no registered providers`
    }
    // An unknown name never becomes a known one.
    return composed.research.status === 'UNKNOWN_PROVIDER'
      && !composed.research.known.includes('mystery')
      ? null : 'an unknown provider appeared in the registered list'
  })

  // === independence of the slots =======================================

  check('8/9 · the slots may name different providers and different models', () => {
    const composed = composeProviders({
      ANTHROPIC_API_KEY: SECRET, OPENAI_API_KEY: SECRET,
      [PROVIDER_ENV.researchModel]: 'openai', [PROVIDER_ENV.researchModelId]: 'a-research-model',
      [PROVIDER_ENV.reviewerModel]: 'anthropic', [PROVIDER_ENV.reviewerModelId]: 'a-reviewer-model',
      [PROVIDER_ENV.retrieval]: 'custom',
    })
    if (composed.selections.research?.provider !== 'openai')
      return `research provider ${String(composed.selections.research?.provider)}`
    if (composed.selections.reviewer?.provider !== 'anthropic')
      return `reviewer provider ${String(composed.selections.reviewer?.provider)}`
    if (composed.selections.research?.modelId === composed.selections.reviewer?.modelId)
      return 'the two slots collapsed onto one model id'
    if (composed.selections.retrieval?.provider !== 'custom')
      return `retrieval provider ${String(composed.selections.retrieval?.provider)}`
    // Same provider, different models, is also legal.
    const sameProvider = composeProviders({
      ...ANTHROPIC_CONFIGURED,
      [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.researchModelId]: 'model-one',
      [PROVIDER_ENV.reviewerModel]: 'anthropic', [PROVIDER_ENV.reviewerModelId]: 'model-two',
    })
    return sameProvider.selections.research?.modelId === 'model-one'
      && sameProvider.selections.reviewer?.modelId === 'model-two'
      ? null : 'one provider could not carry two model ids'
  })

  check('9b · the provider name never implies a model id', () => {
    const composed = composeProviders({
      ...ANTHROPIC_CONFIGURED,
      [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.researchModelId]: 'explicit-id',
    })
    if (composed.selections.research?.modelId !== 'explicit-id')
      return `model id ${String(composed.selections.research?.modelId)}`
    // No default is authored anywhere in this layer.
    for (const file of ['lib/xray/providers/config.ts', 'lib/xray/providers/registry.ts']) {
      const source = stripComments(read(file))
      const claudeDefault = /claude-[a-z0-9.\-]+/i.exec(source)
      if (claudeDefault) return `${file} names a model: ${claudeDefault[0]}`
      if (/gpt-[a-z0-9.\-]+/i.test(source)) return `${file} names an OpenAI model`
    }
    return null
  })

  // === secrets ==========================================================

  check('10 · a missing secret is reported by name, never by value', () => {
    const composed = composeProviders({
      [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.researchModelId]: 'a-model',
    })
    if (composed.research.status !== 'CONFIGURATION_INCOMPLETE')
      return `resolved ${composed.research.status}`
    if (!composed.research.missing.includes('ANTHROPIC_API_KEY'))
      return `missing ${JSON.stringify(composed.research.missing)}`
    const described = describeResolution(composed.research)
    return /ANTHROPIC_API_KEY .* not set/.test(described)
      ? null : `described as "${described}"`
  })

  check('10b · a present secret never appears in a result, description or error', () => {
    const composed = composeProviders({
      ANTHROPIC_API_KEY: SECRET, OPENAI_API_KEY: SECRET,
      [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.researchModelId]: 'a-model',
      [PROVIDER_ENV.reviewerModel]: 'openai', [PROVIDER_ENV.reviewerModelId]: 'b-model',
      [PROVIDER_ENV.retrieval]: 'anthropic',
    })
    // The resolutions, serialized. `env` handles are deliberately not carried
    // on a resolution, so nothing can walk back to a value through one.
    const serialized = JSON.stringify([
      composed.research, composed.reviewer, composed.retrieval, composed.selections,
    ])
    if (serialized.includes(SECRET)) return 'a resolution carries the secret value'
    for (const slot of ['research', 'reviewer', 'retrieval'] as const) {
      if (describeResolution(composed[slot]).includes(SECRET))
        return `the ${slot} description carries the secret value`
    }
    // And a thrown message cannot, because nothing here throws with config in
    // it; asserted by there being no throw carrying env at all.
    const source = stripComments(read('lib/xray/providers/registry.ts'))
      + stripComments(read('lib/xray/providers/config.ts'))
    if (/throw new \w*Error\([^)]*env/.test(source))
      return 'an error message is built from the environment'
    return null
  })

  // === no fallback ======================================================

  check('11 · a provider that cannot be honoured never becomes another one', () => {
    const cases: [string, Environment, string][] = [
      ['unknown name', {
        [PROVIDER_ENV.researchModel]: 'mystery', [PROVIDER_ENV.researchModelId]: 'x',
      }, 'UNKNOWN_PROVIDER'],
      ['no model id', {
        ...ANTHROPIC_CONFIGURED, [PROVIDER_ENV.researchModel]: 'anthropic',
      }, 'MODEL_ID_REQUIRED'],
      ['no secret', {
        [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.researchModelId]: 'x',
      }, 'CONFIGURATION_INCOMPLETE'],
      ['not implemented', {
        ...ANTHROPIC_CONFIGURED,
        [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.researchModelId]: 'x',
      }, 'NOT_IMPLEMENTED'],
    ]
    for (const [label, env, expected] of cases) {
      const composed = composeProviders(env)
      if (composed.research.status !== expected)
        return `${label}: resolved ${composed.research.status}, expected ${expected}`
      // Whatever went wrong, the answer names the selected provider or nothing
      // — never a substitute.
      const resolution = composed.research as { provider?: string; requested?: string }
      const named = resolution.provider ?? resolution.requested
      if (named !== undefined && named !== 'anthropic' && named !== 'mystery')
        return `${label}: resolved to "${named}"`
      if (fullyAvailable(composed)) return `${label}: reported as fully available`
    }
    // No code path picks a different entry when one fails.
    const source = stripComments(read('lib/xray/providers/registry.ts'))
    for (const smell of [/entries\[0\]/, /\?\?\s*entries\.find/, /fallback/i,
      /\|\|\s*'anthropic'/, /\?\?\s*'anthropic'/]) {
      if (smell.test(source)) return `the registry contains a fallback: ${String(smell)}`
    }
    return null
  })

  // === the ports ========================================================

  check('12 · factories return the existing ports and nothing else', () => {
    /*
     * Proven by construction: a test registry whose factories return the real
     * port types resolves to AVAILABLE and hands them back. If a factory's
     * return type were anything other than the existing port, this would not
     * typecheck — which is the strongest form the claim can take.
     */
    const model: ResearchModel = {
      name: 'test-research-model',
      async decompose() { return unavailable() },
      async classify() { return unavailable() },
      async trace() { return unavailable() },
      async disconfirm() { return unavailable() },
      async reconcile() { return unavailable() },
      async grade() { return unavailable() },
      async identifyGaps() { return unavailable() },
    }
    const reviewer: ReviewerModel = {
      name: 'test-reviewer-model',
      async judge() { return unavailable() },
    }
    const adapter: ResearchAdapter = {
      name: 'test-retrieval',
      async search() { return unavailable() },
      async retrieve() { return unavailable() },
    }
    const registry: ProviderRegistry = {
      researchModels: [{ provider: 'anthropic', requires: [], create: () => model }],
      reviewerModels: [{ provider: 'anthropic', requires: [], create: () => reviewer }],
      retrieval: [{ provider: 'anthropic', requires: [], create: () => adapter }],
    }
    const composed = composeProviders({
      [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.researchModelId]: 'x',
      [PROVIDER_ENV.reviewerModel]: 'anthropic', [PROVIDER_ENV.reviewerModelId]: 'y',
      [PROVIDER_ENV.retrieval]: 'anthropic',
    }, registry)

    if (!fullyAvailable(composed)) return 'a fully configured registry did not resolve available'
    if (composed.research.status !== 'AVAILABLE') return 'research is not available'
    if (composed.research.modelId !== 'x') return `research model id ${String(composed.research.modelId)}`
    if (composed.reviewer.status !== 'AVAILABLE' || composed.reviewer.modelId !== 'y')
      return 'reviewer did not carry its own model id'
    // The default registry implements none of them, so 20a can construct
    // nothing by accident.
    const implemented = [
      ...DEFAULT_REGISTRY.researchModels, ...DEFAULT_REGISTRY.reviewerModels,
      ...DEFAULT_REGISTRY.retrieval,
    ].filter((entry) => entry.create !== undefined)
    return implemented.length === 0
      ? null : `${implemented.length} default entr(ies) can already construct a provider`
  })

  // === isolation ========================================================

  check('13 · no provider import or provider setting reaches any other layer', () => {
    /*
     * Stated over the whole tracked tree rather than an allowlist of
     * directories, so a new directory cannot quietly acquire the right to
     * read a provider setting. Only the provider layer and the host
     * composition area may name these variables at all.
     */
    const repository = root('').replace(/\/$/, '')
    const tracked = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.mjs'],
      { cwd: repository, encoding: 'utf8' }).split('\n').filter(Boolean)
    const composition = /^lib\/xray\/(providers|host)\//

    for (const file of tracked) {
      if (composition.test(file)) continue
      const source = stripComments(readFileSync(join(repository, file), 'utf8'))
      if (/from '@\/lib\/xray\/providers\//.test(source) || /providers\/(config|registry)'/.test(source))
        return `${file} imports the provider layer`
      for (const variable of Object.values(PROVIDER_ENV)) {
        if (source.includes(variable)) return `${file} reads ${variable}`
      }
      for (const secret of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
        if (source.includes(secret)) return `${file} reads ${secret}`
      }
    }

    // The pipeline layer and the graph it writes read no environment at all.
    for (const directory of ['lib/xray/pipeline', 'lib/xray/domain', 'lib/xray/validation',
      'lib/xray/projections', 'lib/xray/selectors', 'lib/xray/review', 'lib/xray/acceptance']) {
      for (const file of sources(directory)) {
        if (/-checks\.ts$/.test(file)) continue
        if (/process\.env/.test(stripComments(readFileSync(file, 'utf8'))))
          return `${file.slice(file.indexOf('lib/xray'))} reads process.env`
      }
    }

    // And the provider layer never reaches back into a host or a runtime.
    for (const file of sources('lib/xray/providers')) {
      if (file.endsWith('composition-checks.ts')) continue
      if (/setExecutionRuntimeProvider|setDatabaseProvider|hostConnection/
        .test(stripComments(readFileSync(file, 'utf8'))))
        return `${file.slice(file.indexOf('lib/xray'))} registers or opens a host resource`
    }
    return null
  })

  check('13b · provider selectors and model ids never enter canonical state', () => {
    // A selection is a fact about a deployment, not about an investigation.
    // Nothing in the domain, the snapshot writer or the schema can hold one.
    const schema = read('db/migrations/0001_version_ownership.up.sql')
    for (const variable of Object.values(PROVIDER_ENV)) {
      if (schema.includes(variable)) return `the schema mentions ${variable}`
    }
    for (const token of ['model_id', 'provider_name', 'research_model']) {
      if (new RegExp(`\\b${token}\\b`).test(schema)) return `the schema has a ${token} column`
    }
    const domain = sources('lib/xray/domain')
      .map((file) => readFileSync(file, 'utf8')).join('\n')
    return /modelId|providerName/.test(domain)
      ? 'the domain carries a provider selector' : null
  })

  // === nothing registered yet ==========================================

  check('15 · 20a registers no execution runtime, so the unconfigured path stands', () => {
    const instrumentation = stripComments(read('instrumentation.ts'))
    if (/providers\//.test(instrumentation))
      return 'instrumentation already composes providers'
    if (/setExecutionRuntimeProvider/.test(instrumentation))
      return 'instrumentation already registers an execution runtime'
    // The default runtime is still what an unconfigured deployment gets.
    const runtime = stripComments(read('lib/xray/application/runtime.ts'))
    if (!/unconfiguredResearchRuntime/.test(runtime))
      return 'the unconfigured runtime is gone'
    return /providers\//.test(runtime) ? 'the application runtime imports the provider layer' : null
  })

  check('14/§5 · no provider secret can be committed, and none has been', () => {
    const repository = root('').replace(/\/$/, '')
    const git = (...argv: string[]) =>
      execFileSync('git', argv, { cwd: repository, encoding: 'utf8' })

    // Every plausible home for a provider key is ignored, .envrc included:
    // direnv users export keys there and it is not covered by ".env.*".
    for (const candidate of ['.env', '.env.local', '.env.production',
      '.env.production.local', '.envrc', '.env.anthropic']) {
      try { git('check-ignore', '-q', candidate) }
      catch { return `${candidate} is not ignored` }
    }

    // Nothing tracked looks like a live key. Searched by shape, not by name,
    // so a key stored under an unexpected variable is still caught.
    const tracked = git('ls-files').split('\n').filter(Boolean)
    const keyShape = /(sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,})/
    for (const file of tracked) {
      let content: string
      try { content = readFileSync(join(repository, file), 'utf8') } catch { continue }
      const found = keyShape.exec(content)
      if (found) return `${file} contains something shaped like a key: ${found[0].slice(0, 12)}…`
    }

    // And the canonical fixture is byte-identical to its committed state, so
    // 20a demonstrably changed no evidence.
    const fixtureDiff = git('status', '--porcelain', '--', 'lib/xray/fixtures').trim()
    return fixtureDiff === '' ? null : `the fixture is modified:\n${fixtureDiff}`
  })

  check('stop line · no provider HTTP, SDK, prompt or model call exists yet', () => {
    // The gate itself is excluded: it names the forbidden tokens in order to
    // forbid them, which is the opposite of containing a provider call.
    for (const file of sources('lib/xray/providers')) {
      if (file.endsWith('composition-checks.ts')) continue
      const source = stripComments(readFileSync(file, 'utf8'))
      const relative = file.slice(file.indexOf('lib/xray'))
      for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /https?:\/\/api\./,
        /@anthropic-ai/, /\bopenai\b.*from/, /messages\.create/, /system\s*:/,
        /\bprompt\b\s*[:=]/]) {
        if (forbidden.test(source)) return `${relative} contains ${String(forbidden)}`
      }
    }
    // The exclusion above is narrow, not a hole: no file in the layer — the
    // gate included — may even import a transport.
    for (const file of sources('lib/xray/providers')) {
      const imports = stripComments(readFileSync(file, 'utf8'))
        .match(/from '([^']+)'/g) ?? []
      const transport = imports.find((line) => /node:(http|https|net|tls|dns)/.test(line))
      if (transport !== undefined)
        return `${file.slice(file.indexOf('lib/xray'))} imports a transport: ${transport}`
    }

    // And no provider SDK was added as a dependency.
    const manifest = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>
    }
    const installed = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    const sdk = installed.filter((name) => /anthropic|openai|langchain|ai-sdk/i.test(name))
    return sdk.length === 0 ? null : `a provider SDK is installed: ${sdk.join(', ')}`
  })

  report()
}

/** The one shape every test port returns: nothing is available in 20a. */
function unavailable() {
  return {
    kind: 'CAPABILITY_UNAVAILABLE' as const,
    operation: 'test:composition',
    reason: 'NOT_CONFIGURED' as const,
    detail: 'The composition gate constructs no live provider.',
    resolvedBy: 'Implement a provider adapter in a later slice.',
  }
}

function report(): void {
  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
  }
  const failed = results.filter((result) => !result.ok).length
  console.log(`\n${results.length - failed}/${results.length} provider composition checks passed`)
  if (failed > 0) process.exitCode = 1
}
