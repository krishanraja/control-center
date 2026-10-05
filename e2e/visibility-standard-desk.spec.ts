import { test } from '@playwright/test'
import { mockAudit, auditTables, VISIBILITY_TARGETS } from './fixtures/audit'
import {
  standDownTriage, openSpeakingLane, gotoSpeakingLane,
  theHeroIsTheOneThatClears, itSaysWhatMakesItWorthIt,
  refusalsAreShownWithReasons, theEmptyStateIsHonest, theWindowStillDoesNotScroll,
} from './visibilityStandard'

/**
 * Nova's standard on the desk, at 1440x900 and 1920x1080.
 *
 * The twin of visibility-standard-phone.spec.ts. Both shells render their own
 * tree and nothing one proves carries over, which is the lesson the desk pass of
 * 2026-09-23 learned by fixing fifteen surfaces without once rendering the shell
 * Krish actually carries.
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
