/**
 * The provider registry (#20 slice 20a).
 *
 * WHAT IT IS
 * ==========
 * A name → factory table for each of the three composition slots, plus the
 * resolution that turns an operator's environment into either a factory it can
 * call or a precise statement of why it cannot.
 *
 * WHICH WAY THE DEPENDENCY POINTS
 * ===============================
 * Factories return the **existing** ports — `ResearchModel`, `ReviewerModel`,
 * `ResearchAdapter` — and nothing else. Composition depends on the pipeline's
 * contracts; the pipeline never learns that a registry exists. `anthropic` and
 * `openai` are rows in a table, not branches in a stage.
 *
 * WHAT RESOLUTION MUST KEEP APART
 * ===============================
 * Five states, and the first four are all "no research capability here" rather
 * than anything wrong with a graph:
 *
 *   NOT_SELECTED             the operator named no provider for this slot
 *   UNKNOWN_PROVIDER         a name no entry matches
 *   MODEL_ID_REQUIRED        a model slot with no model named
 *   CONFIGURATION_INCOMPLETE selected, but something it needs is absent
 *   NOT_IMPLEMENTED          recognised and configured; no adapter exists yet
 *   AVAILABLE                a factory that can be called
 *
 * Collapsing any of them into "unavailable" would lose the only information an
 * operator can act on. `CONFIGURATION_INCOMPLETE` names the **variables** that
 * are absent and never their values.
 *
 * NO SILENT FALLBACK
 * ==================
 * A selected provider that cannot be honoured resolves to its own failure. It
 * never resolves to a different provider, and it never resolves to the
 * unconfigured runtime while reporting the selected provider as active. 20a
 * registers no runtime at all: until a live one exists, a fresh run ends
 * through the path #6's amendment already made truthful.
 */

import type { ResearchAdapter } from '@/lib/xray/pipeline/retrieval-port'
import type { ResearchModel } from '@/lib/xray/pipeline/model-port'
import type { ReviewerModel } from '@/lib/xray/review'
import {
  readProviderSelections,
  type Environment, type ModelProviderConfig, type ModelSelection,
  type ProviderSelections, type RetrievalProviderConfig, type RetrievalSelection,
} from './config'

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * One registry entry.
 *
 * `requires` lets resolution check a provider's own configuration — the names
 * of the variables it needs — without this layer knowing what any of them
 * mean or reading their values. `create` is absent for an entry that is
 * recognised but not yet implemented, which is how a reserved name says so
 * instead of faking capability.
 */
export interface ProviderEntry<Port, Config> {
  readonly provider: string
  /** Environment variable names this provider cannot work without. */
  readonly requires: readonly string[]
  readonly create?: (config: Config) => Port | Promise<Port>
}

export type ResearchModelFactory = ProviderEntry<ResearchModel, ModelProviderConfig>
export type ReviewerModelFactory = ProviderEntry<ReviewerModel, ModelProviderConfig>
export type RetrievalProviderFactory = ProviderEntry<ResearchAdapter, RetrievalProviderConfig>

export interface ProviderRegistry {
  readonly researchModels: readonly ResearchModelFactory[]
  readonly reviewerModels: readonly ReviewerModelFactory[]
  readonly retrieval: readonly RetrievalProviderFactory[]
}

/**
 * The entries 20a reserves.
 *
 * All three Anthropic entries are recognised and **not implemented**: 20a is
 * composition only and may make no network call, so there is no adapter to
 * return. 20b and 20c add `create` to these same rows, and a configuration
 * that resolves `NOT_IMPLEMENTED` today resolves `AVAILABLE` then, with no
 * change to anything that consumes the registry.
 *
 * `openai` and `custom` are reserved the same way, for the same reason: a
 * recognised name that is honest about having no implementation is useful, and
 * one that pretends otherwise is worse than an unknown name.
 */
