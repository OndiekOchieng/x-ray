/**
 * Provider selection, parsed from the environment (#20 slice 20a).
 *
 * WHERE THE ENVIRONMENT IS ALLOWED TO BE READ
 * ===========================================
 * Here, and at the host. Nothing under `pipeline/`, `domain/`, `validation/`,
 * `persistence/` or `projections/` reads a provider setting or imports a
 * provider module — the pipeline sees `{ model?, research? }` and nothing
 * about who supplies them. Composition depends on the ports; the ports never
 * depend on composition.
 *
 * PROVIDER NAME AND MODEL ID ARE SEPARATE
 * =======================================
 * `anthropic` is a registry entry, not a model. It implies no default and
 * never resolves to one: a research selection of `anthropic` with no
 * `XRAY_RESEARCH_MODEL_ID` is **incomplete configuration**, not a licence to
 * pick a Claude version on the operator's behalf. Research and reviewer are
 * selected independently and may name different providers and different
 * models.
 *
 * WHAT A MISSING SELECTION IS
 * ===========================
 * Not a defect. An unconfigured deployment is a deployment with no research
 * capability, which the pipeline already reports truthfully as
 * `CAPABILITY_BLOCKED`. Nothing here invents a provider to avoid saying so,
 * and nothing here falls back from a selected provider to another one.
 *
 * SECRETS
 * =======
 * A provider's secret is read by that provider, never by this module, and no
 * value ever enters a resolution result, a thrown message or a diagnostic.
 * What this layer may say is *which variable is absent* — a name, never a
 * value.
 *
 * WHAT A FACTORY MAY SEE
 * ======================
 * Only the variables its own registry entry declares. A factory is handed a
 * `ProviderConfiguration` built by narrowing the environment down to that
 * entry's declared names *before* anything the factory can touch exists — so
 * no config object, and no closure reachable from one, ever captures the full
 * environment. An Anthropic entry declaring `ANTHROPIC_API_KEY` cannot read
 * `OPENAI_API_KEY`, `XRAY_POSTGRES_URL`, or any other host setting through
 * what it is given.
 *
 * That boundary governs what this layer *hands over*. It cannot stop a module
 * from importing `process` itself, so the gate additionally holds the line
 * that within `lib/xray/providers/` only this file may name `process.env` —
 * which is what keeps a future adapter going through its declared
 * configuration rather than around it.
 */

/** The three composition slots a run can have. */
export type ProviderSlot = 'RESEARCH_MODEL' | 'REVIEWER_MODEL' | 'RETRIEVAL'

/** The two slots that name a model. A retrieval provider is not a model. */
export type ModelSlot = Extract<ProviderSlot, 'RESEARCH_MODEL' | 'REVIEWER_MODEL'>

/** Environment variable names, in one place so the gate can check for others. */
export const PROVIDER_ENV = {
  researchModel: 'XRAY_RESEARCH_MODEL',
  researchModelId: 'XRAY_RESEARCH_MODEL_ID',
  reviewerModel: 'XRAY_REVIEWER_MODEL',
  reviewerModelId: 'XRAY_REVIEWER_MODEL_ID',
  retrieval: 'XRAY_RETRIEVAL_PROVIDER',
} as const

/** A model slot's selection, as the operator wrote it. */
export interface ModelSelection {
  slot: ModelSlot
  /** Registry entry name, lowercased and trimmed. Never a model. */
  provider: string
  /** Absent means the operator did not name one, which is incomplete. */
  modelId?: string
  /** Which variables these came from, for precise reporting. */
  source: { provider: string; modelId: string }
}

export interface RetrievalSelection {
  slot: Extract<ProviderSlot, 'RETRIEVAL'>
  provider: string
  source: { provider: string }
}

export interface ProviderSelections {
  research?: ModelSelection
  reviewer?: ModelSelection
  retrieval?: RetrievalSelection
}

/** A minimal environment, so the gate can supply one instead of mutating the process. */
export type Environment = Readonly<Record<string, string | undefined>>

/**
 * The ambient environment — the one door.
 *
 * This is the only expression in `lib/xray/providers/` that names
 * `process.env`, and the gate holds that line. Everything else, the registry
 * included, takes an `Environment` it was given. That is what makes "the
 * environment is read at the composition boundary" a checkable claim rather
 * than a description.
 */
export const hostEnvironment = (): Environment => process.env

