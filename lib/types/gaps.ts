export type ResolutionPath = 'PUBLIC_RECORD_REQUEST' | 'WAIT_FOR_RECORD' | 'FIELD_VERIFICATION' | 'SOURCE_CLARIFICATION' | 'DATASET_QUERY' | 'EXPERT_INTERPRETATION' | 'OTHER'

export interface GapRecord {
  id: string; title: string; missing: string; whyItMatters: string; settleIt: string[]
  holder: string; holderNote: string; resolutionPath: ResolutionPath; claimId: string
  context: string; identifiers: string[]; records: string[]; status: 'OPEN' | 'WAITING' | 'RESOLVED'
}

export interface CachedInvestigation {
  id: string; title: string; source: string; investigatedAt: string; protocol: string
  claims: number; receipts: number; gaps: number; updatedAt: string; summary: string
}

export const resolutionPathLabels: Record<ResolutionPath, string> = {
  PUBLIC_RECORD_REQUEST: 'Public record request', WAIT_FOR_RECORD: 'Wait for record', FIELD_VERIFICATION: 'Field verification', SOURCE_CLARIFICATION: 'Source clarification', DATASET_QUERY: 'Dataset query', EXPERT_INTERPRETATION: 'Expert interpretation', OTHER: 'Other',
}

export const gapRecords: GapRecord[] = [
  { id: 'GAP-001', title: 'Missing authoritative project-cost record', missing: 'A current authoritative record explaining why the project is described as worth KSh16.7 billion.', whyItMatters: 'Located evidence contains materially different values representing original contract sums, estimated project costs and later public descriptions. Without the missing administrative bridge, X-Ray cannot establish exactly how KSh16.7B is derived.', settleIt: ['Approved variation schedules', 'Revised contract-price schedules', 'Latest authoritative KeNHA project-cost report', 'Equivalent current administrative record'], holder: 'Kenya National Highways Authority / relevant roads administration', holderNote: 'This is a research conclusion about likely custody, not a confirmed information-officer or contact detail.', resolutionPath: 'PUBLIC_RECORD_REQUEST', claimId: 'claim-2', context: 'The project value claim was classified unresolved after Treasury and public reporting surfaced different material figures.', identifiers: ['Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road', 'XRAY-KE-001', 'KSh16.7B reported project value'], records: ['Current approved project-cost record', 'Approved variation schedule(s)', 'Revised contract-price schedule(s)'], status: 'OPEN' },
  { id: 'GAP-002', title: 'Did the scheduled presidential inspection occur?', missing: 'A post-event record confirming whether the scheduled inspection took place, was cancelled, or changed.', whyItMatters: 'The available evidence supports scheduled status only. A planned visit is not evidence that the visit occurred.', settleIt: ['Post-visit State House release', 'Updated official itinerary', 'Dated site-visit report'], holder: 'State House or the relevant roads administration', holderNote: 'The likely holder may change as newer records become available.', resolutionPath: 'WAIT_FOR_RECORD', claimId: 'claim-4', context: 'At the original research cutoff, post-event evidence was unavailable.', identifiers: ['XRAY-KE-001', 'Scheduled inspection referenced in January 2025 coverage'], records: ['Post-event public release', 'Updated itinerary or cancellation record'], status: 'WAITING' },
]

export const cachedInvestigations: CachedInvestigation[] = [{ id: 'XRAY-KE-001', title: 'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road', source: 'Citizen Digital', investigatedAt: 'Sep 13, 2026', protocol: 'X-Ray v0.1', claims: 5, receipts: 11, gaps: 2, updatedAt: 'Sep 13, 2026', summary: 'A public evidence trail for road length, project value, delivery claims and a scheduled inspection.' }]

export const getGap = (id: string) => gapRecords.find((gap) => gap.id === id) ?? gapRecords[0]
export const buildAtiDraft = (gap: GapRecord) => `Subject: Request for access to records concerning ${gap.identifiers[0]}\n\nDear Information Access Officer,\n\nI am requesting access to the following public records concerning ${gap.identifiers[0]}:\n\n${gap.records.map((record) => `• ${record}`).join('\n')}\n\nContext\n${gap.context}\n\nWhy this record matters\n${gap.whyItMatters}\n\nPlease provide the records in an accessible electronic format where possible. This draft was prepared from a structured X-Ray investigation; it has not been submitted by X-Ray.\n\nYours faithfully,\n[Your name]\n[Your contact details]`
export const buildGapShareText = (gap: GapRecord) => `X-Ray found a missing receipt\n\n${gap.title}\n\nWhat is missing: ${gap.missing}\n\nWhat would settle it: ${gap.settleIt[0]}.`
export const downloadText = (filename: string, text: string) => { if (typeof document === 'undefined') return; const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url) }
export const copyText = async (text: string) => { if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text) }
export const routeForGap = (id: string) => `/gap/${id}`
export const versionHistory = ['Version 1 · Investigated Sep 13, 2026', 'New receipts can trigger re-evaluation → X-Ray v2']
export const libraryPrinciple = 'Verdicts expire. Receipts compound.'
export const libraryDescription = 'Public claims change. New documents emerge. Better evidence becomes available.'
export const currentProtocol = 'X-Ray v0.1'
export const allResolutionPaths = Object.keys(resolutionPathLabels) as ResolutionPath[]
export const isAtiPath = (path: ResolutionPath) => path === 'PUBLIC_RECORD_REQUEST'
