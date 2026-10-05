import { expect, type Page } from '@playwright/test'

/**
 * The assertions for Nova's standard, shared by the desk and phone specs so the
 * two cannot drift. Both shells render their own tree, so nothing one proves
 * carries over, and both have to hold.
 *
 * Written against the complaint, which is the specification: the output has to
 * be unmissable, it has to say what makes each opportunity worth it, and a weak
 * target has to be visibly refused with its reason rather than silently
 * dropped. Four assertions, one per clause, plus the no-scroll invariant
 * because the surface is tall and that is the way a change here breaks the gate.
 */

/** Visibility auto-opens its triage cockpit over a lane with more than eight
 *  untriaged rows, and the cockpit replaces the whole board. Seeding the same
 *  dismissed-for-today flag a returning reader carries is how you get to the
 *  board; clicking the deck instead would make every test here depend on a
 *  different surface. Same helper as e2e/events-lane.spec.ts. */
export async function standDownTriage(page: Page) {
  await page.addInitScript(() => {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    try {
      localStorage.setItem('cc:triage-dismissed', JSON.stringify({ guests: today, visibility: today }))
    } catch { /* private mode: the deck opens and the spec fails loudly */ }
  })
}

/** Open People, Visibility, Speaking and press. The board settles over a couple
 *  of renders as guests and targets land; clicking into that detaches the
 *  button mid-gesture. */
export async function openSpeakingLane(page: Page) {
  await gotoSpeakingLane(page)
  await expect(page.getByTestId('worth-taking')).toBeVisible({ timeout: 15_000 })
}

/**
 * The navigation half, without the assertion, so the empty-state test can reuse
 * it with a different fixture.
 *
 * The first load of a cold project renders the shell before the board, and on a
 * 1920 desk and on both phones the lane tabs were not in the tree within the
 * default five seconds while 1440 happened to make it. Waiting on the Guests tab
 * first, then on the one being clicked, is the same two-step
 * e2e/events-lane.spec.ts uses and for the same reason: the board settles across
 * a couple of renders as guests and targets land, and clicking into that
 * detaches the button mid-gesture.
 */
export async function gotoSpeakingLane(page: Page) {
  await page.goto('/#/people?lane=visibility')
  await expect(page.getByRole('button', { name: /^Guests/ }).first()).toBeVisible({ timeout: 20_000 })
  const tab = page.getByRole('button', { name: /^Speaking/ }).first()
  await expect(tab).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1600)
  await tab.click()
  await leaveDeckMode(page)
}

/**
 * The phone's swipe deck owns the whole screen, and it opens on its own.
 *
 * `useSwipeTriage` in MobileGuests enters deck mode at eight untriaged rows and
 * does not consult the dismissed-for-today flag that the desktop board reads, so
 * `standDownTriage` is not enough on a phone: the deck replaces the board,
 * including the hero. The populated fixture always has more than eight, as the
 * real queue does, so this is the state a reader actually arrives in.
 *
 * Clicking Exit is the real affordance a reader uses, so the specs go through it
 * rather than reaching into the hook's state. Harmless on the desk, where the
 * strip is not on screen.
 */
export async function leaveDeckMode(page: Page) {
  const exit = page.getByRole('button', { name: /^Exit$/ }).first()
  if (await exit.isVisible().catch(() => false)) {
    await exit.click()
    await page.waitForTimeout(500)
  }
}

/**
 * 1. ONE opportunity, and it is the one that clears all three floors.
 *
 * The fixture gives the set exactly one `take`. The old hero ranked by nearest
 * deadline and then by relevance_score, which is two scales in one column, so
 * it pointed at whichever row Nova happened to have written. This asserts the
 * hero is the row the standard chose and not the row with the biggest number.
 */
export async function theHeroIsTheOneThatClears(page: Page) {
  const hero = page.getByTestId('worth-taking')
  await expect(hero).toBeVisible()
  const text = (await hero.textContent()) || ''

  expect(text, 'the hero names the stage').toContain('Worth taking')

  // The three axes, all three, because the headline number is their minimum and
  // the reader has to be able to see which one is carrying it.
  const axes = page.getByTestId('worth-taking-axes')
  await expect(axes).toBeVisible()
  for (const label of ['Room', 'Platform', 'Only you']) {
    expect((await axes.textContent()) || '', `the ${label} axis is shown`).toContain(label)
  }

  // Not one of the refused rows. The fixture's refusals all describe a room of
  // journalists, so that sentence appearing in the hero means a refused row has
  // reached the one focal surface on the tab.
  expect(text, 'a refused row has reached the hero').not.toContain('report on decisions rather than make them')
}

