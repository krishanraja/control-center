/**
 * Drives artifacts/triage-desk.html in a real browser against a fake Supabase
 * connector, and asserts on what reached the wire rather than on what the page
 * appears to say. Run from the repo root: `node artifacts/triage-desk.probe.mjs`.
 *
 * It is not in `e2e/` on purpose: the desk is a published artifact, not part of
 * the Vite build, so `vite preview` has nothing to serve and CI has nothing to
 * run. `testDir: './e2e'` in playwright.config.ts keeps it out of the suite.
 *
 * WHY IT EXISTS, AND WHY IT ASSERTS THE WAY IT DOES.
 *
 * The first version of this probe reported correct code as broken, twice over:
 * it matched /buried_at/ against the SQL log, which is in EVERY read because
 * each stage filters `buried_at is null`; and it clicked `button.ghost`, which
 * is "Keep this note" in DOM order, not "Not a piece". A test that indicts
 * working code is worse than no test - it sends you rewriting a fix that
 * already landed. So: precise selectors, by role and exact name, and SQL
 * assertions specific enough to tell a read from a write.
 *
 * The cases are the two failure modes this page has actually shipped:
 * a decision that vanishes without recording anything, and a receipt that
 * claims success over a write the database refused.
 */
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DESK = 'file://' + join(dirname(fileURLToPath(import.meta.url)), 'triage-desk.html')
const CHROME = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const FORMATS = [
  { slug: 'split_the_bill', label: 'split.the.bill', hero: false, cadence_label: 'Wednesdays', mandate: 'What it costs and who pays.' },
  { slug: 'mind_the_gap', label: 'mind.the.gap', hero: true, cadence_label: 'Fridays', mandate: 'The gap between claim and reality.' },
  { slug: 'lift_the_lid', label: 'lift.the.lid', hero: false, cadence_label: 'standing', mandate: 'Sharper or dependent.' },
]
const SEEDS = [
  { id: '11111111-1111-4111-8111-111111111111', idea: 'Seed one: who pays for the inference', thesis: 'A thesis.', created_at: '2026-09-20T10:00:00Z', brand_fit_score: 9, pillar_id: null, source_url: null, lane_slot: null, auto: false },
  { id: '22222222-2222-4222-8222-222222222222', idea: 'Seed two: the gap between the claim and the receipt', thesis: 'Another thesis.', created_at: '2026-09-20T11:00:00Z', brand_fit_score: 7, pillar_id: null, source_url: null, lane_slot: 'split_the_bill', auto: true },
]

let failures = 0
const ok = (label, got, want = true) => {
  const pass = got === want
  if (!pass) failures++
  console.log(`   ${pass ? 'ok  ' : 'FAIL'} ${label}${pass ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`)
}

/** A page wired to a fake connector. `refuseLedger` rejects only the INSERT. */
async function open(browser, { seeds, refuseLedger = false }) {
  const page = await browser.newPage()
  const errs = []
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message))
  await page.addInitScript(({ seeds, formats, refuseLedger }) => {
    window.__sql = []
    const rows = q => {
      window.__sql.push(q)
      if (/insert into public\.content_edit_events/.test(q)) {
        if (refuseLedger) { const e = new Error('new row violates check constraint'); e.code = 'tool_error'; throw e }
        return []
      }
      if (/from public\.venture_formats/.test(q)) return formats
      if (/count\(\*\) filter/.test(q)) return [{ triage: seeds.length, draft: 0, review: 0 }]
      if (/^select id from public\.content_ideas/m.test(q.trim())) return [{ id: seeds[0].id }]
      if (/lane_slot is null and state in/.test(q)) return seeds
      if (/from public\.system_config/.test(q)) return [{ value: '' }]
      return []
    }
    window.claude = {
      use: async n => n === 'mcp'
        ? { callTool: async (s, t, a) => ({ payload: rows(a.query) }), listTools: async () => ({ servers: [] }) }
        : null,
    }
  }, { seeds, formats: FORMATS, refuseLedger })
  await page.goto(DESK)
  await page.waitForSelector('article.card')
  return { page, errs, since: async n => (await page.evaluate(() => window.__sql)).slice(n), mark: () => page.evaluate(() => window.__sql.length) }
}

