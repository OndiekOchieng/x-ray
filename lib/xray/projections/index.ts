/**
 * X-Ray projections — presentation view models over the canonical graph.
 *
 *   canonical graph → selectors → projections → UI
 *
 * Projections resolve ids into displayable objects, attach labels, group
 * evidence for display, and rebuild the "receipt" idea from Source + Evidence.
 *
 * They are React-free: no components, no hooks, no JSX, no DOM. A component
 * consuming a view never touches the graph and never learns how ids resolve.
 *
 * THEY MUST NOT:
 *  - mutate canonical state (every array is copied out)
 *  - invent research conclusions, reword a claim, or upgrade a finding
 *  - store derived counts back into the domain
 *  - collapse ordinal confidence into a number
 *
 * This is the synthesis side of the boundary in XR-INV-011: it reads the graph
 * and writes nothing back.
 *
 * NOT HERE: ATI draft generation. Composing request prose is a synthesis step
 * with its own rules (ADR-0008) and is left to the UI-migration slice; GapView
 * exposes the structured inputs a draft needs without composing them.
 */

export * from './labels'
export * from './receipt-view'
export * from './discrepancy-view'
export * from './gap-view'
export * from './finding-view'
export * from './provenance-view'
export * from './claim-view'
export * from './investigation-view'
export * from './library-view'
