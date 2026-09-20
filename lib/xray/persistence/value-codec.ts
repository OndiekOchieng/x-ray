/** Lossless JSONB value encoding for workspace and execution audit records. */
export type Encoded =
  | { t: 'undefined' }
  | { t: 'scalar'; v: string | number | boolean | null }
  | { t: 'array'; v: Encoded[] }
  | { t: 'object'; v: [string, Encoded][] }

// Explicit undefined, absent, and null must remain distinct. Tagged nodes
// cannot collide with any canonical object key or value.
export function encodeValue(value: unknown): Encoded {
  if (value === undefined) return { t: 'undefined' }
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite persisted number')
    return { t: 'scalar', v: value }
  }
  if (Array.isArray(value)) return { t: 'array', v: value.map(encodeValue) }
  if (typeof value === 'object') return { t: 'object', v: Object.entries(value).map(([key, member]) => [key, encodeValue(member)]) }
  throw new Error(`Unsupported persisted value: ${typeof value}`)
}

export function decodeValue(node: Encoded): unknown {
  switch (node.t) {
    case 'undefined': return undefined
    case 'scalar': return node.v
    case 'array': return node.v.map(decodeValue)
    case 'object': return Object.fromEntries(node.v.map(([key, value]) => [key, decodeValue(value)]))
  }
}
