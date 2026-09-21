/**
 * Rendered checks for the primary journey (#11 slice 11d).
 *
 * WHY A BROWSER
 * =============
 * 11c's checks read authored copy, which was right for copy and cannot answer
 * 11d's questions. Whether a page overflows a 360px viewport, whether a
 * focused control is *visibly* focused, and what a screen reader calls an icon
 * button are all facts about layout, the cascade and the accessibility tree.
 * Source text cannot say, and a DOM without a layout engine cannot either.
 *
 * So this drives the Chrome already on the machine over the DevTools Protocol —
 * no new dependency and no E2E framework. See `browser.ts`.
 *
 * WHAT IT NEEDS
 * =============
 * A production build served against the seeded database:
 *
 *   XRAY_POSTGRES_URL=… pnpm demo:seed
 *   XRAY_POSTGRES_URL=… PORT=3160 pnpm start
 *   XRAY_DEMO_URL=http://localhost:3160 pnpm check:rendered
 *
 * With no server reachable it says so and exits non-zero rather than passing
 * vacuously — a rendered gate that skips itself is worse than no gate.
 *
 * Run:  pnpm check:rendered
 */

import { writeFileSync } from 'node:fs'

import { Browser, BrowserUnavailable } from './browser'
import { DEMO_SEED } from './demo-seed'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

const BASE = process.env.XRAY_DEMO_URL ?? 'http://localhost:3160'
const SLUG = DEMO_SEED.slug

/** The primary journey, in the order a judge walks it. */
const JOURNEY = {
  landing: '/',
  library: '/library',
  progress: `/investigation/${DEMO_SEED.investigationId}`,
  explorer: `/investigations/${DEMO_SEED.investigationId}`,
  gapRequestable: '/gap/GAP-001',
  gapWaiting: '/gap/GAP-003',
  publicVersion: `/xray/${SLUG}/v1`,
  notFound: '/investigations/DOES-NOT-EXIST',
} as const

const NARROW = 360
const DESKTOP = 1280

