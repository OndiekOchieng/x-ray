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
 * value ever enters a configuration object, a resolution result, a thrown
 * message or a diagnostic. What this layer may say is *which variable is
 * absent* — a name, never a value.
 */

/** The three composition slots a run can have. */
export type ProviderSlot = 'RESEARCH_MODEL' | 'REVIEWER_MODEL' | 'RETRIEVAL'

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
  slot: 'RESEARCH_MODEL' | 'REVIEWER_MODEL'
  /** Registry entry name, lowercased and trimmed. Never a model. */
  provider: string
  /** Absent means the operator did not name one, which is incomplete. */
  modelId?: string
  /** Which variables these came from, for precise reporting. */
  source: { provider: string; modelId: string }
}

export interface RetrievalSelection {
  slot: 'RETRIEVAL'
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
export function readProviderSelections(env: Environment = process.env): ProviderSelections {
  const model = (
    slot: 'RESEARCH_MODEL' | 'REVIEWER_MODEL', providerVar: string, modelVar: string,
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
 * Configuration for one model slot.
 *
 * `modelId` is required here, because a factory is only ever reached once
 * resolution has established that the operator named one. The `env` handle
 * lets a provider read its own secret at construction time without this layer
 * ever holding the value.
 */
export interface ModelProviderConfig {
  slot: 'RESEARCH_MODEL' | 'REVIEWER_MODEL'
  provider: string
  modelId: string
  env: Environment
}

export interface RetrievalProviderConfig {
  slot: 'RETRIEVAL'
  provider: string
  env: Environment
}
