import { test, expect, type Route } from '@playwright/test'
import { mockAudit } from './fixtures/audit'
import { BOARD } from './fixtures/board'

/**
 * The work board, on the phone.
 *
 * Krish, 2026-10-03: "I need the boards to not be Claude pages, but accessible
 * by Codex too and workable using Codex too". The board is served by the
 * content engine at /api/workbench; Claude and Codex sessions write it, Krish
 * reads it here and replies. These pin the phone experience: what waits on him
 * comes first, a reply sends his exact words, and nothing leaves the screen.
 */

test('the board shows what waits on Krish first, and a reply sends his exact words', async ({ page }) => {
  let posted: Record<string, unknown> | null = null
  await mockAudit(page)
  await page.route('**/api/workbench', async (route: Route) => {
    if (route.request().method() === 'POST') {
      posted = route.request().postDataJSON() as Record<string, unknown>
      return route.fulfill({ json: { ok: true, reply: { id: '22222222-2222-4222-8222-222222222222', item_id: 'you-p1-brief', text: posted.text, by: 'Krish', at: '2026-10-03T19:40:00.000Z', seen_at: null, seen_by: null } } })
    }
    return route.fulfill({ json: BOARD })
  })
  await page.goto('/#/board')
  const board = page.getByTestId('work-board')
  await expect(board.getByText(BOARD.state.headline)).toBeVisible({ timeout: 20_000 })

  // Waiting on you comes before In progress and Done.
  const onYou = page.getByTestId('board-on-you')
  await expect(onYou.getByText('Say yes to turning article 1 into a video and slides')).toBeVisible()
  const top = await onYou.boundingBox()
  const doing = await page.getByTestId('board-in-progress').boundingBox()
  expect(top!.y).toBeLessThan(doing!.y)

  // An earlier reply shows with whether a session has read it.
  await expect(page.getByTestId('board-item-you-p3-approve').getByText('Reading it tonight')).toBeVisible()
  await expect(page.getByTestId('board-item-you-p3-approve').getByText('read by Codex')).toBeVisible()

  // Replying sends exactly what he typed, to that item.
  const card = page.getByTestId('board-item-you-p1-brief')
  await card.getByRole('textbox').fill('yes, make the video')
  await card.getByRole('button', { name: 'Send reply' }).click()
  await expect.poll(() => posted).not.toBeNull()
  expect(posted).toEqual({ action: 'reply', item_id: 'you-p1-brief', text: 'yes, make the video' })
  await expect(card.getByText('yes, make the video')).toBeVisible()
  await expect(card.getByText('not read yet')).toBeVisible()
})

test('nothing on the board leaves the phone screen', async ({ page }) => {
  await mockAudit(page)
  await page.route('**/api/workbench', (route: Route) => route.fulfill({ json: BOARD }))
  await page.goto('/#/board')
  await expect(page.getByTestId('board-on-you')).toBeVisible({ timeout: 20_000 })
  const off = await page.evaluate(() => {
    const bad: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], textarea, summary'))) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (r.left < -1 || r.right > innerWidth + 1) bad.push(`${(el.textContent || el.tagName).trim().slice(0, 30)} at ${Math.round(r.left)}..${Math.round(r.right)}`)
    }
    return bad
  })
  expect(off).toEqual([])
})

test('one item at a time: the card answers, the verdict lands in place, and Next is a press', async ({ page }) => {
  // Growth's standard (Krish, 2026-10-05). The board used to open a reply box
  // under every item waiting on him at once: two primary buttons on one
  // screen, and the second item's box below the fold.
  await mockAudit(page)
  await page.route('**/api/workbench', async (route: Route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      return route.fulfill({ json: { ok: true, reply: { id: '33333333-3333-4333-8333-333333333333', item_id: body.item_id, text: body.text, by: 'Krish', at: '2026-10-03T19:40:00.000Z', seen_at: null, seen_by: null } } })
    }
    return route.fulfill({ json: BOARD })
  })
  await page.goto('/#/board')

  // The numbers, at a glance.
  const numbers = page.getByTestId('board-numbers')
  await expect(numbers).toContainText(/Waiting on you\s*2/, { timeout: 20_000 })
  await expect(numbers).toContainText(/In progress\s*1/)

  // One card, one reply box, one Send.
  const next = page.getByTestId('board-next')
  await expect(next).toContainText('Say yes to turning article 1 into a video and slides')
  await expect(next).toContainText('1 of 2')
  await expect(page.getByRole('button', { name: 'Send reply' })).toHaveCount(1)
  await expect(page.getByRole('textbox')).toHaveCount(1)

  // The second item is a row: his last word on it, and a press to answer it.
  const row = page.getByTestId('board-item-you-p3-approve')
  await expect(row).toContainText('Reading it tonight')
  await expect(row.getByRole('button', { name: /Answer this one/ })).toBeVisible()

  // The verdict lands where he pressed, and nothing advances on its own.
  await next.getByRole('textbox').fill('yes, make the video')
  await next.getByRole('button', { name: 'Send reply' }).tap()
  await expect(page.getByTestId('board-verdict')).toContainText('Sent.')
  await page.waitForTimeout(400)
  await expect(next).toContainText('Say yes to turning article 1 into a video and slides')

  // Next is a press, and it brings up the other item.
  await page.getByTestId('board-next-item').tap()
  await expect(page.getByTestId('board-next')).toContainText('Read article 3 and say yes or what to change')
  await expect(page.getByTestId('board-next')).toContainText('2 of 2')

  // What is done is one tap away, not on the screen.
  await expect(page.getByText('Buttons no longer fall off the phone screen')).toHaveCount(0)
  await page.getByTestId('board-done').getByRole('button', { name: /Done recently/ }).tap()
  await expect(page.getByText('Buttons no longer fall off the phone screen')).toBeVisible()
})

test('with nothing waiting, the board says so once, with the number that matters next', async ({ page }) => {
  await mockAudit(page)
  const quiet = { ...BOARD, items: BOARD.items.filter(i => i.lane !== 'on_you' && i.lane !== 'done'), replies: [] }
  await page.route('**/api/workbench', (route: Route) => route.fulfill({ json: quiet }))
  await page.goto('/#/board')
  await expect(page.getByText('Nothing is waiting on you.')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('1 thing is in progress.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send reply' })).toHaveCount(0)
  // The empty lane is named once, not drawn as a card.
  await expect(page.getByText('Nothing in the done list.')).toBeVisible()
  await expect(page.getByTestId('board-done').locator('section')).toHaveCount(0)
})
