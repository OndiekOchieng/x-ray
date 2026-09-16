/**
 * X-Ray selectors — the read layer over the canonical evidence graph.
 *
 *   canonical graph → selectors → projections → UI
 *
 * Selectors are pure functions over an `XRayGraph`. They contain no React, no
 * DOM, no routing, no network access, no presentation formatting, and no
 * fixture-specific ids — a generic selector never imports XRAY-KE-001.
 *
 * They expose data. They make no epistemic rulings: whether two measurements
 * are compatible, whether a contradiction is earned, whether a finding is
 * sound. Those belong to the invariant validator, which is not implemented.
 *
 * Absence convention: `*ById` returns `T | undefined`. Nothing fabricates a
 * fallback. `requireEntity` is an explicit assertion used when resolving an id
 * the graph asserts exists, and it throws `GraphIntegrityError` rather than
 * rendering a blank.
 */

export type { XRayGraph, XRayGraphInput, ClaimIdLike } from './graph'
export { createXRayGraph, requireEntity, GraphIntegrityError } from './graph'

export * from './claims'
export * from './evidence'
export * from './sources'
export * from './provenance'
export * from './findings'
export * from './gaps'
export * from './discrepancies'
export * from './counts'
export * from './investigation'
