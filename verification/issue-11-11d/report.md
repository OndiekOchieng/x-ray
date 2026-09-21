# Issue #11 slice 11d — responsive, accessibility, loading and error hardening

**Released from:** `42a0f9d`
**Gate:** `pnpm check:rendered` — **18/18**, in real Chrome against the seeded PostgreSQL
**Screenshots:** 12, at 360px and 1280px, in `verification/issue-11-11d/`
**Canonical data:** untouched

---

## The harness, and why it is this one

11d's claims are about *rendered* behaviour — whether a page overflows a 360px
viewport, whether a focused control is **visibly** focused, what a screen
reader calls an icon button. None of that is answerable from source text, which
is where 11c's checks stopped, and none of it is answerable from a DOM without a
layout engine, since jsdom computes no geometry and no cascade.

So `lib/xray/host/browser.ts` drives the Chrome already installed on this
machine over the DevTools Protocol: a launcher, a WebSocket and
`Runtime.evaluate`, in about 200 lines. **No new dependency, no browser
download, no E2E framework.** Node's global `WebSocket` and `fetch` do the rest.

It deliberately has no test runner, assertion library, page objects, retries or
parallelism — a check that needs those is a check that wants a framework, and
11d was told not to introduce one.

With no server reachable it reports that and exits non-zero rather than passing
vacuously. A rendered gate that skips itself is worse than no gate.

---

## What the audit actually found

11a predicted overflow from three unprefixed grids. Measured at 360px, **there
was no horizontal overflow anywhere** — Tailwind grids shrink rather than
overflow. The real problem was readability, not overflow: the landing's featured
card rendered **three 82px columns**. So item 11 is asserted as *column count
and minimum column width*, not as overflow.

Four defects the rendered audit found that source inspection had not:

| Finding | Measured | Fix |
| --- | --- | --- |
| No authored focus ring | **33 of 33** focusable controls on the explorer, 11 of 11 on the gap page, 2 of 2 on the public version | one global `:focus-visible` rule |
| Two `<main>` landmarks | explorer, gap page and library each had 2 | the inner ones became `<div>` |
| Heading skip | the progress page went `h2 → h4`, 13 times | `pipeline-stage.tsx` emits `h3` |
| 82px columns at 360px | landing featured card | narrow fallbacks on the three flagged grids |

### The focus fix is one rule, deliberately

Per-component classes were never going to close a 33-of-33 gap — a control
added later simply would not have one. So the rule is global, keyed on
`:focus-visible` so it fires for keyboard focus and not mouse clicks, and uses
two channels: a 2px outline that survives either theme, and a 2px offset so the
ring does not sit on the control's own border. Components may still add their
own; this is the floor.

---

## Check 14 was wrong, and fixing it found another defect

This is the most important thing in the slice, so it is recorded in full.

The first version of check 14 accepted any outline wider than a hairline. The
**W1 variant — deleting the global focus rule outright — passed 18/18**, because
Chrome keeps drawing its own ring. The check was measuring "is focus drawn",
when the release asks for something stricter: *"Do not rely on browser-default
focus if the surrounding styling makes it hard to see."*

Measured on this machine:

```text
Chrome default   outline: auto  1px, offset 1px
authored here    outline: solid 2px, offset 2px
```

So an acceptable indicator is now a ring **at least 2px wide and offset clear of
the border**, or a box-shadow — both things a stylesheet had to ask for.

**The hardened check immediately failed the clean tree**, on a defect the weak
version had hidden: `/xray/{slug}/v1` is a **self-contained document** that
loads none of the application's stylesheets, so its two links — including the
canonical citation link, the whole point of that page — had only the browser
default. Fixed by authoring `a:focus-visible` into the published document's own
inline stylesheet, along with `overflow-wrap` for long slugs.

---

## Loading and error states

Five `loading.tsx` files, one per streamed route, each with `role="status"` and
visible text: *Loading the demo investigation…*, *Loading evidence…*, *Loading
investigation…*, *Loading gap…*, *Loading published X-Rays…*.

None says *Analyzing*, *Researching*, *Investigating* or *Tracing*. The demo
path replays a completed investigation, and dressing a read of stored state as
live research is the one dishonesty this whole issue exists to avoid. Check
19/20 refuses all four words — and reads the code with comments stripped,
because the comment explaining the rule contains the words it forbids. (That is
the same mistake 11c made once; it is now made once here too and fixed.)

**These loading states broke the harness before they broke anything else.**
`settle()` waited for the document to stop growing, and a small static
placeholder satisfies that instantly — so three checks were measuring the
placeholder rather than the page, and reported failures that were not real
(a "3-column grid", "Tab reached 0 of 34 controls", "hover-only links"). It now
also requires no visible `Loading…` text and three consecutive stable reads.

