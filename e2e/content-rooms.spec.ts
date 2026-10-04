import { test, expect, type Page, type Route } from '@playwright/test'
import { mockContentMorning } from './fixtures/content'
import { contentTables, IDEAS } from './fixtures/populated'

/**
 * The Content tab: today's calls.
 *
 * Since 2026-10-04 the tab is not a set of rooms. It lists the decisions the
 * engine cannot make without Krish, numbered, one in focus, each with one
 * primary action and "Not now", and the verdict lands where the call was.
 * The file keeps its old name because CI runs it by name.
 *
 * Every fixture is a realistic morning (fixtures/populated.ts): a finished
 * piece with no date, a draft whose facts passed, a draft never checked, a
 * series with nothing picked and five ready pieces, a Studio video and three
 * weekly rulings. None of it is day-dependent: the series days are computed
 * from the real date, so no assertion here names a weekday.
 */

const MTG = IDEAS.find(i => i.id === 'idea-mtg-review')!

async function rowTitles(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="content-call-row-"]').allInnerTexts()
}

/** Record the engine writes, answering each the way the engine does. */
async function recordWrites(page: Page, opts: { approve?: { status: number; json: Record<string, unknown> } } = {}) {
  const writes: Array<{ method: string; url: string; body: any }> = []
  await page.route('**/api/content-ideas*', (r: Route) => {
    const req = r.request()
    if (req.method() === 'GET') {
      return r.fulfill({ json: { ok: true, piece: { id: MTG.id, state: 'review', lane_slot: MTG.lane_slot, idea: MTG.idea, thesis: MTG.thesis, body: MTG.body, updated_at: MTG.updated_at } } })
    }
    const body = req.postDataJSON()
    writes.push({ method: req.method(), url: req.url(), body })
    if (body?.state === 'approved' && opts.approve) return r.fulfill({ status: opts.approve.status, json: opts.approve.json })
    return r.fulfill({ json: { ok: true } })
  })
  await page.route('**/api/content/pick', (r: Route) => {
    const body = r.request().postDataJSON()
    writes.push({ method: 'POST', url: r.request().url(), body })
    return r.fulfill({ json: { ok: true, previous: { state: 'researching', lane_slot: 'follow_the_money', lane: null } } })
  })
  return writes
}

