/**
 * XRAY-KE-001 — the canonical acceptance fixture.
 *
 * Reconstructed from the frozen benchmark corpus under
 * docs/benchmarks/XRAY-KE-001/, NOT migrated from the v0 UI fixture.
 *
 * Every material assertion traces to the Claude run, the GPT run, or an
 * architecture acceptance requirement derived from them. Citations appear as
 * [C:Snnn] and [G:Snnn] comments against the records they support.
 *
 * Research cutoff 2026-09-13. Nothing published after that date is used, and
 * nothing is filled in from general knowledge.
 *
 * Nothing in the application consumes this yet.
 */

export { claims, claimById, SURFACE_FOCUS_PASSAGE } from './claims'
export { sources, sourceById, SURFACE_SOURCE_ID } from './sources'
export { sourceDependencies, sourceDependencyById } from './source-dependencies'
export { evidence, evidenceById } from './evidence'
export { evidenceProvenance, evidenceProvenanceById } from './evidence-provenance'
export { discrepancies, discrepancyById } from './discrepancies'
export { disconfirmations, disconfirmationById } from './disconfirmation'
export { findings, findingById } from './findings'
export { gaps, gapById } from './gaps'
export {
  investigation,
  investigationVersion,
  stageRuns,
  INVESTIGATION_ID,
} from './investigation'

/*
 * There is no ATIRequest collection here, and there is nowhere for one to go.
 *
 * Neither benchmark run executed the action stage — both stopped after stage 9
 * — so there is no frozen evidence for a drafted request. GAP-001, GAP-002,
 * GAP-004, GAP-005 and GAP-006 are ATI-eligible; GAP-003 is not. Eligibility
 * was never a reason to manufacture a request, and since #10 removed requests
 * from the evidence graph a fixture could not carry one anyway.
 */
