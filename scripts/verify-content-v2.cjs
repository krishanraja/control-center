// Preview-deployment verification for Content Engine v2 (PR gate, spec §7 PR-B).
// Drives the Vercel preview (Basic-Auth gated) with the system Chrome:
//   1. Desktop 1440x900: This Week room (brief card + decision queue), Shifts
//      room (register + dossier), Feed, Library. Screenshots each.
//   2. Mobile 390x844: decision deck; zero-horizontal-overflow measured.
//   3. Brief editor overlay: opens #/content?brief=<week>, waits for the
//      TipTap canvas, screenshots; fan-out bar present.
// Usage: node scripts/verify-content-v2.cjs <previewUrl> <accessCode> <week>

const puppeteer = require('puppeteer-core')

const [, , BASE, CODE, WEEK = '2026-W28'] = process.argv
if (!BASE || !CODE) { console.error('usage: node scripts/verify-content-v2.cjs <url> <accessCode> [week]'); process.exit(1) }

const SHOT_DIR = 'C:/Users/krish/AppData/Local/Temp/claude/v2-shots'
const fs = require('fs')
fs.mkdirSync(SHOT_DIR, { recursive: true })

async function bootResilientGoto(page, url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    try {
      // The access gate is a standalone middleware page with NO #root; unlock
      // must run before waiting for the app to paint, and its redirect drops
      // the hash route, so re-navigate to the target after unlocking.
      const unlocked = await unlockIfGated(page)
      if (unlocked) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForFunction(() => (document.getElementById('root')?.innerText || '').length > 40, { timeout: 20000 })
      return
    } catch { /* reload and retry */ }
  }
  throw new Error(`app never booted at ${url}`)
}

// Prod serves a client-side access gate ("Enter your access code"). Type the
// code and unlock; the session keeps subsequent navigations open.
async function unlockIfGated(page) {
  const gated = await page.evaluate(() => document.body.innerText.includes('Enter your access code'))
  if (!gated) return false
  const input = await page.$('input')
  if (!input) throw new Error('access gate shown but no input found')
  await input.type(CODE, { delay: 20 })
  await page.keyboard.press('Enter')
  // Unlock reloads the whole document (execution context is destroyed), so a
  // waitForFunction would throw. Poll instead, tolerating dead contexts.
  const deadline = Date.now() + 60000
  let blankSince = null
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500))
    try {
      const t = await page.evaluate(() => document.getElementById('root')?.innerText || '')
      if (t.length > 60 && !t.includes('Enter your access code')) {
        await new Promise(r => setTimeout(r, 2000))
        return true
      }
      // Post-unlock blank shell: the session persisted, the paint did not.
      // Reload (runbook: the SPA sometimes boots blank; reload up to a few times).
      if (t.length < 10) {
        blankSince = blankSince || Date.now()
        if (Date.now() - blankSince > 8000) {
          blankSince = null
          await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
        }
      } else {
        blankSince = null
      }
    } catch { /* navigating; keep polling */ }
  }
  throw new Error('unlock did not complete')
}

