import { test, expect } from '@playwright/test'
import { mockAudit } from './fixtures/audit'
import { standDownTriage, gotoSpeakingLane } from './visibilityStandard'

/**
 * Evidence for one question: what does a refused target actually look like.
 *
 * Behind VISIBILITY_SHOTS=1 like the other shot specs. It opens the refusals
 * and scrolls the board to them, because the panel sits below the hero and a
 * screenshot of the fold proves only that the panel exists.
 */
test('refused targets, scrolled to', async ({ page }) => {
  test.skip(process.env.VISIBILITY_SHOTS !== '1', 'VISIBILITY_SHOTS=1 to capture evidence')
  await standDownTriage(page)
  await mockAudit(page)
  await gotoSpeakingLane(page)
  const panel = page.getByTestId('refused-by-standard')
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await panel.getByRole('button', { name: /Refused by the standard/ }).click()
  await panel.scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  const vp = page.viewportSize()
  await page.screenshot({ path: `shots/visibility-refusals-open-${vp?.width}x${vp?.height}.png` })
})
