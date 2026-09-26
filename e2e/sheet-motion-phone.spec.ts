import { test, expect } from '@playwright/test'
import { mockAudit } from './fixtures/audit'

/**
 * A bottom sheet rises straight up, and nothing behind it re-blurs per frame.
 *
 * Both were live on 2026-09-26 and together made every drawer on the phone
 * judder. The sheet's entrance keyframe animated `transform`, which replaced
 * the `-translate-x-1/2` that centres it, so the More drawer rose with its
 * left edge at 195px on a 390px screen (half of it off the right side) and
 * jumped 195px left on the frame the animation ended. Under it, the scrim
 * carried a full-screen `backdrop-filter` over the ambient field, which
 * animates forever, so the phone re-blurred the whole viewport every frame.
 *
 * This samples the sheet's box on every animation frame from the tap until it
 * settles. Against the old keyframe it records 195 then 0.
 */
test('the More drawer rises without moving sideways, over an unblurred scrim', async ({ page }) => {
  await mockAudit(page)
  await page.goto('/#/home')
  await expect(page.getByRole('button', { name: 'More' })).toBeVisible()

  await page.evaluate(() => {
    const w = window as unknown as { __sheetLefts: number[] }
    w.__sheetLefts = []
    let frames = 0
    const tick = () => {
      const el = document.querySelector<HTMLElement>('[data-slot="dialog-content"]')
      if (el) w.__sheetLefts.push(Math.round(el.getBoundingClientRect().left))
      if (++frames < 90) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible()
  await page.waitForTimeout(700)

  const lefts = await page.evaluate(() => (window as unknown as { __sheetLefts: number[] }).__sheetLefts)
  expect(lefts.length, 'the sheet was never sampled').toBeGreaterThan(5)
  const settled = lefts[lefts.length - 1]
  expect(lefts.filter(l => Math.abs(l - settled) > 1), `sheet left edge per frame: ${lefts.join(',')}`).toEqual([])

  const blur = await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-slot="dialog-overlay"]')!).backdropFilter)
  expect(blur).toBe('none')
})

test('tapping a tab highlights it and routes there', async ({ page }) => {
  await mockAudit(page)
  await page.goto('/#/home')
  const nav = page.getByRole('navigation', { name: 'Primary' })
  const growth = nav.getByRole('button', { name: 'Growth' })
  await expect(growth).toBeVisible()
  await growth.click()
  await expect(growth).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveURL(/#\/growth/)
})
