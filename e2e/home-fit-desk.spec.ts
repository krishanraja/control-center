import { test, expect, type Page } from '@playwright/test'
import { mockDailyMove, mockWorstMorning, homeScrolls, foldLevel, landsOn, MOVES } from './fixtures/dailyMove'

/**
 * Home on the desk never scrolls and never clips (Krish, 2026-10-03: "no
 * scroll guaranteed everywhere"). At 1440x900 and 1920x1080, which the desk
 * projects pick this file up by its suffix to run at, and at the two laptop
 * sizes that ran out of room first, 1366x768 and 1280x720, in contexts of
 * their own. The reasons open inline on the desk, so they are the state that
 * pushes hardest: 86px past a 1280x720 frame before Home learned to fold.
 */

test.use({ timezoneId: 'UTC' })
const WEDNESDAY = new Date('2026-09-30T10:00:00Z')

async function openHome(page: Page, worst = false) {
  await page.clock.setFixedTime(WEDNESDAY)
  const writes = worst ? await mockWorstMorning(page) : await mockDailyMove(page)
  await page.goto('/#/home')
  await expect(page.getByTestId('daily-move-slot')).toBeVisible()
  await page.waitForTimeout(600)
  return writes
}

async function whole(page: Page, state: string) {
  expect(await homeScrolls(page), `${state}: Home scrolls or is cut off`).toEqual([])
}

test('a normal morning is one screen, with the move open and in reach', async ({ page }) => {
  await openHome(page)
  await whole(page, 'a normal morning')
  await expect(page.getByTestId('daily-move-text')).toHaveText(MOVES[0].text)
  expect(await landsOn(page.getByTestId('daily-move-take'))).toBe(true)
})

test('the longest morning stays whole with the reasons open, and with each fold opened by hand', async ({ page }) => {
  await openHome(page, true)
  await whole(page, 'the longest morning')
  await page.getByTestId('daily-move-not-this').click()
  await expect(page.getByRole('group', { name: 'Why not this one?' })).toBeVisible()
  await whole(page, 'reasons open')
  const withReasons = await foldLevel(page)
  await page.getByRole('button', { name: 'Keep it' }).click()
  // Closing the reasons gives the room back and the stage unfolds. Measure the
  // settled stage, not the frame between: a fold read mid-refit is a toggle
  // that is about to leave the page. Two still frames are not enough to know
  // that: the ResizeObserver that starts the refit can land up to ten frames
  // after the click (measured 2026-10-08), so wait for the unfold itself. A
  // screen tall enough to fold nothing has nothing to wait for.
  if (withReasons > 0) await expect.poll(() => foldLevel(page)).toBeLessThan(withReasons)
  await whole(page, 'reasons closed')
  for (const id of ['due-tests-fold', 'ladder-week-fold', 'ladder-os-fold']) {
    const toggle = page.getByTestId(id)
    if (await toggle.count() === 0 || await toggle.getAttribute('aria-expanded') === 'true') continue
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.waitForTimeout(250)
    await whole(page, `with ${id} opened by hand`)
  }
})

test('answering the move gives the room back', async ({ page }) => {
  await openHome(page, true)
  const before = await foldLevel(page)
  await page.getByTestId('daily-move-later').click()
  await expect(page.getByTestId('daily-move-slot')).toHaveCount(0)
  await page.waitForTimeout(300)
  await whole(page, 'after Later')
  expect(await foldLevel(page)).toBeLessThanOrEqual(before)
})

test('a morning with no move is one screen too', async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY)
  await mockWorstMorning(page)
  await page.route(url => url.pathname === '/api/strategist', r => r.fulfill({ json: { ok: true, read: null } }))
  await page.goto('/#/home')
  await expect(page.getByRole('region', { name: 'Today' })).toBeVisible()
  await page.waitForTimeout(800)
  await whole(page, 'no move')
})

for (const [w, h] of [[1366, 768], [1280, 720]] as const) {
  test(`${w}x${h} holds through the longest morning with the reasons open`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desk-1440', 'a size of its own; one run is enough')
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    await openHome(page, true)
    await whole(page, `${w}x${h}, the longest morning`)
    await page.getByTestId('daily-move-not-this').click()
    await expect(page.getByRole('group', { name: 'Why not this one?' })).toBeVisible()
    await whole(page, `${w}x${h}, reasons open`)
    expect(await landsOn(page.getByRole('button', { name: 'Wrong timing' }))).toBe(true)
    await page.getByRole('button', { name: 'Keep it' }).click()
    for (const id of ['due-tests-fold', 'ladder-week-fold', 'ladder-os-fold']) {
      const toggle = page.getByTestId(id)
      if (await toggle.count() === 0 || await toggle.getAttribute('aria-expanded') === 'true') continue
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await whole(page, `${w}x${h}, with ${id} opened by hand`)
    }
    await ctx.close()
  })
}
