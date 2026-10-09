import { test, expect } from '@playwright/test'
import { mockDailyMove, watchSlotOneEmpty, pastEdges, landsOn, MOVES, CHALLENGE } from './fixtures/dailyMove'
import { DAILY_MOVE, isDailyMoveRead } from './fixtures/audit'

/**
 * Today's move on the desk (ADR-028), at 1440x900 and 1920x1080.
 *
 * When the first slot of Today is empty, the strategist's morning read sits in
 * it as a proposal. Three answers, each one tap: Take it (the move becomes his
 * slot 1), Not this (he says why, and the next move takes its place), Later
 * (nothing more today). Every answer is a verdict in the suggestion bank, and
 * the slot write happens only on Take.
 *
 * The desk shows what the move survived in full; the phone spec covers it
 * behind one tap. The no-scroll gates measure Home with this proposal in place,
 * through the same fixture. Every person here is synthetic. The clock is a
 * fixed Wednesday in UTC so Home's weekday content is the fuller one.
 */

test.use({ timezoneId: 'UTC' })
const WEDNESDAY = new Date('2026-09-30T10:00:00Z')
const TODAY = '2026-09-30'

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(WEDNESDAY)
})

test('the proposal sits in the first slot: who, why, and what it survived, inside its column', async ({ page }) => {
  const writes = await mockDailyMove(page)
  await page.goto('/#/home')

  const slot = page.getByTestId('daily-move-slot')
  await expect(slot).toBeVisible()
  await expect(slot).toContainText('Suggested for today')
  await expect(page.getByTestId('daily-move-text')).toHaveText(MOVES[0].text)
  await expect(page.getByTestId('daily-move-person')).toHaveText('Riley Stone, Chief operating officer at Fixture Media Holdings')
  await expect(slot).toContainText(MOVES[0].why)

  // What it survived is evidence, so it is shown when asked, on the desk too
  // (Growth's rule, 2026-10-05): never inline, and whole in the "?".
  await expect(page.getByTestId('daily-move-survived')).toHaveCount(0)
  await expect(slot).not.toContainText('argued against it')
  await page.getByRole('button', { name: 'Why this suggestion is here.' }).click()
  const why = page.getByRole('dialog').last()
  await expect(why).toContainText(`${CHALLENGE.by} argued against it: ${CHALLENGE.objection}`)
  await expect(why).toContainText(`Why it stayed first: ${CHALLENGE.why}`)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // The read drafted an ask to this move's person, so it offers that; there
  // is no draft, so no draft link.
  await expect(page.getByTestId('daily-move-open-ask')).toBeVisible()
  await expect(page.getByTestId('daily-move-open-draft')).toHaveCount(0)

  // Inside the Today column, words included, and every control takes a click.
  const col = (await page.getByRole('region', { name: 'Today' }).boundingBox())!
  expect(await pastEdges(slot, col.x, col.x + col.width), 'laid out past the Today column').toEqual([])
  for (const id of ['daily-move-take', 'daily-move-open-ask', 'daily-move-not-this', 'daily-move-later']) {
    expect(await landsOn(page.getByTestId(id)), `${id} is covered`).toBe(true)
  }

  // Reading it is not a model call.
  expect(writes.strategistPosts).toBe(0)
  expect(writes.slots).toEqual([])
})

test('Take it makes the move his slot 1, with no empty slot in between, and records accepted', async ({ page }) => {
  const writes = await mockDailyMove(page, { focusDelayMs: 400 })
  await page.goto('/#/home')
  await expect(page.getByTestId('daily-move-slot')).toBeVisible()

  const blinks = await watchSlotOneEmpty(page)
  await page.getByTestId('daily-move-take').click()

  // The move's bank id rides with the slot write (ADR-030), so the tick on
  // this slot can be recorded as did_it against the move.
  await expect.poll(() => writes.slots).toEqual([{ date: TODAY, slot: 1, text: MOVES[0].text, suggestion_id: MOVES[0].suggestion_id }])
  const mine = page.getByRole('button', { name: 'Edit target 1' })
  await expect(mine).toHaveText(MOVES[0].text)
  await expect(page.getByTestId('daily-move-slot')).toHaveCount(0)
  await expect.poll(() => writes.verdicts).toEqual([
    { suggestion_id: 'sug-move-1', verdict: 'accepted', reason_code: null, note: null, final: { text: MOVES[0].text } },
  ])

  // Settled: the row came back, and the slot stayed his the whole way.
  await page.waitForTimeout(900)
  await expect(mine).toHaveText(MOVES[0].text)
  expect(await blinks(), 'slot 1 went empty between the proposal and his slot').toBe(0)
})

