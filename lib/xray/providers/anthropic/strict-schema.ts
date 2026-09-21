/**
 * The strict-tool-use schema subset (#20, first-light Finding 1).
 *
 * WHY THIS EXISTS
 * ===============
 * First light failed at `RECONCILE` because the model returned
 * `discrepancies` as a string where the declared schema says array. The
 * envelope was correct and the decoder correctly refused it — a declared
 * schema was a *request*, not a guarantee.
 *
 * Anthropic's `strict: true` makes it a guarantee: tool inputs are produced by
 * grammar-constrained sampling, so `input` follows `input_schema`. The price is
 * that the schema must lie inside a documented subset, and a schema outside it
 * is a 400 rather than a silent downgrade.
 *
 * So this module is the audit. It is deliberately a **validator, not a
 * normaliser**: auto-inserting `additionalProperties: false` would hide an
 * authoring mistake behind a fix, and the mistake is the thing worth seeing.
 * Every authored schema states its own compliance, and this refuses the ones
 * that do not — before a request is sent, not after a 400 comes back.
 *
 * THE SUBSET, VERIFIED 2026-09-21
 * ===============================
 * https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
 * https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 *   (the limitations live on the second page; the first links to it)
 *
 * Supported: object, array, string, integer, number, boolean, null; `enum`
 * over scalars only; `const`; `anyOf` and `allOf` (no `allOf` with `$ref`);
 * `$ref`/`$defs`/`definitions` (no external `$ref`); `default`; `required`;
 * `additionalProperties`, which **must be `false`** for objects; the string
 * formats `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `uri`,
 * `ipv4`, `ipv6`, `uuid`; and array `minItems` — only `0` or `1`.
 *
 * Not supported: recursive schemas; complex types inside `enum`; external
 * `$ref`; numeric constraints (`minimum`, `maximum`, `multipleOf`); string
 * constraints (`minLength`, `maxLength`); array constraints beyond `minItems`
 * of 0 or 1; `additionalProperties` set to anything but `false`.
 *
 * PURITY: pure validation over plain objects. No I/O, no SDK, no prompt text.
 */

/** Keywords the subset does not support, with why each is refused. */
const UNSUPPORTED: Readonly<Record<string, string>> = {
  minimum: 'numeric constraints are not supported',
  maximum: 'numeric constraints are not supported',
  exclusiveMinimum: 'numeric constraints are not supported',
  exclusiveMaximum: 'numeric constraints are not supported',
  multipleOf: 'numeric constraints are not supported',
  minLength: 'string constraints are not supported',
  maxLength: 'string constraints are not supported',
  pattern: 'string constraints are not supported',
  maxItems: 'array constraints beyond minItems 0 or 1 are not supported',
  uniqueItems: 'array constraints beyond minItems 0 or 1 are not supported',
  oneOf: 'oneOf is not among the supported combinators',
  not: 'not is not among the supported combinators',
  patternProperties: 'patternProperties is not supported',
  propertyNames: 'propertyNames is not supported',
  dependentRequired: 'dependent schemas are not supported',
  dependentSchemas: 'dependent schemas are not supported',
  if: 'conditional schemas are not supported',
  then: 'conditional schemas are not supported',
  else: 'conditional schemas are not supported',
}

const FORMATS = new Set(['date-time', 'time', 'date', 'duration', 'email',
  'hostname', 'uri', 'ipv4', 'ipv6', 'uuid'])

const SCALAR_ENUM = new Set(['string', 'number', 'boolean'])

/** One reason a schema is not strict-compatible, with the path that carries it. */
export interface StrictSchemaProblem {
  readonly path: string
  readonly problem: string
}

/**
 * Every way the schema departs from the subset.
 *
 * Returns them all rather than the first, because an author fixing one nested
 * object at a time and re-running is how the second one gets missed.
 */
export function strictSchemaProblems(schema: unknown, path = 'input_schema'): StrictSchemaProblem[] {
  const out: StrictSchemaProblem[] = []
  walk(schema, path, out)
  return out
}

