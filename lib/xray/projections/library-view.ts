/**
 * LibraryView — a cached public X-Ray as a browsable entry.
 *
 * Counts are derived at projection time. The v0 scaffold stored them on the
 * library record and they disagreed with the graph; here they cannot.
 *
 * Version history is projected from `InvestigationVersion` records rather than
 * from prose strings. XRAY-KE-001 is Version 1, so there is exactly one entry —
 * and a second will appear when a real version exists, not when copy is
 * written.
 */

import type { XRayGraph } from '@/lib/xray/selectors'
import { investigationView, type InvestigationView } from './investigation-view'

export interface LibraryVersionView {
  version: number
  createdAt: string
  trigger: string
  supersedesVersion?: number
  addedSourceCount: number
  addedEvidenceCount: number
  reEvaluatedClaimCount: number
}

export interface LibraryEntryView {
  investigationId: string
  title: string
  surfacePublisher?: string
  protocolVersion: string
  researchCutoffAt?: string
  investigatedAt: string
  currentVersion: number

  claimCount: number
  /** Evidence records, labelled "receipts" for the public surface. */
  receiptCount: number
  sourceCount: number
  /** Reported beside `sourceCount`, never instead of it. */
  independentOriginCount: number
  openGapCount: number

  versions: LibraryVersionView[]
}

export function libraryEntryView(graph: XRayGraph): LibraryEntryView {
  const view: InvestigationView = investigationView(graph)
  const v = graph.version

  return {
    investigationId: view.investigationId,
    title: view.surface.title,
    surfacePublisher: view.surface.publisher,
    protocolVersion: view.protocolVersion,
    researchCutoffAt: view.researchCutoffAt,
    investigatedAt: view.completedAt ?? view.createdAt,
    currentVersion: view.version,

    claimCount: view.counts.claims,
    receiptCount: view.counts.receipts,
    sourceCount: view.counts.sources,
    independentOriginCount: view.counts.independentOrigins,
    openGapCount: view.counts.openGaps,

    versions: v
      ? [
          {
            version: v.version,
            createdAt: v.createdAt,
            trigger: v.trigger,
            supersedesVersion: v.supersedesVersion,
            addedSourceCount: v.addedSourceIds.length,
            addedEvidenceCount: v.addedEvidenceIds.length,
            reEvaluatedClaimCount: v.reEvaluatedClaimIds.length,
          },
        ]
      : [],
  }
}

/** A library listing. One entry per investigation graph. */
export function libraryView(graphs: readonly XRayGraph[]): LibraryEntryView[] {
  return graphs.map(libraryEntryView)
}