test('Not this asks why, keeps what he typed, and offers the next move with its draft', async ({ page }) => {
  const writes = await mockDailyMove(page)
  await page.goto('/#/home')
  await expect(page.getByTestId('daily-move-text')).toHaveText(MOVES[0].text)

  await page.getByTestId('daily-move-not-this').click()
  const why = page.getByRole('group', { name: 'Why not this one?' })
  await expect(why).toBeVisible()
  await why.getByRole('button', { name: /add a note/i }).click()
  await why.getByRole('textbox').fill('Riley is travelling until Friday.')
  await why.getByRole('button', { name: 'Wrong timing' }).click()

  await expect.poll(() => writes.verdicts).toEqual([
    { suggestion_id: 'sug-move-1', verdict: 'rejected', reason_code: 'wrong_timing', note: 'Riley is travelling until Friday.', final: null },
  ])

  // The runner-up, with the draft it is about, opening in a new tab.
  await expect(page.getByTestId('daily-move-text')).toHaveText(MOVES[1].text)
  await expect(page.getByTestId('daily-move-person')).toContainText('Dana Clark')
  const draft = page.getByTestId('daily-move-open-draft')
  await expect(draft).toHaveAttribute('href', MOVES[1].draft_url!)
  await expect(draft).toHaveAttribute('target', '_blank')
  await expect(draft).toHaveAttribute('rel', /noopener/)
  // The challenge was about the first move, so it says nothing here.
  await expect(page.getByTestId('daily-move-survived')).toHaveCount(0)

  expect(writes.slots, 'setting a move aside must not write his Today list').toEqual([])
})

test('Later leaves the first slot empty and his for the rest of the day', async ({ page }) => {
  const writes = await mockDailyMove(page)
  await page.goto('/#/home')
  await expect(page.getByTestId('daily-move-slot')).toBeVisible()

  await page.getByTestId('daily-move-later').click()
  await expect(page.getByTestId('daily-move-slot')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Set target 1' })).toBeVisible()
  await expect.poll(() => writes.verdicts).toEqual([
    { suggestion_id: 'sug-move-1', verdict: 'deferred', reason_code: null, note: null, final: null },
  ])
  expect(writes.slots).toEqual([])
})

test('Open the ask opens today\'s read beside Home, with what the first move survived', async ({ page }) => {
  const writes = await mockDailyMove(page)
  await page.goto('/#/home')
  await page.getByTestId('daily-move-open-ask').click()

  const sheet = page.getByTestId('strategist-sheet')
  await expect(sheet).toHaveAttribute('data-mode', 'daily')
  await expect(page.getByTestId('strategist-daily-read')).toBeVisible()
  await expect(page.getByTestId('strategist-next-0')).toContainText(MOVES[0].text)
  await expect(page.getByTestId('strategist-next-1')).toContainText(MOVES[1].text)
  await expect(page.getByTestId('strategist-daily-survived')).toContainText(CHALLENGE.objection)

  const box = (await sheet.boundingBox())!
  expect(await pastEdges(sheet, box.x, box.x + box.width), 'laid out past the sheet').toEqual([])
  expect(writes.strategistPosts, 'opening the morning read paid for a new one').toBe(0)
})

test('a move already drafted with him leads with the draft, and the press is his', async ({ page }) => {
  await mockDailyMove(page)
  // The ledger says the first move was drafted in a walkthrough (ADR-030), and
  // the approach it is about has a Gmail draft. Registered after the fixture's
  // own route so it wins (Playwright checks handlers newest first).
  const drafted = structuredClone(DAILY_MOVE) as typeof DAILY_MOVE & { read: { outcomes?: Record<string, unknown>; read: { next_steps: Array<{ suggestion_id: string; draft_url?: string | null }> } } }
  drafted.read.outcomes = { [MOVES[0].suggestion_id]: { outcome: 'drafted', artifact: 'Riley, twenty minutes this month?' } }
  drafted.read.read.next_steps[0].draft_url = 'https://mail.google.com/mail/u/0/#drafts/riley'
  await page.route(isDailyMoveRead, r => r.fulfill({ json: drafted }))
  await page.goto('/#/home')

  const slot = page.getByTestId('daily-move-slot')
  await expect(slot).toBeVisible()
  await expect(slot).toContainText('Drafted with you. Your press.')
  const open = page.getByTestId('daily-move-open-draft')
  await expect(open).toContainText('Open the draft')
  await expect(open).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#drafts/riley')
  // Take it is still there, quieter, after the draft.
  const openBox = (await open.boundingBox())!
  const takeBox = (await page.getByTestId('daily-move-take').boundingBox())!
  expect(openBox.x, 'the draft leads').toBeLessThan(takeBox.x)
})
