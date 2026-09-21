import { notFound } from 'next/navigation'

import { AtiRequestPanel } from '@/components/investigations/ati-request-panel'
import { EvidenceExplorer } from '@/components/investigations/evidence-explorer'
import { getAtiActionSurfaces, getExplorerPayload } from '@/lib/xray/investigations'

/**
 * Dynamic, exactly as before Cache Components was enabled.
 *
 * This route already rendered per request. `instant = false` declares that
 * under the new prerender rules rather than changing what it does: the #9
 * cache boundary is the immutable public version projection, not an
 * internal page.
 *
 * The ATI action surface lives here and nowhere public. Action state is
 * mutable and this page is dynamic; a committed public version's bytes are
 * neither, and #10 does not put one inside the other.
 */
export const instant = false

/**
 * Existence is decided here, not in the body.
 *
 * 11a found that `notFound()` inside the component produced HTTP **200**: with
 * Partial Prerendering the shell is already flushed by the time the loader
 * answers, so the 404 arrived only inside the streamed payload. `generateMetadata`
 * runs before the response is committed, so a `notFound()` from here is a real
 * 404 on the status line.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!(await getExplorerPayload(id))) notFound()
  return {}
}

export default async function EvidenceExplorerRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const payload = await getExplorerPayload(id)

  // Previously this route declared `dynamicParams = false` with a single
  // hardcoded param, so it could serve exactly one investigation for all time.
  // The loader seam now decides what exists, and unknown ids are not-found.
  if (!payload) notFound()

  // Read separately from the explorer payload, which projects immutable
  // research state. Carrying both in one payload would make mutable action
  // state look like part of the evidence record.
  const requests = await getAtiActionSurfaces(id)

  return (
    <>
      <EvidenceExplorer payload={payload} />
      {requests.length > 0 && (
        <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pb-16">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Information requests
          </h2>
          {requests.map((surface) => (
            <AtiRequestPanel key={surface.requestId} surface={surface} />
          ))}
        </div>
      )}
    </>
  )
}
