import { test, expect, type Route } from '@playwright/test'
import { mockAudit } from './fixtures/audit'
import { BOARD } from './fixtures/board'

/**
 * The work board on the desk, built to Growth's standard (Krish, 2026-10-05):
 * the numbers at a glance, ONE item waiting on him as the card, and the queue
 * beside it rather than under it once the box is wide. The width is the box's
 * own (useContainerWidth), so these read the project's viewport and never set
 * their own.
 */

async function openBoard(page: import('@playwright/test').Page) {
  await mockAudit(page)
  await page.route('**/api/workbench', (route: Route) => route.fulfill({ json: BOARD }))
  await page.goto('/#/board')
  await expect(page.getByTestId('board-next')).toBeVisible({ timeout: 20_000 })
}

test('one card, one Send, and the queue beside it, not under it', async ({ page }) => {
  await openBoard(page)
  await expect(page.getByTestId('work-board')).toHaveAttribute('data-shape', 'wide')
  await expect(page.getByRole('button', { name: 'Send reply' })).toHaveCount(1)

  const card = (await page.getByTestId('board-on-you').boundingBox())!
  const queue = (await page.getByTestId('board-in-progress').boundingBox())!
  expect(queue.x, 'the queue sits beside the card').toBeGreaterThan(card.x + card.width - 1)
  expect(queue.y, 'the queue starts level with the card, not below it').toBeLessThan(card.y + card.height / 2)
})

test('the window never scrolls, and nothing on the board is laid out past its edges', async ({ page }) => {
  await openBoard(page)
  const out = await page.evaluate(() => {
    const bad: string[] = []
    const ws = document.documentElement.scrollHeight - innerHeight
    if (ws > 1) bad.push(`the window scrolls ${ws}px`)
    const board = document.querySelector('[data-testid="work-board"]') as HTMLElement
    const edge = board.getBoundingClientRect()
    for (const el of Array.from(board.querySelectorAll<HTMLElement>('button, a[href], textarea, h1, h2, h3, p'))) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (r.left < edge.left - 1 || r.right > edge.right + 1) bad.push(`${(el.textContent || el.tagName).trim().slice(0, 30)} past the board`)
    }
    return bad
  })
  expect(out).toEqual([])
})