function walk(node: unknown, path: string, out: StrictSchemaProblem[]): void {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return
  const schema = node as Record<string, unknown>

  for (const [keyword, reason] of Object.entries(UNSUPPORTED)) {
    if (keyword in schema) out.push({ path: `${path}.${keyword}`, problem: reason })
  }

  if (typeof schema['$ref'] === 'string' && /^[a-z][a-z0-9+.-]*:/i.test(schema['$ref'])) {
    out.push({ path: `${path}.$ref`, problem: 'external $ref is not supported' })
  }

  if ('format' in schema) {
    const format = schema['format']
    if (typeof format !== 'string' || !FORMATS.has(format)) {
      out.push({
        path: `${path}.format`,
        problem: `format "${String(format)}" is not one of ${[...FORMATS].join(', ')}`,
      })
    }
  }

  if ('enum' in schema) {
    const values = schema['enum']
    if (!Array.isArray(values)) {
      out.push({ path: `${path}.enum`, problem: 'enum must be an array' })
    } else {
      for (const [index, value] of values.entries()) {
        if (value === null) continue
        if (!SCALAR_ENUM.has(typeof value)) {
          out.push({
            path: `${path}.enum[${index}]`,
            problem: 'enum values must be strings, numbers, booleans or null',
          })
        }
      }
    }
  }

  if ('minItems' in schema) {
    const minItems = schema['minItems']
    if (minItems !== 0 && minItems !== 1) {
      out.push({
        path: `${path}.minItems`,
        problem: `minItems ${String(minItems)} is not supported; only 0 or 1 are`,
      })
    }
  }

  if (schema['type'] === 'object') {
    /*
     * The rule the whole module exists for, and it applies to **every** object
     * — a nested item schema inside an array is an object too. Auditing only
     * the top level is how a schema passes review and 400s in production.
     */
    if (!('additionalProperties' in schema)) {
      out.push({
        path: `${path}.additionalProperties`,
        problem: 'objects must state additionalProperties: false',
      })
    } else if (schema['additionalProperties'] !== false) {
      out.push({
        path: `${path}.additionalProperties`,
        problem: `additionalProperties must be false, not ${JSON.stringify(schema['additionalProperties'])}`,
      })
    }
  }

  const properties = schema['properties']
  if (typeof properties === 'object' && properties !== null) {
    for (const [name, child] of Object.entries(properties as Record<string, unknown>)) {
      walk(child, `${path}.properties.${name}`, out)
    }
  }

  const items = schema['items']
  if (Array.isArray(items)) {
    items.forEach((child, index) => walk(child, `${path}.items[${index}]`, out))
  } else if (items !== undefined) {
    walk(items, `${path}.items`, out)
  }

  for (const combinator of ['anyOf', 'allOf'] as const) {
    const branches = schema[combinator]
    if (!Array.isArray(branches)) continue
    branches.forEach((child, index) => walk(child, `${path}.${combinator}[${index}]`, out))
  }

  for (const container of ['$defs', 'definitions'] as const) {
    const defs = schema[container]
    if (typeof defs !== 'object' || defs === null) continue
    for (const [name, child] of Object.entries(defs as Record<string, unknown>)) {
      walk(child, `${path}.${container}.${name}`, out)
    }
  }
}

/** Thrown when a tool schema would be rejected by the API. */
export class StrictSchemaRejected extends Error {
  readonly problems: readonly StrictSchemaProblem[]

  constructor(toolName: string, problems: readonly StrictSchemaProblem[]) {
    super(
      `Tool "${toolName}" declares strict: true but its schema is outside the`
      + ` supported subset:\n${problems.map((entry) =>
        `  ${entry.path}: ${entry.problem}`).join('\n')}`,
    )
    this.name = 'StrictSchemaRejected'
    this.problems = problems
  }
}

/**
 * Refuse a non-compliant schema before a request is sent.
 *
 * Before, not after: the API's answer to an unsupported keyword is a 400, and
 * a 400 discovered in production is a 400 that cost a run. This is the same
 * information, at authoring time, naming the path.
 */
export function assertStrictSchema(toolName: string, schema: unknown): void {
  const problems = strictSchemaProblems(schema)
  if (problems.length > 0) throw new StrictSchemaRejected(toolName, problems)
}
