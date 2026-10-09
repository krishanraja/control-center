import { test, expect, type Page, type Route } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'
import {
  DECISION_RULES, EXPOSURE_LADDER, LENSES, LENS_ORDER, TRAPS,
  type LensId, type RuleId, type TrapId,
} from '../src/content/focusTheory'
import type {
  AskLadder, AskPerson, AskSection, HeadlineSection, HeardSection, LensMove, LensSection,
  NextStepSection, ObjectiveSection, ReadShape, StrategistRead, StrategistSection,
} from '../src/types/strategist'

/**
 * The strategist (ADR-026), end to end against the production build.
 *
 * What these protect, one test each:
 *
 *   1. Talk it through on the desk: the note goes up as HIS words with the
 *      inferred kind, the read streams in, and the one move becomes today's
 *      ask with HIS prediction. The machine never fills predicted_no_pct: the
 *      guess chips start empty and the ladder is named in words, never a
 *      percentage, or learningFor() would tell him about a guess he never made.
 *   2. Today's ask already went out: the move offers Copy only, because the
 *      server refuses to overwrite a sent ask (409 already_sent).
 *   3. A failure is a plain sentence and a Retry, never a code, and a stream
 *      that ends without `done` is a failure rather than a short read.
 *   4. The first OS goal saved on a cold start opens its read by itself.
 *   5. The Focus Ritual on a Monday: his words first, and a drafted objective
 *      is saved only when he taps Take it, through the ritual's own add() and
 *      the goal gate (Ruling, Krish, 2026-09-27). No ask card in the ritual,
 *      and Escape on a why popover inside it closes the popover, not the day.
 *   6. The move's order is the manual's: the words, his guess, then contact.
 *
 * Every person, company and figure below is synthetic. The repo is public and
 * NOW.md's never_publish covers named leads and scorecard figures.
 *
 * The clock is pinned to a MONDAY and the file runs in UTC. The note's kind is
 * inferred from the civil day (Monday is "Starting the week"), so an unpinned
 * clock would make the first assertion a calendar test. Pinned on both sides,
 * because the fixtures below are built in node and read in the browser.
 */

test.use({ timezoneId: 'UTC' })

const MONDAY = new Date('2026-09-28T10:00:00Z')
const TODAY = '2026-09-28'

const OS_ID = 'os:two-paid-pilots-by-december'
const OS_TITLE = 'Two paid pilots by December'

// ── Section builders: the shape the server emits AFTER validation ────────────
// Labels, sources, rule numbers, trap chips and ladder words are server-filled
// from the corpus, so the fixtures take them from the same corpus rather than
// restating them.

function headline(text: string, rule: RuleId): HeadlineSection {
  const n = DECISION_RULES.findIndex(r => r.id === rule)
  return { kind: 'headline', text, rule, rule_n: n + 1, rule_chip: DECISION_RULES[n].chip }
}

function heard(text: string, trapId: TrapId | null): HeardSection {
  const trap = trapId ? TRAPS.find(t => t.id === trapId) ?? null : null
  return { kind: 'heard', text, trap: trapId, trap_chip: trap?.chip ?? null, counter_move: trap?.move ?? null }
}

function lens(id: LensId, status: LensSection['status'], read: string, missing: string | null, move: LensMove | null = null): LensSection {
  const L = LENSES[id]
  return { kind: 'lens', lens: id, label: L.label, rule: L.rule, source: L.source, status, read, missing, move }
}

function ladder(level: number): AskLadder {
  const l = EXPOSURE_LADDER.find(x => x.level === level)!
  return { level: l.level, request: l.request, feared: l.feared, learning: l.learning }
}

function objective(text: string, job: ObjectiveSection['job'], lensId: LensId | null, why: string, play = false): ObjectiveSection {
  return { kind: 'objective', text, job, serves: OS_ID, serves_title: OS_TITLE, lens: lensId, why, play }
}

const NO_JOB_FOR_CAPITAL =
  'No job of the five covers raising money. This move sits outside them by your ruling of 27 September 2026.'

const RILEY: AskPerson = {
  contact_id: 'c-fixture-riley', name: 'Riley Stone', title: 'Chief operating officer', company: 'Fixture Media',
  best_channel: 'email', email: 'riley@fixture.test', linkedin_url: null,
}
const MORGAN: AskPerson = {
  contact_id: 'c-fixture-morgan', name: 'Morgan Vale', title: 'Operating partner', company: 'Fixture Capital',
  best_channel: 'linkedin', email: null, linkedin_url: 'https://www.linkedin.com/in/fixture-morgan',
}

