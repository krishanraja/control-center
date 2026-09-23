import { test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { largestHole, squeezedText, rawErrorStrings } from './fixtures/layout'
import { mockAudit, AUDIT_ROUTES } from './fixtures/audit'

/**
 * The same audit, on a phone.
 *
 * The desk pass fixed fifteen surfaces and never once rendered the shell Krish
 * actually carries around. Mobile is a different tree — MobileShell, BottomNav,
 * CreateSheet, the 1.2x zoom root — so nothing the desk pass proved carries
 * over, and the failure modes are different too: a phone cannot afford a hole,
 * but it can very easily clip a stage under a fixed bottom nav or squeeze a
 * sentence to one word a line.
 *
 * What it measures, per surface, at 390x844 and 360x640:
 *  - the window scrolling (the shell is 100dvh; the window must never move)
 *  - content cut off below the zoom root, or hidden UNDER the bottom nav,
 *    which is the phone-specific version of the desk's clipping bug
 *  - text squeezed under 70px across three or more lines
 *  - tap targets under the 44px floor
 *  - machine strings, error boundaries
 *
 * Instrument, not a gate. `phone-noscroll-phone.spec.ts` is the gate.
 * Run it: `LAYOUT_AUDIT=1 npx playwright test layout-audit --project=phone-390`.
 */

const OUT = path.join(process.cwd(), 'audit')

interface PhoneMeasure {
  route: string
  name: string
  width: number
  height: number
  windowScroll: number
  /** Content past the bottom of the shell with nothing to scroll it. */
  clipped: string[]
  /** Visible content sitting under the fixed bottom nav. */
  underNav: string[]
  squeezed: string[]
  /** Interactive targets smaller than 44 physical px on either axis. */
  smallTargets: string[]
  holeFraction: number
  rawErrors: string[]
  crashed: string | null
}

/**
 * The phone's clipping check, in the zoom root's own pixels.
 *
 * App renders the whole mobile tree inside `zoom: 1.2`, so a rect read from
 * getBoundingClientRect is already in CSS pixels of the zoomed box — the root's
 * own rect is the frame to compare against, not innerHeight.
 */
async function phoneClipped(page: Page) {
  return page.evaluate(() => {
    const root = (document.querySelector('.mobile-zoom-root') ?? document.querySelector('main')) as HTMLElement | null
    if (!root) return ['NO SHELL']
    const fb = root.getBoundingClientRect().bottom
    const bad: string[] = []
    const walk = (el: Element) => {
      const he = el as HTMLElement
      const cs = getComputedStyle(he)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return
      if (cs.position === 'fixed') return
      if (he !== root) {
        let n: HTMLElement | null = he.parentElement
        while (n && n !== root) {
          const pcs = getComputedStyle(n)
          if (pcs.overflowY === 'auto' || pcs.overflowY === 'scroll') return
          n = n.parentElement
        }
      }
      const own = Array.from(he.childNodes).filter(t => t.nodeType === Node.TEXT_NODE)
        .map(t => t.textContent || '').join(' ').trim()
      if (own) {
        const r = he.getBoundingClientRect()
        if (r.top > fb + 2) bad.push(`"${own.slice(0, 34)}" ${Math.round(r.top - fb)}px past the shell`)
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(root)
    return Array.from(new Set(bad)).slice(0, 8)
  })
}

/**
 * Content the bottom nav is sitting on top of.
 *
 * This is the phone bug the design notes keep returning to — "no artificial cut
 * off above the bottom nav bar", "the last rows were unreachable above a blank
 * band". A scroller that does not reserve the nav's height ends its travel with
 * its final rows permanently behind it, and nothing about that looks broken in
 * a screenshot: the rows are drawn, they are just under an opaque bar.
 *
 * Only flagged when the scroller is at its END — mid-scroll overlap is normal
 * and expected.
 */
async function underBottomNav(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-testid="bottom-nav"], nav.fixed, .bottom-nav') as HTMLElement | null
      ?? Array.from(document.querySelectorAll<HTMLElement>('nav')).find(n => getComputedStyle(n).position === 'fixed')
      ?? null
    if (!nav) return [] as string[]
    const navTop = nav.getBoundingClientRect().top
    // Scroll every scroller to its end first: overlap only matters at the end
    // of travel, where it becomes permanent.
    const scrollers = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => {
      const cs = getComputedStyle(el)
      return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2
    })
    for (const sc of scrollers) sc.scrollTop = sc.scrollHeight
    const bad: string[] = []
    const walk = (el: Element) => {
      const he = el as HTMLElement
      const cs = getComputedStyle(he)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return
      if (he === nav || nav.contains(he) || cs.position === 'fixed') return
      const own = Array.from(he.childNodes).filter(t => t.nodeType === Node.TEXT_NODE)
        .map(t => t.textContent || '').join(' ').trim()
      if (own) {
        const r = he.getBoundingClientRect()
        // Its middle is behind the bar, and it is on screen at all.
        if (r.top < navTop + 4 && r.bottom > navTop + 8 && r.top > 0) {
          bad.push(`"${own.slice(0, 34)}" ${Math.round(r.bottom - navTop)}px behind the nav`)
        }
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(document.body)
    return Array.from(new Set(bad)).slice(0, 8)
  })
}

/** Tap targets under the 44px floor, in physical pixels (the zoom is applied). */
async function smallTapTargets(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role="button"], input, select'))) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
      if (el.matches('.sr-only, .sr-only *')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      if (r.top > innerHeight || r.bottom < 0) continue
      // A control inside another control (a chevron in a row) is not its own
      // tap target; the row is.
      if (el.parentElement?.closest('button, a[href], [role="button"]')) continue
      if (r.height >= 44 && r.width >= 24) continue
      // The BOX being small is not the defect — the reachable AREA being small
      // is. `.tap-44` grows the hit area with a pseudo-element and leaves the
      // ink alone, which is the right fix for a close X or a small checkbox, so
      // a probe that trusted getBoundingClientRect would report a control it
      // had just fixed. Hit-test instead: does a press 22px above and below the
      // centre still land on this control?
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const hits = (x: number, y: number) => {
        const t = document.elementFromPoint(x, y)
        return Boolean(t && (t === el || el.contains(t) || t.contains(el)))
      }
      const reach = hits(cx, cy - 20) && hits(cx, cy + 20)
      if (!reach) {
        const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 28)
        bad.push(`"${label}" ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }
    return Array.from(new Set(bad)).slice(0, 12)
  })
}

test.describe.configure({ mode: 'serial' })

test.skip(!process.env.LAYOUT_AUDIT, 'set LAYOUT_AUDIT=1 to run the layout audit')

test('walk every surface on a phone and record what it measures', async ({ page }, testInfo) => {
  test.setTimeout(600_000)
  fs.mkdirSync(OUT, { recursive: true })
  const vp = page.viewportSize()!
  const results: PhoneMeasure[] = []

  await mockAudit(page)

  for (const route of AUDIT_ROUTES) {
    await page.goto(`/${route.hash}`)
    await page.waitForTimeout(2500)

    const crashed = await page.evaluate(() => {
      const t = document.body.textContent || ''
      return /failed to render|Minified React error|Something went wrong/i.test(t) ? t.slice(0, 160) : null
    })
    const windowScroll = await page.evaluate(() =>
      Math.max(document.documentElement.scrollHeight - innerHeight, document.body.scrollHeight - innerHeight, 0))

    const sel = '.mobile-zoom-root'
    const hasShell = await page.evaluate(s => Boolean(document.querySelector(s)), sel)
    const frame = hasShell ? sel : 'main'
    const hole = await largestHole(page, frame)

    const m: PhoneMeasure = {
      route: route.id,
      name: route.name,
      width: vp.width,
      height: vp.height,
      windowScroll,
      clipped: await phoneClipped(page),
      underNav: await underBottomNav(page),
      squeezed: await squeezedText(page, frame, 70),
      smallTargets: await smallTapTargets(page),
      holeFraction: Math.round(hole.fraction * 100) / 100,
      rawErrors: await rawErrorStrings(page, frame),
      crashed,
    }
    results.push(m)
    await page.screenshot({ path: path.join(OUT, `phone${vp.width}-${route.id}.png`) })
    console.log(
      `${route.name.padEnd(30)} scroll=${m.windowScroll} CLIPPED=${m.clipped.length} underNav=${m.underNav.length} ` +
      `squeezed=${m.squeezed.length} smallTap=${m.smallTargets.length} hole=${m.holeFraction}${m.crashed ? ' CRASHED' : ''}`,
    )
  }

  fs.writeFileSync(
    path.join(OUT, `report-phone-${vp.width}.json`),
    JSON.stringify({ viewport: vp, takenAt: new Date().toISOString(), results }, null, 2),
  )
  testInfo.attach('report', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
})
