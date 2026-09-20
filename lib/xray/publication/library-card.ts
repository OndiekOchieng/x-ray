/**
 * Library card and query types.
 *
 * Types only, with no runtime import of any kind. Client components render
 * cards, and a shared module that reached `version-cache.ts` would drag a
 * `'use cache'` function into a client bundle — which the bundler rejects, and
 * rightly: a cache declaration is a server concern.
 */

/**
 * One publicly discoverable X-Ray.
 *
 * Addressed by slug. The internal investigation id is deliberately absent: the
 * public namespace is the slug, and discovery has no business handing out an
 * internal handle.
 */
export interface LibraryCard {
  slug: string
  /** The exact version currently presented. Never "latest committed". */
  version: number
  title: string
  surfacePublisher?: string
  protocolVersion: string
  researchCutoffAt?: string
  investigatedAt?: string
  /** When the current presentation act happened. Used only for ordering. */
  publishedAt: string

  claimCount: number
  /** Evidence records, labelled "receipts" for the public surface. */
  receiptCount: number
  sourceCount: number
  /** Reported beside `sourceCount`, never instead of it (XR-INV-004). */
  independentOriginCount: number
  openGapCount: number

  /** Convenience address. */
  href: string
  /** Citation-grade address. */
  citationHref: string
}

/** Metadata filters only. Evidence prose is deliberately not searchable. */
export interface LibraryQuery {
  /** Free text over title and publisher. Trimmed, case-insensitive. */
  q?: string
  publisher?: string
  protocolVersion?: string
  slug?: string
  minOpenGaps?: number
  maxOpenGaps?: number
}
