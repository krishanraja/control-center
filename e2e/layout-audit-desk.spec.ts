import { test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { largestHole, squeezedText, scrollContainers, rawErrorStrings } from './fixtures/layout'
import { mockAudit, AUDIT_ROUTES } from './fixtures/audit'

/**
 * The whole-app layout audit.
 *
 * Krish, 2026-09-23: "this repo has many instances of subpar UI design […]
 * find and objectively assess them all […] ensuring no scroll at all times but
 * 11/10 interaction design and information hierarchy."
 *
 * This is the instrument, not an assertion suite: it walks every desktop
 * surface with populated fixtures, screenshots it, and records the measures
 * that a person can point at in the screenshot afterwards. It writes
 * `audit/report.json` and `audit/<route>.png`, and it never fails — a red
 * suite hides the numbers, and the numbers are the deliverable. The specs that
 * do fail on these defects are `desk-noscroll.spec.ts`.
 *
 * Run it: `npx playwright test layout-audit --project=desk-1440`.
 */

const OUT = path.join(process.cwd(), 'audit')

interface Measure {
  route: string
  name: string
  width: number
  height: number
  /** Pixels the window itself can scroll. The contract says zero. */
  windowScroll: number
  /** Pixels the tab's own region overflows its box. */
  mainOverflow: number
  /** Scroll containers with something to scroll, inside the tab. */
  nestedScrollers: string[]
  /** Largest unpainted rectangle inside the painted area, 0-1. */
  holeFraction: number
  holeRect: { x: number; y: number; w: number; h: number } | null
  /** Text squeezed under 90px across 3+ lines. */
  squeezed: string[]
  /** Machine strings shown to the reader. */
  rawErrors: string[]
  /** Interactive elements whose boxes overlap each other. */
  overlaps: string[]
  /** Text nodes below the WCAG AA contrast floor. */
  lowContrast: string[]
  /** Font sizes used that are not on the nine-token role scale. */
  offScaleType: string[]
  /** Tallest single element as a fraction of viewport height. */
  tallestChromeFraction: number
  /** Content cut off below the frame with no scroller to reach it. */
  clipped: string[]
  crashed: string | null
}

/** Interactive boxes that sit on top of each other — the collision a reader hits. */
async function overlappingControls(page: Page, sel: string) {
  return page.evaluate((s) => {
    const frame = document.querySelector(s)
    if (!frame) return ['FRAME NOT FOUND']
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role="button"], input'))
      .filter(el => {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false
        if (el.matches('.sr-only, .sr-only *')) return false
        const r = el.getBoundingClientRect()
        return r.width > 8 && r.height > 8 && r.top < innerHeight && r.bottom > 0
      })
    const label = (el: HTMLElement) =>
      `${el.tagName}"${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28)}"`
    const bad: string[] = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        if (a.contains(b) || b.contains(a)) continue
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
        const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
        const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
        if (ox > 4 && oy > 4) {
          const area = ox * oy
          const smaller = Math.min(ra.width * ra.height, rb.width * rb.height)
          // Ignore slivers; a real collision covers a quarter of the smaller control.
          if (area / smaller > 0.25) bad.push(`${label(a)} ⨯ ${label(b)} (${Math.round(ox)}×${Math.round(oy)}px)`)
        }
      }
    }
    return Array.from(new Set(bad)).slice(0, 12)
  }, sel)
}

/**
 * Content that falls outside the frame with no way to reach it.
 *
 * This is the failure mode a no-scroll shell introduces if a surface is put
 * inside `overflow-hidden` without its own scroller: the rows are laid out,
 * they are simply cut off, and NO other probe sees it. `scrollContainers`
 * reports zero (nothing scrolls), `largestHole` reports a clean board, and the
 * screenshot looks tidy — because the missing rows are not in it.
 *
 * Returns the deepest visible text leaf that starts below the frame's bottom
 * edge, and how far past it sits.
 */
