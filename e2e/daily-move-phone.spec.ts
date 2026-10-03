import { test, expect } from '@playwright/test'
import { mockDailyMove, watchSlotOneEmpty, pastEdges, landsOn, MOVES, CHALLENGE } from './fixtures/dailyMove'

/**
 * Today's move on the phone (ADR-028), at 390x844 and 360x640 (the phone
 * projects pick this file up by its suffix and set the size and touch).
 *
 * Home on a phone has no height to spare, so the proposal leads with the move
 * and puts what it survived one tap away. Measured, not assumed:
 *   - Nothing in the proposal, or in the read it opens, is laid out past the
 *     screen's edge, words included. A line that will not wrap is cut off on a
 *     phone, and no scroll measure sees it.
 *   - Every control lands a tap on itself: on screen and not under the bottom
 *     bar or another layer.
 *   - Take it fills slot 1 in place. It must not open the slot editor: the
 *     move is already written, and an editor would make him type to agree.
 *
 * Every person here is synthetic. The clock is a fixed Wednesday in UTC.
 */

test.use({ timezoneId: 'UTC' })
const WEDNESDAY = new Date('2026-09-30T10:00:00Z')
const TODAY = '2026-09-30'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY)
})

test('the proposal fits the phone, every control takes a tap, and what it survived is one tap away', async ({ page }) => {
  await mockDailyMove(page)
  const vw = page.viewportSize()!.width
  await page.goto('/#/home')

  const slot = page.getByTestId('daily-move-slot')
  await slot.scrollIntoViewIfNeeded()
  await expect(slot).toBeVisible()
  await expect(page.getByTestId('daily-move-text')).toHaveText(MOVES[0].text)
  await expect(page.getByTestId('daily-move-person')).toContainText('Riley Stone')

  // Behind one tap here, so the move comes first.
  await expect(page.getByTestId('daily-move-survived')).toHaveCount(0)
  await page.getByTestId('daily-move-show-survived').tap()
  await expect(page.getByTestId('daily-move-survived')).toContainText(CHALLENGE.objection)

  expect(await pastEdges(slot, 0, vw), `laid out past the ${vw}px edge`).toEqual([])
  for (const id of ['daily-move-take', 'daily-move-open-ask', 'daily-move-not-this', 'daily-move-later']) {
    const c = page.getByTestId(id)
    await c.scrollIntoViewIfNeeded()
    expect(await landsOn(c), `${id} does not take a tap`).toBe(true)
  }

  // The reasons open in place and stay on the screen.
  await page.getByTestId('daily-move-not-this').tap()
  const why = page.getByRole('group', { name: 'Why not this one?' })
  await why.scrollIntoViewIfNeeded()
  expect(await pastEdges(why, 0, vw), 'the reasons run past the edge').toEqual([])
  const timing = why.getByRole('button', { name: 'Wrong timing' })
  await timing.scrollIntoViewIfNeeded()
  expect(await landsOn(timing)).toBe(true)
})

test('Take it fills slot 1 in place, with no editor and no empty slot in between', async ({ page }) => {
  const writes = await mockDailyMove(page, { focusDelayMs: 400 })
  await page.goto('/#/home')
  const take = page.getByTestId('daily-move-take')
  await take.scrollIntoViewIfNeeded()

  const blinks = await watchSlotOneEmpty(page)
  await take.tap()

  await expect.poll(() => writes.slots).toEqual([{ date: TODAY, slot: 1, text: MOVES[0].text }])
  await expect(page.getByRole('button', { name: 'Edit target 1' })).toContainText(MOVES[0].text)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => writes.verdicts.map(v => v.verdict)).toEqual(['accepted'])

  await page.waitForTimeout(900)
  await expect(page.getByRole('button', { name: 'Edit target 1' })).toContainText(MOVES[0].text)
  expect(await blinks(), 'slot 1 went empty between the proposal and his slot').toBe(0)
})

test('Open the ask opens today\'s read as a sheet that fits the screen, and the page still answers after', async ({ page }) => {
  const writes = await mockDailyMove(page)
  const vw = page.viewportSize()!.width
  await page.goto('/#/home')
  const open = page.getByTestId('daily-move-open-ask')
  await open.scrollIntoViewIfNeeded()
  await open.tap()

  const sheet = page.getByTestId('strategist-sheet')
  await expect(sheet).toHaveAttribute('data-mode', 'daily')
  await expect(page.getByTestId('strategist-daily-read')).toBeVisible()
  await expect(page.getByTestId('strategist-daily-survived')).toContainText(CHALLENGE.objection)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  expect(await pastEdges(sheet, 0, vw), `the read runs past the ${vw}px edge`).toEqual([])
  expect(writes.strategistPosts).toBe(0)

  // Closed the way a thumb does, the proposal is still there and still answers.
  await page.touchscreen.tap(Math.round(vw / 2), 8)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const later = page.getByTestId('daily-move-later')
  await later.scrollIntoViewIfNeeded()
  await later.tap()
  await expect.poll(() => writes.verdicts.map(v => v.verdict)).toEqual(['deferred'])
  await expect(page.getByTestId('daily-move-slot')).toHaveCount(0)
})
