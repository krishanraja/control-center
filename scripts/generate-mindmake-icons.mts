import { readFileSync, writeFileSync } from 'node:fs'
import { chromium, type Page } from '@playwright/test'

type SquareIcon = {
  path: string
  size: number
  markWidth: number
  background: string
  transparent?: boolean
}

const mark = readFileSync('public/mindmake-mark.svg', 'utf8')
const wordmark = readFileSync('public/mindmake-wordmark.svg', 'utf8')

const browser = await chromium.launch({ headless: true })

async function renderSquare(page: Page, icon: SquareIcon) {
  await page.setViewportSize({ width: icon.size, height: icon.size })
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; }
      body {
        display: grid;
        place-items: center;
        overflow: hidden;
        background: ${icon.transparent ? 'transparent' : icon.background};
      }
      svg { display: block; width: ${icon.markWidth}px; height: auto; }
    </style>
    ${mark}
  `)
  await page.screenshot({ path: icon.path, omitBackground: icon.transparent })
}

try {
  const page = await browser.newPage()

  // Browser favicons retain transparency. Installed-app icons use Mindmake ink
  // so the official mint mark survives light launchers, dark launchers and OS
  // masks. The maskable mark is only 50% of the canvas, safely inside the
  // platform's central 80% minimum safe zone.
  for (const icon of [
    { path: 'public/favicon-16.png', size: 16, markWidth: 14, background: 'transparent', transparent: true },
    { path: 'public/favicon-32.png', size: 32, markWidth: 28, background: 'transparent', transparent: true },
    { path: 'public/favicon-48.png', size: 48, markWidth: 42, background: 'transparent', transparent: true },
    { path: 'public/favicon.png', size: 512, markWidth: 440, background: 'transparent', transparent: true },
    { path: 'public/favicon-180.png', size: 180, markWidth: 100, background: '#0a100d' },
    { path: 'public/apple-touch-icon.png', size: 180, markWidth: 100, background: '#0a100d' },
    { path: 'public/icon-192.png', size: 192, markWidth: 108, background: '#0a100d' },
    { path: 'public/icon-512.png', size: 512, markWidth: 288, background: '#0a100d' },
    { path: 'public/icon-maskable-512.png', size: 512, markWidth: 256, background: '#0a100d' },
  ] satisfies SquareIcon[]) {
    await renderSquare(page, icon)
  }

  // ICO can embed PNG payloads directly. Building its directory here keeps the
  // 16/32/48px fallback reproducible without a machine-level image tool.
  const faviconFrames = [16, 32, 48].map(size => ({
    size,
    png: Uint8Array.from(readFileSync(`public/favicon-${size}.png`)),
  }))
  const directorySize = 6 + 16 * faviconFrames.length
  const payloadSize = faviconFrames.reduce((sum, frame) => sum + frame.png.length, 0)
  const faviconIco = new Uint8Array(directorySize + payloadSize)
  const icoView = new DataView(faviconIco.buffer)
  icoView.setUint16(0, 0, true)
  icoView.setUint16(2, 1, true)
  icoView.setUint16(4, faviconFrames.length, true)
  let payloadOffset = directorySize
  faviconFrames.forEach((frame, index) => {
    const entry = 6 + 16 * index
    faviconIco[entry] = frame.size
    faviconIco[entry + 1] = frame.size
    icoView.setUint16(entry + 4, 1, true)
    icoView.setUint16(entry + 6, 32, true)
    icoView.setUint32(entry + 8, frame.png.length, true)
    icoView.setUint32(entry + 12, payloadOffset, true)
    faviconIco.set(frame.png, payloadOffset)
    payloadOffset += frame.png.length
  })
  writeFileSync('public/favicon.ico', faviconIco)

  await page.setViewportSize({ width: 1200, height: 630 })
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; }
      body {
        display: grid;
        place-items: center;
        overflow: hidden;
        background:
          radial-gradient(70% 95% at 84% 18%, rgba(127,227,180,.13), transparent 64%),
          radial-gradient(55% 80% at 12% 96%, rgba(224,164,74,.08), transparent 68%),
          #0a100d;
      }
      main { display: flex; align-items: center; gap: 58px; }
      .mark svg { display: block; width: 190px; height: auto; }
      .wordmark svg { display: block; width: 590px; height: auto; }
    </style>
    <main>
      <div class="mark">${mark}</div>
      <div class="wordmark">${wordmark}</div>
    </main>
  `)
  await page.screenshot({ path: 'public/mindmake-og.png' })
} finally {
  await browser.close()
}

console.log('Generated official Mindmake favicon, install icons and social card.')