const MOVE_LINE = 'Would you take a short call on Thursday about the pilot?'
const MOVE_ASK: AskSection = {
  kind: 'ask',
  to: { kind: 'named', person: RILEY },
  line: MOVE_LINE,
  message: 'I am running a three week pilot that shows a leader where their team stands on AI.\nWould you be willing to take a short call on Thursday to see if it fits?\nIf it is not a fit, please say so.',
  why: 'Riley is deciding on AI this quarter and took a call with you in the spring.',
  ladder: ladder(6),
  lens: 'sell_first',
  job: 'fill_pilots',
  job_note: null,
}
const INTRO_ASK: AskSection = {
  kind: 'ask',
  to: { kind: 'role', role: 'A chief executive in a portfolio company', via: { kind: 'contact', person: MORGAN } },
  line: 'Would you introduce me to one portfolio chief executive?',
  message: 'Would you be willing to introduce me to one chief executive in your portfolio who is weighing AI this quarter?\nIf it is not appropriate, please say so.',
  why: 'Morgan sits on portfolio boards and has offered introductions before.',
  ladder: ladder(4),
  lens: 'partner',
  job: 'fill_pilots',
  job_note: null,
}
const NEXT_STEP: NextStepSection = {
  kind: 'next_step', text: 'Send Riley the one-page pilot scope with a Thursday call slot', goal_id: null, job: 'fill_pilots',
}

const HEADLINE_TEXT = 'The week you described is booked calls, and the plan you described is another pass on the deck.'
const OBJ_1 = 'Book two calls with named leaders about the pilot'
const OBJ_2 = 'Show the deck to one buyer before touching it again'

/** Starting the week: what a Monday note reads as. */
const WEEK_OPEN: StrategistSection[] = [
  headline(HEADLINE_TEXT, 'private'),
  heard('You said you want calls booked this week and that you keep going back to the deck.', 'polishing'),
  lens('sell_first', 'move', 'No call is booked for this week yet.', 'The ask that books the first one.',
    { text: 'Ask one leader who is deciding on AI this quarter for a call on Thursday.', job: 'fill_pilots', by: '2026-10-01', target: null, job_note: null }),
  lens('isolation', 'move', 'The deck has been reworked alone since the last buyer saw it.', 'One buyer seeing it before the next pass.',
    { text: 'Show the current deck to one buyer before changing it again.', job: 'keep_honest', by: null, target: null, job_note: null }),
  lens('capital_cofounder', 'move', 'You said an investor conversation keeps coming up.', 'One conversation that settles it with evidence.',
    { text: 'Ask a warm investor contact for a short call about what the first pilot proves.', job: null, by: null, target: 'investor', job_note: NO_JOB_FOR_CAPITAL }),
  objective(OBJ_1, 'fill_pilots', 'sell_first', 'It is the week you asked for, in your words.'),
  objective(OBJ_2, 'keep_honest', 'isolation', 'The deck has had its pass.', true),
  NEXT_STEP,
  MOVE_ASK,
  INTRO_ASK,
  { kind: 'worry', text: 'I worry nobody will pay for a pilot before the product is finished.' },
  { kind: 'close', stop: 'Once Riley names a day, stop and confirm it.' },
]

/** The OS goal, read in full: all six lenses, a kill signal, one move. */
const OS_READ: StrategistSection[] = [
  headline('The goal names the pilots and not who sells them with you.', 'alone'),
  ...LENS_ORDER.map(id => lens(id, id === 'sell_first' ? 'move' : 'later', `What the goal shows on ${LENSES[id].label.toLowerCase()}.`, 'One thing to check.',
    id === 'sell_first' ? { text: 'Ask one leader for a pilot call this week.', job: 'fill_pilots', by: '2026-10-02', target: null, job_note: null } : null)),
  objective(OBJ_1, 'fill_pilots', 'sell_first', 'The first pilot starts with a call.'),
  MOVE_ASK,
  { kind: 'kill', text: 'No leader agrees to a call after ten warm asks.', by: '2026-10-31' },
  { kind: 'close', stop: 'Once Riley names a day, stop and confirm it.' },
]

/** A weekly objective, read short: outward or inward, and one move. */
const WEEKLY_READ: StrategistSection[] = [
  headline('The objective is written as work on the deck, and nobody outside sees it this week.', 'private'),
  { kind: 'reframe', direction: 'inward', why: 'It names what you will make, not who you will ask.', wording: 'Book two calls with leaders who could run the pilot' },
  MOVE_ASK,
  { kind: 'close', stop: 'Once Riley names a day, stop and confirm it.' },
]

// ── The wire ─────────────────────────────────────────────────────────────────

/** The complete read `done` carries, with suggestion ids stamped the way the server does. */
function readOf(shape: ReadShape, sections: StrategistSection[], idPrefix = 'sug'): { read: StrategistRead; ids: string[] } {
  const of = <K extends StrategistSection['kind']>(k: K) => sections.filter(s => s.kind === k) as Array<Extract<StrategistSection, { kind: K }>>
  const ids: string[] = []
  const stamp = <T extends { suggestion_id?: string | null }>(items: T[], tag: string) =>
    items.map((s, i) => { const id = `${idPrefix}-${tag}-${i + 1}`; ids.push(id); return { ...s, suggestion_id: id } })
  const objectives = stamp(of('objective'), 'obj')
  const asks = stamp(of('ask'), 'ask')
  const next_steps = stamp(of('next_step'), 'next')
  return {
    ids,
    read: {
      v: 1, shape,
      headline: of('headline')[0], heard: of('heard')[0] ?? null, lenses: of('lens'), reframe: of('reframe')[0] ?? null,
      objectives, progress: of('progress'), next_steps, asks,
      worry: of('worry')[0] ?? null, kill: of('kill')[0] ?? null, learning: of('learning')[0] ?? null, close: of('close')[0],
    },
  }
}

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

