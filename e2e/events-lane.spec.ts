import { test, expect, type Page, type Route } from '@playwright/test'
import { mockAudit, auditTables } from './fixtures/audit'

/**
 * The attend lane.
 *
 * Written against a complaint rather than against a component, because the
 * complaint is the specification:
 *
 *   "the events I should be attending are not very well researched, do not change
 *    based on my city and are stale - and I want to meet successful entrepreneurs
 *    and those running successful businesses, not AI developers or adtech people"
 *
 * Four assertions, one per clause. The one that matters most is the city one: on
 * 2026-09-24 the lane rendered `visibility_targets`, `location` was NULL on all 56
 * live rows, and there was no home city anywhere in the repo, so switching cities
 * could not possibly have changed anything. A test that only checked the lane
 * renders would have passed against that.
 *
 * Every card here is mocked, so this proves the SURFACE reads the city and honours
 * the ordering. That the model's judgement is any good is a different question,
 * tested by tests/api/eventScore.test.ts and scripts/check-events-honesty.mts.
 */

const LANE = '#/people?lane=visibility'

/**
 * Visibility auto-opens its triage cockpit when a lane has more than eight
 * untriaged rows, which the populated fixture always does, and the cockpit
 * replaces the whole board including the lane tabs. Seeding the same
 * dismissed-for-today flag a returning user carries is how you get to the board;
 * clicking through the deck instead would make every test here depend on the
 * deck's behaviour, which is a different surface's job.
 */
async function standDownTriage(page: Page) {
  await page.addInitScript(() => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    try {
      localStorage.setItem('cc:triage-dismissed', JSON.stringify({ guests: today, visibility: today }))
    } catch { /* private mode: the deck opens and the spec says so loudly */ }
  })
}

/** Open People, Visibility, then the Events lane. */
async function openEventsLane(page: Page) {
  await page.goto(`/${LANE}`)
  const tab = page.getByRole('button', { name: /^Events/ }).first()
  await expect(tab).toBeVisible()
  // The board settles across a couple of renders as guests, targets and events
  // land. Clicking into that detaches the button mid-gesture.
  await expect(page.getByRole('button', { name: /^Guests/ }).first()).toBeVisible()
  await page.waitForTimeout(1200)
  await tab.click()
  await expect(page.getByTestId('events-lane')).toBeVisible()
}

async function cardTitles(page: Page): Promise<string[]> {
  const cards = page.getByTestId('event-card')
  await expect(cards.first()).toBeVisible()
  return cards.evaluateAll(els =>
    els.map(el => (el.querySelector('p')?.textContent || '').trim()),
  )
}

test.describe.configure({ mode: 'serial' })

test('the lane renders rooms, not press contacts', async ({ page }) => {
  await standDownTriage(page)
  await mockAudit(page)
  await openEventsLane(page)

  const titles = await cardTitles(page)
  expect(titles.length).toBeGreaterThan(4)

  // The old lane's content, which must not be here. These are `press_relationship`
  // rows in visibility_targets: 46 of the 56 live rows, with one journalist
  // appearing about ten times. They belong under Speaking & Press.
  const joined = titles.join(' | ')
  expect(joined).not.toMatch(/Digiday|NiemanLab|Nieman Lab/i)
})

test('the room full of owners outranks the room full of developers', async ({ page }) => {
  await standDownTriage(page)
  await mockAudit(page)
  await openEventsLane(page)

  const titles = await cardTitles(page)
  const owners = titles.findIndex(t => /Entrepreneurs Organization|Owner-manager|Scaleup CFO/i.test(t))
  const devs = titles.findIndex(t => /PyTorch|LLMday|Hackathon|Claude Code|AI In Practice/i.test(t))

  expect(owners, 'an owner-run room should be on the board').toBeGreaterThanOrEqual(0)
  expect(devs, 'a developer room should still be ON the board, just below').toBeGreaterThanOrEqual(0)
  // Below, not absent. Scrubbing them would be archiving something that is not
  // dead, and the lane's rule is that only the dead are archived.
  expect(owners).toBeLessThan(devs)
})

