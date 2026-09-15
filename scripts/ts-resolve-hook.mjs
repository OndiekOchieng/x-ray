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
 * Used only by `npm run check:fixtures`. It is not part of the application
 * build and nothing in app/ or components/ depends on it.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CANDIDATES = ['.ts', '.tsx', '/index.ts', '.js', '.mjs']

export function resolve(specifier, context, nextResolve) {
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
