/**
 * A minimal browser driver for the rendered gate (#11 slice 11d).
 *
 * WHY THIS AND NOT A TEST FRAMEWORK
 * =================================
 * 11d's claims are about *rendered* behaviour: whether a page overflows a
 * 360px viewport, whether a focused control is visibly focused, what a screen
 * reader would call an icon button. None of that is answerable from source
 * text, which is where 11c's checks stopped, and none of it is answerable from
 * a DOM without a layout engine — jsdom computes no geometry and no cascade.
 *
 * So this drives the Chrome already installed on the machine over the DevTools
 * Protocol. No new dependency, no browser download, no E2E framework: a
 * launcher, a WebSocket, and `Runtime.evaluate`. The harness exists to prove
 * the acceptance points and nothing else.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * ================================
 * No test runner, no assertion library, no page-object layer, no retries, no
 * parallelism. A check that needs any of that is a check that wants a
 * framework, and 11d was told not to introduce one.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Chrome locations worth trying before giving up. */
const CHROME_CANDIDATES = [
  process.env.XRAY_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((path): path is string => typeof path === 'string')

export class BrowserUnavailable extends Error {
  constructor() {
    super('No Chrome or Chromium was found. Set XRAY_CHROME to its executable.')
    this.name = 'BrowserUnavailable'
  }
}

interface Pending {
  resolve: (value: Record<string, unknown>) => void
  reject: (error: Error) => void
}

export class Browser {
  private readonly process: ChildProcess
  private readonly profile: string
  private readonly socket: WebSocket
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private sessionId?: string

  private constructor(process: ChildProcess, profile: string, socket: WebSocket) {
    this.process = process
    this.profile = profile
    this.socket = socket
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String((event as MessageEvent).data)) as {
        id?: number; result?: Record<string, unknown>; error?: { message: string }
      }
      if (message.id === undefined) return
      const waiting = this.pending.get(message.id)
      if (!waiting) return
      this.pending.delete(message.id)
      if (message.error) waiting.reject(new Error(message.error.message))
      else waiting.resolve(message.result ?? {})
    })
  }

  /** Launch headless Chrome and attach to a fresh page. */
  static async launch(): Promise<Browser> {
    const executable = await firstExisting(CHROME_CANDIDATES)
    if (!executable) throw new BrowserUnavailable()

    const profile = mkdtempSync(join(tmpdir(), 'xray-cdp-'))
    const port = 9222 + Math.floor(process.hrtime()[1] % 500)
    const child = spawn(executable, [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ], { stdio: 'ignore' })

    const endpoint = await waitForEndpoint(port)
    const socket = new WebSocket(endpoint)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
    })

    const browser = new Browser(child, profile, socket)
    const target = await browser.send('Target.createTarget', { url: 'about:blank' })
    const attached = await browser.send('Target.attachToTarget',
      { targetId: target.targetId, flatten: true })
    browser.sessionId = attached.sessionId as string
    await browser.send('Page.enable')
    await browser.send('Runtime.enable')
    return browser
  }

  private send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.nextId++
    const message: Record<string, unknown> = { id, method, params }
    if (this.sessionId && !method.startsWith('Target.')) message.sessionId = this.sessionId
    this.socket.send(JSON.stringify(message))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, 30_000)
    })
  }

  /** CSS pixels, with a device pixel ratio of 1 so measurements are literal. */
  async setViewport(width: number, height: number): Promise<void> {
    await this.send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  }

  /**
   * Navigate and wait for the page to settle.
   *
   * Streamed pages finish after `load`, so this also waits for the document to
   * stop growing — a claim about a rendered page that measured a half-streamed
   * one would be worthless.
   */
  async goto(url: string): Promise<void> {
    await this.send('Page.navigate', { url })
    await this.settle()
  }

  /**
   * Wait until the page has actually arrived.
   *
   * Two conditions, and the second was learned the hard way: 11d added
   * authored loading placeholders, and a "wait until the document stops
   * growing" rule settles on one of them instantly — the placeholder is small,
   * static, and identical on consecutive reads. Every measurement after that
   * describes the placeholder rather than the page.
   *
   * So: no visible `Loading…` text, and three consecutive identical sizes
   * rather than two.
   */
  private async settle(): Promise<void> {
    let previous = -1
    let stable = 0
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      const state = JSON.parse(String(await this.evaluate(`
        return JSON.stringify({
          size: document.body.innerHTML.length,
          loading: /^\\s*Loading\\b/.test((document.body.textContent || '').trim()),
        })
      `))) as { size: number; loading: boolean }
      if (state.loading || state.size === 0) { previous = -1; stable = 0; continue }
      stable = state.size === previous ? stable + 1 : 0
      previous = state.size
      if (stable >= 2) return
    }
  }

  /** Evaluate an expression and return its JSON value. */
  async evaluate(expression: string): Promise<unknown> {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => { ${expression.includes('return') ? expression : `return (${expression})`} })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    const wrapper = result.result as { value?: unknown; subtype?: string; description?: string }
    if ((result.exceptionDetails as { text?: string } | undefined))
      throw new Error(`evaluate failed: ${JSON.stringify(result.exceptionDetails)}`)
    return wrapper?.value
  }

  /** Press a key, so tab order and focus can be measured rather than assumed. */
  async press(key: string): Promise<void> {
    const codes: Record<string, { code: string; windowsVirtualKeyCode: number }> = {
      Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
      Enter: { code: 'Enter', windowsVirtualKeyCode: 13 },
      Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
    }
    const descriptor = codes[key]
    if (!descriptor) throw new Error(`No key descriptor for ${key}`)
    for (const type of ['keyDown', 'keyUp'] as const) {
      await this.send('Input.dispatchKeyEvent', { type, key, ...descriptor })
    }
  }

  async screenshot(): Promise<string> {
    const shot = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    return shot.data as string
  }

  async close(): Promise<void> {
    try { this.socket.close() } catch { /* already closing */ }
    this.process.kill()
    try { rmSync(this.profile, { recursive: true, force: true }) } catch { /* best effort */ }
  }
}

async function firstExisting(paths: readonly string[]): Promise<string | undefined> {
  const { access } = await import('node:fs/promises')
  for (const path of paths) {
    try { await access(path); return path } catch { /* try the next one */ }
  }
  return undefined
}

async function waitForEndpoint(port: number): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      const body = await response.json() as { webSocketDebuggerUrl?: string }
      if (body.webSocketDebuggerUrl) return body.webSocketDebuggerUrl
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('Chrome did not expose a DevTools endpoint')
}