async function clippedBelow(page: Page, sel: string) {
  return page.evaluate((s) => {
    const frame = document.querySelector(s) as HTMLElement | null
    if (!frame) return [] as string[]
    const fb = frame.getBoundingClientRect().bottom
    const bad: string[] = []
    const walk = (el: Element) => {
      const he = el as HTMLElement
      const cs = getComputedStyle(he)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return
      // Inside something that scrolls, being below the fold is normal.
      //
      // The ancestor walk must start INSIDE the frame. Started at the frame
      // itself it ran off the top of the document, found the first scrollable
      // ancestor up there and returned on the very first node — so the probe
      // reported a clean surface after visiting exactly one element. It was
      // silently green over 225px of unreachable content on Systems.
      if (he !== frame) {
        let n: HTMLElement | null = he.parentElement
        while (n && n !== frame) {
          const pcs = getComputedStyle(n)
          if (pcs.overflowY === 'auto' || pcs.overflowY === 'scroll') return
          n = n.parentElement
        }
      }
      const own = Array.from(he.childNodes).filter(t => t.nodeType === Node.TEXT_NODE)
        .map(t => t.textContent || '').join(' ').trim()
      if (own) {
        const r = he.getBoundingClientRect()
        if (r.top > fb + 2) bad.push(`"${own.slice(0, 34)}" ${Math.round(r.top - fb)}px below the frame`)
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(frame)
    return Array.from(new Set(bad)).slice(0, 8)
  }, sel)
}

/** Composited contrast of every visible text leaf, against the WCAG AA floor. */
async function lowContrastText(page: Page, sel: string) {
  return page.evaluate((s) => {
    const frame = document.querySelector(s)
    if (!frame) return ['FRAME NOT FOUND']
    const parse = (c: string): [number, number, number, number] => {
      const m = c.match(/[\d.]+/g)
      if (!m) return [0, 0, 0, 0]
      return [Number(m[0]), Number(m[1]), Number(m[2]), m[3] === undefined ? 1 : Number(m[3])]
    }
    const over = (fg: [number, number, number, number], bg: [number, number, number]) =>
      [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])) as [number, number, number]
    const lum = (rgb: [number, number, number]) => {
      const [r, g, b] = rgb.map(v => {
        const c = v / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const bgOf = (el: HTMLElement): [number, number, number] => {
      let n: HTMLElement | null = el
      while (n) {
        const c = parse(getComputedStyle(n).backgroundColor)
        if (c[3] > 0.85) return [c[0], c[1], c[2]]
        n = n.parentElement
      }
      return [10, 16, 13]
    }
    const bad: string[] = []
    const walk = (el: Element) => {
      const he = el as HTMLElement
      const cs = getComputedStyle(he)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return
      const own = Array.from(he.childNodes).filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent || '').join(' ').trim()
      if (own) {
        const r = he.getBoundingClientRect()
        if (r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0) {
          const bg = bgOf(he)
          // Text painted with a gradient through `background-clip: text` has
          // `color: transparent`, so the composited colour IS the background
          // and the naive ratio is 1.00:1 — a false alarm on every such node.
          // Take the darkest stop of the gradient instead, which is the
          // honest worst case for the reader.
          const clip = (cs as unknown as { webkitBackgroundClip?: string }).webkitBackgroundClip || cs.backgroundClip
          let colour = cs.color
          if (clip === 'text' && parse(cs.color)[3] < 0.05) {
            const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || [])
            if (!stops.length) return
            const lumOf = (c: string) => {
              const v = parse(c)
              return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
            }
            // The stop furthest from the ground is the one that reads worst.
            const groundLum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]
            colour = stops.reduce((worst, c) =>
              Math.abs(lumOf(c) - groundLum) < Math.abs(lumOf(worst) - groundLum) ? c : worst)
          }
          const fg = over(parse(colour), bg)
          const l1 = lum(fg), l2 = lum(bg)
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
          const size = parseFloat(cs.fontSize)
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
          const floor = large ? 3 : 4.5
          if (ratio < floor) bad.push(`"${own.slice(0, 32)}" ${ratio.toFixed(2)}:1 @${size}px`)
        }
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(frame)
    return Array.from(new Set(bad)).slice(0, 15)
  }, sel)
}

/** Font sizes in use that are not one of the nine role tokens. */
async function offScaleType(page: Page, sel: string) {
  return page.evaluate((s) => {
    const SCALE = [11, 12, 13, 14, 16, 20, 28, 40, 56]
    const frame = document.querySelector(s)
    if (!frame) return ['FRAME NOT FOUND']
    const seen = new Map<number, string>()
    const walk = (el: Element) => {
      const he = el as HTMLElement
      const own = Array.from(he.childNodes).filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent || '').join(' ').trim()
      if (own) {
        const size = Math.round(parseFloat(getComputedStyle(he).fontSize) * 10) / 10
        if (!SCALE.some(t => Math.abs(t - size) < 0.6) && !seen.has(size)) {
          seen.set(size, `${size}px "${own.slice(0, 28)}"`)
        }
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(frame)
    return Array.from(seen.values()).slice(0, 10)
  }, sel)
}

/** The tallest single box, as a share of the viewport — a hero eating the screen. */
async function tallestChrome(page: Page, sel: string) {
  return page.evaluate((s) => {
    const frame = document.querySelector(s)
    if (!frame) return 0
    let worst = 0
    const walk = (el: Element) => {
      const he = el as HTMLElement
      if (he.matches('section, header, aside') && he.children.length <= 4) {
        const r = he.getBoundingClientRect()
        if (r.height > 0) worst = Math.max(worst, r.height / innerHeight)
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(frame)
    return Math.round(worst * 100) / 100
  }, sel)
}

test.describe.configure({ mode: 'serial' })

test('walk every desktop surface and record what it measures', async ({ page }, testInfo) => {
  test.setTimeout(600_000)
  fs.mkdirSync(OUT, { recursive: true })
  const vp = page.viewportSize()!
  const results: Measure[] = []

  await mockAudit(page)

  for (const route of AUDIT_ROUTES) {
    await page.goto(`/${route.hash}`)
    // Let lazy chunks, skeletons and the halo animation settle.
    await page.waitForTimeout(2500)

    const sel = 'main'
    const crashed = await page.evaluate((s) => {
      const t = document.querySelector(s)?.textContent || ''
      return /failed to render|Minified React error|Something went wrong/i.test(t) ? t.slice(0, 160) : null
    }, sel)

    const windowScroll = await page.evaluate(() =>
      Math.max(document.documentElement.scrollHeight - innerHeight, document.body.scrollHeight - innerHeight, 0))
    const mainOverflow = await page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement | null
      return el ? Math.max(el.scrollHeight - el.clientHeight, 0) : -1
    }, sel)

    const hole = await largestHole(page, sel)
    const m: Measure = {
      route: route.id,
      name: route.name,
      width: vp.width,
      height: vp.height,
      windowScroll,
      mainOverflow,
      nestedScrollers: await scrollContainers(page, sel),
      holeFraction: Math.round(hole.fraction * 100) / 100,
      holeRect: hole.rect,
      squeezed: await squeezedText(page, sel),
      rawErrors: await rawErrorStrings(page, sel),
      overlaps: await overlappingControls(page, sel),
      lowContrast: await lowContrastText(page, sel),
      offScaleType: await offScaleType(page, sel),
      tallestChromeFraction: await tallestChrome(page, sel),
      clipped: await clippedBelow(page, sel),
      crashed,
    }
    results.push(m)
    await page.screenshot({ path: path.join(OUT, `${vp.width}-${route.id}.png`) })
    console.log(
      `${route.name.padEnd(30)} scroll=${m.windowScroll}/${m.mainOverflow} hole=${m.holeFraction} ` +
      `scrollers=${m.nestedScrollers.length} CLIPPED=${m.clipped.length} overlap=${m.overlaps.length} lowContrast=${m.lowContrast.length} ` +
      `offScale=${m.offScaleType.length} squeezed=${m.squeezed.length}${m.crashed ? ' CRASHED' : ''}`,
    )
  }

  fs.writeFileSync(
    path.join(OUT, `report-${vp.width}.json`),
    JSON.stringify({ viewport: vp, takenAt: new Date().toISOString(), results }, null, 2),
  )
  testInfo.attach('report', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
})
