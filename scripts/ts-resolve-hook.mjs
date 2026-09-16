/**
 * Node module-resolution hook: lets Node run the TypeScript fixture modules
 * directly, despite their bundler-style extensionless relative imports.
 *
 * Node 26 strips TypeScript types natively but still requires explicit file
 * extensions in ESM. The fixture and domain modules are written for the Next
 * bundler (`moduleResolution: "bundler"`), which does not. This hook bridges
 * the two by trying `.ts`, `.tsx` and `/index.ts` when a relative specifier has
 * no extension.
 *
 * It also resolves the project's `@/*` path alias, which Node does not know
 * about — tsconfig maps it to the project root.
 *
 * Used only by the check scripts. It is not part of the application build and
 * nothing in app/ or components/ depends on it.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CANDIDATES = ['.ts', '.tsx', '/index.ts', '.js', '.mjs']

/** Project root, mirroring the `@/*` -> `./*` mapping in tsconfig.json. */
const PROJECT_ROOT = new URL('../', import.meta.url)

export function resolve(specifier, context, nextResolve) {
  // `@/x` is the project's own path alias, not an npm scope.
  if (specifier.startsWith('@/')) {
    const base = new URL(specifier.slice(2), PROJECT_ROOT).href
    for (const ext of ['', ...CANDIDATES]) {
      if (ext !== '' || /\.[cm]?[jt]sx?$/.test(specifier)) {
        if (existsSync(fileURLToPath(base + ext))) return nextResolve(base + ext, context)
      }
    }
    return nextResolve(base, context)
  }

  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL).href
    for (const ext of CANDIDATES) {
      if (existsSync(fileURLToPath(base + ext))) {
        return nextResolve(base + ext, context)
      }
    }
  }
  return nextResolve(specifier, context)
}
