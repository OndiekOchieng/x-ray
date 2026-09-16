/**
 * Browser utilities.
 *
 * Deliberately NOT in `lib/xray/`. Clipboard and download are DOM side
 * effects with no domain meaning, and the domain, selector and projection
 * layers are required to stay free of DOM access.
 *
 * Moved here from the v0 scaffold's `lib/types/gaps.ts`, where they sat beside
 * type definitions and fixture data.
 */

/** Copy text to the clipboard. Silently no-ops where unavailable. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Offer text to the user as a file download. */
export function downloadText(filename: string, text: string): void {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
