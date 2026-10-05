import { test } from '@playwright/test'
import { mockAudit, auditTables, VISIBILITY_TARGETS } from './fixtures/audit'
import {
  standDownTriage, openSpeakingLane, gotoSpeakingLane,
  theHeroIsTheOneThatClears, itSaysWhatMakesItWorthIt,
  refusalsAreShownWithReasons, theEmptyStateIsHonest, theWindowStillDoesNotScroll,
} from './visibilityStandard'

/**
 * Nova's standard on the phone, at 390x844 and 360x640.
 *
 * The twin of visibility-standard-desk.spec.ts, and the half that bites. The
 * mobile shell renders its own tree inside a zoom: 1.2 root with a fixed
 * BottomNav, so nothing the desk pass proved carries over, and 360x640 is the
 * size that has broken this exact surface before: the phone no-scroll gate
 * records "Visibility's triage card was left 55px of a 640px screen by its own
 * chrome, with the guest's name, their pitch and every research link clipped
 * out of the card". The hero added here is taller than that card, so it gets
 * its own narrow proof rather than relying on the gate alone.
 *
 * Every row here is mocked, so this proves the SURFACE honours the verdicts and
 * shows the refusals. That the model's judgement is any good is a different
 * question, held by scripts/check-visibility-standard.mts, which runs the
 * arithmetic over the real cases.
 */

test.describe.configure({ mode: 'serial' })

test('the hero is the one stage that clears all three floors', async ({ page }) => {
  await standDownTriage(page)
  await mockAudit(page)
  await openSpeakingLane(page)
  await theHeroIsTheOneThatClears(page)
  await theWindowStillDoesNotScroll(page)
})

test('it says who is in the room, why him and what the angle is', async ({ page }) => {
  await standDownTriage(page)
  await mockAudit(page)
  await openSpeakingLane(page)
  await itSaysWhatMakesItWorthIt(page)
})

test('a refused target is shown with its reason as a sentence', async ({ page }) => {
  await standDownTriage(page)
  await mockAudit(page)
  await openSpeakingLane(page)
  await refusalsAreShownWithReasons(page)
  await theWindowStillDoesNotScroll(page)
})

test('with nothing clearing the bar the lane is empty and says why', async ({ page }) => {
  await standDownTriage(page)
  // Every row refused. This is close to the live corpus: applied to the real
  // table today, the take lane is empty, which is the correct answer and the
  // state the surface most needs to get right.
  await mockAudit(page, {
    ...auditTables(),
    visibility_targets: VISIBILITY_TARGETS.map(t => ({
      ...t,
      score_version: 1,
      verdict: 'rejected',
      reject_reason: 'visibility_wrong_audience',
      room_score: 24, standing_score: 70, only_him_score: 31, visibility_score: 24,
    })),
  })
  await gotoSpeakingLane(page)
  await theEmptyStateIsHonest(page, '#/people?lane=visibility')
  await theWindowStillDoesNotScroll(page)
})