type Ending =
  | { kind: 'done'; shape: ReadShape }
  | { kind: 'error'; error: string; detail: string }
  | { kind: 'none' }

/** An SSE body in the order api/strategist.ts writes it: open, stages, sections, then the end. */
function sse(sections: StrategistSection[], end: Ending): string {
  const out = [': open\n\n', frame('stage', { stage: 'grounding' }), frame('stage', { stage: 'thinking' }), ': ping\n\n', frame('stage', { stage: 'writing' })]
  sections.forEach((section, index) => out.push(frame('section', { index, section })))
  if (end.kind === 'done') {
    const { read, ids } = readOf(end.shape, sections)
    out.push(frame('stage', { stage: 'saving' }))
    out.push(frame('done', { ok: true, read_id: 'read-fixture-1', suggestion_ids: ids, persisted: true, read, notes: [] }))
  } else if (end.kind === 'error') {
    out.push(frame('error', { error: end.error, detail: end.detail, read_id: 'read-fixture-1' }))
  }
  return out.join('')
}

// ── Mocks ────────────────────────────────────────────────────────────────────

function goalRow(id: string, title: string, horizon: 'os' | 'weekly', parent: string | null) {
  return {
    id, title, horizon, parent_id: parent, venture: null, status: 'active', job: horizon === 'weekly' ? 'fill_pilots' : null,
    priority: null, why_now: null, definition_of_done: null, target_horizon: null,
    is_stale: false, orphaned: false, days_since_touch: 1, stale_after_days: horizon === 'weekly' ? 10 : 90,
    week_start: horizon === 'weekly' ? TODAY : null, closed_at: null, carried_from: null,
    updated_at: MONDAY.toISOString(), created_at: MONDAY.toISOString(),
  }
}

interface Captured {
  strategist: Array<Record<string, unknown>>
  asks: Array<Record<string, unknown>>
  verdicts: Array<Record<string, unknown>>
  objectives: Array<Record<string, unknown>>
  patches: Array<Record<string, unknown>>
  slots: Array<Record<string, unknown>>
}

interface MockOpts {
  /** One SSE body per POST, in order; the last repeats. */
  bodies?: string[]
  os?: Array<ReturnType<typeof goalRow>>
  weekly?: Array<ReturnType<typeof goalRow>>
  todayAsk?: Record<string, unknown> | null
}

async function mockAll(page: Page, opts: MockOpts = {}): Promise<Captured> {
  const cap: Captured = { strategist: [], asks: [], verdicts: [], objectives: [], patches: [], slots: [] }
  const body = (r: Route) => JSON.parse(r.request().postData() || '{}') as Record<string, unknown>

  // Catch-alls FIRST. Playwright checks handlers in reverse registration
  // order, so a specific route registered after these wins; the other way
  // round the catch-all shadows it and the sheet renders against nothing.
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())
  await page.route('**/api/**', r => r.fulfill({ json: { ok: true } }))

  await page.clock.setFixedTime(MONDAY)
  await answerPilotGate(page, 'UTC')

  // Specific routes LAST.
  const os = opts.os ?? [goalRow(OS_ID, OS_TITLE, 'os', null)]
  const weekly = opts.weekly ?? []
  await page.route('**/api/goals/ladder*', r => r.fulfill({ json: {
    ok: true, horizons: ['os', 'weekly'], by_horizon: { os, weekly }, goals: [...os, ...weekly],
    stale_count: 0, orphan_count: 0, ventures: [], current_week: TODAY, last_week: [],
  } }))

  // One handler for the one route, branching on method: GET is the latest
  // read (none yet), POST is the stream.
  const bodies = opts.bodies ?? [sse(WEEK_OPEN, { kind: 'done', shape: 'week_open' })]
  await page.route('**/api/strategist*', r => {
    if (r.request().method() === 'GET') {
      return r.fulfill({ json: { ok: true, read: null, last_attempt_at: null, last_status: null } })
    }
    cap.strategist.push(body(r))
    const sseBody = bodies[Math.min(cap.strategist.length - 1, bodies.length - 1)]
    return r.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody })
  })

  await page.route('**/api/pilot/asks*', r => {
    if (r.request().method() === 'POST') {
      cap.asks.push(body(r))
      return r.fulfill({ json: { ok: true } })
    }
    return r.fulfill({ json: { ok: true, today_ask: opts.todayAsk ?? null, unresolved: null, today: TODAY } })
  })

  await page.route('**/api/suggestions/verdict', r => {
    cap.verdicts.push(body(r))
    return r.fulfill({ status: 201, json: { ok: true, id: `verdict-${cap.verdicts.length}`, round: 1 } })
  })

  await page.route('**/api/objectives', r => {
    const b = body(r)
    cap.objectives.push(b)
    return r.fulfill({ json: { ok: true, objective: { id: b.id, title: b.title, horizon: b.horizon } } })
  })

  await page.route('**/api/goals', r => {
    if (r.request().method() === 'PATCH') cap.patches.push(body(r))
    return r.fulfill({ json: { ok: true } })
  })

  await page.route('**/api/daily-focus/slot', r => {
    cap.slots.push(body(r))
    return r.fulfill({ json: { ok: true } })
  })

  return cap
}