const browser = await chromium.launch({ executablePath: CHROME })

console.log('A. the first press asks why, and writes nothing')
{
  const { page, errs, since, mark } = await open(browser, { seeds: SEEDS })
  const card = page.locator('article.card').first()
  await card.locator('textarea.notes').fill('This is a money story wearing a gap headline.')
  ok('the foot counts the note before any press',
    await card.locator('.notefoot .sep').textContent(), '45 characters will travel with your next press')
  const at = await mark()
  await card.getByRole('button', { name: 'Not a piece' }).click()
  ok('nothing written on the first press', (await since(at)).length, 0)
  ok('five reasons offered', await card.locator('.reasons button').count(), 5)
  ok('the card is still a card', await card.evaluate(n => n.classList.contains('settled')), false)

  console.log('B. the second press buries, records, and says so')
  const at2 = await mark()
  await card.locator('.reasons button', { hasText: 'Wrong register' }).click()
  await page.waitForSelector('article.card.settled')
  const wrote = await since(at2)
  const event = wrote.find(q => /insert into public\.content_edit_events/.test(q)) || ''
  ok('buried_at set', wrote.some(q => /set buried_at=now\(\)/.test(q)))
  ok('a binned event', /'binned'/.test(event))
  ok('carrying the reason code', event.includes("'wrong_register'"))
  ok('carrying his words', event.includes('money story wearing a gap headline'))
  const receipt = await page.locator('article.card.settled').first().innerText()
  ok('the receipt names the reason', receipt.includes('Set aside: wrong register'))
  ok('the receipt confirms the note', receipt.includes('your note saved with it, 45 characters'))
  ok('the receipt confirms the record', receipt.includes('recorded for the compiler'))

  console.log('C. undo puts it back, and retracts in the ledger')
  const at3 = await mark()
  await page.locator('article.card.settled').first().getByRole('button', { name: 'Undo' }).click()
  await page.waitForSelector('article.card:not(.settled) textarea.notes')
  const undone = await since(at3)
  ok('unburied', undone.some(q => /set buried_at=null/.test(q)))
  ok('retraction recorded', undone.some(q => /content_edit_events/.test(q) && /triage_undo/.test(q)))

  console.log('D. a subchannel pick grades whatever guessed first')
  const two = page.locator('article.card', { hasText: 'Seed two' })
  await two.locator('textarea.notes').fill('Right subject, wrong question.')
  const at4 = await mark()
  await two.getByRole('button', { name: 'mind.the.gap', exact: true }).click()
  await page.waitForSelector('article.card.settled')
  const events = (await since(at4)).filter(q => /insert into public\.content_edit_events/.test(q))
  ok('two rows: the grade and the choice', events.length, 2)
  ok('the auto-triage guess graded wrong', events.some(q => /magic_rejected/.test(q) && /wrong_subchannel/.test(q)))
  ok('his note on both', events.filter(q => q.includes('Right subject, wrong question')).length, 2)
  ok('no page errors', errs.join('; '), '')
  await page.close()
}

console.log('E. a refused ledger is never shown as a tick')
{
  const { page } = await open(browser, { seeds: [SEEDS[0]], refuseLedger: true })
  await page.locator('textarea.notes').first().fill('a note worth keeping')
  await page.getByRole('button', { name: 'Not a piece' }).click()
  await page.locator('.reasons button', { hasText: 'Thin evidence' }).click()
  await page.waitForSelector('article.card.settled')
  const settled = page.locator('article.card.settled').first()
  ok('marked as a warning, not a success', await settled.evaluate(n => n.classList.contains('settled-warn')))
  ok('says the record was refused', (await settled.innerText()).includes('the ledger refused this record'))
  ok('the note is rescued onto the idea', (await settled.innerText()).includes('kept on the idea instead'))
  ok('the page banner is up', (await page.locator('#ledger-state').innerText()).startsWith('Decisions are not being recorded'))

  console.log('F. the end of a batch keeps the receipts')
  ok('the batch end is offered', await page.locator('.batch-end').count(), 1)
  ok('the receipt survived it', await page.locator('article.card.settled').count(), 1)
  await page.close()
}

await browser.close()
console.log(failures ? `\n${failures} FAILED` : '\nall checks passed')
process.exit(failures ? 1 : 0)
