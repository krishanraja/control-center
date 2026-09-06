import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

let failures = 0
const fail = (message: string) => { console.error(`FAIL: ${message}`); failures++ }
const read = (path: string) => readFileSync(path, 'utf8')
const includes = (source: string, expected: string, label: string) => {
  if (!source.includes(expected)) fail(`${label} is missing ${JSON.stringify(expected)}`)
}

const officialMark = read('public/mindmake-mark.svg')
const officialMarkHash = createHash('sha256').update(officialMark).digest('hex')
const expectedMarkHash = 'd1517af3047b6e4cd45f9e9613d4f4383b35b11e3408d659793925231360fae7'
if (officialMarkHash !== expectedMarkHash) {
  fail(`official Mindmake mark hash changed: expected ${expectedMarkHash}, received ${officialMarkHash}`)
}

const officialWordmark = read('public/mindmake-wordmark.svg')
const officialWordmarkHash = createHash('sha256').update(officialWordmark).digest('hex')
const expectedWordmarkHash = '57fd2cdef929de2035baf5b0405a152878b26f7eba39b17b1d4c03f2470b9737'
if (officialWordmarkHash !== expectedWordmarkHash) {
  fail(`official Mindmake wordmark hash changed: expected ${expectedWordmarkHash}, received ${officialWordmarkHash}`)
}

const officialDerivatives = {
  'public/apple-touch-icon.png': '76b12065970ff35f29fe37641eecb8ecc768df68e5d6cd9346eaf8ffcb03e3da',
  'public/favicon-16.png': 'b97f40e099b21255f4877cd7cb2aaed6491f972fe070c37f3d8129b5e7e2c22e',
  'public/favicon-32.png': '04b28333d4c4dac1aec80746acd819770ef913ff85eba0844d9efc23e1e027eb',
  'public/favicon-48.png': 'fc989d7a23ea5ad2abd0dfe89803684a2a15d8a7feb6867eb0ff7193e3334412',
  'public/favicon.png': '54b992e5199d46a5cfdad3da2330371926341519c86f496db32e8a2f00a99bb2',
  'public/favicon-180.png': '76b12065970ff35f29fe37641eecb8ecc768df68e5d6cd9346eaf8ffcb03e3da',
  'public/favicon.ico': '159eb3fab20467315fb36c6c4a6629a2d7a034f3b7af7088dcabeb5bb4334d50',
  'public/icon-192.png': '75482b3a845c5524536fadd899a2347a49209099043e9b94a5cc84af8844a8ed',
  'public/icon-512.png': 'f595f560340cfe1a793bc94113afece0490cb2c8b18a3409909c4aeb560067b1',
  'public/icon-maskable-512.png': 'f49559bc5325509c4de9ae1abde95d3f2148d809b050681bc73b33f26d13decb',
  'public/mindmake-og.png': '6b8798bc08b3c7b9fd033fa478888956f4209d5a6359d128bd69fbc4bc368d9a',
  'public/builtwithai-logo-wordmark.png': '271ab965dc51714be8c13c8a6bb8c7b2b60f4bf22caf51dda5a2928e295fd29f',
  'public/moneyofai-logo-wordmark.png': '1cdd6d7710c9970a1e86c8793b33acf6b3f63c81304aeb6efe84d392467322a6',
} as const

for (const [path, expected] of Object.entries(officialDerivatives)) {
  const base64 = readFileSync(path, 'base64')
  const actual = createHash('sha256').update(base64, 'base64').digest('hex')
  if (actual !== expected) fail(`official Mindmake derivative changed at ${path}: expected ${expected}, received ${actual}`)
}

const expectedPngSizes = {
  'public/favicon-16.png': [16, 16],
  'public/favicon-32.png': [32, 32],
  'public/favicon-48.png': [48, 48],
  'public/favicon.png': [512, 512],
  'public/favicon-180.png': [180, 180],
  'public/apple-touch-icon.png': [180, 180],
  'public/icon-192.png': [192, 192],
  'public/icon-512.png': [512, 512],
  'public/icon-maskable-512.png': [512, 512],
  'public/mindmake-og.png': [1200, 630],
  'public/builtwithai-logo-wordmark.png': [1200, 630],
  'public/moneyofai-logo-wordmark.png': [1200, 630],
} as const

for (const [path, [expectedWidth, expectedHeight]] of Object.entries(expectedPngSizes)) {
  const png = Buffer.from(readFileSync(path, 'base64'), 'base64')
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail(`${path} is not a PNG`)
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  if (width !== expectedWidth || height !== expectedHeight) {
    fail(`${path} dimensions changed: expected ${expectedWidth}x${expectedHeight}, received ${width}x${height}`)
  }
}

