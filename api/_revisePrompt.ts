// _revisePrompt — the prompt behind /api/content-ideas/:id/revise.
//
// Lifted out of the route for the same reason _finalPass, _humor, _ladder and
// _trendGate already live in their own modules: a prompt that is assembled
// inline inside a handler cannot be read, diffed, or measured without standing
// up the whole request. Revise is the most-used generative surface in the
// composer, so it is the one whose wording most deserves to be A/B-able.
//
// This module is deliberately free of I/O. Everything it needs — the voice
// block, the channel corpus slice, the materials block — is loaded by the
// caller and passed in, so an experiment can hold that context fixed and vary
// only the wording, which is the whole point of an experiment.

import { VOICE_GUARDRAILS } from './_content.js'
import { buildHumourSystem } from './_humor.js'

export type ReviseMode = 'tone' | 'length' | 'zoom' | 'feedback' | 'humor'
export const REVISE_MODES: readonly ReviseMode[] = ['tone', 'length', 'zoom', 'feedback', 'humor'] as const

export const ZOOM_FALLBACK = 'Zoom into the single sharpest angle and expand only that. Discard the rest.'

export interface ReviseContext {
  /** system_config.content_voice_block */
  voice: string
  /** corpusForChannel(...) for the channel being written FOR. */
  channelCorpus: string
  /** materialsContext(...) output, or '' when the piece carries no materials. */
  materialsBlock: string
  idea?: { idea?: string | null; thesis?: string | null; contrarian?: string | null } | null
}

export interface ReviseRequest {
  mode: ReviseMode | string
  /** Preset value ('punchier', 'adapt-linkedin') or 'custom' for free text. */
  value?: string | null
  /** Rich steer text carried by a preset chip. */
  hint?: string | null
  /** Free-text feedback Krish typed himself. */
  instruction?: string | null
  /** The draft currently on screen. */
  sourceText: string
  /** A substring of sourceText to rewrite in place, when the edit is local. */
  selection?: string | null
  humour: boolean
}

/** The one-line steer that tells the model what change to make. */
export function buildDirective(r: Pick<ReviseRequest, 'mode' | 'value' | 'hint' | 'instruction'>): string {
  if (r.mode === 'zoom') return r.hint || ZOOM_FALLBACK
  return r.hint || r.instruction || `Apply this change: ${r.value}.`
}

export function buildReviseSystem(ctx: ReviseContext, r: Pick<ReviseRequest, 'value' | 'humour'>): string {
  if (r.humour) {
    return buildHumourSystem({
      register: r.value || 'witty',
      voice: ctx.voice,
      channelCorpus: ctx.channelCorpus,
      materialsBlock: ctx.materialsBlock,
    })
  }
  const corpusBlock = ctx.channelCorpus
    ? `\n\nCHANNEL CORPUS (the mandate, audience, and bar for this channel — bend the draft toward THIS, not a generic rewrite):\n${ctx.channelCorpus}`
    : ''
  return [
    'You are Cleo, rewriting a draft in Krish Raja\'s voice. Krish is a British-Australian founder-operator in Brooklyn who runs a production AI agent fleet. Founder-practitioner, two gears, compression, the "Not X, Y" clarifier, hard-verdict endings.',
    '',
    ctx.voice ? `VOICE REFERENCE:\n${ctx.voice}` : '',
    corpusBlock,
    '',
    VOICE_GUARDRAILS,
    ctx.materialsBlock,
    '',
    'Return ONLY the rewritten text. No preamble, no explanation, no quotes around it.',
  ].filter(Boolean).join('\n')
}

export function buildReviseUser(ctx: ReviseContext, r: ReviseRequest): string {
  const directive = buildDirective(r)
  const extra = r.instruction && r.instruction !== directive
    ? `\nAlso apply this specific feedback: ${r.instruction}`
    : ''
  const i = ctx.idea
  const head = i
    ? `IDEA: ${i.idea}${i.thesis ? `\nTHESIS: ${i.thesis}` : ''}${i.contrarian ? `\nCONTRARIAN ANGLE: ${i.contrarian}` : ''}\n\n`
    : ''

  const inPlace = !!(r.selection && r.sourceText.includes(r.selection))
  if (inPlace) {
    return `${head}Rewrite ONLY the SELECTED passage below. ${directive}${extra}\n\nFULL DRAFT (for context, do not return it):\n${r.sourceText}\n\nSELECTED PASSAGE (return only the rewritten version of this):\n${r.selection}`
  }
  return `${head}Rewrite the draft below. ${directive}${extra}\n\nDRAFT:\n${r.sourceText}`
}

export function buildRevisePrompt(ctx: ReviseContext, r: ReviseRequest): { system: string; user: string } {
  return { system: buildReviseSystem(ctx, r), user: buildReviseUser(ctx, r) }
}
