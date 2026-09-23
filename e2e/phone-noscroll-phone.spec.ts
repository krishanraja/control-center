import { test, expect, type Page } from '@playwright/test'
import { mockAudit, AUDIT_ROUTES } from './fixtures/audit'

/**
 * Every phone surface is one screen, and everything on it is reachable.
 *
 * The desk gate's twin. Same three invariants, different shell: mobile renders
 * its own tree inside a `zoom: 1.2` root with a fixed BottomNav and a floating
 * create button, so nothing the desk pass proved carries over — and the phone
 * has a fourth way to lose content that a desk does not. A scroller that fails
 * to reserve the nav's height ends its travel with its last rows permanently
 * behind an opaque bar. They are drawn. They are just unreachable, and a
 * screenshot shows a tidy screen.
 *
 * Both failures were live when this was written, at 360x640:
 *  - Home's canon stack clipped rather than scrolled, so "Pick your 3 for
 *    today" — the primary action on the page — sat 63px below the screen with
 *    nothing to say it was there. The existing home-noscroll spec covers
 *    360x640 and passed, because its fixture's goal titles are short enough to
 *    fit; Krish's are not.
 *  - Visibility's triage card was left 55px of a 640px screen by its own
 *    chrome, with the guest's name, their pitch and every research link
 *    clipped out of the card.
 *
 * 360x640 is the one that bites. A spec list that stops at 390x844 is a spec
 * list that has never seen a short Android with browser chrome.
 */

/** Content past the bottom of the shell with nothing able to scroll it. */
async function clippedBelowShell(page: Page) {
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
        if (r.top > fb + 2) bad.push(`"${own.slice(0, 40)}" ${Math.round(r.top - fb)}px past the shell`)
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(root)
    return Array.from(new Set(bad)).slice(0, 6)
  })
}

/** Content the bottom nav sits on top of once every scroller is at its end. */
async function strandedUnderNav(page: Page) {
  return page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll<HTMLElement>('nav'))
      .find(n => getComputedStyle(n).position === 'fixed')
    if (!nav) return [] as string[]
    const navTop = nav.getBoundingClientRect().top
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const cs = getComputedStyle(el)
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) {
        el.scrollTop = el.scrollHeight
      }
    }
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
        if (r.top < navTop + 4 && r.bottom > navTop + 8 && r.top > 0) {
          bad.push(`"${own.slice(0, 40)}" ${Math.round(r.bottom - navTop)}px behind the nav`)
        }
      }
      for (const c of Array.from(he.children)) walk(c)
    }
    walk(document.body)
    return Array.from(new Set(bad)).slice(0, 6)
  })
}

test.describe.configure({ mode: 'serial' })

for (const route of AUDIT_ROUTES) {
  test(`${route.name} is one phone screen, whole`, async ({ page }) => {
    await mockAudit(page)
    await page.goto(`/${route.hash}`)
    await page.waitForTimeout(2200)

    const crashed = await page.evaluate(() => {
      const t = document.body.textContent || ''
      return /failed to render|Minified React error|Something went wrong/i.test(t) ? t.slice(0, 160) : null
    })
    expect(crashed, `${route.name} is showing an error boundary: ${crashed}`).toBeNull()

    const windowScroll = await page.evaluate(() => Math.max(
      document.documentElement.scrollHeight - innerHeight,
      document.body.scrollHeight - innerHeight, 0))
    expect(windowScroll, `${route.name} scrolls the window by ${windowScroll}px`).toBeLessThanOrEqual(2)

    const cut = await clippedBelowShell(page)
    expect(cut, `${route.name} has content cut off below the shell:\n${cut.join('\n')}`).toEqual([])

    const stranded = await strandedUnderNav(page)
    expect(stranded, `${route.name} leaves content stranded under the bottom nav:\n${stranded.join('\n')}`).toEqual([])
  })
}
