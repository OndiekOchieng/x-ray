/**
 * Anthropic provider factories (#20 slice 20b).
 *
 * Two factories, each reading only what its registry entry declared. The
 * declaration is `ANTHROPIC_API_KEY` (required) and `ANTHROPIC_BASE_URL`
 * (optional) — and `ANTHROPIC_BASE_URL` is declared rather than read around
 * the boundary precisely because 20a's amendment made that the only way to
 * widen what a provider can see.
 *
 * Why a base URL at all: a deployment behind a gateway needs one, and the 20b
 * gate needs one to exercise the transport against a local stub. The
 * alternative — a test-only escape hatch in the transport — would be a second
 * door into the same room.
 */

import type { ModelProviderConfig, RetrievalProviderConfig } from '../config'
import { AnthropicResearchModel } from './research-model'
import { AnthropicResearchAdapter } from './retrieval-adapter'
import { AnthropicReviewerModel } from './reviewer-model'

/** The variables an Anthropic entry declares. Nothing else is reachable. */
export const ANTHROPIC_REQUIRES = ['ANTHROPIC_API_KEY'] as const
export const ANTHROPIC_OPTIONAL = ['ANTHROPIC_BASE_URL'] as const

/**
 * Retrieval requires one more name than the model rows.
 *
 * `XRAY_ANTHROPIC_SEARCH_MODEL_ID` exists because retrieval names no model in
 * the composition contract — a search provider is not a model, and there is no
 * `XRAY_RETRIEVAL_MODEL_ID` — yet the Messages API needs one to execute a
 * server tool. Declaring it on the entry keeps it inside 20a's boundary:
 * reviewable in the registry, reachable by this factory only.
 *
 * **Required**, not optional, and the distinction is the point. If it were
 * optional, a deployment missing it would resolve `AVAILABLE` and then throw
 * when the factory ran — a resolution that lies about what it can do. Required
 * means it resolves `CONFIGURATION_INCOMPLETE`, naming the variable, which is
 * what an operator can act on.
 */
export const ANTHROPIC_RETRIEVAL_REQUIRES = [
  'ANTHROPIC_API_KEY', 'XRAY_ANTHROPIC_SEARCH_MODEL_ID',
] as const

export function createAnthropicResearchModel(
  config: ModelProviderConfig,
): AnthropicResearchModel {
  return new AnthropicResearchModel(modelOptions(config))
}

export function createAnthropicReviewerModel(
  config: ModelProviderConfig,
): AnthropicReviewerModel {
  return new AnthropicReviewerModel(modelOptions(config))
}

/**
 * The retrieval adapter.
 *
 * `RetrievalProviderConfig` carries no `modelId`, by contract: selecting a
 * retrieval provider says nothing about a model. But a server tool runs inside
 * a Messages request, so one is needed to execute the search — and it is
 * declared as required on the entry, so resolution refuses before the factory
 * runs rather than choosing a Claude version on the operator's behalf.
 */
export function createAnthropicRetrieval(
  config: RetrievalProviderConfig,
): AnthropicResearchAdapter {
  const modelId = config.configuration.require('XRAY_ANTHROPIC_SEARCH_MODEL_ID')
  const baseUrl = config.configuration.optional('ANTHROPIC_BASE_URL')
  return new AnthropicResearchAdapter({
    modelId,
    apiKey: config.configuration.require('ANTHROPIC_API_KEY'),
    ...(baseUrl === undefined ? {} : { baseUrl }),
  })
}

function modelOptions(config: ModelProviderConfig): {
  modelId: string; apiKey: string; baseUrl?: string
} {
  const baseUrl = config.configuration.optional('ANTHROPIC_BASE_URL')
  return {
    // `modelId` comes from the resolution, never from a default: selecting
    // `anthropic` implies no model (#20's composition contract).
    modelId: config.modelId,
    apiKey: config.configuration.require('ANTHROPIC_API_KEY'),
    ...(baseUrl === undefined ? {} : { baseUrl }),
  }
}

export { AnthropicResearchModel } from './research-model'
export { AnthropicResearchAdapter } from './retrieval-adapter'
export { AnthropicReviewerModel } from './reviewer-model'
export type { CallDiagnostics } from './transport'
