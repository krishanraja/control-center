// The video format list exists twice on purpose: the picker in
// src/lib/contentEngine.ts (client) and the structure + prompt in
// api/_video.ts (server, which owns what gets asked of the model). The repo
// already does this for FactoryChannel and says "keep the two in step" in a
// comment; this checks it instead of hoping.
//
// A drift here is quiet and nasty: the UI offers a length the server rejects
// with "duration required", which reads as a broken button.
//   npx tsx scripts/check-video-formats.mts
import { VIDEO_FORMATS as CLIENT } from '../src/lib/contentEngine.js'
import { VIDEO_FORMATS as SERVER, videoFormat } from '../api/_video.js'

let fail = 0
const bad = (m: string) => { console.log(`FAIL ${m}`); fail++ }

const cIds = CLIENT.map(f => f.id)
const sIds = SERVER.map(f => f.id)

for (const id of cIds) if (!sIds.includes(id)) bad(`client offers "${id}", server does not accept it`)
for (const id of sIds) if (!cIds.includes(id)) bad(`server accepts "${id}", client never offers it`)

for (const c of CLIENT) {
  const s = SERVER.find(x => x.id === c.id)
  if (!s) continue
  if (s.label !== c.label) bad(`"${c.id}" label differs: client "${c.label}", server "${s.label}"`)
  if (s.seconds !== c.seconds) bad(`"${c.id}" seconds differ: client ${c.seconds}, server ${s.seconds}`)
  if (s.words !== c.words) bad(`"${c.id}" words differ: client ${c.words}, server ${s.words}`)
}

// Each length must carry its own structure, or the whole point is lost: a
// shared shape means the long formats are the short ones with padding.
const shapes = new Set(SERVER.map(f => f.shape))
if (shapes.size !== SERVER.length) bad('two formats share a structure; each length needs its own shape')
for (const f of SERVER) {
  if (f.shape.length < 120) bad(`"${f.id}" has no real structure, just a length`)
  // ~150 spoken words a minute. Wrong here and the model is handed a budget
  // that does not match the label it is writing to.
  const expected = Math.round((f.seconds / 60) * 150)
  if (Math.abs(f.words - expected) > expected * 0.35) {
    bad(`"${f.id}" targets ${f.words} words for ${f.seconds}s; ~${expected} is the 150wpm figure`)
  }
}

if (!videoFormat('60s')) bad('videoFormat() cannot resolve a known id')
if (videoFormat('90s')) bad('videoFormat() resolved an id that is not offered')

console.log(fail === 0
  ? `PASS ${CLIENT.length} formats, client and server agree, each with its own structure`
  : `${fail} FAILURES`)
process.exit(fail ? 1 : 0)