const value = (env: Environment, name: string): string | undefined => {
  const raw = env[name]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Read the selections, without judging them.
 *
 * Parsing and resolution are separate on purpose: this says what the operator
 * asked for, and `resolve` says whether it can be honoured. Conflating the two
 * is how "unset" and "wrong" end up indistinguishable.
 */
export function readProviderSelections(env: Environment = hostEnvironment()): ProviderSelections {
  const model = (
    slot: ModelSlot, providerVar: string, modelVar: string,
  ): ModelSelection | undefined => {
    const provider = value(env, providerVar)
    if (provider === undefined) return undefined
    const modelId = value(env, modelVar)
    return {
      slot,
      provider: provider.toLowerCase(),
      ...(modelId === undefined ? {} : { modelId }),
      source: { provider: providerVar, modelId: modelVar },
    }
  }

  const retrievalProvider = value(env, PROVIDER_ENV.retrieval)
  return {
    ...(model('RESEARCH_MODEL', PROVIDER_ENV.researchModel, PROVIDER_ENV.researchModelId)
      ? { research: model('RESEARCH_MODEL', PROVIDER_ENV.researchModel, PROVIDER_ENV.researchModelId)! }
      : {}),
    ...(model('REVIEWER_MODEL', PROVIDER_ENV.reviewerModel, PROVIDER_ENV.reviewerModelId)
      ? { reviewer: model('REVIEWER_MODEL', PROVIDER_ENV.reviewerModel, PROVIDER_ENV.reviewerModelId)! }
      : {}),
    ...(retrievalProvider === undefined ? {} : {
      retrieval: {
        slot: 'RETRIEVAL' as const,
        provider: retrievalProvider.toLowerCase(),
        source: { provider: PROVIDER_ENV.retrieval },
      },
    }),
  }
}

// ---------------------------------------------------------------------------
// What a factory is handed
// ---------------------------------------------------------------------------

/**
 * The configuration one provider entry is allowed to see.
 *
 * `declared` holds **only** the variables that entry declared, and only those
 * that are actually set. It is frozen and prototype-less, so there is no
 * inherited channel to probe and nothing to mutate. It is built by narrowing
 * the environment first; `narrowEnvironment` is the single place that happens,
 * and nothing reachable from a `ProviderConfiguration` closes over the full
 * environment.
 *
 * `require` exists so an adapter fails loudly rather than quietly: asking for
 * an undeclared name is a programming error in the *registry entry*, not a
 * missing secret, and the two should not look alike. Its message names the
 * variable asked for and the names declared — never a value, and it closes
 * over the narrowed record only.
 */
export interface ProviderConfiguration {
  /** Exactly the declared names that are set, with their values. Frozen. */
  readonly declared: Readonly<Record<string, string>>
  /** The names the entry declared, set or not. Names only. */
  readonly declaredNames: readonly string[]
  /** A declared value, or throw. Throws for any undeclared name. */
  require(name: string): string
  /** A declared value if set, else undefined. Throws for any undeclared name. */
  optional(name: string): string | undefined
}

/**
 * Narrow an environment to one entry's declared names.
 *
 * The returned object is the *only* thing a factory receives, and it is
 * derived here rather than carried: `env` is read in this function and is not
 * captured by anything it returns.
 */
export function narrowEnvironment(
  env: Environment, declaredNames: readonly string[],
): ProviderConfiguration {
  const names = Object.freeze([...new Set(declaredNames)])
  const declared = Object.create(null) as Record<string, string>
  for (const name of names) {
    const found = value(env, name)
    if (found !== undefined) declared[name] = found
  }
  Object.freeze(declared)

  const undeclared = (name: string): Error => new Error(
    `This provider entry declares ${names.length === 0 ? 'no variables' : names.join(', ')}`
    + ` and may not read ${name}. Declare it on the registry entry to use it.`,
  )

  return Object.freeze({
    declared,
    declaredNames: names,
    require(name: string): string {
      if (!names.includes(name)) throw undeclared(name)
      const found = declared[name]
      if (found === undefined) {
        throw new Error(`${name} is declared by this provider entry but is not set.`)
      }
      return found
    },
    optional(name: string): string | undefined {
      if (!names.includes(name)) throw undeclared(name)
      return declared[name]
    },
  })
}

/**
 * Configuration for one model slot.
 *
 * `modelId` is required here, because a factory is only ever reached once
 * resolution has established that the operator named one. There is
 * deliberately no `env` member: see `ProviderConfiguration`.
 */
export interface ModelProviderConfig {
  slot: ModelSlot
  provider: string
  modelId: string
  configuration: ProviderConfiguration
}

export interface RetrievalProviderConfig {
  slot: Extract<ProviderSlot, 'RETRIEVAL'>
  provider: string
  configuration: ProviderConfiguration
}