/** Open the sheet from the ladder's desk action and say something. */
async function talk(page: Page, note: string) {
  await page.goto('/#/home')
  await page.getByTestId('ladder-talk').click()
  const input = page.getByTestId('talk-box-input')
  await expect(input).toBeVisible()
  await input.fill(note)
  await page.getByTestId('talk-box-send').click()
}

// ── 1. Talk it through ───────────────────────────────────────────────────────

test.describe('the strategist on the desk', () => {
  test('talk it through: his words go up, the read streams in, and the move takes HIS guess', async ({ page }) => {
    const cap = await mockAll(page)
    await page.goto('/#/home')
    await page.getByTestId('ladder-talk').click()

    const sheet = page.getByTestId('strategist-sheet')
    await expect(sheet).toHaveAttribute('data-mode', 'talk')
    const input = page.getByTestId('talk-box-input')
    // Dictation types into whatever has focus. An unfocused box means Wispr
    // Flow lands nowhere, which is the whole input design gone.
    await expect(input).toBeFocused()
    // Monday is "Starting the week", and it is his to change.
    await expect(page.getByRole('button', { name: 'Starting the week', exact: true })).toHaveAttribute('aria-pressed', 'true')

    // Enter is a newline; Cmd/Ctrl+Enter sends.
    await input.fill('Two calls booked this week is what I want.')
    await input.press('End')
    await input.press('Enter')
    await input.pressSequentially('But I keep going back to the deck.')
    await expect(input).toHaveValue('Two calls booked this week is what I want.\nBut I keep going back to the deck.')
    expect(cap.strategist).toHaveLength(0)
    await input.press('ControlOrMeta+Enter')

    const read = page.getByTestId('strategist-read')
    await expect(read).toHaveAttribute('data-complete', 'true')
    expect(cap.strategist).toHaveLength(1)
    expect(cap.strategist[0]).toMatchObject({
      source: 'note',
      kind: 'week_open',
      body: 'Two calls booked this week is what I want.\nBut I keep going back to the deck.',
    })

    // What he said is kept on screen, whole.
    await expect(page.getByTestId('strategist-you-said')).toContainText('But I keep going back to the deck.')

    // The sections, where the read puts them.
    await expect(page.getByTestId('strategist-headline')).toContainText(HEADLINE_TEXT)
    // The source is his rule in its own words. Its chip is the FAILURE
    // condition, which under a recommendation reads as the advice.
    const rule = WEEK_OPEN[0] as HeadlineSection
    const ruleWords = DECISION_RULES.find(r => r.id === rule.rule)!.verdict.match(/^[^.]+\./)![0]
    await expect(page.getByTestId('strategist-headline')).toContainText(`Your rule ${rule.rule_n}: ${ruleWords}`)
    await expect(page.getByTestId('strategist-headline')).not.toContainText(rule.rule_chip)
    await expect(page.getByTestId('strategist-heard')).toContainText('You said you want calls booked')
    const lensIds = await read.locator('[data-testid^="strategist-lens-"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')))
    expect(lensIds).toEqual(['strategist-lens-sell_first', 'strategist-lens-isolation', 'strategist-lens-capital_cofounder'])
    // An investor move says, in words, that no job covers raising money.
    await expect(page.getByTestId('strategist-lens-capital_cofounder')).toContainText('No job of the five covers raising money')
    await expect(page.getByTestId('strategist-objective-0')).toContainText(OBJ_1)
    await expect(page.getByTestId('strategist-objective-1')).toContainText(OBJ_2)
    await expect(page.getByTestId('strategist-next-0')).toContainText(NEXT_STEP.text)
    await expect(page.getByTestId('strategist-ask-1')).toContainText('through Morgan Vale')
    await expect(page.getByTestId('strategist-worry')).toBeVisible()

    // The one move: the ladder in words, never a percentage.
    const move = page.getByTestId('strategist-move')
    await expect(move).toContainText(MOVE_LINE)
    const ladderWords = move.getByTestId('strategist-ladder').first()
    await expect(ladderWords).toContainText(`It can feel like: ${MOVE_ASK.ladder.feared}.`)
    await expect(ladderWords).toContainText(`Whatever the answer: ${MOVE_ASK.ladder.learning}.`)
    expect(await ladderWords.innerText()).not.toMatch(/%/)
    await expect(move.getByTestId('strategist-close')).toContainText('Once Riley names a day')

    // The seed is his to edit, and the guess is his to make: no chip is
    // pressed until he presses one. Nothing can reach Riley before that: the
    // contact buttons wait for the guess.
    await expect(move.getByTestId('ask-seed-compose')).toBeVisible()
    await expect(move.getByTestId('strategist-contact-0')).toHaveCount(0)
    for (const pct of [20, 40, 60, 80]) {
      await expect(move.getByTestId(`ask-guess-${pct}`)).toHaveAttribute('aria-pressed', 'false')
    }
    await move.getByTestId('ask-guess-60').click()
    await expect(move.getByTestId('ask-guess-60')).toHaveAttribute('aria-pressed', 'true')
    await move.getByRole('button', { name: 'Make it today’s ask' }).click()

    await expect.poll(() => cap.asks.length).toBe(1)
    // A first name, never a full one: pilot_asks is readable with the browser key.
    expect(cap.asks[0]).toMatchObject({ ask_text: `Riley: ${MOVE_LINE}`, predicted_no_pct: 60, mark_sent: false })
    expect(String(cap.asks[0].ask_text)).not.toContain('Stone')
    await expect.poll(() => cap.verdicts.length).toBe(1)
    expect(cap.verdicts[0]).toMatchObject({ suggestion_id: 'sug-ask-1', verdict: 'accepted' })
    // Now, and only now, one click reaches Riley. It writes no second verdict.
    await expect(move.getByTestId('strategist-contact-0')).toBeVisible()
    await expect(move.getByTestId('strategist-contact-0')).toContainText('Email Riley')

    // Put on today: the first empty slot, through the existing slot route.
    await page.getByTestId('strategist-put-today-0').click()
    await expect.poll(() => cap.slots.length).toBe(1)
    expect(cap.slots[0]).toMatchObject({ date: TODAY, slot: 1, text: NEXT_STEP.text, job: 'fill_pilots' })
    await expect(page.getByTestId('strategist-next-0')).toContainText('On today, slot 1')
    await expect.poll(() => cap.verdicts.length).toBe(2)
    expect(cap.verdicts[1]).toMatchObject({ suggestion_id: 'sug-next-1', verdict: 'accepted' })

    // Not this, with a reason from the one vocabulary.
    await page.getByTestId('strategist-not-this-objective-1').click()
    await page.getByRole('button', { name: 'Wrong timing' }).click()
    await expect.poll(() => cap.verdicts.length).toBe(3)
    expect(cap.verdicts[2]).toMatchObject({ suggestion_id: 'sug-obj-2', verdict: 'rejected', reason_code: 'wrong_timing' })
    await expect(page.getByTestId('strategist-objective-1')).toHaveCount(0)

    // Nothing he did here saved a goal. Only Take it, through the ritual, does.
    expect(cap.objectives).toHaveLength(0)
    expect(cap.strategist).toHaveLength(1)
  })

  // ── 2. Today's ask already sent ──────────────────────────────────────────
  test('today’s ask has already gone out: the move offers Copy only and posts nothing', async ({ page }) => {
    const cap = await mockAll(page, {
      todayAsk: {
        id: 'ask-fixture-1', ask_text: 'Sam: lunch on Friday?', predicted_no_pct: 40,
        sent_at: MONDAY.toISOString(), resolved_at: null, outcome: null,
      },
    })
    await talk(page, 'A short Monday note.')

    const move = page.getByTestId('strategist-move')
    await expect(move.getByTestId('ask-seed-sent')).toBeVisible()
    await expect(move.getByTestId('ask-seed-sent')).toContainText('already gone out')
    await expect(move.getByRole('button', { name: 'Copy the wording' })).toBeVisible()
    await expect(move.getByRole('button', { name: /Make it today|Replace today/ })).toHaveCount(0)
    await expect(move.locator('[data-testid^="ask-guess-"]')).toHaveCount(0)
    expect(cap.asks).toHaveLength(0)
  })

  test('at assist the draft already exists: the one press opens it in Gmail, and still waits for his guess', async ({ page }) => {
    // ADR-030, phase 5: once strategist_ask sits at assist, the read makes
    // the Gmail draft and its link rides on the ask. The order is the
    // manual's: the words, his guess, then the press. Sending stays in Gmail.
    const DRAFT = 'https://mail.google.com/mail/u/0/#drafts?compose=fixture-draft-1'
    const sections = WEEK_OPEN.map(s => (s === MOVE_ASK ? { ...MOVE_ASK, draft_url: DRAFT } : s))
    const cap = await mockAll(page, { bodies: [sse(sections, { kind: 'done', shape: 'week_open' })] })
    await talk(page, 'A short Monday note.')

    const move = page.getByTestId('strategist-move')
    await expect(move).toContainText(MOVE_LINE)
    await expect(move.getByTestId('strategist-contact-0')).toHaveCount(0)
    await move.getByTestId('ask-guess-60').click()
    await move.getByRole('button', { name: 'Make it today’s ask' }).click()
    await expect.poll(() => cap.verdicts.length).toBe(1)

    const press = move.getByTestId('strategist-contact-0')
    await expect(press).toBeVisible()
    await expect(press).toContainText('Open the draft in Gmail')
    await expect(press).toHaveAttribute('href', DRAFT)
    await expect(press).toHaveAttribute('target', '_blank')
    // No mailto, nothing that could send: the anchor is the draft itself.
    expect(await press.evaluate(el => el.tagName)).toBe('A')
    expect(await press.getAttribute('href')).not.toMatch(/^mailto:/)
  })

  // ── 3. Failures ──────────────────────────────────────────────────────────
  test('an in-band error is a plain sentence and a Retry that sends the same note again', async ({ page }) => {
    const detail = 'The read stopped before it finished. What you said is kept, and you can run it again.'
    const cap = await mockAll(page, {
      bodies: [
        sse(WEEK_OPEN.slice(0, 3), { kind: 'error', error: 'strategist_read_incomplete', detail }),
        sse(WEEK_OPEN, { kind: 'done', shape: 'week_open' }),
      ],
    })
    await talk(page, 'Monday, and I am not sure where to start.')

    const error = page.getByTestId('strategist-error')
    await expect(error).toContainText(detail)
    // A sentence for him, never the code.
    expect(await error.innerText()).not.toMatch(/strategist_read_incomplete|_/)
    // What came through is shown as not kept, and it is never offered as a move.
    await expect(page.getByTestId('strategist-read')).toHaveAttribute('data-complete', 'false')
    await expect(page.getByTestId('strategist-note-read')).toContainText('The read was not saved')
    await expect(page.getByTestId('strategist-move')).toHaveCount(0)

    await page.getByTestId('strategist-retry').click()
    await expect.poll(() => cap.strategist.length).toBe(2)
    expect(cap.strategist[1]).toEqual(cap.strategist[0])
    await expect(page.getByTestId('strategist-read')).toHaveAttribute('data-complete', 'true')
    await expect(page.getByTestId('strategist-error')).toHaveCount(0)
  })

  test('a stream that ends without done is a failure, not a short read', async ({ page }) => {
    await mockAll(page, { bodies: [sse(WEEK_OPEN.slice(0, 2), { kind: 'none' })] })
    await talk(page, 'A note that gets cut off.')

    await expect(page.getByTestId('strategist-error')).toContainText('stopped before it finished')
    await expect(page.getByTestId('strategist-retry')).toBeVisible()
    await expect(page.getByTestId('strategist-read')).toHaveAttribute('data-complete', 'false')
    await expect(page.getByTestId('strategist-move')).toHaveCount(0)
  })

  // ── 4. Cold start ────────────────────────────────────────────────────────
  test('the first OS goal saved on a cold start opens its read by itself', async ({ page }) => {
    const cap = await mockAll(page, { os: [], bodies: [sse(OS_READ, { kind: 'done', shape: 'os' })] })
    await page.goto('/#/home')
    await expect(page.getByTestId('strategist-sheet')).toHaveCount(0)

    await page.getByRole('button', { name: 'Set your OS goals' }).click()
    await page.getByPlaceholder('What is the whole system for?').fill(OS_TITLE)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect.poll(() => cap.objectives.length).toBe(1)
    expect(cap.objectives[0]).toMatchObject({ id: OS_ID, title: OS_TITLE, horizon: 'os' })

    await expect(page.getByTestId('strategist-sheet')).toHaveAttribute('data-mode', 'goal')
    await expect.poll(() => cap.strategist.length).toBe(1)
    expect(cap.strategist[0]).toMatchObject({ source: 'goal', goalId: OS_ID })
    await expect(page.getByTestId('strategist-goal-read')).toHaveAttribute('data-status', 'ready')

    // The OS read is the full read: all six lenses, in order, and a dated kill.
    const lensIds = await page.getByTestId('strategist-read').locator('[data-testid^="strategist-lens-"]')
      .evaluateAll(els => els.map(e => e.getAttribute('data-testid')))
    expect(lensIds).toEqual(LENS_ORDER.map(id => `strategist-lens-${id}`))
    await expect(page.getByTestId('strategist-kill')).toContainText('Check by 31 Oct')
    await expect(page.getByTestId('strategist-move')).toContainText(MOVE_LINE)
  })
})