test.describe('today\'s calls on the desk', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('numbers the calls, holds the first in focus, and asks how sure on an approve call', async ({ page }) => {
    await mockContentMorning(page)
    await page.goto('/#/content')

    await expect(page.getByTestId('content-call-row-1')).toHaveAttribute('aria-current', 'true')
    const reader = page.getByTestId('content-reader')
    await expect(reader.getByRole('heading', { name: 'Same agent, opposite answers' })).toBeVisible()
    await expect(reader.getByText('How sure are you that it comes true?')).toBeVisible()
    await expect(reader.getByTestId('how-sure').getByRole('button', { name: '70%' })).toHaveAttribute('aria-pressed', 'true')
    await expect(reader.getByTestId('call-primary')).toHaveText('Approve at 70%')
    await expect(reader.getByTestId('call-later')).toHaveText('Not now')
    // The engine strip carries real counts, and the payoff line counts the calls.
    await expect(page.getByTestId('content-engine-flow')).toContainText('Judged ready')
    await expect(page.getByText(/calls today\./)).toBeVisible()
  })

  test('approving with a new number saves the number, then approves, and the verdict stays where the call was', async ({ page }) => {
    await mockContentMorning(page)
    const writes = await recordWrites(page)
    await page.goto('/#/content')
    await expect(page.getByTestId('content-call-row-1')).toBeVisible()
    const before = await rowTitles(page)

    const reader = page.getByTestId('content-reader')
    await reader.getByTestId('how-sure').getByRole('button', { name: '80%' }).click()
    await expect(reader.getByTestId('call-primary')).toHaveText('Approve at 80%')
    await reader.getByTestId('call-primary').click()

    await expect(reader.getByTestId('call-verdict')).toHaveText('Approved at 80% sure.')
    await expect(page.getByTestId('content-call-1')).toHaveAttribute('data-state', 'done')
    const patches = writes.filter(w => w.method === 'PATCH')
    expect(patches[0].body.id).toBe(MTG.id)
    expect(patches[0].body.body).toContain('How sure we are: 80%')
    expect(patches[1].body).toMatchObject({ id: MTG.id, state: 'approved', panel_run_id: 'run-mtg-1' })
    // Nothing moved: the same calls in the same order, the first one settled.
    await expect(page.getByTestId('content-call-row-1')).toContainText('Approved at 80% sure.')
    expect((await rowTitles(page)).length).toBe(before.length)
    await expect(page.getByTestId('content-call-row-1')).toHaveAttribute('aria-current', 'true')
    await expect(page.getByTestId('content-progress')).toContainText(`1 of ${before.length} settled`)
  })

  test('when the engine says no, its own sentence shows where the call was', async ({ page }) => {
    await mockContentMorning(page)
    await recordWrites(page, { approve: { status: 409, json: { ok: false, error: 'The fact check is out of date for these words' } } })
    await page.goto('/#/content')

    const reader = page.getByTestId('content-reader')
    await reader.getByTestId('call-primary').click()
    await expect(reader.getByTestId('call-verdict')).toHaveText('That did not go through.')
    await expect(reader).toContainText('The fact check is out of date for these words. Nothing was changed.')
    await reader.getByRole('button', { name: 'Back to the call' }).click()
    await expect(reader.getByTestId('call-primary')).toBeVisible()
  })

  test('Not now moves a call to tomorrow on this device, and Undo brings it back', async ({ page }) => {
    await mockContentMorning(page)
    await page.goto('/#/content')

    await page.getByTestId('content-call-row-2').click()
    const reader = page.getByTestId('content-reader')
    await reader.getByTestId('call-later').click()
    await expect(reader.getByTestId('call-verdict')).toHaveText('Moved to tomorrow.')
    const stored = await page.evaluate(() => localStorage.getItem('content.notNow.v1'))
    expect(stored).toContain('go_out:idea-uth-approved')

    // A reload the same day keeps it settled, in the same place.
    await page.reload()
    await expect(page.getByTestId('content-call-row-2')).toContainText('Moved to tomorrow.')
    await page.getByTestId('content-call-row-2').click()
    await page.getByTestId('content-reader').getByTestId('call-undo').click()
    await expect(page.getByTestId('content-reader').getByTestId('call-primary')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('content.notNow.v1'))).not.toContain('go_out:idea-uth-approved')
  })

  test('a pick lays the best three side by side, and writing one sends that piece, with Undo', async ({ page }) => {
    await mockContentMorning(page)
    const writes = await recordWrites(page)
    await page.goto('/#/content')

    await page.locator('[data-testid^="content-call-row-"]', { hasText: 'What should follow.the.money run on' }).click()
    const reader = page.getByTestId('content-reader')
    const cards = reader.locator('[data-testid^="pick-candidate-"]')
    await expect(cards).toHaveCount(3)
    const boxes = await Promise.all([0, 1, 2].map(k => cards.nth(k).boundingBox()))
    expect(new Set(boxes.map(b => Math.round(b!.y))).size, 'the three are read side by side').toBe(1)
    await expect(cards.nth(0)).toContainText('Who really pays for the free AI tier')
    await expect(cards.nth(0)).toContainText('4 of 8 judges gave it 8 or more')
    await expect(cards.nth(1)).toContainText('Clears out Monday')
    await expect(cards.nth(0)).toContainText('ft.com')

    await cards.nth(1).getByRole('radio').click()
    await expect(cards.nth(1)).toHaveAttribute('data-selected', 'true')
    await reader.getByTestId('call-primary').click()
    await expect(reader.getByTestId('call-verdict')).toContainText('Picked for follow.the.money on')
    expect(writes.find(w => w.body?.action === 'pick')?.body).toMatchObject({ action: 'pick', id: 'idea-ftm-ready-2', series: 'follow_the_money' })

    await reader.getByTestId('call-undo').click()
    await expect.poll(() => writes.some(w => w.body?.action === 'restore' && w.body?.id === 'idea-ftm-ready-2')).toBe(true)
  })

  test('the engine line names the failing jobs and opens them', async ({ page }) => {
    await mockContentMorning(page)
    await page.goto('/#/content')

    const line = page.getByTestId('content-engine-line')
    await expect(line).toContainText('engine jobs are failing.')
    await line.click()
    await expect(page.getByTestId('engine-attention')).toBeVisible()
  })

  test('browsing every piece is one quiet control, with the Library inside', async ({ page }) => {
    await mockContentMorning(page)
    await page.goto('/#/content')

    // No room pills: the only content-room-* left is the tab's one scroller.
    await expect(page.locator('[data-testid^="content-room-"]')).toHaveCount(1)
    await page.getByTestId('content-browse-open').click()
    await page.getByTestId('content-browse-follow_the_money').click()
    await expect(page.getByTestId('content-browse-panel-follow_the_money')).toContainText('Who really pays for the free AI tier')
    await page.getByTestId('content-browse-library').click()
    await expect(page.getByTestId('content-calendar')).toBeVisible()
  })
})