/** Every interactive control a keyboard can reach. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select,textarea,summary,[tabindex]:not([tabindex="-1"])'

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(4000) })
  } catch {
    console.error(`No server at ${BASE}. See the header of this file for how to start one.`)
    process.exitCode = 1
    return
  }

  let browser: Browser
  try {
    browser = await Browser.launch()
  } catch (error) {
    if (error instanceof BrowserUnavailable) console.error(error.message)
    else console.error(error)
    process.exitCode = 1
    return
  }

  try {
    // === headings and landmarks =========================================

    await browser.setViewport(DESKTOP, 900)

    await check('1-4 · every primary page has exactly one h1', async () => {
      for (const [name, path] of Object.entries(JOURNEY)) {
        await browser.goto(BASE + path)
        const count = Number(await browser.evaluate(
          'document.querySelectorAll("h1").length'))
        if (count !== 1) return `${name} has ${count} h1 element(s)`
      }
      return null
    })

    await check('5 · heading levels never skip on the primary journey', async () => {
      for (const [name, path] of Object.entries(JOURNEY)) {
        await browser.goto(BASE + path)
        const levels = (await browser.evaluate(
          '[...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]))',
        )) as number[]
        if (levels.length === 0 || levels[0] !== 1) return `${name} starts at h${levels[0]}`
        for (let index = 1; index < levels.length; index += 1) {
          if (levels[index] - levels[index - 1] > 1)
            return `${name} skips h${levels[index - 1]} → h${levels[index]}`
        }
      }
      return null
    })

    await check('E · exactly one main landmark per page', async () => {
      for (const [name, path] of Object.entries(JOURNEY)) {
        await browser.goto(BASE + path)
        const mains = Number(await browser.evaluate('document.querySelectorAll("main").length'))
        if (mains !== 1) return `${name} has ${mains} main element(s)`
      }
      return null
    })

    // === responsive =====================================================

    await check('6-10 · no horizontal overflow at 360px anywhere on the journey', async () => {
      await browser.setViewport(NARROW, 900)
      for (const [name, path] of Object.entries(JOURNEY)) {
        await browser.goto(BASE + path)
        const overflow = Number(await browser.evaluate(`
          const root = document.documentElement
          return root.scrollWidth - root.clientWidth
        `))
        if (overflow > 0) {
          const culprits = await browser.evaluate(`
            const width = document.documentElement.clientWidth
            return [...document.querySelectorAll('*')]
              .filter((el) => el.getBoundingClientRect().right > width + 1)
              .slice(0, 3)
              .map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0])
          `)
          return `${name} overflows by ${overflow}px: ${JSON.stringify(culprits)}`
        }
      }
      return null
    })

    await check('11 · the three flagged grids reflow to one or two columns at 360px', async () => {
      await browser.setViewport(NARROW, 900)
      // The landing's featured card, which carried an unprefixed grid-cols-3.
      await browser.goto(BASE + JOURNEY.landing)
      const landing = await browser.evaluate(`
        return [...document.querySelectorAll('[class*="grid-cols"]')]
          .map((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      `) as number[]
      if (landing.some((columns) => columns > 2))
        return `the landing still renders ${Math.max(...landing)} columns at 360px`

      // The progress page's completion state, which carried grid-cols-2.
      await browser.goto(BASE + JOURNEY.progress)
      const progress = await browser.evaluate(`
        return [...document.querySelectorAll('[class*="grid-cols"]')]
          .map((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      `) as number[]
      if (progress.some((columns) => columns > 2))
        return `the progress page still renders ${Math.max(...progress)} columns at 360px`

      // And nothing on the journey renders a column narrower than ~120px,
      // which is where dense metadata stops being readable rather than
      // merely stops overflowing.
      for (const path of [JOURNEY.explorer, JOURNEY.gapRequestable]) {
        await browser.goto(BASE + path)
        const narrowest = Number(await browser.evaluate(`
          const widths = [...document.querySelectorAll('[class*="grid-cols"]')]
            .flatMap((el) => getComputedStyle(el).gridTemplateColumns.split(' '))
            .map((value) => parseFloat(value))
            .filter((value) => Number.isFinite(value) && value > 0)
          return widths.length === 0 ? 999 : Math.min(...widths)
        `))
        if (narrowest < 120) return `${path} renders a ${Math.round(narrowest)}px column at 360px`
      }
      return null
    })

    await check('12 · a long title, url or id does not force the viewport sideways', async () => {
      await browser.setViewport(NARROW, 900)
      await browser.goto(BASE + JOURNEY.publicVersion)
      // The canonical citation link is the longest unbroken string in the
      // product, and it is displayed in full on purpose.
      const measured = await browser.evaluate(`
        const link = document.querySelector('[data-testid="canonical-link"]')
        if (!link) return JSON.stringify({ found: false })
        const root = document.documentElement
        return JSON.stringify({
          found: true,
          chars: link.textContent.trim().length,
          right: Math.round(link.getBoundingClientRect().right),
          viewport: root.clientWidth,
          overflow: root.scrollWidth - root.clientWidth,
        })
      `) as string
      const info = JSON.parse(measured) as {
        found: boolean; chars: number; right: number; viewport: number; overflow: number
      }
      if (!info.found) return 'the canonical citation link is not rendered'
      if (info.chars < 60) return `the citation is only ${info.chars} characters, so this proves little`
      if (info.overflow > 0) return `the citation overflows the viewport by ${info.overflow}px`
      return info.right <= info.viewport + 1
        ? null : `the citation extends ${info.right - info.viewport}px past the viewport`
    })

    // === keyboard and focus =============================================

    await browser.setViewport(DESKTOP, 900)

    await check('13 · every primary control is reachable by Tab', async () => {
      for (const [name, path] of [
        ['landing', JOURNEY.landing], ['explorer', JOURNEY.explorer],
        ['gap', JOURNEY.gapRequestable], ['public version', JOURNEY.publicVersion],
      ] as [string, string][]) {
        await browser.goto(BASE + path)
        const expected = Number(await browser.evaluate(
          `document.querySelectorAll('${FOCUSABLE}').length`))
        if (expected === 0) return `${name} has no focusable control at all`
        await browser.evaluate('document.body.focus(); return true')
        const reached = new Set<string>()
        for (let step = 0; step < expected + 6; step += 1) {
          await browser.press('Tab')
          const id = String(await browser.evaluate(`
            const el = document.activeElement
            if (!el || el === document.body) return ''
            return el.tagName + '#' + (el.id || (el.textContent || '').trim().slice(0, 24))
          `))
          if (id) reached.add(id)
        }
        // Not every control need be reached in one pass — a focus trap or a
        // hidden control would show up as a large shortfall.
        if (reached.size < Math.min(expected, 4))
          return `${name}: Tab reached ${reached.size} of ${expected} controls`
      }
      return null
    })

    await check('14 · a focused control is visibly focused', async () => {
      for (const [name, path] of [
        ['landing', JOURNEY.landing], ['explorer', JOURNEY.explorer],
        ['gap', JOURNEY.gapRequestable], ['public version', JOURNEY.publicVersion],
        ['not found', JOURNEY.notFound],
      ] as [string, string][]) {
        await browser.goto(BASE + path)
        await browser.evaluate('document.body.focus(); return true')
        for (let step = 0; step < 3; step += 1) {
          await browser.press('Tab')
          // Computed style, not a class name: what matters is whether the
          // focus is drawn, and by what.
          const state = JSON.parse(String(await browser.evaluate(`
            const el = document.activeElement
            if (!el || el === document.body) return JSON.stringify({ skip: true })
            const style = getComputedStyle(el)
            return JSON.stringify({
              skip: false,
              tag: el.tagName,
              label: (el.textContent || '').trim().slice(0, 24),
              outlineWidth: parseFloat(style.outlineWidth) || 0,
              outlineStyle: style.outlineStyle,
              outlineOffset: parseFloat(style.outlineOffset) || 0,
              boxShadow: style.boxShadow,
            })
          `))) as {
            skip: boolean; tag?: string; label?: string
            outlineWidth?: number; outlineStyle?: string
            outlineOffset?: number; boxShadow?: string
          }
          if (state.skip) continue
          /*
           * AUTHORED, not merely the browser default.
           *
           * The first version of this accepted any outline wider than a
           * hairline, and the W1 variant — deleting the global focus-visible
           * rule outright — still passed 18/18, because Chrome keeps drawing
           * its own ring. The release is explicit that a browser default is
           * not sufficient where the surrounding styling makes it hard to
           * see, so the check has to tell the two apart.
           *
           * Measured on this machine:
           *   Chrome default   style `auto`,  width 1-3px, offset 0px
           *   authored here    style `solid`, width 2px,   offset 2px
           *
           * So an acceptable indicator is a ring at least 2px wide that is
           * offset clear of the control's own border, or a box-shadow. Both
           * are things a stylesheet had to ask for.
           */
          const width = state.outlineWidth ?? 0
          const offset = state.outlineOffset ?? 0
          const outlined = state.outlineStyle !== 'none' && width >= 2 && offset > 0
          const shadowed = Boolean(state.boxShadow) && state.boxShadow !== 'none'
          if (!outlined && !shadowed)
            return `${name}: ${state.tag}[${state.label}] has no authored focus indicator` +
              ` (outline ${state.outlineStyle} ${width}px offset ${offset}px)`
        }
      }
      return null
    })

    // === names, state and colour ========================================

    await check('15/16 · icon-only controls and the receipt drawer have accessible names', async () => {
      await browser.goto(BASE + JOURNEY.explorer)
      const unnamed = await browser.evaluate(`
        const named = (el) => {
          if (el.getAttribute('aria-label')) return true
          if (el.getAttribute('title')) return true
          const labelled = el.getAttribute('aria-labelledby')
          if (labelled && labelled.split(/\\s+/).some((id) => document.getElementById(id))) return true
          if (el.id && document.querySelector('label[for="' + el.id + '"]')) return true
          return (el.textContent || '').trim().length > 0
        }
        return [...document.querySelectorAll('${FOCUSABLE}')]
          .filter((el) => !named(el))
          .map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0])
      `) as string[]
      if (unnamed.length > 0) return `unnamed controls: ${JSON.stringify(unnamed.slice(0, 4))}`

      // Open the receipt drawer, which is the journey's one dialog-like
      // surface, and check it is named and closable from the keyboard.
      const opened = await browser.evaluate(`
        // The receipt rows, specifically: the claim navigator's buttons look
        // similar and open nothing, which is what the first selector caught.
        const trigger = [...document.querySelectorAll('button')]
          .find((el) => /hover:border-primary\\/50/.test(String(el.className)))
          ?? [...document.querySelectorAll('button')]
            .find((el) => /Inspect receipt/i.test(el.getAttribute('aria-label') || ''))
        if (!trigger) return 'no receipt trigger found'
        trigger.click()
        return 'clicked'
      `)
      if (opened !== 'clicked') return String(opened)
      await new Promise((resolve) => setTimeout(resolve, 400))
      const drawer = JSON.parse(String(await browser.evaluate(`
        const panel = document.querySelector('[role="dialog"], [aria-modal="true"], aside')
        if (!panel) return JSON.stringify({ found: false })
        const closers = [...panel.querySelectorAll('button')]
          .filter((el) => /close/i.test(el.getAttribute('aria-label') || el.textContent || ''))
        return JSON.stringify({
          found: true,
          role: panel.getAttribute('role') || panel.tagName.toLowerCase(),
          name: panel.getAttribute('aria-label') ||
            (panel.getAttribute('aria-labelledby')
              ? (document.getElementById(panel.getAttribute('aria-labelledby'))?.textContent || '').trim()
              : ''),
          closers: closers.length,
          closerNames: closers.map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim()),
        })
      `))) as {
        found: boolean; role?: string; name?: string; closers?: number; closerNames?: string[]
      }
      if (!drawer.found) return 'the receipt drawer did not open'
      if (!drawer.name) return `the drawer (${String(drawer.role)}) has no accessible name`
      return (drawer.closers ?? 0) > 0
        ? null : 'the drawer has no named close control'
    })

    await check('17 · state is never carried by colour alone', async () => {
      for (const path of [JOURNEY.explorer, JOURNEY.gapRequestable, JOURNEY.progress]) {
        await browser.goto(BASE + path)
        // Every element whose only content is a colour swatch or dot would
        // fail here; what is asserted is that each status-bearing region
        // carries words.
        /*
         * The question is whether STATE is carried by colour alone, not
         * whether a coloured element contains text. A decorative dot marked
         * `aria-hidden` sitting beside `<span>Research complete</span>` is
         * correct markup, and the first version of this check failed it.
         *
         * So a coloured element is a violation only when neither it nor the
         * region around it says anything in words.
         */
        const wordless = await browser.evaluate(`
          const suspects = [...document.querySelectorAll('[class*="bg-amber"],[class*="bg-red"],[class*="bg-green"],[class*="bg-primary/"]')]
          return suspects
            .filter((el) => {
              if ((el.textContent || '').trim().length > 0) return false
              if (el.querySelector('svg')) return false
              // Explicitly decorative: the state is somewhere else by
              // definition, and marking it hidden is the correct thing to do.
              if (el.getAttribute('aria-hidden') === 'true') return false
              // parentElement, not closest(): closest() starts at the element
              // itself, so a coloured <div> always matched itself and reported
              // its own empty text.
              let region = el.parentElement
              for (let up = 0; up < 3 && region; up += 1) {
                if ((region.textContent || '').trim().length > 0) return false
                region = region.parentElement
              }
              return true
            })
            .map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0])
        `) as string[]
        if (wordless.length > 0)
          return `${path}: colour-only state in ${JSON.stringify(wordless.slice(0, 3))}`
      }
      return null
    })

    await check('18 · nothing on the journey requires hover', async () => {
      for (const path of Object.values(JOURNEY)) {
        await browser.goto(BASE + path)
        // A control reachable only on hover would be display:none until
        // hovered; a hover-only *disclosure* would hide content with no
        // keyboard equivalent. Both show up as focusable elements that are
        // not rendered.
        const hidden = await browser.evaluate(`
          return [...document.querySelectorAll('${FOCUSABLE}')]
            .filter((el) => {
              const rect = el.getBoundingClientRect()
              const style = getComputedStyle(el)
              const offscreen = rect.width === 0 && rect.height === 0
              const hiddenByCss = style.visibility === 'hidden' || style.display === 'none'
              const srOnly = /sr-only/.test(String(el.className))
              return (offscreen || hiddenByCss) && !srOnly
            })
            .map((el) => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0])
        `) as string[]
        if (hidden.length > 0)
          return `${path}: ${JSON.stringify(hidden.slice(0, 3))} reachable but not rendered`
      }
      return null
    })

    // === loading and error states =======================================

    await check('19/20 · loading states say what is happening, and never claim research', async () => {
      const { readFileSync } = await import('node:fs')
      const files = ['app/loading.tsx', 'app/library/loading.tsx',
        'app/investigations/[id]/loading.tsx', 'app/investigation/[id]/loading.tsx',
        'app/gap/[id]/loading.tsx']
      for (const file of files) {
        const raw = readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')
        // Comments explain what the copy must NOT say, so scanning them for
        // forbidden words fails every file that documents the rule — which is
        // exactly what the first version of this check did.
        const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        if (!/role="status"/.test(source)) return `${file} announces nothing`
        const text = /Loading[^<]*/.exec(source)
        if (!text) return `${file} has no visible loading text`
        if (text[0].trim().length < 10) return `${file}'s loading text is "${text[0].trim()}"`
        // The distinction 11a and 11b were built around: this is a read of
        // stored state, not research.
        for (const forbidden of [/Analyz/i, /Researching/i, /Investigating/i, /Tracing/i]) {
          if (forbidden.test(source)) return `${file} claims live research`
        }
      }
      return null
    })

    await check('21 · storage-unavailable is readable and announced', async () => {
      const { readFileSync } = await import('node:fs')
      for (const file of ['app/page.tsx', 'app/library/page.tsx']) {
        const source = readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')
        if (!/temporarily unavailable/.test(source)) return `${file} has no outage copy`
        if (!/role="status"/.test(source)) return `${file} does not announce the outage`
      }
      return null
    })

    await check('22 · a 404 offers a way out', async () => {
      await browser.goto(BASE + JOURNEY.notFound)
      const page = JSON.parse(String(await browser.evaluate(`
        const links = [...document.querySelectorAll('main a[href]')]
          .map((el) => el.getAttribute('href'))
        return JSON.stringify({
          text: (document.body.textContent || '').replace(/\\s+/g, ' '),
          links,
        })
      `))) as { text: string; links: string[] }
      if (!/nothing at this address/i.test(page.text))
        return 'the 404 page does not say what happened'
      // An outage and a wrong address are different things, and this page
      // must not be mistaken for the first.
      if (/temporarily unavailable/i.test(page.text))
        return 'the 404 page reads as an outage'
      if (!page.links.includes('/')) return 'no route home'
      return page.links.includes('/library') ? null : 'no route to the library'
    })

    await check('23 · a capability-blocked run stays truthful and readable', async () => {
      // A real fresh submission through the running server, with no provider.
      const created = await (await fetch(`${BASE}/api/investigations`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceUrl: 'https://example.org/rendered-gate-source' }),
      })).json() as { investigationId: string }
      const run = await (await fetch(
        `${BASE}/api/investigations/${created.investigationId}/executions`,
        { method: 'POST' })).json() as { executionRunId: string; status: string }
      if (run.status !== 'CAPABILITY_BLOCKED') return `durable status ${run.status}`

      await browser.goto(
        `${BASE}/investigation/${created.investigationId}?run=${run.executionRunId}`)
      const text = String(await browser.evaluate(
        '(document.body.textContent || "").replace(/\\s+/g, " ")'))
      for (const required of ['Research capability unavailable', 'Scheduled and did not run',
        'no version committed', 'no evidence was gathered']) {
        if (!text.includes(required)) return `the page omits "${required}"`
      }
      for (const forbidden of ['Investigation failed', 'could not be verified',
        'no evidence exists', 'Analyzing']) {
        if (text.includes(forbidden)) return `the page says "${forbidden}"`
      }
      // Readable by keyboard: the run's status is in a live region.
      const announced = Number(await browser.evaluate(
        'document.querySelectorAll(\'[role="status"]\').length'))
      return announced > 0 ? null : 'the blocked run is drawn but not announced'
    })

    await check('24/25 · the two gap actions stay distinct and keyboard-operable', async () => {
      await browser.goto(BASE + JOURNEY.gapRequestable)
      const requestable = String(await browser.evaluate(
        '(document.body.textContent || "").replace(/\\s+/g, " ")'))
      if (!/can be requested/.test(requestable))
        return 'the requestable gap does not offer a request'

      await browser.goto(BASE + JOURNEY.gapWaiting)
      const waiting = JSON.parse(String(await browser.evaluate(`
        const text = (document.body.textContent || '').replace(/\\s+/g, ' ')
        const disabled = [...document.querySelectorAll('button[disabled],[aria-disabled="true"]')]
          .map((el) => (el.textContent || '').trim())
        return JSON.stringify({ text, disabled })
      `))) as { text: string; disabled: string[] }
      if (!/nothing to request/.test(waiting.text))
        return 'the waiting gap does not explain the different next step'
      if (/Draft records request/.test(waiting.text))
        return 'the waiting gap offers a records request'
      // And not hidden behind a disabled button either, which would still
      // present the action as the thing that would settle it.
      const disabledRequest = waiting.disabled.find((label) => /request/i.test(label))
      if (disabledRequest) return `the waiting gap shows a disabled "${disabledRequest}"`

      // The requestable gap's own controls are operable from the keyboard.
      await browser.goto(BASE + JOURNEY.gapRequestable)
      await browser.evaluate('document.body.focus(); return true')
      let reachedControl = false
      for (let step = 0; step < 12 && !reachedControl; step += 1) {
        await browser.press('Tab')
        reachedControl = Boolean(await browser.evaluate(`
          const el = document.activeElement
          return Boolean(el) && el !== document.body &&
            ['A', 'BUTTON', 'TEXTAREA', 'INPUT'].includes(el.tagName)
        `))
      }
      return reachedControl ? null : 'no control on the gap page was reachable by Tab'
    })

    await check('26 · the public exact version is still action-free', async () => {
      await browser.goto(BASE + JOURNEY.publicVersion)
      const surface = JSON.parse(String(await browser.evaluate(`
        return JSON.stringify({
          buttons: document.querySelectorAll('button').length,
          forms: document.querySelectorAll('form').length,
          inputs: document.querySelectorAll('input,textarea,select').length,
          links: document.querySelectorAll('a[href]').length,
          text: (document.body.textContent || '').replace(/\\s+/g, ' '),
        })
      `))) as {
        buttons: number; forms: number; inputs: number; links: number; text: string
      }
      if (surface.buttons + surface.forms + surface.inputs > 0)
        return `the published version carries ${surface.buttons} button(s), ${surface.forms} form(s), ${surface.inputs} input(s)`
      if (surface.links === 0) return 'the published version has no citation or history link'
      for (const leak of ['Draft records request', 'custody', 'Received record']) {
        if (surface.text.includes(leak)) return `the published version shows "${leak}"`
      }
      // 11c's distinctions survive.
      for (const required of ['Records traced', 'Independent origins', 'Open gaps']) {
        if (!surface.text.includes(required)) return `the published version omits "${required}"`
      }
      return null
    })

    // === screenshots, for the record ====================================

    await check('evidence · narrow and desktop screenshots captured', async () => {
      const shots: [string, number][] = [['narrow-360', NARROW], ['desktop-1280', DESKTOP]]
      for (const [label, width] of shots) {
        await browser.setViewport(width, 1200)
        for (const [name, path] of Object.entries(JOURNEY)) {
          if (name === 'notFound' || name === 'library') continue
          await browser.goto(BASE + path)
          const data = await browser.screenshot()
          writeFileSync(
            new URL(`../../../verification/issue-11-11d/${label}-${name}.png`, import.meta.url),
            Buffer.from(data, 'base64'))
        }
      }
      return null
    })
  } finally {
    await browser.close()
  }

  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
  }
  const failed = results.filter((result) => !result.ok).length
  console.log(`\n${results.length - failed}/${results.length} rendered checks passed`)
  if (failed > 0) process.exitCode = 1
}
