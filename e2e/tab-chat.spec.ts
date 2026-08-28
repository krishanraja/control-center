import { test, expect, type Page } from '@playwright/test'
import { answerPilotGate } from './pilot-gate-mock'

/**
 * Talk-to-this-tab E2E, deterministic: /api/tab-chat and every Supabase call
 * is mocked.
 *
 * The three things worth protecting here are the three that were built
 * deliberately:
 *
 *   1. The panel opens from the desktop pill AND from ⌘/.
 *   2. The input HAS FOCUS when it opens. This is the whole input design —
 *      Krish dictates with Wispr Flow, which types into whatever is focused,
 *      so an unfocused box means dictation lands nowhere and the feature is
 *      dead on the surface it was built for.
 *   3. The request carries the ACTIVE TAB, so the answer is scoped to what is
 *      on screen rather than to the business in general.
 *
 * The route is fulfilled as JSON rather than SSE on purpose. The client reads
 * the response's own content type and falls back to a single delta, so mocking
 * JSON exercises the fallback path a non-streaming deploy would take.
 */

const REPLY =
  'Two of the three failing workflows share one dead Gmail credential, so one re-auth clears both.\n\n' +
  'Next: re-auth the Gmail credential on HARO Ingestion, which has failed 94 of 184 runs in 28 days.'

/** Captures what the client actually posted, so scoping can be asserted. */
interface Captured { tab?: string; lane?: string | null; messages?: Array<{ role: string; content: string }> }

async function mockAll(page: Page, captured: Captured[]) {
  // Catch-alls FIRST: Playwright matches the most recently registered route,
  // so a specific route registered later wins. Registering these last would
  // swallow every specific handler below.
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }))
  await page.route('**/realtime/**', r => r.abort())
  await page.route('**/api/**', r => r.fulfill({ json: { ok: true } }))

  // The pill lives behind the pilot gate: TabChatHost takes
  // suppressed={fullScreenOverlayOpen}, and the morning check-in IS a
  // full-screen overlay, so inside the gate's window there is no pill to
  // click. A fixed afternoon stops the gate deciding to fire at all;
  // answerPilotGate covers the case where it decides anyway. The blanket
  // **/api/** mock above is not enough — { ok: true } is not the shape the
  // gate reads, so it renders regardless.
  await page.clock.setFixedTime(new Date('2026-08-20T18:30:00Z'))
  await answerPilotGate(page)

  await page.route('**/api/tab-chat', async r => {
    captured.push(JSON.parse(r.request().postData() || '{}'))
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: REPLY }),
    })
  })
}

test.describe('talk to this tab', () => {
  test('the pill opens a focused input and scopes the question to the active tab', async ({ page }) => {
    const captured: Captured[] = []
    await mockAll(page, captured)

    await page.goto('/#/os')
    const pill = page.getByTestId('tab-chat-pill')
    await expect(pill).toBeVisible()
    // Tab-aware label, so it is obvious what the question will be about.
    await expect(pill).toContainText('OS')

    await pill.click()

    const input = page.getByTestId('tab-chat-input')
    await expect(input).toBeVisible()
    // The load-bearing assertion. Dictation goes to the focused element.
    await expect(input).toBeFocused()

    await input.fill('what is broken right now?')
    await input.press('Enter')

    await expect(page.getByText(/one re-auth clears both/)).toBeVisible()

    expect(captured).toHaveLength(1)
    expect(captured[0].tab).toBe('os')
    expect(captured[0].messages?.at(-1)?.content).toBe('what is broken right now?')
  })

  test('⌘/ opens it too, and the thread is sent back on the second turn', async ({ page }) => {
    const captured: Captured[] = []
    await mockAll(page, captured)

    await page.goto('/#/growth')
    // Growth is a lazy chunk. Wait for the pill before pressing anything: the
    // hotkey listener mounts with the host, so a key sent during the chunk
    // fetch lands on nothing and the failure looks like a broken shortcut.
    await expect(page.getByTestId('tab-chat-pill')).toBeVisible()
    // ControlOrMeta, not Meta: the handler accepts either modifier (Cmd on
    // macOS, Ctrl elsewhere) and these browsers run on Linux, where Meta is
    // the Super key and nothing is listening for it.
    await page.keyboard.press('ControlOrMeta+/')

    const input = page.getByTestId('tab-chat-input')
    await expect(input).toBeFocused()

    await input.fill('why is signups flat?')
    await input.press('Enter')
    await expect(page.getByText(/one re-auth clears both/)).toBeVisible()

    // The second question is always the real one, so the first exchange has to
    // travel with it. Ask Marcus posts only { question } and cannot do this.
    await input.fill('why?')
    await input.press('Enter')

    await expect.poll(() => captured.length).toBe(2)
    expect(captured[1].tab).toBe('growth')
    expect(captured[1].messages).toHaveLength(3)
    expect(captured[1].messages?.[0].role).toBe('user')
    expect(captured[1].messages?.[1].role).toBe('assistant')
    expect(captured[1].messages?.at(-1)?.content).toBe('why?')
  })

  test('a failed answer says so instead of rendering as an empty reply', async ({ page }) => {
    const captured: Captured[] = []
    await mockAll(page, captured)
    await page.route('**/api/tab-chat', r => r.fulfill({ status: 500, json: { error: 'anthropic_failed' } }))

    await page.goto('/#/home')
    await page.getByTestId('tab-chat-pill').click()
    const input = page.getByTestId('tab-chat-input')
    await input.fill('anything?')
    await input.press('Enter')

    // An empty bubble would be indistinguishable from "Marcus had nothing to
    // say", which is the failure mode this whole pass exists to remove.
    await expect(page.getByText(/could not answer|500|failed/i).first()).toBeVisible()
  })
})
