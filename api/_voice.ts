import { supabase } from './_supabase.js'

/**
 * The canonical voice for outbound correspondence drafted in Krish's name.
 *
 * Returns the full krish-voice skill (system_config.content_voice_block) — the
 * same block the content composer grounds in — so every outbound surface (leads,
 * customers, guests, contacts) writes in one voice, not a thin summary. Falls
 * back to the legacy short ruleset (krish_voice_rules) if the block is ever
 * empty, so a missing row degrades gracefully instead of dropping voice entirely.
 *
 * The Cleo Email Draft workflow's `Build Prompt` node injects whatever this
 * returns as "VOICE RULES (follow exactly)", on top of the node's own
 * email-specific scaffolding (120-word cap, subject shape). So the two compose:
 * the full voice plus the format guardrails.
 */
export async function loadOutboundVoice(): Promise<string> {
  const { data } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', ['content_voice_block', 'krish_voice_rules'])
  const byKey: Record<string, string> = {}
  for (const row of data || []) {
    const v = (row as any).value
    byKey[(row as any).key] = typeof v === 'string' ? v : (v ? JSON.stringify(v) : '')
  }
  return (byKey['content_voice_block'] || byKey['krish_voice_rules'] || '').trim()
}
