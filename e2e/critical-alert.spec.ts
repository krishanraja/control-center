import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The critical alarm is a mark in the top bar and a drawer behind it.
 *
 * It used to be a full-width banner at the top of Home. Its own docstring said
 * "one line, always", but `.truncate` is globally neutralised to protect the
 * complete-copy rule, so the sentence wrapped: on a 360px phone the banner took
 * 180px of a 640px screen, the doorway band landed on Today, and the third slot
 * was clipped away with nothing said. Ruling (Krish, 2026-09-17): alerts go in
 * a side drawer opened from a small mark in the top bar, not in screen space.
 *
 * What this pins, because each part is the kind that rots quietly:
 *  • the mark appears ONLY when something is actually wrong,
 *  • the whole sentence survives the move (the drawer never truncates),
 *  • dismissing silences this alarm and removes the mark,
 *  • and Home still shows all three of Today's slots on a short phone, which
 *    is the thing the banner was costing.
 */

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())

async function mock(page: Page, { fleetSilent }: { fleetSilent: boolean }) {
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  // A fleet that HAS reported recently produces no alarm at all.
  if (!fleetSilent) {
    await page.route('**/api/fleet/**', (r: Route) =>
      r.fulfill({ json: { ok: true, lastRunAt: new Date().toISOString(), workflows: [] } }))
  }
  await page.route('**/api/pilot/checkin*', (r: Route) => r.fulfill({
    json: {
      ok: true,
      morning: { id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green', one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false },
      last_evening: null, evening_done_today: true, yesterday: null,
      timezone: 'Australia/Sydney', today,
    },
  }))
}

test('the mark opens a drawer carrying the whole sentence, and dismiss silences it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mock(page, { fleetSilent: true })
  await page.goto('/#/home')

  const mark = page.getByTestId('critical-alert-mark')
  await expect(mark).toBeVisible({ timeout: 15_000 })

  await mark.click()
  const drawer = page.getByTestId('critical-alert-drawer')
  await expect(drawer).toBeVisible()

  // The sentence is whole. A banner could only ever show part of it.
  await expect(drawer).toContainText('Fleet silent')
  const body = await drawer.innerText()
  expect(body).not.toContain('…')
  expect(body.length).toBeGreaterThan(40)

  await page.getByTestId('critical-alert-dismiss').click()
  await expect(mark).toHaveCount(0)
})

test('a short phone keeps all three of Today while an alarm is live', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await mock(page, { fleetSilent: true })
  await page.goto('/#/home')
  await expect(page.getByTestId('critical-alert-mark')).toBeVisible({ timeout: 15_000 })

  // Painted, not merely laid out: a slot clipped by an overflow-hidden
  // ancestor still reports a box, which is exactly how this shipped broken.
  const painted = await page.evaluate(() => {
    const nums = [...document.querySelectorAll('span')]
      .filter(s => ['1', '2', '3'].includes((s.textContent || '').trim()) && s.getBoundingClientRect().width > 4)
    return nums.filter(n => {
      const r = n.getBoundingClientRect()
      let el: HTMLElement | null = n.parentElement
      while (el) {
        const cs = getComputedStyle(el)
        if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
          const b = el.getBoundingClientRect()
          if (r.bottom > b.bottom + 1 || r.top < b.top - 1) return false
        }
        el = el.parentElement
      }
      return true
    }).map(n => (n.textContent || '').trim())
  })
  expect(painted).toEqual(['1', '2', '3'])
})
