// SUITE: revise — is an LLM-expanded brief better than the instruction as typed?
//
// The question behind this suite: "when this tool asks a model to do something,
// would it be better to first ask a model to rewrite the instruction toward the
// outcome, and use THAT as the brief?"
//
// ── WHY THIS SURFACE ─────────────────────────────────────────────────────────
// /api/content-ideas/:id/revise has the widest gap in the codebase between a
// very thick system prompt (persona, voice block, channel corpus, the guardrail
// kill-list, attached materials) and a very thin directive. If expansion pays
// anywhere here, it pays here.
//
// ── WHY THREE ARMS ───────────────────────────────────────────────────────────
// Reading the live data first changed the design. Every revise in the revision
// history ran from a PRESET chip, and each preset already carries a hand-written
// steer of 20-45 words in src/lib/contentEngine.ts. So the product already does
// brief expansion, statically, by hand. Testing "typed instruction vs expanded
// brief" would therefore have measured a path almost nobody takes, and would
// have compared the new idea against nothing rather than against the incumbent.
//
//   bare       the chip's label alone ("Punchier"). What revise would look like
//              with no hand-written hint. The floor.
//   hint       the hand-written hint that ships today. The incumbent.
//   llm-brief  the bare label expanded by a model call at request time. The
//              proposal.
//
// That yields the three numbers worth having: does expansion beat no expansion
// (hint and llm-brief vs bare), and does the dynamic version beat the one
// already written down (llm-brief vs hint)? Only the second decides whether
// there is anything to build.
//
// ── WHAT THIS CANNOT TELL YOU ────────────────────────────────────────────────
// The judge is a model applying the Five Standards rubric, not Krish. It
// measures conformance to a written bar. That is a fair proxy for "would this
// clear the gate" and a poor one for "does this sound like me". A win here is
// permission to try something in the product, never proof it is better.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  callClaude, corpusForChannel, laneToCorpusChannel, loadCorpus, loadVoiceBlock,
  materialsContext, readMaterials, sanitizeVoice, usageCost,
} from '../../../api/_content.js'
import { buildRevisePrompt, type ReviseContext } from '../../../api/_revisePrompt.js'
import { scoreStandards, standardsMean } from '../../../api/_standards.js'
import type { Suite, Variant, GenResult } from '../_types.mts'
import { UTILITY_MODEL } from '../../../api/_models.js'

const MODEL = UTILITY_MODEL
const TEMP = 0.5

/**
 * The steers under test, copied from src/lib/contentEngine.ts.
 *
 * Deliberately duplicated rather than imported: that file is a browser module
 * and this is a Node script, and more importantly an experiment should pin the
 * exact wording it measured. If the presets change, this list should be updated
 * consciously, and old reports stay interpretable.
 *
 * Chosen because all four appear in the live revision history.
 */
const PRESETS = [
  { value: 'punchier', label: 'Punchier', hint: 'Compress. Shorter declaratives, harder verb choices, uneven rhythm. Cut every word that the reader already understands.' },
  { value: 'shorter', label: 'Shorter', hint: 'Cut at least a third. Keep the sharpest sentences, lose the connective tissue.' },
  { value: 'harder-verdict', label: 'Harder ending', hint: 'Replace the ending with a hard, forward-looking verdict. No summary, no question, no CTA.' },
  { value: 'contrarian', label: 'More contrarian', hint: 'Sharpen the antagonist. Discard the lazy version of the take out loud ("Not X, Y") then commit to the spikier read. Spike points at the idea, never the reader.' },
] as const

export interface ReviseCase {
  id: string
  ideaId: string
  idea: string
  thesis: string | null
  contrarian: string | null
  body: string
  lane: string | null
  lane_slot: string | null
  preset: { value: string; label: string; hint: string }
  materials?: unknown
}

let ctxCache: { voice: string; corpus: string } | null = null
async function sharedContext() {
  if (!ctxCache) {
    const [voice, corpus] = await Promise.all([loadVoiceBlock(), loadCorpus()])
    ctxCache = { voice, corpus }
  }
  return ctxCache
}

async function contextFor(c: ReviseCase): Promise<ReviseContext> {
  const { voice, corpus } = await sharedContext()
  const materials = readMaterials({ materials: c.materials })
  return {
    voice,
    channelCorpus: corpusForChannel(corpus, laneToCorpusChannel(c.lane, c.lane_slot)),
    materialsBlock: materials.length ? `\n\n${materialsContext(materials)}` : '',
    idea: { idea: c.idea, thesis: c.thesis, contrarian: c.contrarian },
  }
}

