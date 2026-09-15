/** Registers the TypeScript resolution hook. See ts-resolve-hook.mjs. */
import { register } from 'node:module'
register('./ts-resolve-hook.mjs', import.meta.url)