// ── 5. The Focus Ritual on a Monday ──────────────────────────────────────────

test.describe('the strategist in the Focus Ritual', () => {
  test('his words first, and Take it saves a drafted objective through the ritual’s own add()', async ({ page }) => {
    const cap = await mockAll(page)
    await page.goto('/#/home')
    await page.getByRole('button', { name: 'Add a weekly objective' }).click()

    const ritual = page.getByRole('dialog', { name: 'Focus ritual' })
    await expect(ritual).toBeVisible()
    // The TalkBox sits inline at the top; the ritual never opens a sheet on
    // itself, because its Escape snoozes the day.
    await expect(ritual.getByTestId('strategist-talk-inline')).toBeVisible()
    await expect(ritual.getByRole('button', { name: 'Starting the week', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await ritual.getByTestId('talk-box-input').fill('This week is about getting two leaders on a call.')
    await ritual.getByTestId('talk-box-send').click()

    await expect(ritual.getByTestId('strategist-read')).toHaveAttribute('data-complete', 'true')
    expect(cap.strategist[0]).toMatchObject({ source: 'note', kind: 'week_open', body: 'This week is about getting two leaders on a call.' })
    await expect(ritual.getByTestId('strategist-objective-0')).toContainText(OBJ_1)
    // One move, and no "today's ask" button in here: the ritual can hold
    // three reads, and three ask cards would be three moves.
    await expect(ritual.getByTestId('strategist-move')).toContainText(MOVE_LINE)
    await expect(ritual.locator('[data-testid="ask-seed-compose"], [data-testid="ask-seed-sent"]')).toHaveCount(0)
    await expect(ritual.getByTestId('strategist-move-home')).toBeVisible()

    // Escape on a why popover inside the ritual closes the popover and
    // leaves the ritual open: the ritual's own Escape snoozes the day.
    await ritual.getByTestId('strategist-objective-0').getByRole('button', { name: /^Why this suggestion is here/ }).click()
    const popover = page.locator('[data-slot="popover-content"]')
    await expect(popover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)
    await expect(ritual).toBeVisible()
    // Nothing is a goal until he takes it.
    expect(cap.objectives).toHaveLength(0)

    await ritual.getByTestId('strategist-take-0').click()
    await expect.poll(() => cap.objectives.length).toBe(1)
    expect(cap.objectives[0]).toMatchObject({
      horizon: 'weekly',
      title: OBJ_1,
      parent_id: OS_ID,
      job: 'fill_pilots',
    })
    await expect(ritual.getByTestId('strategist-objective-0')).toContainText('In this week')
    await expect.poll(() => cap.verdicts.length).toBe(1)
    expect(cap.verdicts[0]).toMatchObject({ suggestion_id: 'sug-obj-1', verdict: 'accepted' })

    // A drafted objective he took does not spend a second model call, and no
    // sheet opened over the ritual.
    await page.waitForTimeout(300)
    expect(cap.strategist).toHaveLength(1)
    await expect(page.getByTestId('strategist-sheet')).toHaveCount(0)
  })

  test('Take it in the sheet hands the wording to the ritual, and only his Add saves it', async ({ page }) => {
    const cap = await mockAll(page, {
      bodies: [sse(WEEK_OPEN, { kind: 'done', shape: 'week_open' }), sse(WEEKLY_READ, { kind: 'done', shape: 'weekly' })],
    })
    await talk(page, 'A Monday note about the pilot.')
    await expect(page.getByTestId('strategist-read')).toHaveAttribute('data-complete', 'true')

    await page.getByTestId('strategist-take-0').click()
    await expect(page.getByTestId('strategist-sheet')).toHaveCount(0)
    const ritual = page.getByRole('dialog', { name: 'Focus ritual' })
    await expect(ritual).toBeVisible()
    await expect(ritual.getByPlaceholder('Write a weekly objective…')).toHaveValue(OBJ_1)
    // Handed over, not saved.
    expect(cap.objectives).toHaveLength(0)

    await ritual.getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(() => cap.objectives.length).toBe(1)
    expect(cap.objectives[0]).toMatchObject({ horizon: 'weekly', title: OBJ_1, parent_id: OS_ID })
    await expect.poll(() => cap.verdicts.length).toBe(1)
    expect(cap.verdicts[0]).toMatchObject({ suggestion_id: 'sug-obj-1', verdict: 'accepted' })

    // After an add, the short read of that objective runs, by its id.
    await expect.poll(() => cap.strategist.length).toBe(2)
    expect(cap.strategist[1]).toMatchObject({ source: 'goal', goalId: cap.objectives[0].id })
    const added = ritual.getByTestId('strategist-added-read')
    await expect(added.getByTestId('strategist-reframe')).toContainText('Book two calls with leaders who could run the pilot')
  })

  test('a progress note marks a weekly objective done through the goal PATCH', async ({ page }) => {
    const WEEKLY_ID = 'weekly:send-the-pilot-scope-to-two-leaders'
    const WEEKLY_TITLE = 'Send the pilot scope to two leaders'
    const DROP_ID = 'weekly:rebuild-the-deck'
    const DROP_TITLE = 'Rebuild the deck'
    const CARRY_ID = 'weekly:book-one-call'
    const CARRY_TITLE = 'Book one call'
    const UPDATE: StrategistSection[] = [
      headline('The scope went out, and neither leader has been asked for a date.', 'slow_pay'),
      heard('You said both leaders have the scope and you are waiting to hear back.', 'avoiding_ask'),
      { kind: 'progress', goal_id: WEEKLY_ID, goal_title: WEEKLY_TITLE, verdict: 'done', why: 'Both scopes went out on Tuesday.' },
      { kind: 'progress', goal_id: DROP_ID, goal_title: DROP_TITLE, verdict: 'drop', why: 'The deck is not what books the call.' },
      { kind: 'progress', goal_id: CARRY_ID, goal_title: CARRY_TITLE, verdict: 'carry', why: 'Two days are left for it.' },
      NEXT_STEP,
      MOVE_ASK,
      { kind: 'close', stop: 'Once Riley names a day, stop and confirm it.' },
    ]
    const cap = await mockAll(page, {
      weekly: [
        goalRow(WEEKLY_ID, WEEKLY_TITLE, 'weekly', OS_ID),
        goalRow(DROP_ID, DROP_TITLE, 'weekly', OS_ID),
        goalRow(CARRY_ID, CARRY_TITLE, 'weekly', OS_ID),
      ],
      bodies: [sse(UPDATE, { kind: 'done', shape: 'update' })],
    })
    await page.goto('/#/home')
    await page.getByTestId('ladder-talk').click()
    // The kind is his to change: a Monday note can still be progress.
    const progress = page.getByTestId('talk-box').getByRole('button', { name: 'Progress', exact: true })
    await progress.click()
    await expect(progress).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('talk-box-input').fill('Both leaders have the scope now.')
    await page.getByTestId('talk-box-send').click()

    await expect(page.getByTestId('strategist-read')).toHaveAttribute('data-complete', 'true')
    expect(cap.strategist[0]).toMatchObject({ source: 'note', kind: 'update' })
    await expect(page.getByTestId('strategist-progress-0')).toContainText(WEEKLY_TITLE)

    await page.getByTestId('strategist-progress-act-0').click()
    await expect.poll(() => cap.patches.length).toBe(1)
    expect(cap.patches[0]).toMatchObject({ goalId: WEEKLY_ID, status: 'done' })
    await expect(page.getByTestId('strategist-progress-0')).toContainText('Marked done.')

    // A drop asks twice, as the ladder's own drop does.
    await page.getByTestId('strategist-progress-act-1').click()
    await expect(page.getByTestId('strategist-progress-act-1')).toHaveText('Tap again to drop it')
    await page.waitForTimeout(200)
    expect(cap.patches).toHaveLength(1)
    await page.getByTestId('strategist-progress-act-1').click()
    await expect.poll(() => cap.patches.length).toBe(2)
    expect(cap.patches[1]).toMatchObject({ goalId: DROP_ID, status: 'dropped' })
    await expect(page.getByTestId('strategist-progress-1')).toContainText('Dropped.')

    // Carry is said, not a button: the objective is already active.
    await expect(page.getByTestId('strategist-progress-2')).toContainText('Keep going')
    await expect(page.getByTestId('strategist-progress-act-2')).toHaveCount(0)
    expect(cap.patches).toHaveLength(2)
  })
})

// ── 7. The walkthrough a note starts (api/_walkthrough.ts) ──────────────────
//
// Krish, 2026-10-08: a note should start a Claude Code session that walks him
// through it. The fire runs on the server after `done`, so the read must land
// first and the stream may carry one more event. The card is the door: the
// link once a session started, and when one did not, a retry and the prompt
// to paste by hand. It never leaves him with nothing.

test.describe('the walkthrough a note starts', () => {
  const SESSION = 'https://claude.ai/code/session_01FIXTURE'

  test('the read lands before the session starts, and the card links to the session', async ({ page }) => {
    const withFire = sse(WEEK_OPEN, { kind: 'done', shape: 'week_open' }) +
      frame('walkthrough', { read_id: 'read-fixture-1', run: { status: 'started', session_url: SESSION } })
    await mockAll(page, { bodies: [withFire] })
    const gets: string[] = []
    await page.route('**/api/walkthrough*', r => {
      gets.push(r.request().url())
      return r.fulfill({ json: { ok: true, read_id: 'read-fixture-1', prompt: 'Run the walkthrough', run: { status: 'started', session_url: SESSION, error: null, attempts: 1 } } })
    })
    await talk(page, 'Two calls booked this week is what I want.')

    await expect(page.getByTestId('strategist-note-read')).toHaveAttribute('data-status', 'ready')
    const open = page.getByTestId('walkthrough-open')
    await expect(open).toBeVisible()
    await expect(open).toHaveAttribute('href', SESSION)
    expect(gets[0]).toContain('readId=read-fixture-1')
    await expect(page.getByTestId('walkthrough-start')).toHaveCount(0)
  })

  test('a session that did not start offers a retry and the prompt, and the retry opens it', async ({ page }) => {
    await mockAll(page)
    const posts: Array<Record<string, unknown>> = []
    let started = false
    await page.route('**/api/walkthrough*', r => {
      if (r.request().method() === 'POST') {
        posts.push(JSON.parse(r.request().postData() || '{}'))
        started = true
      }
      const run = started
        ? { status: 'started', session_url: SESSION, error: null, attempts: 2 }
        : { status: 'not_configured', session_url: null, error: 'not_configured: set the routine', attempts: 1 }
      return r.fulfill({ json: { ok: true, read_id: 'read-fixture-1', prompt: 'Run the walkthrough in .claude/skills/walkthrough/SKILL.md for strategist read read-fixture-1.', run } })
    })
    await talk(page, 'Two calls booked this week is what I want.')

    const card = page.getByTestId('walkthrough-card')
    await expect(card).toHaveAttribute('data-status', 'not_configured')
    await expect(page.getByTestId('walkthrough-why')).toHaveText('The Claude routine is not connected to Control Center yet.')
    await expect(page.getByTestId('walkthrough-prompt')).toContainText('.claude/skills/walkthrough/SKILL.md')
    await expect(page.getByTestId('walkthrough-copy')).toBeVisible()

    await page.getByTestId('walkthrough-start').click()
    await expect(page.getByTestId('walkthrough-open')).toHaveAttribute('href', SESSION)
    expect(posts).toEqual([{ readId: 'read-fixture-1' }])
  })
})