export const DEFAULT_REGISTRY: ProviderRegistry = {
  researchModels: [
    { provider: 'anthropic', requires: ['ANTHROPIC_API_KEY'] },
    { provider: 'openai', requires: ['OPENAI_API_KEY'] },
  ],
  reviewerModels: [
    { provider: 'anthropic', requires: ['ANTHROPIC_API_KEY'] },
    { provider: 'openai', requires: ['OPENAI_API_KEY'] },
  ],
  retrieval: [
    { provider: 'anthropic', requires: ['ANTHROPIC_API_KEY'] },
    { provider: 'custom', requires: [] },
  ],
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type ProviderResolution<Port> =
  | { status: 'NOT_SELECTED'; slot: string }
  | { status: 'UNKNOWN_PROVIDER'; slot: string; requested: string; known: readonly string[] }
  | { status: 'MODEL_ID_REQUIRED'; slot: string; provider: string; variable: string }
  | {
    status: 'CONFIGURATION_INCOMPLETE'
    slot: string
    provider: string
    /** Variable **names**. Never values. */
    missing: readonly string[]
  }
  | { status: 'NOT_IMPLEMENTED'; slot: string; provider: string; modelId?: string }
  | {
    status: 'AVAILABLE'
    slot: string
    provider: string
    modelId?: string
    /** Returns exactly the existing port. Nothing is called during resolution. */
    create: () => Promise<Port>
  }

export interface ComposedProviders {
  research: ProviderResolution<ResearchModel>
  reviewer: ProviderResolution<ReviewerModel>
  retrieval: ProviderResolution<ResearchAdapter>
  /** The selections as read, so a caller can report what was asked for. */
  selections: ProviderSelections
}

/**
 * Resolve every slot.
 *
 * Nothing here constructs a provider or touches a network: `AVAILABLE` carries
 * a thunk, and calling it is the caller's decision. 20a never calls it.
 */
export function composeProviders(
  env: Environment = process.env,
  registry: ProviderRegistry = DEFAULT_REGISTRY,
): ComposedProviders {
  const selections = readProviderSelections(env)
  return {
    research: resolveModel(selections.research, registry.researchModels, env),
    reviewer: resolveModel(selections.reviewer, registry.reviewerModels, env),
    retrieval: resolveRetrieval(selections.retrieval, registry.retrieval, env),
    selections,
  }
}

function resolveModel<Port>(
  selection: ModelSelection | undefined,
  entries: readonly ProviderEntry<Port, ModelProviderConfig>[],
  env: Environment,
): ProviderResolution<Port> {
  if (selection === undefined) return { status: 'NOT_SELECTED', slot: 'MODEL' }
  const slot = selection.slot

  const entry = entries.find((candidate) => candidate.provider === selection.provider)
  if (entry === undefined) {
    return {
      status: 'UNKNOWN_PROVIDER', slot, requested: selection.provider,
      known: entries.map((candidate) => candidate.provider),
    }
  }

  // A provider name implies no model. Resolution stops here rather than
  // choosing one, which is the whole point of keeping the two separate.
  if (selection.modelId === undefined) {
    return {
      status: 'MODEL_ID_REQUIRED', slot, provider: entry.provider,
      variable: selection.source.modelId,
    }
  }

  const missing = absent(entry.requires, env)
  if (missing.length > 0) {
    return {
      status: 'CONFIGURATION_INCOMPLETE', slot, provider: entry.provider, missing,
    }
  }

  if (entry.create === undefined) {
    return {
      status: 'NOT_IMPLEMENTED', slot, provider: entry.provider, modelId: selection.modelId,
    }
  }

  const config: ModelProviderConfig = {
    slot, provider: entry.provider, modelId: selection.modelId, env,
  }
  return {
    status: 'AVAILABLE', slot, provider: entry.provider, modelId: selection.modelId,
    create: async () => entry.create!(config),
  }
}

function resolveRetrieval(
  selection: RetrievalSelection | undefined,
  entries: readonly RetrievalProviderFactory[],
  env: Environment,
): ProviderResolution<ResearchAdapter> {
  if (selection === undefined) return { status: 'NOT_SELECTED', slot: 'RETRIEVAL' }
  const slot = selection.slot

  const entry = entries.find((candidate) => candidate.provider === selection.provider)
  if (entry === undefined) {
    return {
      status: 'UNKNOWN_PROVIDER', slot, requested: selection.provider,
      known: entries.map((candidate) => candidate.provider),
    }
  }

  // Retrieval names no model, by contract: a search provider is not a model
  // and requiring an id for it would be a false symmetry.
  const missing = absent(entry.requires, env)
  if (missing.length > 0) {
    return { status: 'CONFIGURATION_INCOMPLETE', slot, provider: entry.provider, missing }
  }

  if (entry.create === undefined) {
    return { status: 'NOT_IMPLEMENTED', slot, provider: entry.provider }
  }

  const config: RetrievalProviderConfig = { slot, provider: entry.provider, env }
  return {
    status: 'AVAILABLE', slot, provider: entry.provider,
    create: async () => entry.create!(config),
  }
}

/** Which required variables are absent. Names only; no value is read out. */
function absent(required: readonly string[], env: Environment): readonly string[] {
  return required.filter((name) => {
    const raw = env[name]
    return typeof raw !== 'string' || raw.trim() === ''
  })
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * One authored line per slot, safe to log or show an operator.
 *
 * Built from variable names and provider names, both of which the operator
 * supplied or the registry declared. No secret can reach it, because no secret
 * is ever read into a resolution.
 */
export function describeResolution(resolution: ProviderResolution<unknown>): string {
  switch (resolution.status) {
    case 'NOT_SELECTED':
      return 'No provider is selected for this slot, so the run has no capability for it.'
    case 'UNKNOWN_PROVIDER':
      return `No provider named "${resolution.requested}" is registered. Registered: ${
        resolution.known.join(', ') || 'none'}.`
    case 'MODEL_ID_REQUIRED':
      return `Provider "${resolution.provider}" is selected but ${
        resolution.variable} names no model. A provider name implies no model.`
    case 'CONFIGURATION_INCOMPLETE':
      return `Provider "${resolution.provider}" is selected but ${
        resolution.missing.join(', ')} ${resolution.missing.length === 1 ? 'is' : 'are'} not set.`
    case 'NOT_IMPLEMENTED':
      return `Provider "${resolution.provider}" is registered and configured, but no adapter for it is implemented yet.`
    case 'AVAILABLE':
      return `Provider "${resolution.provider}"${
        resolution.modelId ? ` with model ${resolution.modelId}` : ''} is configured and available.`
  }
}

/** Whether every selected slot resolved to something callable. */
export const fullyAvailable = (composed: ComposedProviders): boolean =>
  composed.research.status === 'AVAILABLE'
  && composed.reviewer.status === 'AVAILABLE'
  && composed.retrieval.status === 'AVAILABLE'
