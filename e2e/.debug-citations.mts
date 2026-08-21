import { chromium, type Route } from '@playwright/test'
const WEEK = '2026-W33'
const BODY = [
  '# T', '', '## The clues', '',
  '- **Lead one.** [1] What it tells you: x.', '',
  '## Sources', '[1] https://example.com/a16z',
].join('\n')
const BRIEF = { ok: true, brief: { id: 'b1', week: WEEK, title: 'T', status: 'in_review', sections: {}, body_md: BODY, versions: [], stats: {}, formats: [], assembled_at: new Date().toISOString(), approved_at: null, pushed_at: null } }
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH })
const page = await b.newPage()
await page.route('**/api/**', (r: Route) => r.fulfill({ json: { ok: true } }))
await page.route('**/rest/v1/**', (r: Route) => r.fulfill({ json: [] }))
await page.route('**/realtime/**', (r: Route) => r.abort())
await page.route('**/api/briefs/notes', (r: Route) => r.fulfill({ json: { ok: true, notes: [] } }))
await page.route(`**/api/briefs/${WEEK}`, (r: Route) => r.fulfill({ json: BRIEF }))
await page.goto(`http://127.0.0.1:4173/#/content?brief=${WEEK}`)
await page.waitForTimeout(2500)
const dump = async (label: string) => {
  const els = await page.getByText('Sources').all()
  const info = await Promise.all(els.map(async e => `${await e.evaluate(n => n.tagName + ':' + (n.textContent||'').slice(0,60))}`))
  console.log(label, JSON.stringify(info))
  console.log('  canvas md head:', (await page.locator('.brief-canvas .ProseMirror').innerText()).split('\n').slice(-4).join(' | '))
}
await dump('initial(on)')
await page.getByRole('button', { name: 'Citations on' }).click()
await page.waitForTimeout(800)
await dump('after off-click')
await page.getByRole('button', { name: 'Citations off' }).click()
await page.waitForTimeout(800)
await dump('after on-click')
await b.close()
