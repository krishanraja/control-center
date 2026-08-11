import { supabase } from './_supabase.js'

// `system_config.north_star` used to be the store behind Home's mission card:
// a single free-text string with an API write path that no UI ever called. It
// was last written 2026-04-14 and still read "$20K MRR within 60 days" in
// August, because a string has no target date and so nothing can detect that
// it expired.
//
// The OS rung of the goal ladder is the store now. This keeps the key
// resolvable for readers outside this repo (agent briefs, n8n nodes) by
// deriving it from that rung after any write that can touch it. Nothing in
// Control Center should read it: see scripts/check-goal-ladder.mts.
export async function syncNorthStar(): Promise<void> {
  const { data, error } = await supabase
    .from('goals')
    .select('title, priority, created_at')
    .eq('horizon', 'os')
    .eq('status', 'active')
    .order('priority', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  // A mirror is never worth failing a goal write for. If the read fails, the
  // key keeps its previous value, which is strictly better than blanking it.
  if (error) return

  const value = (data || [])
    .map(g => String((g as { title: string }).title || '').trim())
    .filter(Boolean)
    .join('. ')

  await supabase.from('system_config').upsert({
    key: 'north_star',
    value: value ? value + '.' : '',
    updated_at: new Date().toISOString(),
  })
}
