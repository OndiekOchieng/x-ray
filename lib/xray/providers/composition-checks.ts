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
import {
  PROVIDER_ENV, narrowEnvironment,
  type Environment, type ModelProviderConfig, type ProviderConfiguration,
  type RetrievalProviderConfig,
} from './config'
import {
  composeProviders, declaredNames, describeResolution, fullyAvailable,
  DEFAULT_REGISTRY, type ProviderRegistry,
} from './registry'

type Check = { name: string; run: () => string | null | Promise<string | null> }
const checks: Check[] = []

function check(name: string, run: Check['run']): void { checks.push({ name, run }) }

/*
 * An unhandled rejection must fail the gate, not vanish. An earlier version of
 * check 12c discarded the factory promise with `void`, so a factory that threw
 * still reported ok and the process died after printing a pass.
 */
process.on('unhandledRejection', (reason) => {
  console.error(`\nFAIL  an unhandled rejection escaped a check: ${String(reason)}`)
  process.exit(1)
})

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

async function main(): Promise<void> {
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

  check('4 · a retrieval selection requires no composition model id', () => {
    /*
     * The property is about the *composition contract*: there is no
     * `XRAY_RETRIEVAL_MODEL_ID`, because a search provider is not a model, and
     * resolution must never demand one. What a particular entry needs to do
     * its job is the entry's own declaration.
     */
    if ((PROVIDER_ENV as Record<string, string>)['retrievalModelId'] !== undefined)
      return 'the composition contract grew a retrieval model id'
    for (const variable of Object.values(PROVIDER_ENV)) {
      if (/RETRIEVAL.*MODEL_ID/.test(variable)) return `${variable} exists`
    }

    // A fully configured retrieval selection resolves without one being set.
    const composed = composeProviders({
      ANTHROPIC_API_KEY: SECRET,
      XRAY_ANTHROPIC_SEARCH_MODEL_ID: 'a-search-model',
      [PROVIDER_ENV.retrieval]: 'anthropic',
    })
    if (composed.retrieval.status !== 'AVAILABLE')
      return `resolved ${composed.retrieval.status}`
    // And no MODEL_ID_REQUIRED can ever be reported for retrieval, because
    // that state is typed to a model slot.
    if ((composed.retrieval as { status: string }).status === 'MODEL_ID_REQUIRED')
      return 'retrieval reported MODEL_ID_REQUIRED'

    /*
     * The entry's own requirement is reported as incomplete configuration, not
     * as availability that throws later. An entry whose factory would throw
     * for a missing variable must not resolve AVAILABLE.
     */
    const missing = composeProviders({
      ANTHROPIC_API_KEY: SECRET, [PROVIDER_ENV.retrieval]: 'anthropic',
    })
    if (missing.retrieval.status !== 'CONFIGURATION_INCOMPLETE')
      return `without its search model id, retrieval resolved ${missing.retrieval.status}`
    if (!missing.retrieval.missing.includes('XRAY_ANTHROPIC_SEARCH_MODEL_ID'))
      return `missing names ${JSON.stringify(missing.retrieval.missing)}`

    // `custom` is still reserved without a factory.
    const custom = composeProviders({ [PROVIDER_ENV.retrieval]: 'custom' })
    return custom.retrieval.status === 'NOT_IMPLEMENTED'
      ? null : `custom resolved ${custom.retrieval.status}`
  })

  check('4b · every AVAILABLE resolution can actually be constructed', async () => {
    /*
     * The general form of the wart check 4 caught: a resolution that reports
     * AVAILABLE and then throws on construction is a resolution that lies.
     * Every default row that resolves AVAILABLE under a fully configured
     * environment is actually constructed here.
     */
    const composed = composeProviders({
      ANTHROPIC_API_KEY: SECRET,
      XRAY_ANTHROPIC_SEARCH_MODEL_ID: 'a-search-model',
      [PROVIDER_ENV.researchModel]: 'anthropic',
      [PROVIDER_ENV.researchModelId]: 'a-research-model',
      [PROVIDER_ENV.reviewerModel]: 'anthropic',
      [PROVIDER_ENV.reviewerModelId]: 'a-reviewer-model',
      [PROVIDER_ENV.retrieval]: 'anthropic',
    })
    for (const slot of ['research', 'reviewer', 'retrieval'] as const) {
      const resolution = composed[slot]
      if (resolution.status !== 'AVAILABLE') return `${slot} resolved ${resolution.status}`
      try {
        const port = await resolution.create()
        if (typeof (port as { name?: unknown }).name !== 'string')
          return `${slot} constructed something without a name`
      } catch (err) {
        return `${slot} resolved AVAILABLE but threw: ${(err as Error).message}`
      }
    }
    return null
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
      // `openai` is registered and reserved without a factory, so it is the
      // row that still exercises NOT_IMPLEMENTED now that 20b implements
      // Anthropic. Using Anthropic here would have made this case vacuous.
      ['not implemented', {
        OPENAI_API_KEY: SECRET,
        [PROVIDER_ENV.researchModel]: 'openai', [PROVIDER_ENV.researchModelId]: 'x',
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
      if (named !== undefined && !['anthropic', 'openai', 'mystery'].includes(named))
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
    const registry: ProviderRegistry = {
      researchModels: [{
        provider: 'anthropic', requires: [], create: () => testResearchModel,
      }],
      reviewerModels: [{
        provider: 'anthropic', requires: [], create: () => testReviewerModel,
      }],
      retrieval: [{
        provider: 'anthropic', requires: [], create: () => testResearchAdapter,
      }],
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
    /*
     * Which default rows are implemented, stated exactly. 20a implemented
     * none, 20b the two Anthropic model rows, 20c Anthropic retrieval.
     * Asserting the whole table rather than a count means a row that quietly
     * gains a factory — `openai` or `custom` — fails here.
     */
    const implemented = (entries: readonly { provider: string; create?: unknown }[]) =>
      entries.filter((entry) => entry.create !== undefined)
        .map((entry) => entry.provider).sort()
    const expected = {
      researchModels: ['anthropic'],
      reviewerModels: ['anthropic'],
      // 20c implements Anthropic retrieval. `custom` stays reserved.
      retrieval: ['anthropic'],
    }
    for (const slot of ['researchModels', 'reviewerModels', 'retrieval'] as const) {
      const actual = implemented(DEFAULT_REGISTRY[slot])
      if (JSON.stringify(actual) !== JSON.stringify(expected[slot])) {
        return `${slot} implements ${JSON.stringify(actual)},`
          + ` expected ${JSON.stringify(expected[slot])}`
      }
    }
    return null
  })

  check('12b · every resolution names its exact slot, absence included', () => {
    // "No research model" and "no reviewer model" are different facts. A
    // generic MODEL would erase the difference an operator needs.
    const none = composeProviders({})
    if (none.research.slot !== 'RESEARCH_MODEL') return `absent research slot ${none.research.slot}`
    if (none.reviewer.slot !== 'REVIEWER_MODEL') return `absent reviewer slot ${none.reviewer.slot}`
    if (none.retrieval.slot !== 'RETRIEVAL') return `absent retrieval slot ${none.retrieval.slot}`

    // And in every other state, across all three slots.
    const vocabulary = new Set(['RESEARCH_MODEL', 'REVIEWER_MODEL', 'RETRIEVAL'])
    const environments: Environment[] = [
      { [PROVIDER_ENV.researchModel]: 'mystery', [PROVIDER_ENV.reviewerModel]: 'mystery',
        [PROVIDER_ENV.retrieval]: 'mystery' },
      { [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.reviewerModel]: 'anthropic' },
      { [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.researchModelId]: 'x',
        [PROVIDER_ENV.reviewerModel]: 'openai', [PROVIDER_ENV.reviewerModelId]: 'y',
        [PROVIDER_ENV.retrieval]: 'anthropic' },
      { ...ANTHROPIC_CONFIGURED,
        [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.researchModelId]: 'x',
        [PROVIDER_ENV.reviewerModel]: 'anthropic', [PROVIDER_ENV.reviewerModelId]: 'y',
        [PROVIDER_ENV.retrieval]: 'custom' },
    ]
    const seen = new Set<string>()
    for (const env of environments) {
      const composed = composeProviders(env)
      for (const [slot, expected] of [
        ['research', 'RESEARCH_MODEL'], ['reviewer', 'REVIEWER_MODEL'],
        ['retrieval', 'RETRIEVAL'],
      ] as const) {
        const resolution = composed[slot]
        if (!vocabulary.has(resolution.slot))
          return `${resolution.status} carried slot "${resolution.slot}"`
        if (resolution.slot !== expected)
          return `the ${slot} slot reported ${resolution.slot} in ${resolution.status}`
        seen.add(resolution.status)
      }
    }
    // All six states were actually exercised above, not just the easy ones.
    const states = ['NOT_SELECTED', 'UNKNOWN_PROVIDER', 'MODEL_ID_REQUIRED',
      'CONFIGURATION_INCOMPLETE', 'NOT_IMPLEMENTED']
    seen.add(none.research.status)
    const unexercised = states.filter((state) => !seen.has(state))
    return unexercised.length === 0 ? null : `never exercised: ${unexercised.join(', ')}`
  })

  check('12c · a factory sees only what its own entry declares', async () => {
    /*
     * The adversarial case. An Anthropic entry declaring ANTHROPIC_API_KEY is
     * composed against an environment that also holds OPENAI_API_KEY, a
     * database URL and an unrelated sentinel. The factory records everything
     * it can reach; nothing foreign may be reachable.
     */
    const FOREIGN = {
      OPENAI_API_KEY: 'FOREIGN-openai-value',
      XRAY_POSTGRES_URL: 'postgres://FOREIGN-database-value/x',
      XRAY_UNRELATED_SENTINEL: 'FOREIGN-unrelated-value',
    }
    const foreignValues = Object.values(FOREIGN)

    let seen: ModelProviderConfig | undefined
    let seenRetrieval: RetrievalProviderConfig | undefined
    const registry: ProviderRegistry = {
      researchModels: [{
        provider: 'anthropic', requires: ['ANTHROPIC_API_KEY'],
        create: (config) => { seen = config; return testResearchModel },
      }],
      reviewerModels: [],
      retrieval: [{
        provider: 'anthropic', requires: ['ANTHROPIC_API_KEY'],
        create: (config) => { seenRetrieval = config; return testResearchAdapter },
      }],
    }

    const composed = composeProviders({
      ...FOREIGN, ANTHROPIC_API_KEY: SECRET,
      [PROVIDER_ENV.researchModel]: 'anthropic', [PROVIDER_ENV.researchModelId]: 'a-model',
      [PROVIDER_ENV.retrieval]: 'anthropic',
    }, registry)
    if (composed.research.status !== 'AVAILABLE') return `research ${composed.research.status}`

    // Resolution alone must not have constructed anything.
    if (seen !== undefined) return 'the factory ran during resolution'

    // Calling the thunk is the only thing that reaches a factory. Awaited, so
    // a factory that throws fails this check rather than escaping it.
    const model = await composed.research.create()
    if (model !== testResearchModel) return 'the factory did not return its port'
    if (composed.retrieval.status !== 'AVAILABLE')
      return `retrieval ${composed.retrieval.status}`
    await composed.retrieval.create()
    if (seen === undefined || seenRetrieval === undefined) return 'the factory never ran'

    for (const [label, config] of [
      ['research', seen as ModelProviderConfig],
      ['retrieval', seenRetrieval as RetrievalProviderConfig],
    ] as const) {
      const configuration = config.configuration

      // It got its own declared secret — the boundary narrows, not blinds.
      if (configuration.require('ANTHROPIC_API_KEY') !== SECRET)
        return `${label}: could not read its own declared key`
      if (configuration.declaredNames.length !== 1)
        return `${label}: declares ${JSON.stringify(configuration.declaredNames)}`

      // Nothing foreign is present, by name...
      for (const name of Object.keys(FOREIGN)) {
        if (name in configuration.declared)
          return `${label}: ${name} is present in declared configuration`
        if (configuration.declared[name] !== undefined)
          return `${label}: ${name} is readable`
        let threw = false
        try { configuration.require(name) } catch (err) {
          threw = true
          const message = (err as Error).message
          for (const foreign of [...foreignValues, SECRET]) {
            if (message.includes(foreign)) return `${label}: require(${name}) leaked a value`
          }
        }
        if (!threw) return `${label}: require(${name}) did not throw`
        let optionalThrew = false
        try { configuration.optional(name) } catch { optionalThrew = true }
        if (!optionalThrew) return `${label}: optional(${name}) did not throw`
      }

      // ...and not by value, anywhere reachable from the config object.
      const reachable = collectStrings(config)
      for (const foreign of foreignValues) {
        if (reachable.some((text) => text.includes(foreign)))
          return `${label}: a foreign value is reachable from the config object`
      }
      if (!reachable.some((text) => text.includes(SECRET)))
        return `${label}: the declared key was not reachable, so the scan proves nothing`

      // No prototype channel, and no environment handle by any name.
      if (Object.getPrototypeOf(configuration.declared) !== null)
        return `${label}: the declared record has a prototype`
      if (!Object.isFrozen(configuration.declared) || !Object.isFrozen(configuration))
        return `${label}: the configuration is mutable`
      for (const key of Object.keys(config)) {
        if (/^(env|environment|process|secrets)$/i.test(key))
          return `${label}: the config exposes "${key}"`
      }
    }

    // The declaration is the boundary: widening it is a registry edit.
    const widened = narrowEnvironment(
      { ...FOREIGN, ANTHROPIC_API_KEY: SECRET },
      declaredNames({ requires: ['ANTHROPIC_API_KEY'], optional: ['XRAY_UNRELATED_SENTINEL'] }),
    )
    if (widened.optional('XRAY_UNRELATED_SENTINEL') !== FOREIGN.XRAY_UNRELATED_SENTINEL)
      return 'an explicitly declared optional name was not readable'
    if (widened.declared['OPENAI_API_KEY'] !== undefined)
      return 'widening one name exposed another'

    // An entry declaring nothing sees nothing.
    const blind = narrowEnvironment({ ...FOREIGN, ANTHROPIC_API_KEY: SECRET }, [])
    return Object.keys(blind.declared).length === 0 && blind.declaredNames.length === 0
      ? null : 'an entry declaring nothing still received configuration'
  })

  check('12d · the type cannot carry an environment handle', () => {
    // The runtime scan above proves this instance is clean; this proves the
    // shape is, so 20b cannot re-add the handle without deleting this line.
    const source = stripComments(read('lib/xray/providers/config.ts'))
    const interfaces = source.match(
      /export interface (?:Model|Retrieval)ProviderConfig \{[^}]*\}/g) ?? []
    if (interfaces.length !== 2) return `found ${interfaces.length} config interfaces`
    for (const shape of interfaces) {
      if (/\benv\b\s*:/.test(shape)) return `a config interface still declares env: ${shape}`
      if (/Environment/.test(shape)) return 'a config interface still carries an Environment'
    }
    // And narrowEnvironment is the only door.
    const registry = stripComments(read('lib/xray/providers/registry.ts'))
    const handedEnv = /create!?\([^)]*\benv\b/.test(registry)
      || /configuration:\s*env\b/.test(registry)
    return handedEnv ? 'the registry hands env to a factory' : null
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
    /*
     * The composition area, and the one host entry point.
     *
     * `instrumentation.ts` is where a host registers itself — that is the
     * whole reason it exists — so it may reach the provider layer. Nothing
     * else outside `providers/` and `host/` may.
     */
    const composition = /^lib\/xray\/(providers|host)\//
    const hostEntryPoint = 'instrumentation.ts'

    for (const file of tracked) {
      if (composition.test(file) || file === hostEntryPoint) continue
      const source = stripComments(readFileSync(join(repository, file), 'utf8'))
      /*
       * Static *and* dynamic imports. An earlier version matched only
       * `from '…'`, so `await import('@/lib/xray/providers/…')` slipped
       * through — which is exactly the form a host registration uses.
       */
      if (/from '@\/lib\/xray\/providers\//.test(source)
        || /import\(\s*'@\/lib\/xray\/providers\//.test(source)
        || /providers\/(config|registry)'/.test(source))
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

    /*
     * And the provider layer never reaches back into a host or a runtime.
     *
     * Check harnesses are excluded by the `-checks.ts` convention rather than
     * by name: an earlier version named only `composition-checks.ts`, so
     * `runtime-checks.ts` — which registers seams *in order to test the
     * registration* — was scanned as implementation.
     */
    for (const file of sources('lib/xray/providers')) {
      if (/-checks\.ts$/.test(file)) continue
      const source = stripComments(readFileSync(file, 'utf8'))
      const relative = file.slice(file.indexOf('lib/xray'))
      if (/setExecutionRuntimeProvider|setDatabaseProvider|hostConnection/.test(source))
        return `${relative} registers or opens a host resource`
      // Inside the provider layer, only config.ts may name process.env. This
      // is what stops a future adapter reading a secret directly instead of
      // going through the configuration its entry declares — the narrowing
      // boundary governs what is handed over, not what `process` holds.
      if (!file.endsWith('providers/config.ts') && /process\.env/.test(source))
        return `${relative} reads process.env directly`
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

  check('15 · the live runtime is registered only when fully configured', () => {
    /*
     * 20a asserted that nothing registered a runtime. 20d registers one, so
     * the assertion is re-aimed at the property that still has to hold: a
     * partial configuration registers **nothing**, leaving the unconfigured
     * runtime in place — which is the behaviour every #6–#11 gate is written
     * against.
     */
    const instrumentation = stripComments(read('instrumentation.ts'))
    if (!/registerLiveProviders/.test(instrumentation))
      return 'instrumentation no longer registers the live providers'

    /*
     * Both seams, and the reviewer's is the one the 20d amendment was about:
     * composing a reviewer and installing nothing left the capability dead —
     * configured, reported, and never asked.
     */
    for (const seam of ['setExecutionRuntimeProvider', 'setReviewerModelProvider']) {
      if (!instrumentation.includes(seam)) return `instrumentation does not pass ${seam}`
    }

    // The conditional lives in `registerLiveProviders`, and each seam is
    // installed exactly once.
    const live = stripComments(read('lib/xray/providers/live-runtime.ts'))
    if (!/if \(composition\.status !== 'COMPOSED'\) \{\s*clear\(seams\)/.test(live))
      return 'an incomplete composition does not clear the live seams'

    /*
     * Symmetry: every path out of registration either installs both seams or
     * clears both. An incomplete composition that merely returned would leave
     * a previously registered runtime and reviewer live, which is the state a
     * re-registration produces and the contract forbids.
     */
    if (!/clear\(seams\)\s*throw err/.test(live.replace(/\n\s*/g, ' ')))
      return 'a composition that throws does not clear the live seams'
    const clearBody = live.slice(live.indexOf('function clear(seams: HostSeams)'))
    for (const seam of ['setExecutionRuntime(null)', 'setReviewerModel(null)']) {
      if (!clearBody.includes(seam)) return `clear() does not call ${seam}`
    }
    for (const seam of ['setExecutionRuntime', 'setReviewerModel']) {
      const installs = live.match(new RegExp(`seams\\.${seam}\\(async`, 'g')) ?? []
      if (installs.length !== 1) return `${seam} is installed ${installs.length} times`
    }

    /*
     * Every required slot must reach a consumer. A slot required but never
     * installed is a dead composition token: it makes a deployment look
     * configured and changes nothing about what runs.
     */
    if (!/REQUIRED_SLOTS/.test(live)) return 'the required slots are not declared'
    for (const slot of ['RESEARCH_MODEL', 'REVIEWER_MODEL', 'RETRIEVAL']) {
      if (!live.includes(slot)) return `${slot} is not among the required slots`
    }

    // A composition with any slot unavailable reports the slots, never a
    // partial runtime.
    if (!/status: 'INCOMPLETE'/.test(live)) return 'there is no incomplete outcome'
    if (/\?\?\s*unconfigured|fallback/i.test(live))
      return 'the live runtime falls back to something'

    // And the unconfigured runtime is still what an unconfigured deployment
    // gets, from the application layer that knows nothing about providers.
    const runtime = stripComments(read('lib/xray/application/runtime.ts'))
    if (!/unconfiguredResearchRuntime/.test(runtime))
      return 'the unconfigured runtime is gone'
    return /from '@\/lib\/xray\/providers\//.test(runtime)
      ? 'the application runtime imports the provider layer' : null
  })

  check('15b · the provider layer has two tiers, and they do not mix', () => {
    /*
     * `providers/anthropic/**` is provider-specific. `live-stages.ts`,
     * `material.ts` and `live-runtime.ts` are provider-neutral composition
     * over #6's ports. The neutral tier must not import the specific one, or
     * "swapping a provider changes only composition" stops being true.
     */
    const neutral = ['live-stages.ts', 'material.ts', 'live-runtime.ts']
    for (const file of neutral) {
      const source = stripComments(read(`lib/xray/providers/${file}`))
      if (/anthropic/i.test(source)) return `${file} mentions a specific provider`
    }
    // And the stages reach the ports, not a vendor.
    const stages = stripComments(read('lib/xray/providers/live-stages.ts'))
    if (!/ctx\.adapters\.model/.test(stages) || !/ctx\.adapters\.research/.test(stages))
      return 'the stages do not read the ports from the stage context'
    return null
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

  check('stop line · exactly one file reaches the network, and retrieval has none', () => {
    /*
     * 20a asserted that nothing in the layer could perform a provider call.
     * 20b makes that false on purpose, so the assertion is re-aimed rather
     * than removed: the network may be reached from exactly one file, and the
     * things 20b still must not do must still be undone.
     */
    const implementation = sources('lib/xray/providers')
      .filter((file) => !/-checks\.ts$/.test(file))

    const httpFiles = implementation.filter((file) => {
      const source = stripComments(readFileSync(file, 'utf8'))
      return /\bfetch\s*\(/.test(source) || /XMLHttpRequest/.test(source)
        || /https?:\/\/api\./.test(source)
    }).map((file) => file.slice(file.indexOf('lib/xray')))
    if (JSON.stringify(httpFiles) !== JSON.stringify(['lib/xray/providers/anthropic/transport.ts']))
      return `files reaching the network: ${JSON.stringify(httpFiles)}`

    // A transport may only be imported by a check harness; the implementation
    // uses global fetch and nothing lower.
    for (const file of implementation) {
      const imports = stripComments(readFileSync(file, 'utf8')).match(/from '([^']+)'/g) ?? []
      const transport = imports.find((line) => /node:(http|https|net|tls|dns)/.test(line))
      if (transport !== undefined)
        return `${file.slice(file.indexOf('lib/xray'))} imports ${transport}`
    }

    // No provider SDK was added as a dependency. 20b uses the Messages API
    // over global fetch, so there is nothing to keep up to date and nothing
    // that can pull in a transitive transport.
    const manifest = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>
    }
    const installed = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    const sdk = installed.filter((name) => /anthropic|openai|langchain|ai-sdk/i.test(name))
    if (sdk.length > 0) return `a provider SDK is installed: ${sdk.join(', ')}`

    /*
     * Retrieval exists as of 20c, so the clause that forbade it is re-aimed at
     * what must still hold: the documented server-tool contract lives in one
     * file, and no provider file can mint canonical evidence.
     */
    const toolFiles = implementation.filter((file) =>
      /web_search_\d|web_fetch_\d/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(file.indexOf('lib/xray')))
    if (JSON.stringify(toolFiles)
      !== JSON.stringify(['lib/xray/providers/anthropic/retrieval-contract.ts'])) {
      return `files naming a server-tool version: ${JSON.stringify(toolFiles)}`
    }

    /*
     * No **vendor** file constructs canonical graph state. Proposals and
     * material are the only things that cross out of `anthropic/`.
     *
     * Scoped to the vendor tier deliberately: `live-stages.ts` builds
     * canonical artifacts, because that is what a stage does. The boundary is
     * that a provider adapter may not, and 20d's stage layer is not a provider
     * adapter — check 15b holds the two tiers apart.
     */
    for (const file of implementation) {
      const relative = file.slice(file.indexOf('lib/xray'))
      if (!relative.startsWith('lib/xray/providers/anthropic/')) continue
      const source = stripComments(readFileSync(file, 'utf8'))
      const canonical = /\b(?:Evidence|Source|Finding|Claim|Gap)\b(?!Proposal|Ref|Refs|Class|Position|Accessibility|Layer|Type|Status|Relationship|Strength|Judgment|Id|Ids)\s*=\s*\{/
        .exec(source)
      if (canonical !== null) return `${relative} builds a canonical ${canonical[0]}`
      if (/from '@\/lib\/xray\/persistence/.test(source))
        return `${relative} reaches persistence`
    }

    // And nothing in the layer, either tier, reaches persistence.
    for (const file of implementation) {
      if (/from '@\/lib\/xray\/persistence/.test(stripComments(readFileSync(file, 'utf8'))))
        return `${file.slice(file.indexOf('lib/xray'))} reaches persistence`
    }
    return null
  })

  check('stop line · prompts stay inside the prompt module', () => {
    /*
     * #20 boundary 7: prompts never enter canonical graph state. The provable
     * form is reachability — only the two adapters import the prompt module,
     * and the modules that build proposals and judgments do not import it at
     * all, so no instruction text has a path into a proposal.
     */
    const importers = sources('lib/xray/providers')
      .filter((file) => !/-checks\.ts$/.test(file))
      .filter((file) => /from '\.\/prompts'|from '\.\.\/prompts'/
        .test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.slice(file.indexOf('lib/xray/providers/')))
      .sort()
    const allowed = [
      'lib/xray/providers/anthropic/research-model.ts',
      'lib/xray/providers/anthropic/reviewer-model.ts',
    ]
    if (JSON.stringify(importers) !== JSON.stringify(allowed))
      return `prompt importers: ${JSON.stringify(importers)}`

    // The validator and the presenter are where provider output becomes
    // proposals. Neither may know what was asked.
    for (const file of ['decode.ts', 'present.ts', 'transport.ts']) {
      const source = stripComments(read(`lib/xray/providers/anthropic/${file}`))
      if (/prompts/.test(source)) return `${file} reaches the prompt module`
    }

    // And nothing outside the provider layer can reach it at all.
    const repository = root('').replace(/\/$/, '')
    const tracked = execFileSync('git', ['ls-files', '*.ts', '*.tsx'],
      { cwd: repository, encoding: 'utf8' }).split('\n').filter(Boolean)
    for (const file of tracked) {
      if (file.startsWith('lib/xray/providers/')) continue
      if (/providers\/anthropic/.test(stripComments(readFileSync(join(repository, file), 'utf8'))))
        return `${file} imports the Anthropic provider`
    }
    return null
  })

  for (const { name, run } of checks) {
    let detail: string | null
    try { detail = await run() } catch (err) { detail = `threw: ${(err as Error).message}` }
    console.log(`${detail === null ? 'ok  ' : 'FAIL'}  ${name}${detail === null ? '' : ` — ${detail}`}`)
    if (detail !== null) failures += 1
  }

  console.log(`\n${checks.length - failures}/${checks.length} provider composition checks passed`)
  if (failures > 0) process.exitCode = 1
}

let failures = 0

/*
 * The test ports. Real instances of the existing port types: that these
 * satisfy `ResearchModel`, `ReviewerModel` and `ResearchAdapter` is checked by
 * the compiler, which is what makes check 12 a proof rather than an assertion.
 */
const testResearchModel: ResearchModel = {
  name: 'test-research-model',
  async decompose() { return unavailable() },
  async classify() { return unavailable() },
  async trace() { return unavailable() },
  async disconfirm() { return unavailable() },
  async reconcile() { return unavailable() },
  async grade() { return unavailable() },
  async identifyGaps() { return unavailable() },
}

const testReviewerModel: ReviewerModel = {
  name: 'test-reviewer-model',
  async judge() { return unavailable() },
}

const testResearchAdapter: ResearchAdapter = {
  name: 'test-retrieval',
  async search() { return unavailable() },
  async retrieve() { return unavailable() },
}

/**
 * Every string reachable from a value, following plain objects and arrays.
 *
 * Used to prove a negative: that no foreign environment value is retrievable
 * from a configuration object by any path, not merely absent from its keys.
 */
function collectStrings(value: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (depth > 8 || value === null || value === undefined) return []
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object') return [String(value)]
  if (seen.has(value)) return []
  seen.add(value)
  const out: string[] = []
  for (const entry of Object.values(value as Record<string, unknown>)) {
    out.push(...collectStrings(entry, depth + 1, seen))
  }
  return out
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

// Invoked last, so the test ports below are initialised before any factory
// runs: an earlier version called main() at the top and a factory hit the
// temporal dead zone.
main().catch((err: unknown) => {
  console.error(`\nFAIL  the gate itself failed: ${String(err)}`)
  process.exit(1)
})