test('switching city changes the list, which is the whole complaint', async ({ page }) => {
  await standDownTriage(page)
  await mockAudit(page)
  await openEventsLane(page)

  // Read the counts the lane states about itself rather than counting cards:
  // StatusLane previews six rows per lane behind a "Show N more", so the number
  // of visible cards is a fact about the preview cap, not about the filter.
  const counts = async () => {
    const el = page.getByTestId('events-summary')
    await expect(el).toBeVisible()
    return {
      home: Number(await el.getAttribute('data-home')),
      total: Number(await el.getAttribute('data-total')),
    }
  }

  // The rooms he can walk into, by title. The COUNT is not the assertion: a
  // fixture can easily hold the same number of rooms in both cities (this one
  // does, seven each), and an equal count would read as "nothing changed" while
  // every row had in fact been swapped.
  const homeTitles = async () => {
    const home = page.locator('[data-testid="event-card"][data-actionability="home"]')
    await expect(home.first()).toBeVisible()
    return (await home.evaluateAll(els =>
      els.map(el => (el.querySelector('p')?.textContent || '').trim()),
    )).sort()
  }

  await page.getByTestId('events-city-london').click()
  const london = await counts()
  const londonHome = await homeTitles()

  await page.getByTestId('events-city-new_york').click()
  const newYork = await counts()
  const newYorkHome = await homeTitles()

  // The list he can act on changes with the city, and changes COMPLETELY. This is
  // the clause that could not have been true before: `location` was NULL on every
  // agent-sourced row and there was no home city anywhere in the repo.
  expect(londonHome.length).toBeGreaterThan(0)
  expect(newYorkHome.length).toBeGreaterThan(0)
  expect(londonHome.filter(t => newYorkHome.includes(t))).toEqual([])

  // And NOTHING is filtered out by the switch. An away-city event is
  // unactionable, not dead, and becomes live the moment a trip is booked.
  // Filtering here would rebuild in TypeScript the mistake that destroyed 26
  // New York rows in SQL.
  expect(london.total).toBe(newYork.total)
  expect(london.total).toBeGreaterThan(london.home)

  // The top of the board is genuinely in the city selected.
  await page.getByTestId('events-city-london').click()
  await expect(page.getByTestId('event-card').first()).toHaveAttribute('data-actionability', 'home')
})

test('an away room says why it is away instead of vanishing', async ({ page }) => {
  await standDownTriage(page)
  await mockAudit(page)
  await openEventsLane(page)
  await page.getByTestId('events-city-london').click()

  const away = page.locator('[data-testid="event-card"][data-actionability^="away"]')
  await expect(away.first()).toBeVisible()
  // The three flavours of away are all real answers, and each says which it is.
  const modes = await away.evaluateAll(els =>
    Array.from(new Set(els.map(el => el.getAttribute('data-actionability')))),
  )
  for (const m of modes) {
    expect(m).toMatch(/^away, (named attendee|bookable|needs a trip)$/)
  }
})

test('an unjudged room says so rather than showing a zero as a verdict', async ({ page }) => {
  await standDownTriage(page)
  await mockAudit(page)
  await openEventsLane(page)
  // The fixture carries exactly one row with scored_at null. A zero and an
  // unjudged room are the same pixels otherwise, and that is the asymmetry that
  // let the old lane's silence survive fifteen days.
  await expect(page.getByText(/Not judged yet/i).first()).toBeVisible()
})

test('the lane says how fresh it is, out loud', async ({ page }) => {
  // The reason this lane was rebuilt is that it went fifteen days without a new
  // row and nothing on screen said so. Staleness has to be visible to be argued
  // with.
  await standDownTriage(page)
  await mockAudit(page)
  await openEventsLane(page)
  await expect(page.getByText(/Newest found/i)).toBeVisible()
})

test('an empty table reads as an explanation, not as a broken lane', async ({ page }) => {
  const tables = auditTables()
  tables.events = []
  tables.events_recommendable = []
  await standDownTriage(page)
  await mockAudit(page, tables)
  await page.route('**/rest/v1/events_recommendable**', (r: Route) => r.fulfill({ json: [] }))

  await page.goto(`/${LANE}`)
  const tab = page.getByRole('button', { name: /^Events/ }).first()
  await expect(tab).toBeVisible()
  await page.waitForTimeout(1200)
  await tab.click()
  await expect(page.getByTestId('events-lane')).toBeVisible()
  await expect(page.getByText(/No events with a verified date/i)).toBeVisible()
})
