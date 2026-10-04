import { supabase } from './_supabase.js'

// "Is this address or profile already someone?" asked of every handle a
// person has had, not only the one on their row.
//
// A merge keeps the loser's email and LinkedIn as identities on the survivor
// (migration 20261004040000), so contacts.email_normalized no longer holds
// every address in the network. A creator that probes only that column would
// make the merged-away person again the next time their old address arrives.
// Every path that creates a contact asks this after its own probes.

export async function contactForHandle(email: string | null | undefined, linkedin: string | null | undefined): Promise<string | null> {
  if (!email && !linkedin) return null
  try {
    const { data, error } = await supabase.rpc('contact_for_handle', { p_email: email || null, p_linkedin: linkedin || null })
    if (error || !data) return null
    return String(data)
  } catch {
    // Before the migration lands the function does not exist; the caller's own
    // probes still ran.
    return null
  }
}
