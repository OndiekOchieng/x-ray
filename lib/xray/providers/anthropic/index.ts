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

import type { ModelProviderConfig } from '../config'
import { AnthropicResearchModel } from './research-model'
import { AnthropicReviewerModel } from './reviewer-model'

/** The variables an Anthropic entry declares. Nothing else is reachable. */
export const ANTHROPIC_REQUIRES = ['ANTHROPIC_API_KEY'] as const
export const ANTHROPIC_OPTIONAL = ['ANTHROPIC_BASE_URL'] as const

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
export { AnthropicReviewerModel } from './reviewer-model'
export type { CallDiagnostics } from './transport'
