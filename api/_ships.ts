import { supabase } from './_supabase.js'

// The one server-side ship writer. A ship is something that left the machine
// toward another human (docs/PILOT-LAYER.md). Every route that records one
// outside the operator's own Log button goes through here, with a dedup key,
// so a retry or a second tap can never double count.
//
// The manual POST in api/pilot/ships.ts stays as it is: that is the operator's
// browser, which has no dedup key and needs none.

export interface ShipInput {
  /** One of the fixed channels: email, publish, invoice, ask, approach, campaign, other. */
  channel: string
  description: string
  /** Stable per event, e.g. ask:<id>, room:<id>, idea:<id>, brief:<week>. */
  dedup_key: string
  occurred_at?: string
  external_ref?: string | null
}

export async function recordShip(input: ShipInput): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('ships').upsert({
    occurred_at: input.occurred_at || new Date().toISOString(),
    source: 'manual' as const,
    channel: input.channel,
    description: input.description.slice(0, 500),
    external_ref: input.external_ref ?? null,
    dedup_key: input.dedup_key,
  }, { onConflict: 'dedup_key' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
