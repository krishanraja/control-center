import { test, expect, type Route } from '@playwright/test'
import { mockAudit } from './fixtures/audit'

/**
 * The work board, on the phone.
 *
 * Krish, 2026-10-03: "I need the boards to not be Claude pages, but accessible
 * by Codex too and workable using Codex too". The board is served by the
 * content engine at /api/workbench; Claude and Codex sessions write it, Krish
 * reads it here and replies. These pin the phone experience: what waits on him
 * comes first, a reply sends his exact words, and nothing leaves the screen.
 */

const BOARD = {
  ok: true,
  state: {
    headline: 'Two things need you: yes to article 1\'s video, and article 3.',
    signals: [{ label: 'Home computer', state: 'ok', text: 'On, up to date, ready' }, { label: 'AI spend, last 14 days', state: '', text: '$85.60' }],
    updated_by: 'codex',
    updated_at: '2026-10-03T19:30:00.000Z',
  },
  items: [
    { id: 'you-p1-brief', lane: 'on_you', rank: 1, area: 'Article 1 · video', title: 'Say yes to turning article 1 into a video and slides', detail: 'Before that starts, you confirm five things.', link: 'https://controlcenter.krishraja.com/#/content?idea=6cb0d213-1aa6-44d3-8dc2-0b91d8dde4df', link_label: 'Open article 1', prompt: "'yes, make the video' or what to change", updated_by: 'claude_code', updated_at: '2026-10-03T19:30:00.000Z' },
    { id: 'you-p3-approve', lane: 'on_you', rank: 2, area: 'Article 3', title: 'Read article 3 and say yes or what to change', detail: 'Every fact in it has been checked.', link: null, link_label: null, prompt: 'Yes, or what to change', updated_by: 'claude_code', updated_at: '2026-10-03T19:00:00.000Z' },
    { id: 'doing-next-picks', lane: 'in_progress', rank: 2, area: 'Articles', title: 'Your next two articles', detail: 'They start once article 3 is approved.', link: null, link_label: null, prompt: null, updated_by: 'codex', updated_at: '2026-10-03T18:00:00.000Z' },
    { id: 'doing-composer-phone', lane: 'done', rank: 0, area: 'Control Center', title: 'Buttons no longer fall off the phone screen', detail: 'Now they all fit.', link: null, link_label: null, prompt: null, updated_by: 'claude_code', updated_at: '2026-10-02T12:45:00.000Z' },
  ],
  replies: [
    { id: '11111111-1111-4111-8111-111111111111', item_id: 'you-p3-approve', text: 'Reading it tonight', by: 'Krish', at: '2026-10-03T19:10:00.000Z', seen_at: '2026-10-03T19:20:00.000Z', seen_by: 'codex' },
  ],
  unseen_replies: 0,
}

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