const ico = Buffer.from(readFileSync('public/favicon.ico', 'base64'), 'base64')
if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) !== 3) {
  fail('favicon.ico must contain a three-frame ICO directory')
} else {
  const sizes = [0, 1, 2].map(index => ico.readUInt8(6 + index * 16))
  if (sizes.join(',') !== '16,32,48') fail(`favicon.ico frames changed: expected 16,32,48, received ${sizes.join(',')}`)
}

const packageJson = read('package.json')
const main = read('src/main.tsx')
const tailwind = read('tailwind.config.js')
const css = read('src/index.css')
const sidebar = read('src/components/DesktopSidebar.tsx')
const mobileMark = read('src/components/mobile/Logomark.tsx')
const identity = read('src/components/shared/MindmakeIdentity.tsx')
const series = read('src/lib/publicSeries.ts')
const contentRooms = read('src/components/content-v2/ContentV2Tab.tsx')
const processing = read('src/components/shared/ProcessingOverlay.tsx')
const index = read('index.html')
const manifest = read('public/manifest.webmanifest')
const middleware = read('middleware.ts')

for (const dependency of [
  '@fontsource-variable/archivo',
  '@fontsource-variable/newsreader',
  '@fontsource-variable/source-serif-4',
  '@fontsource/ibm-plex-mono',
]) includes(packageJson, dependency, 'package.json')

for (const oldDependency of [
  '@fontsource-variable/bricolage-grotesque',
  '@fontsource-variable/fraunces',
  '@fontsource-variable/geist',
  '@fontsource-variable/geist-mono',
]) {
  if (packageJson.includes(oldDependency) || main.includes(oldDependency)) fail(`retired font remains active: ${oldDependency}`)
}

for (const family of ['Archivo Variable', 'Newsreader Variable', 'Source Serif 4 Variable', 'IBM Plex Mono']) {
  includes(tailwind, family, 'tailwind.config.js')
}

for (const opacity of ["8: '0.08'", "12: '0.12'", "92: '0.92'"]) {
  includes(tailwind, opacity, 'tailwind.config.js opacity contract')
}

for (const token of [
  '--bg-base: 10 16 13',
  '--ink: 230 237 232',
  '--accent: 127 227 180',
  '--accent-3: 224 164 74',
  '--bg-base: 242 241 234',
  '--accent: 47 111 81',
  '.text-strong',
  '.text-muted',
  '.text-faint',
  '--ambient-opacity: 0.07',
]) includes(css, token, 'src/index.css')

includes(sidebar, '<MindmakeIdentity', 'DesktopSidebar')
includes(mobileMark, 'MindmakeIdentity as Logomark', 'mobile Logomark compatibility export')
for (const [path, source] of [
  ['shared MindmakeIdentity', identity],
  ['index.html', index],
  ['manifest', manifest],
  ['middleware', middleware],
] as const) includes(source, '/mindmake-mark.svg', path)

includes(processing, '<MindmakeIdentity', 'ProcessingOverlay')
includes(identity, "/mindmake-wordmark.svg", 'shared MindmakeIdentity')
includes(identity, 'publicSeriesIdentity', 'shared series identity')
includes(series, "label: 'Built With AI'", 'public series labels')
includes(series, "label: 'The Money of AI'", 'public series labels')
includes(series, '54ea43b9771d3b263718a4d40cecc68167b7a718', 'public series provenance')
includes(contentRooms, "publicSeriesLabel('built')", 'Content v2 Built label')
includes(contentRooms, "publicSeriesLabel('paid')", 'Content v2 Money label')

for (const expected of ['/mindmake-wordmark.svg', '/mindmake-og.png']) {
  includes(middleware, expected, 'middleware public metadata')
}

for (const expected of [
  '/apple-touch-icon.png',
  '/mindmake-og.png',
  'og:image:width',
  'og:image:height',
]) includes(index, expected, 'index.html')

for (const expected of ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']) {
  includes(manifest, expected, 'manifest')
}

for (const source of [css, index, middleware]) {
  for (const retired of ['#8c80c8', '#6366f1', '#08070d', '#f2f1f8']) {
    if (source.toLowerCase().includes(retired)) fail(`retired Obsidian Aurora token ${retired} remains in active chrome`)
  }
}

if (failures) process.exit(1)
console.log(`Mindmake design authority: official mark ${officialMarkHash.slice(0, 12)}, official wordmark ${officialWordmarkHash.slice(0, 12)}, four type roles, ink/paper, mint/amber, shared chrome aligned`)
