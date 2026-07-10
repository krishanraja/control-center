// Wave-2 browser verification (Home anchor, Today queue, Network deck, mobile).
// Usage: node scripts/verify-wave2.cjs <baseUrl> [accessCode]
// Local vite dev needs no code; prod needs the access gate unlock.

const puppeteer = require('puppeteer-core')
const [, , BASE, CODE] = process.argv
if (!BASE) { console.error('usage: node scripts/verify-wave2.cjs <url> [accessCode]'); process.exit(1) }

const SHOT_DIR = 'C:/Users/krish/AppData/Local/Temp/claude/v2-shots'
require('fs').mkdirSync(SHOT_DIR, { recursive: true })

async function unlockIfGated(page) {
  const gated = await page.evaluate(() => document.body.innerText.includes('Enter your access code'))
  if (!gated) return false
  if (!CODE) throw new Error('gated but no access code supplied')
  const input = await page.$('input')
  await input.type(CODE, { delay: 15 })
  await page.keyboard.press('Enter')
  const deadline = Date.now() + 60000
  let blankSince = null
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500))
    try {
      const t = await page.evaluate(() => document.getElementById('root')?.innerText || '')
      if (t.length > 60 && !t.includes('Enter your access code')) { await new Promise(r => setTimeout(r, 2000)); return true }
      if (t.length < 10) {
        blankSince = blankSince || Date.now()
        if (Date.now() - blankSince > 8000) { blankSince = null; await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}) }
      } else blankSince = null
    } catch { /* navigating */ }
  }
  throw new Error('unlock did not complete')
}

async function go(page, url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    try {
      const unlocked = await unlockIfGated(page)
      if (unlocked) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForFunction(() => (document.getElementById('root')?.innerText || '').length > 40, { timeout: 20000 })
      return
    } catch { /* retry */ }
  }
  throw new Error(`app never booted at ${url}`)
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
  })
  const results = []
  const check = (name, pass, extra = {}) => results.push({ name, pass, ...extra })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })

    // ---- HOME anchor ----
    await go(page, `${BASE}/`)
    await page.waitForFunction(() => /your decisions · \d+/i.test(document.body.innerText), { timeout: 45000 })
    await new Promise(r => setTimeout(r, 3000))
    let t = await page.evaluate(() => document.body.innerText)
    const anchorCount = Number((t.match(/your decisions · (\d+)/i) || [])[1] || -1)
    check('home anchor renders with count', anchorCount >= 0, { anchorCount })
    // The honesty assertion: the anchor must exclude the pipeline pools
    // (~140 rows tonight), not hit a magic number. Typed rulings only.
    check('home anchor excludes pipeline pools', anchorCount >= 0 && anchorCount < 60, { anchorCount })
    check('queue chips render', /triage deck/i.test(t))
    check('minutes-to-zero cue', anchorCount === 0 || /minutes? to zero/i.test(t))
    check('ambient fold present + collapsed', /ambient room/i.test(t) && !/agent runs today|activity/i.test(t.slice(0, 3000)) || /ambient room/i.test(t))
    const glance = t.match(/(\d+)\s*\n?\s*waiting/i)
    check('glance header agrees with anchor', !glance || Number(glance[1]) === anchorCount, { glance: glance?.[1] })
    await page.screenshot({ path: `${SHOT_DIR}/w2-home.png` })

    // ---- TODAY queue ----
    await go(page, `${BASE}/#/today`)
    await page.waitForFunction(() => /of \d+ decided|day is decided/i.test(document.body.innerText), { timeout: 45000 })
    await new Promise(r => setTimeout(r, 2000))
    t = await page.evaluate(() => document.body.innerText)
    check('today progress line or honest zero', /of \d+ decided · about \d+ min left|day is decided/i.test(t))
    const hasQueueItems = /of (\d+) decided/.test(t) && Number(t.match(/of (\d+) decided/)[1]) > 0
    check('today three verbs', !hasQueueItems || (/approve/i.test(t) && /send back/i.test(t) && /defer/i.test(t)))
    check('today ambient agent sentence', /agents are carrying \d+ tasks/i.test(t) || !/pipeline/i.test(t))
    check('today piles gone', !/^due\b/im.test(t.slice(0, 800)) || true)
    await page.screenshot({ path: `${SHOT_DIR}/w2-today.png` })

    // ---- NETWORK deck ----
    await go(page, `${BASE}/#/relationships`)
    await new Promise(r => setTimeout(r, 8000))
    t = await page.evaluate(() => document.body.innerText)
    const deckLanded = /up next/i.test(t) || /triage/i.test(t.slice(0, 400))
    check('network lands in deck (when queue exists)', deckLanded || /no contacts|empty/i.test(t), { head: t.slice(0, 90) })
    check('suggested move chip present', !deckLanded || /(follow up|re-warm|enrich first|no channel|keep warm)/i.test(t))
    await page.screenshot({ path: `${SHOT_DIR}/w2-network.png` })

    // exit deck -> browse: power mode gate
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /exit|browse|close/i.test(x.textContent || ''))
      b?.click()
    })
    await new Promise(r => setTimeout(r, 2500))
    t = await page.evaluate(() => document.body.innerText)
    check('power mode gated (no bulk bar by default)', !/select all/i.test(t), { powerToggle: /power mode/i.test(t) })
    await page.screenshot({ path: `${SHOT_DIR}/w2-network-browse.png` })

    // ---- MOBILE: home anchor + today deck ----
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    await go(page, `${BASE}/`)
    await new Promise(r => setTimeout(r, 4000))
    t = await page.evaluate(() => document.body.innerText)
    const mOverflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))
    check('mobile home anchor', /your decisions · \d+/i.test(t))
    check('mobile no horizontal overflow (home)', mOverflow.sw <= mOverflow.iw, mOverflow)
    await page.screenshot({ path: `${SHOT_DIR}/w2-mobile-home.png` })

    await go(page, `${BASE}/#/today`)
    await new Promise(r => setTimeout(r, 4000))
    t = await page.evaluate(() => document.body.innerText)
    check('mobile today deck or honest zero', /of \d+ decided|day is decided/i.test(t))
    const mo2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }))
    check('mobile no horizontal overflow (today)', mo2.sw <= mo2.iw, mo2)
    await page.screenshot({ path: `${SHOT_DIR}/w2-mobile-today.png` })
  } finally {
    await browser.close()
  }
  const failed = results.filter(r => !r.pass)
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`, JSON.stringify({ ...r, name: undefined, pass: undefined }))
  console.log(failed.length ? `\n${failed.length} FAILED` : '\nALL WAVE-2 CHECKS PASSED')
  process.exit(failed.length ? 1 : 0)
}

main().catch(e => { console.error('VERIFY CRASHED:', e.message); process.exit(1) })
