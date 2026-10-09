import { test, expect, type Page } from '@playwright/test'
import { mockDailyMove, mockWorstMorning, homeScrolls, foldLevel, landsOn, MOVES } from './fixtures/dailyMove'
import { GOAL_LADDER, goal } from './fixtures/audit'

/**
 * Home on a phone never scrolls (Krish, 2026-10-03: "no scroll guaranteed
 * everywhere"). At 390x844 and 360x640, which the phone projects pick this
 * file up by its suffix to run at, and at 375x667 in a context of its own,
 * through every state a morning can be in: the move open, the longest honest
 * morning, each fold opened by hand, the reasons sheet, the move answered, and
 * no move at all.
 *
 * homeScrolls() fails on the window scrolling, on any element that scrolls,
 * and on the stage being past its own box or reporting that it spent every
 * fold. Seen failing before trusted: with the folds switched off, every state
 * below fails at both phone sizes.
 */

test.use({ timezoneId: 'UTC' })
const WEDNESDAY = new Date('2026-09-30T10:00:00Z')

async function openHome(page: Page, worst = false) {
  await page.clock.setFixedTime(WEDNESDAY)
  const writes = worst ? await mockWorstMorning(page) : await mockDailyMove(page)
  await page.goto('/#/home')
  await expect(page.getByTestId('daily-move-slot')).toBeVisible()
  // The due test and the drafted-approach strip arrive after the canon.
  await page.waitForTimeout(600)
  return writes
}

async function whole(page: Page, state: string) {
  expect(await homeScrolls(page), `${state}: Home scrolls or is cut off`).toEqual([])
}

test('a normal morning is one screen, with the move open and its first control in reach', async ({ page }) => {
  await openHome(page)
  await whole(page, 'a normal morning')
  await expect(page.getByTestId('daily-move-slot')).toHaveAttribute('data-folded', 'false')
  await expect(page.getByTestId('daily-move-text')).toHaveText(MOVES[0].text)
  expect(await landsOn(page.getByTestId('daily-move-take'))).toBe(true)
})

test('the longest honest morning is one screen, the move is whole, and every fold opens and stays whole', async ({ page }) => {
  await openHome(page, true)
  await whole(page, 'the longest morning')

  // The move never gives way on its own: it folds only for something he opened.
  const slot = page.getByTestId('daily-move-slot')
  await expect(slot).toHaveAttribute('data-folded', 'false')
  const stage = (await page.getByTestId('home-stage').boundingBox())!
  const text = (await page.getByTestId('daily-move-text').boundingBox())!
  expect(text.y + text.height, 'the move runs past the stage').toBeLessThanOrEqual(stage.y + stage.height + 1)
  expect(await landsOn(page.getByTestId('daily-move-take'))).toBe(true)

  // What it survived is in its "?" whenever the screen has folded it away.
  if (await page.getByTestId('daily-move-survived').count() === 0) {
    await page.getByRole('button', { name: 'Why this suggestion is here.' }).tap()
    await expect(page.getByRole('dialog').last()).toContainText('argued against it')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }

  // A due test opens in the house sheet on a phone, and Home stays whole behind it.
  const tests = page.getByTestId('due-tests-fold')
  if (await tests.count()) {
    await tests.tap()
    await expect(page.getByRole('dialog', { name: 'Tests that are due' })).toBeVisible()
    await whole(page, 'with the due test open in its sheet')
    await page.touchscreen.tap(Math.round(page.viewportSize()!.width / 2), 8)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }

  // A folded rung opens in the house sheet on a phone, never in place: five
  // long objectives are taller than the whole stage. Home and the sheet both
  // stay whole.
  for (const [id, name] of [['ladder-week-fold', /This week.s objectives/], ['ladder-os-fold', /OS goals/]] as const) {
    const toggle = page.getByTestId(id)
    if (await toggle.count() === 0) continue
    await toggle.tap()
    await expect(page.getByRole('dialog', { name })).toBeVisible()
    await whole(page, `with ${id} open in its sheet`)
    await page.touchscreen.tap(Math.round(page.viewportSize()!.width / 2), 8)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }

  // Opening the move again puts it back in front, and the stage still fits.
  const show = page.getByTestId('daily-move-show')
  if (await show.count()) {
    await show.tap()
    await expect(slot).toHaveAttribute('data-folded', 'false')
    await page.waitForTimeout(250)
    await whole(page, 'with the move opened again by hand')
  }
})

test('editing a goal from a folded rung hands over to the editor, one sheet at a time', async ({ page }) => {
  await openHome(page, true)
  const toggle = page.getByTestId('ladder-week-fold')
  test.skip(await toggle.count() === 0, 'this week is not folded at this size')
  await toggle.tap()
  const drawer = page.getByRole('dialog', { name: /This week.s objectives/ })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: /Book two calls with operating chiefs/ }).tap()
  const editor = page.getByRole('dialog', { name: 'Weekly objective' })
  await expect(editor).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(editor.locator('textarea')).toHaveValue(/Book two calls with operating chiefs/)
})