A 404 gets a real page: *"X-Ray has nothing at this address"*, with routes home
and to the library, and wording that keeps 11b's distinction — it says the
address is unknown and explicitly **not** that storage is unavailable.

The `CAPABILITY_BLOCKED` page is asserted to say *Research capability
unavailable*, *Scheduled and did not run*, *no version committed* and *no
evidence was gathered*, and asserted **not** to say *Investigation failed*,
*could not be verified*, *no evidence exists* or *Analyzing* — driven through a
real submission against the running server, whose durable status the check reads
first.

---

## Verification

| # | Item | Check |
| --- | --- | --- |
| 1–4 | one h1 on landing, explorer, gap, public version | 1-4 (all eight journey pages) |
| 5 | heading order coherent | 5 (no level skipped on any journey page) |
| 6–10 | no horizontal overflow at 360px | 6-10 (all eight pages, with culprits named on failure) |
| 11 | the three flagged grids reflow | 11 (column count **and** no column under 120px) |
| 12 | long titles/urls/ids do not overflow | 12 (the canonical citation link, measured) |
| 13 | controls keyboard reachable | 13 (real Tab presses, four pages) |
| 14 | visible focus | 14 (**authored** ring, five pages) |
| 15 | icon-only controls named | 15/16 (computed names: aria-label, aria-labelledby, `label[for]`, text) |
| 16 | drawer named and keyboard-closable | 15/16 (opens the drawer, reads role, name and close control) |
| 17 | state not colour-only | 17 (coloured elements with no words in themselves or their region) |
| 18 | no hover-only interaction | 18 (focusable but unrendered, all eight pages) |
| 19, 20 | loading text present, no research claim | 19/20 |
| 21 | storage-unavailable announced | 21 |
| 22 | 404 recovery path | 22 (and asserted not to read as an outage) |
| 23 | capability-blocked truthful | 23 (real submission, durable status, then the page) |
| 24, 25 | gap actions distinct, keyboard-operable | 24/25 (including: not a *disabled* request button) |
| 26 | public version action-free | 26 (zero buttons, forms, inputs) |
| 27, 28 | canonical bytes and publication history | `check:demo-host` 15/15, `check:legibility` 20/20, `check:publication`, `check:version-lineage` |
| 29 | #9/#10/11b/11c gates green | `final-gate.txt` |
| 30, 31 | typecheck, production build | `final-gate.txt` |

### Viewports

Measured at 360, 1280 for every assertion; screenshots captured at **360px** and
**1280px** for the landing, progress, explorer, both gaps and the public version
— 12 files. The intermediate widths (390–430, 768) are covered by the same
assertions: the layout has breakpoints only at `sm:` (640px), so 360 and 1280
bracket both sides of every one of them. Stated rather than implied.

### The gate bites

`gate-bites.txt`, six variants, each rebuilt and reserved:

| Variant | Caught by |
| --- | --- |
| **W1** remove the global focus rule | 14 — *after* hardening; the first run recorded a false pass, and that is in the record |
| **W2** reintroduce `grid-cols-3` with no fallback | 11 |
| **W3** icon-only drawer close, no name | 15/16 |
| **W4** replace loading text with a bare spinner | 19/20 |
| **W5** render `CAPABILITY_BLOCKED` as *Investigation failed* | 23 |
| **W6** hide the `WAIT_FOR_RECORD` distinction | 24/25 |

---

## Limitations, stated

**Low-bandwidth (§J) is covered by construction rather than by throttling.** The
demo path reads stored state and touches no provider — 11b proved that, and
`check:rendered` measures every page after its loading placeholder clears, so a
slow page shows authored text rather than a blank shell. What is **not** proven
here is behaviour under an artificially throttled network: CDP can emulate it,
and asserting a specific timing would make the gate flaky, so it was left out
deliberately rather than faked.

**Contrast ratios are not measured.** The focus ring uses the theme's `--ring`
and `--fg` tokens, which are the same tokens the rest of the interface trusts.
A contrast audit is a different tool and a different slice.

**No transaction-scope refactor.** Nothing in 11d proved the single shared
connection blocks the single-operator demo, so the carried gap stays carried, as
the stop line requires.

## Files

- `verification/issue-11-11d/narrow-360-*.png`, `desktop-1280-*.png` — 12 screenshots
- `verification/issue-11-11d/gate-bites.txt` — six adversarial variants, with the W1 correction recorded
- `verification/issue-11-11d/final-gate.txt` — 18/18 plus the regression sweep

## Reproduction

```bash
export XRAY_POSTGRES_URL="postgresql://xray@127.0.0.1:5488/xraylive"
pnpm demo:seed && pnpm build
PORT=3160 pnpm start &
XRAY_DEMO_URL=http://localhost:3160 pnpm check:rendered
```

Chrome is located automatically; `XRAY_CHROME` overrides it.