/** One rewrite, with `directive` standing in for whatever the arm produced. */
async function generate(c: ReviseCase, directive: string): Promise<GenResult> {
  const ctx = await contextFor(c)
  const { system, user } = buildRevisePrompt(ctx, {
    // hint carries the directive, exactly as a preset chip does in the product.
    mode: 'feedback', value: c.preset.value, hint: directive, instruction: null,
    sourceText: c.body, selection: null, humour: false,
  })
  let usd = 0
  const t0 = Date.now()
  const out = await callClaude({
    system, user, model: MODEL, temperature: TEMP, maxTokens: 2600, timeoutMs: 150_000,
    onUsage: u => { usd += usageCost(u) },
  })
  return { output: sanitizeVoice(out.trim().replace(/^["'`]+|["'`]+$/g, '')), ms: Date.now() - t0, usd }
}

// ── The expansion step under test ────────────────────────────────────────────
//
// Written as the strongest honest version of the technique rather than a straw
// man: told what the downstream call already carries so it does not waste words
// restating the voice rules, and forbidden from adding intent, which is the
// failure mode that makes expansion actively harmful on a voice-critical
// surface. A weaker expander would make the incumbent look better than it is.
const EXPANDER_SYSTEM = [
  'You turn a terse editing instruction into a precise brief for a rewrite.',
  '',
  "The rewriter you are briefing ALREADY has: the full draft, the piece's thesis, Krish's voice reference, the channel corpus, the attached research materials, and a hard list of banned constructions. Do not restate any of that. Your brief is only about WHAT CHANGE TO MAKE.",
  '',
  'Given the instruction and the draft it applies to, write a brief that:',
  '  1. names the change in the instruction\'s own terms',
  '  2. points at the specific passages in THIS draft the change lands on',
  "  3. states what must not change (the argument, the evidence, the ending's verdict)",
  '',
  'HARD RULE: never add an objective the instruction does not contain. If it says "cut the middle", brief a cut, not a cut plus a sharper hook. Inventing intent is the one way this step makes the result worse, because the rewriter cannot tell your invention from his instruction.',
  '',
  'Return ONLY the brief. Under 120 words. No preamble.',
].join('\n')

async function expand(c: ReviseCase): Promise<{ brief: string; ms: number; usd: number }> {
  let usd = 0
  const t0 = Date.now()
  const brief = await callClaude({
    system: EXPANDER_SYSTEM,
    user: `INSTRUCTION: ${c.preset.label}\n\nPIECE: ${c.idea}${c.thesis ? `\nTHESIS: ${c.thesis}` : ''}\n\nDRAFT:\n${c.body.slice(0, 6000)}`,
    model: MODEL, temperature: 0.3, maxTokens: 400, timeoutMs: 60_000,
    onUsage: u => { usd += usageCost(u) },
  })
  return { brief: brief.trim(), ms: Date.now() - t0, usd }
}

const bare: Variant<ReviseCase> = {
  name: 'bare',
  note: 'the chip label alone, no hand-written steer — the floor',
  run: c => generate(c, c.preset.label),
  preview: c => previewWith(c, c.preset.label),
}

const hint: Variant<ReviseCase> = {
  name: 'hint',
  note: 'the hand-written preset steer that ships today — the incumbent',
  run: c => generate(c, c.preset.hint),
  preview: c => previewWith(c, c.preset.hint),
}

const llmBrief: Variant<ReviseCase> = {
  name: 'llm-brief',
  note: 'the chip label expanded into a brief by a model call, then used as the steer',
  async run(c) {
    const e = await expand(c)
    const g = await generate(c, e.brief)
    return { output: g.output, ms: g.ms + e.ms, usd: g.usd + e.usd }
  },
  preview: c => ({
    system: EXPANDER_SYSTEM,
    user: `INSTRUCTION: ${c.preset.label}\n\nPIECE: ${c.idea}\n\nDRAFT:\n${c.body.slice(0, 500)}…\n\n[the brief this returns then replaces the steer in the prompt shown above]`,
  }),
}

function previewWith(c: ReviseCase, directive: string) {
  return buildRevisePrompt(
    { voice: '<VOICE BLOCK>', channelCorpus: '<CHANNEL CORPUS>', materialsBlock: '', idea: { idea: c.idea, thesis: c.thesis, contrarian: c.contrarian } },
    { mode: 'feedback', value: c.preset.value, hint: directive, instruction: null, sourceText: c.body, selection: null, humour: false },
  )
}

export const suite: Suite<ReviseCase> = {
  name: 'revise',
  describe: 'bare instruction vs hand-written steer vs LLM-expanded brief, on the composer rewrite path',
  scale: 'Five Standards, mean of five 1-5 scores',
  variants: [bare, hint, llmBrief],
  groupOf: c => c.preset.value,

  async loadCases({ fixture, limit }) {
    let drafts: any[]
    if (fixture) {
      const raw = JSON.parse(readFileSync(resolve(process.cwd(), fixture), 'utf8'))
      drafts = Array.isArray(raw) ? raw : raw.cases
    } else {
      const { supabase } = await import('../../../api/_supabase.js')
      const { data, error } = await supabase
        .from('content_ideas')
        .select('id,idea,thesis,body,lane,lane_slot,meta')
        .not('body', 'is', null)
        .in('state', ['drafting', 'review', 'approved', 'published'])
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      drafts = (data || []).filter(r => String(r.body || '').length >= 900)
    }

    // Cross drafts with presets, interleaved by preset so a small --cases run
    // still covers every steer rather than four rewrites of one draft.
    const out: ReviseCase[] = []
    for (let d = 0; d < drafts.length && out.length < limit; d++) {
      for (let p = 0; p < PRESETS.length && out.length < limit; p++) {
        const r = drafts[(d + p) % drafts.length]
        const meta = (r.meta || {}) as any
        const preset = PRESETS[p]
        const id = `${r.id}:${preset.value}`
        if (out.some(o => o.id === id)) continue
        out.push({
          id,
          ideaId: r.id,
          idea: r.idea,
          thesis: r.thesis ?? null,
          contrarian: meta.contrarian ?? null,
          body: String(r.body),
          lane: r.lane ?? null,
          lane_slot: r.lane_slot ?? null,
          preset: { ...preset },
          materials: meta.materials,
        })
      }
    }
    return out
  },

  async judge(c, output) {
    const { corpus } = await sharedContext()
    const v = await scoreStandards(
      { idea: c.idea, thesis: c.thesis, draft: output, hasArtifact: false },
      { corpus, model: MODEL, timeoutMs: 90_000 },
    )
    return { score: standardsMean(v), detail: { preset: c.preset.value, scores: v.scores, quality: v.quality_score, failing: v.failing } }
  },
}
