/**
 * XRAY-KE-001 assembled as an `XRayGraph`.
 *
 * This is the adapter between the canonical fixture records and the generic
 * selector/projection API. It is the ONLY place the fixture and the query
 * layer meet: generic selectors never import XRAY-KE-001, and this module adds
 * no facts — it hands the existing canonical arrays to `createXRayGraph`.
 *
 * The canonical records are untouched. Nothing here rewrites, reorders or
 * supplements them.
 */

import { createXRayGraph, type XRayGraph } from '@/lib/xray/selectors'

import { claims } from './claims'
import { sources } from './sources'
import { sourceDependencies } from './source-dependencies'
import { evidence } from './evidence'
import { evidenceProvenance } from './evidence-provenance'
import { discrepancies } from './discrepancies'
import { disconfirmations } from './disconfirmation'
import { findings } from './findings'
import { gaps } from './gaps'
import { investigation, investigationVersion } from './investigation'
import { atiRequests } from './index'

/** Build the query aggregate for XRAY-KE-001. */
export function createXrayKe001Graph(): XRayGraph {
  return createXRayGraph({
    investigation,
    version: investigationVersion,
    claims,
    sources,
    sourceDependencies,
    evidence,
    evidenceProvenance,
    discrepancies,
    disconfirmations,
    findings,
    gaps,
    atiRequests,
  })
}

/**
 * The assembled graph.
 *
 * Exported as a value for convenience in checks and future adapters. It is a
 * query structure over canonical arrays, not canonical state itself.
 */
export const xrayKe001Graph: XRayGraph = createXrayKe001Graph()