test('Not this asks why in a sheet, and Home stays one screen behind it', async ({ page }) => {
  const writes = await openHome(page, true)
  await page.getByTestId('daily-move-not-this').tap()
  const why = page.getByRole('group', { name: 'Why not this one?' })
  await expect(why).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await whole(page, 'with the reasons sheet open')
  await why.getByRole('button', { name: 'Wrong timing' }).tap()
  await expect.poll(() => writes.verdicts.map(v => v.verdict)).toEqual(['rejected'])
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await whole(page, 'after setting the move aside')
})

test('answering the move gives the room back', async ({ page }) => {
  await openHome(page, true)
  const before = await foldLevel(page)
  await page.getByTestId('daily-move-later').tap()
  await expect(page.getByTestId('daily-move-slot')).toHaveCount(0)
  await page.waitForTimeout(300)
  await whole(page, 'after Later')
  expect(await foldLevel(page), 'the stage did not unfold once the move was answered').toBeLessThanOrEqual(before)
})

test('a midweek morning with no week set keeps the move whole, and the week ask one tap away', async ({ page }) => {
  // The honest state behind the 2026-10-05 red: Wednesday, nothing set for the
  // week, and the longest move. The full-width "Set this week's 3" used to
  // stay put and fold the move on its own at 360x640. Seen failing before the
  // fix: data-folded was "true" at fold level 9.
  await page.clock.setFixedTime(WEDNESDAY)
  await mockWorstMorning(page)
  await page.route('**/api/goals/ladder*', r => r.fulfill({ json: {
    ok: true,
    by_horizon: { os: [goal('os-1', 'Twenty-five paid advisory rooms by the end of the quarter, each with a named buyer', 'os')], weekly: [] },
    ventures: ['mindmake'], stale_count: 0, orphan_count: 0,
    week_of: GOAL_LADDER.week_of, current_week: GOAL_LADDER.current_week,
  } }))
  await page.goto('/#/home')
  await expect(page.getByTestId('daily-move-slot')).toBeVisible()
  await page.waitForTimeout(600)
  await whole(page, 'no week set')
  await expect(page.getByTestId('daily-move-slot')).toHaveAttribute('data-folded', 'false')
  expect(await landsOn(page.getByTestId('daily-move-take'))).toBe(true)
  // Exactly one place asks for the week, and it opens the ritual at the week.
  const ask = page.getByRole('button', { name: /Set this week/ })
  await expect(ask).toHaveCount(1)
  expect(await landsOn(ask)).toBe(true)
})

test('every number on the vitals band is on screen at a glance, none under the alarm', async ({ page }) => {
  // The band used to scroll sideways with its scrollbar hidden: at 360 and
  // 390 the Waiting count sat out of sight and Log slid under the alarm mark
  // (2026-10-05). Seen failing before the fix: Waiting did not take its own
  // tap and the band was wider inside than out.
  await openHome(page, true)
  const waiting = page.getByTestId('vitals-waiting')
  expect(await landsOn(waiting), 'Waiting is hidden or covered').toBe(true)
  const sideways = await waiting.evaluate(el => {
    const band = el.parentElement as HTMLElement
    return band.scrollWidth - band.clientWidth
  })
  expect(sideways, 'the vitals band scrolls sideways').toBeLessThanOrEqual(1)
  for (const name of [/^Sent /, /^Paid /]) {
    expect(await landsOn(page.getByRole('button', { name })), `${name} is hidden or covered`).toBe(true)
  }
  await whole(page, 'the vitals band')
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

test('375x667 holds through the same morning', async ({ browser }, info) => {
  test.skip(info.project.name !== 'phone-390', 'a size of its own; one run is enough')
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await openHome(page, true)
  await whole(page, '375x667, the longest morning')
  await page.getByTestId('daily-move-not-this').tap()
  await expect(page.getByRole('group', { name: 'Why not this one?' })).toBeVisible()
  await whole(page, '375x667, reasons open')
  await ctx.close()
})

// The ask budget (ADR-030): one primary ask outside the Today slots while the
// move is the head of the queue; the drafted strip is a queue entry now.
test('the longest morning has one ask: the move in its slot, and no second hero or strip', async ({ page }) => {
  await mockWorstMorning(page)
  await page.goto('/#/home')
  await expect(page.getByTestId('daily-move-slot')).toBeVisible()
  await expect(page.getByTestId('pilot-strip')).toHaveCount(0)
  await expect(page.getByTestId('home-queue-move')).toHaveCount(0)
  expect(await homeScrolls(page), 'Home scrolls or is cut off').toEqual([])
})