/**
 * 2. It says what makes it worth it, at the point of action.
 *
 * Krish's words: "an incredible opportunity for me". That is carried by who is
 * in the room, why him, why now and the angle, and all four have to sit between
 * the headline and the button. If he has to open a detail panel to find out
 * what the button means, the layout failed.
 */
export async function itSaysWhatMakesItWorthIt(page: Page) {
  const hero = page.getByTestId('worth-taking')
  // On a phone the angle stays on screen and "why you, and why now" folds
  // behind one tap, because all three expanded put the card at 781px in a 533px
  // frame at 360x640 and left the primary action 448px below the fold. Nothing
  // is removed, so the assertion goes through the tap the reader would make.
  const more = hero.getByRole('button', { name: /Why you, and why now/i })
  if (await more.isVisible().catch(() => false)) {
    await more.click()
    await page.waitForTimeout(300)
  }
  const text = (await hero.textContent()) || ''
  for (const label of ['Why you', 'The angle']) {
    expect(text, `the hero carries "${label}"`).toContain(label)
  }
  // Who is in the room is the `sub`, so it is prose rather than a label.
  expect(text, 'who is actually in the room').toMatch(/owners|managing directors|founders/i)
  // The action does the thing, and it is a record rather than a send.
  await expect(hero.getByRole('button', { name: /Mark applied/ })).toBeVisible()
}

/**
 * 3. A weak target is visibly refused, with its reason.
 *
 * The rule this replaces lived in Nova's brief as "if I cannot enrich a
 * candidate to green or amber quality, DO NOT write the row", so a refusal left
 * no trace at all. The panel is collapsed by default and the reason is a
 * sentence, never a raw code at a reader.
 */
export async function refusalsAreShownWithReasons(page: Page) {
  const panel = page.getByTestId('refused-by-standard')
  await expect(panel).toBeVisible()
  const header = (await panel.textContent()) || ''
  expect(header, 'the count of refusals is stated').toMatch(/\d+ refused/)
  expect(header, 'rows the standard has not reached are a queue length, not a verdict')
    .toMatch(/not reached yet|too little on the page/)

  await panel.getByRole('button', { name: /Refused by the standard/ }).click()
  const open = (await panel.textContent()) || ''

  // A sentence, not a code. Any raw code reaching a reader is the defect.
  expect(open, 'the reason is a sentence').toMatch(
    /does not contain anyone who can move a decision|practitioners, not the people who buy|press and commentators|slot is bought|anybody could give/,
  )
  expect(open, 'a raw reject code is printed at the reader').not.toContain('visibility_wrong_audience')
}

/**
 * 4. The lane is allowed to be empty, and says which kind of empty.
 *
 * Three different facts: the standard has never run, it ran and nothing cleared
 * the bar, or there is nothing in the queue. Collapsing them into one line is
 * how a lane goes fifteen days without a row while nothing on screen says so.
 * Proved by serving a set where every row is refused.
 */
export async function theEmptyStateIsHonest(page: Page, route: string) {
  const empty = page.getByTestId('worth-taking-empty')
  await expect(empty).toBeVisible()
  expect(await empty.getAttribute('data-state')).toBe('nothing-clears')
  const text = (await empty.textContent()) || ''
  expect(text, 'the empty state names the standard rather than apologising').toMatch(
    /Nothing clears the bar/,
  )
  expect(text, 'it says why, in the three conditions').toMatch(/decision-maker in the room/)
  expect(text, 'it says when it last judged').toMatch(/Last judged/)
  // And it is not filled with the next best thing.
  expect(text, 'the empty state is carrying an opportunity anyway').not.toMatch(/Mark applied/)
  expect(route).toBeTruthy()
}

/** The invariant the surface is most likely to break, measured the same way the
 *  two gates measure it. The hero is tall; a change here that overflows the
 *  shell would otherwise only show up in the gate run. */
export async function theWindowStillDoesNotScroll(page: Page) {
  const windowScroll = await page.evaluate(() => Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    document.body.scrollHeight - window.innerHeight,
    0,
  ))
  expect(windowScroll, 'the window scrolls with the standard surface on screen')
    .toBeLessThanOrEqual(2)
}