test.describe('today\'s calls on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('every call is a card with one primary action and Not now', async ({ page }) => {
    await mockContentMorning(page)
    await page.goto('/#/content')

    const calls = page.locator('[data-testid^="content-call-"][data-state]')
    await expect(calls.first()).toBeVisible()
    const n = await calls.count()
    expect(n).toBeGreaterThan(5)
    for (let k = 0; k < n; k += 1) {
      await expect(calls.nth(k).getByTestId('call-primary')).toHaveCount(1)
      await expect(calls.nth(k).getByTestId('call-later')).toHaveCount(1)
    }
    // A pick on a phone stacks its three, one under the other.
    const cards = page.locator('[data-testid^="pick-candidate-"]')
    const [a, b] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1)
  })

  test('nothing to decide reads as all clear, not as an empty page', async ({ page }) => {
    const quiet = { ...contentTables(), content_ideas: IDEAS.filter(i => i.id.startsWith('idea-found-') || i.id.startsWith('idea-weak-')), content_decisions: [] }
    await mockContentMorning(page, { reviews: [], tables: quiet })
    await page.goto('/#/content')

    await expect(page.getByTestId('content-all-clear')).toBeVisible()
    await expect(page.getByText('All clear.')).toBeVisible()
    await expect(page.getByTestId('content-engine-flow')).toBeVisible()
  })

  test('a failed read says so and offers to try again', async ({ page }) => {
    await mockContentMorning(page)
    await page.route('**/rest/v1/content_ideas*', (r: Route) => r.fulfill({ status: 500, json: { code: '57014', message: 'canceling statement due to statement timeout' } }))
    await page.goto('/#/content')

    await expect(page.getByTestId('content-error')).toBeVisible()
    await expect(page.getByText("Today's calls did not load.")).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByText('All clear.')).toHaveCount(0)
  })

  test('while loading, the shape of the list arrives before the data', async ({ page }) => {
    await mockContentMorning(page)
    let release: () => void = () => {}
    const held = new Promise<void>(resolve => { release = resolve })
    await page.route('**/rest/v1/content_ideas*', async (r: Route) => {
      await held
      return r.fulfill({ json: IDEAS })
    })
    await page.goto('/#/content')

    await expect(page.getByTestId('content-loading')).toBeVisible()
    await expect(page.getByText('All clear.')).toHaveCount(0)
    release()
    await expect(page.getByTestId('content-calls')).toBeVisible()
  })
})