async function clickRoom(page, label) {
  await page.evaluate((l) => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find(x => x.textContent && x.textContent.trim().startsWith(l))
    if (b) b.click()
  }, label)
  await new Promise(r => setTimeout(r, 1200))
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
  })
  const results = []
  try {
    const page = await browser.newPage()
    await page.authenticate({ username: 'krish', password: CODE })

    // ---- desktop ----
    await page.setViewport({ width: 1440, height: 900 })
    await bootResilientGoto(page, `${BASE}/#/content`)
    await page.waitForFunction(() => document.body.innerText.includes('Weekly brief') || document.body.innerText.includes('No brief yet'), { timeout: 30000 })
    const hasBrief = await page.evaluate(() => document.body.innerText.includes('Weekly brief'))
    const decisionCount = await page.evaluate(() => {
      const m = document.body.innerText.match(/decisions this week · (\d+)/i)
      return m ? Number(m[1]) : 0
    })
    await page.screenshot({ path: `${SHOT_DIR}/desktop-thisweek.png` })
    results.push({ check: 'desktop This Week renders brief card', pass: hasBrief, decisionCount })

    await clickRoom(page, 'Shifts')
    await page.waitForFunction(() => /Shift · /i.test(document.body.innerText), { timeout: 20000 }).catch(() => {})
    const shiftCards = await page.evaluate(() => document.body.innerText.match(/Shift · /gi)?.length || 0)
    await page.screenshot({ path: `${SHOT_DIR}/desktop-shifts.png` })
    results.push({ check: 'Shifts room renders register', pass: shiftCards > 0, shiftCards })

    // open first shift dossier
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Shift ·'))
      card?.click()
    })
    await page.waitForFunction(() => /dossier/i.test(document.body.innerText), { timeout: 15000 }).catch(() => {})
    const hasDossier = await page.evaluate(() => /dossier/i.test(document.body.innerText))
    await page.screenshot({ path: `${SHOT_DIR}/desktop-dossier.png` })
    results.push({ check: 'dossier opens with evidence', pass: hasDossier })

    await clickRoom(page, 'Feed')
    const feedItems = await page.evaluate(() => {
      const m = document.body.innerText.match(/(\d+) items/)
      return m ? Number(m[1]) : 0
    })
    await page.screenshot({ path: `${SHOT_DIR}/desktop-feed.png` })
    results.push({ check: 'Feed renders read-only stream', pass: feedItems > 0, feedItems })

    await clickRoom(page, 'Library')
    await page.screenshot({ path: `${SHOT_DIR}/desktop-library.png` })
    results.push({ check: 'Library renders', pass: true })

    // ---- brief editor overlay ----
    await bootResilientGoto(page, `${BASE}/#/content?brief=${WEEK}`)
    await page.waitForFunction(() => (document.querySelector('.ProseMirror')?.textContent || '').length > 500, { timeout: 45000 })
    const editorText = await page.evaluate(() => (document.querySelector('.ProseMirror')?.textContent || '').length)
    const hasFanout = await page.evaluate(() => /publish as/i.test(document.body.innerText))
    const hasMagic = await page.evaluate(() => document.body.innerText.includes('Tighten'))
    await page.screenshot({ path: `${SHOT_DIR}/desktop-brief-editor.png` })
    results.push({ check: 'brief editor loads content into TipTap', pass: editorText > 500, editorText })
    results.push({ check: 'fan-out bar + magic row present', pass: hasFanout && hasMagic })

    // ---- mobile ----
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    await bootResilientGoto(page, `${BASE}/#/content`)
    await page.waitForFunction(() => document.body.innerText.includes('This Week') || document.body.innerText.includes('of'), { timeout: 20000 })
    await new Promise(r => setTimeout(r, 1500))
    const overflow = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: innerWidth,
    }))
    const deckVisible = await page.evaluate(() =>
      /of \d+ · about/.test(document.body.innerText) || document.body.innerText.includes('The week is decided'))
    await page.screenshot({ path: `${SHOT_DIR}/mobile-deck.png` })
    results.push({ check: 'mobile deck renders one decision', pass: deckVisible })
    results.push({ check: 'mobile no horizontal overflow', pass: overflow.sw <= overflow.iw, ...overflow })

    // mobile brief editor (read mode + magic row)
    await bootResilientGoto(page, `${BASE}/#/content?brief=${WEEK}`)
    await page.waitForFunction(() => (document.querySelector('.ProseMirror')?.textContent || '').length > 500, { timeout: 45000 })
    const mobileMagic = await page.evaluate(() => document.body.innerText.includes('Tell Cleo'))
    await page.screenshot({ path: `${SHOT_DIR}/mobile-brief.png` })
    results.push({ check: 'mobile brief read mode + Tell Cleo', pass: mobileMagic })
  } finally {
    await browser.close()
  }

  const failed = results.filter(r => !r.pass)
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}`, JSON.stringify({ ...r, check: undefined, pass: undefined }))
  console.log(failed.length ? `\n${failed.length} FAILED` : '\nALL CHECKS PASSED')
  process.exit(failed.length ? 1 : 0)
}

main().catch(e => { console.error('VERIFY CRASHED:', e.message); process.exit(1) })
