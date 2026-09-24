import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * The Sunday list: everything the ladder judged weak, grouped by the judge
 * that did the killing.
 *
 * WHY THE FIXTURE LOOKS LIKE THIS. Every row below is a real shape from a real
 * ladder run on 2026-09-24, not an invented one, because the last time a
 * fixture here was written from imagination (`{ ok: true }`) it rendered an
 * empty page and scored the layout as a hole. In particular:
 *
 *  - the per-judge scores are NOT on the row. meta.ladder carries the standing
 *    and which judge was weakest; the eight scores live in judge_verdicts,
 *    joined on panel_run_id. A fixture that put a `scores` map here would test
 *    a shape the backend never writes.
 *  - `researched` on the last attempt is the field that decides what a piece
 *    needs from Krish, so both states are represented: a refusal WITH research
 *    is a finished idea wanting his standing, one with none is a lookup that
 *    never ran. The screen renders them differently and this spec proves it.
 *  - the Jev row is the seed that caused this screen to exist. Krish graded it
 *    7; `consequence`, `reader` and `standing` scored it 3 on four independent
 *    expansions. It must be visible and overridable, never buried.
 */

const ladder = (o: {
  band: string; score: number; weakest: string; first?: number
  angle?: string; researched?: boolean; sources?: string[]; detail?: string
  reExpanded?: boolean
}) => ({
  roster_version: 'panel-v2',
  judged_at: '2026-09-24T09:00:00Z',
  first: { score: o.first ?? o.score, weakest: o.weakest, band: o.band },
  final: { score: o.score, weakest: o.weakest, band: o.band },
  expansion: o.angle ? { angle: o.angle, parties: ['the lab', 'the buyer'], scenarios: 2, decision_rule: true, known: 3, inferred: 2 } : { failed: 'the model returned unparseable JSON' },
  attempts: o.detail ? [{
    n: 1, outcome: 'declined', detail: o.detail,
    score_before: o.score, score_after: o.score, weakest_before: o.weakest,
    researched: o.researched === true, sources: o.sources ?? [], briefed: 7,
  }] : [],
  ...(o.band === 'weak' ? {
    bury_confirmation: {
      first: { score: o.score, weakest: o.weakest, band: 'weak' },
      second: { score: o.score, weakest: o.weakest, band: 'weak' },
      agreed: true, re_expanded: o.reExpanded !== false,
    },
  } : {}),
  panel_run_id: '3f1c9a2e-5d44-4a7b-9c11-6b2e8f0a7d33',
  router: { fits: { mind_the_gap: 4, split_the_bill: 3, lift_the_lid: 5 }, winner: 'lift_the_lid', contested: [], why: 'x' },
  router_disagrees: false,
})

const row = (id: string, idea: string, l: unknown) => ({
  id, idea, thesis: 'A thesis.', body: null, source_type: 'pool_headline',
  state: 'seeded', lane_slot: null, created_at: '2026-09-22T10:00:00Z',
  updated_at: '2026-09-24T09:00:00Z', buried_at: null, library_at: null,
  origin: 'agent', horizon: 'news', meta: { ladder: l },
})

const IDEAS = [
  // Three held by `consequence`: the lopsided warning must fire.
  row('i1', 'Jev proves the agent stack should be split by decision type', ladder({
    band: 'weak', score: 3, weakest: 'consequence', first: 4,
    angle: "Jev's real claim isn't the price, it's that decision-making should be split by type",
    researched: true, detail: 'The brief wants a named builder’s Monday decision and a reader who is a specific leader with skin in the choice. None of that exists in the sourced material.',
    sources: ['https://www.langchain.com/blog/jev-agent-evals-langsmith', 'https://thehackernews.com/2026/09/claude-opus-5-helped-researchers-take.html'],
  })),
  row('i2', 'Two labs shipped near-simultaneous price cuts', ladder({
    band: 'weak', score: 2, weakest: 'consequence',
    angle: 'Two frontier labs releasing near-simultaneously is a coordination signal',
    researched: true, detail: 'No primary disclosure exists for any of the three incidents, only secondary coverage.',
    sources: ['https://cybersecuritynews.com/opus-5-to-help-exploit-openai-flaws/'],
  })),
  row('i3', 'Model naming conventions are converging', ladder({
    band: 'weak', score: 4, weakest: 'consequence',
    researched: false, detail: 'Nothing was available to research for this attempt.',
  })),
  // One held by `standing`, so grouping is visibly by judge and not by date.
  row('i4', 'Encoding a leader’s judgement is the missing component', ladder({
    band: 'weak', score: 3, weakest: 'standing',
    angle: 'The component nobody ships is the one that encodes a leader’s taste',
    researched: true, detail: 'Needs a client engagement Krish has lived.',
    sources: ['https://example.org/a'],
  })),
  // Not weak: must never appear here.
  row('i5', 'A piece that cleared the bar', ladder({ band: 'ready', score: 8, weakest: 'novelty', angle: 'A ready angle' })),
  // Never judged at all: also must never appear. "Not looked at yet" and
  // "looked at and could not be lifted" are opposite instructions to a human.
  { ...row('i6', 'An unjudged seed', null), meta: {} },
]

const calmMorning = {
  id: 'm1', kind: 'morning', energy: 4, anxiety: 1, mode: 'green',
  one_word: 'sharp', intent: null, venture: null, override_at: null, skipped: false,
}

