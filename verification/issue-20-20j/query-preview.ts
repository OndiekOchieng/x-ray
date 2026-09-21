/**
 * What X-Ray would now search for, on first light's own record.
 *
 * OFFLINE. No provider is configured, no request is made, nothing is spent.
 * It runs the real `query-plan.ts` over the surface facts
 * `verification/issue-20-20e` recorded and prints the queries, beside the
 * queries first light actually issued.
 *
 * The publisher and the published date are stated rather than quoted: 20e's
 * inspection printed the URL and the title but not `observed.publisher` or
 * `observed.publishedAt`. Both are ordinary metadata `INGEST` copies when the
 * retrieval reports them, and the run that follows will show what they
 * actually were.
 *
 * Run:  node --import ./scripts/register-ts-resolve.mjs verification/issue-20-20j/query-preview.ts
 */

import {
  describeQueryPlan, investigationAnchors, planQuery,
} from '@/lib/xray/pipeline/query-plan'

const SURFACE_URL = 'https://www.standardmedia.co.ke/national/article/2001512734'
  + '/audit-shame-of-counties-blowing-millions-on-bogus-projects-travel'

const claims = [
  {
    id: 'C001',
    text: "The Auditor General's findings raise questions about whether taxpayers"
      + ' are getting value for money.',
    entities: ['Auditor General', 'taxpayers'],
  },
  {
    id: 'C002',
    text: 'The Auditor General has highlighted wastage of public funds by counties.',
    entities: ['Auditor General', 'counties'],
  },
]

const anchors = investigationAnchors({
  surfaceClaims: claims.map((claim) => ({ entities: claim.entities })),
  surfaceSource: {
    publisher: 'The Standard',
    url: SURFACE_URL,
    publishedAt: '2026-09-19',
  },
})

console.log('=== anchors read off the surface record ===')
for (const anchor of anchors) console.log(`  ${anchor.origin.padEnd(26)} ${anchor.term}`)

console.log('\n=== what first light searched for ===')
for (const claim of claims) {
  const before = planQuery(claim, [], { maxResults: 5 })
  console.log(`  ${claim.id}: ${before.query.terms}`)
  console.log(`      constraints: ${JSON.stringify(before.query.constraints)}`)
}

console.log('\n=== what it would search for now ===')
for (const claim of claims) {
  const plan = planQuery(claim, anchors, { maxResults: 5 })
  console.log(`  ${describeQueryPlan(plan)}`)
  console.log(`      constraints: ${JSON.stringify(plan.query.constraints)}`)
}

console.log('\nNo provider was called. Whether the retrieval actually improves is'
  + '\nfor the civic rerun to establish, not this script.')