async function mock(page: Page, ideas: unknown[]) {
  const posted: Record<string, unknown>[] = []
  await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
  await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', (r: Route) => r.abort())
  // Without a completed check-in the app opens on its four-step morning
  // takeover and the content tab never renders at all. The first version of
  // this spec left it out and every case failed waiting for a nav control,
  // which reads as a broken component rather than a missing fixture — the
  // exact failure AGENTS.md records ("a fixture that renders an empty page
  // measures nothing"). The page snapshot in the failure artefact is what
  // said so; the error message alone would have sent me into the nav code.
  await page.route('**/api/pilot/timezone', (r: Route) =>
    r.fulfill({ json: { ok: true, timezone: 'America/New_York' } }))
  await page.route('**/api/pilot/checkin*', (r: Route) =>
    r.fulfill({
      json: {
        ok: true, morning: calmMorning, last_evening: null, evening_done_today: true,
        yesterday: null, timezone: 'America/New_York',
        today: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
      },
    }))
  // Specific AFTER the catch-alls: Playwright checks handlers in reverse
  // registration order, and the other way round the catch-all shadows this and
  // the screen renders its empty state forever.
  await page.route('**/rest/v1/content_ideas*', (r: Route) => r.fulfill({ json: ideas }))
  await page.route('**/rest/v1/judge_verdicts*', (r: Route) => r.fulfill({ json: [] }))
  await page.route('**/api/content-edits', (r: Route) => {
    try { posted.push(JSON.parse(r.request().postData() || '{}')) } catch { /* recorded as absent */ }
    return r.fulfill({ json: { ok: true } })
  })
  return posted
}

test.describe('the Sunday list', () => {
  test('groups by the judge that did the killing, biggest group first', async ({ page }) => {
    await mock(page, IDEAS)
    await page.goto('/#/content')
    await page.getByTestId('content-room-weak').click()

    const list = page.getByTestId('sunday-list')
    await expect(list).toBeVisible()
    // Named by what the judge wanted, never by its rubric key: "consequence"
    // tells Krish nothing about whether he agrees.
    await expect(page.getByTestId('sunday-group-consequence')).toContainText('Nobody does anything differently')
    await expect(page.getByTestId('sunday-group-standing')).toContainText('Not yours to say')

    // Biggest group first. The rubric doing the most killing is the finding,
    // so it goes where the eye lands.
    const groups = await page.locator('[data-testid^="sunday-group-"]').all()
    expect(await groups[0]!.getAttribute('data-testid')).toBe('sunday-group-consequence')
  })

  test('says so when one judge is holding most of the list', async ({ page }) => {
    await mock(page, IDEAS)
    await page.goto('/#/content')
    await page.getByTestId('content-room-weak').click()
    // 3 of 4 on one judge. This sentence is the entire reason the screen groups
    // by judge rather than by date, so it is asserted rather than assumed.
    await expect(page.getByTestId('sunday-lopsided')).toContainText('3 of 4')
  })

  test('distinguishes a piece that needs Krish from one nothing researched', async ({ page }) => {
    await mock(page, IDEAS)
    await page.goto('/#/content')
    await page.getByTestId('content-room-weak').click()

    const jev = page.locator('li', { hasText: "Jev's real claim" })
    await expect(jev).toContainText('Needs you')
    const unresearched = page.locator('li', { hasText: 'Model naming conventions' })
    await expect(unresearched).toContainText('Never researched')
  })

  test('a row opens the same decide card, not a second one', async ({ page }) => {
    // A separate decision surface here would be a fork of the one that
    // already captures a reason in one tap and carries panel_run_id. The
    // header says Overrule rather than Decide, and Back returns to the survey.
    await mock(page, IDEAS)
    await page.goto('/#/content')
    await page.getByTestId('content-room-weak').click()
    await page.getByTestId('sunday-row-i1').click()
    await expect(page.getByTestId('decide-card')).toBeVisible()
    await expect(page.getByTestId('decide-card')).toContainText('Overrule this')
    await page.getByTestId('decide-close').click()
    await expect(page.getByTestId('sunday-list')).toBeVisible()
  })

  test('an overrule from the Sunday list reaches the ledger with its run id', async ({ page }) => {
    const posted = await mock(page, IDEAS)
    await page.goto('/#/content')
    await page.getByTestId('content-room-weak').click()
    await page.getByTestId('sunday-row-i1').click()
    await page.getByTestId('decide-write').click()
    await page.getByTestId('reason-i_have_lived_this').click()
    await page.getByTestId('decide-commit').click()

    expect(posted).toHaveLength(1)
    // The machine said weak and he said write it. That disagreement is the
    // most valuable calibration row the system can produce, and before this
    // surface existed it went nowhere.
    expect(posted[0]!.action).toBe('approved')
    expect(posted[0]!.panel_run_id).toBe('3f1c9a2e-5d44-4a7b-9c11-6b2e8f0a7d33')
    expect(posted[0]!.reason_code).toBe('i_have_lived_this')
  })

  test('never shows a ready piece or one that was never judged', async ({ page }) => {
    await mock(page, IDEAS)
    await page.goto('/#/content')
    await page.getByTestId('content-room-weak').click()
    await expect(page.getByTestId('sunday-list')).not.toContainText('A piece that cleared the bar')
    await expect(page.getByTestId('sunday-list')).not.toContainText('An unjudged seed')
  })

  test('an empty list says nothing was buried, because nothing ever is', async ({ page }) => {
    await mock(page, [IDEAS[4]])
    await page.goto('/#/content')
    await page.getByTestId('content-room-weak').click()
    await expect(page.getByText('Nothing was judged weak.')).toBeVisible()
  })
})
