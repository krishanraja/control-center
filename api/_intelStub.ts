import { supabase } from './_supabase.js'

// Every contact needs a contact_intelligence row, or it does not exist.
//
// network_search ranks on contact_intelligence.intel_doc and its embedding.
// A contacts row on its own is invisible to the Network tab, to the Pilots
// seed, to the guest scout and to every other surface that goes through the
// scorer: not low-ranked, absent. api/network/add-person.ts has always known
// this and writes both rows. The bulk paths never did, so 119 people sat in
// the corpus unfindable on 2026-09-16, which is the same failure migration
// 20260915240000 had to add an "invisible" counter for.
//
// A stub is enough to be found. The ci_rebuild_doc_trg trigger fires BEFORE
// INSERT and composes intel_doc from the CONTACTS row (name, title, company,
// location), so a stub with no judgment still yields "Jane Doe · VP Sales ·
// AdRoll · London" and is reachable by lexical search immediately. It is also
// marked embed_stale, so the next embedding pass picks it up rather than the
// row claiming a freshness it does not have.
//
// intel_method is 'pending' on purpose: it is NOT one of the eight real
// methods, so nothing can mistake a stub for a judgment, and the Network
// tab's thin-evidence badge keeps telling the truth about it.

export const STUB_METHOD = 'pending'

/**
 * Give every one of these contacts a contact_intelligence row if it has none.
 *
 * Best effort by design: an import that succeeded must not be reported as
 * failed because the stub write did not land. It returns how many rows it
 * created so a caller can say so, and never throws.
 */
export async function ensureIntelligenceRows(contactIds: string[]): Promise<number> {
  const ids = [...new Set(contactIds.filter(Boolean))]
  if (!ids.length) return 0
  try {
    const { data: have } = await supabase
      .from('contact_intelligence')
      .select('contact_id')
      .in('contact_id', ids)
    const seen = new Set((have || []).map(r => String((r as { contact_id: string }).contact_id)))
    const missing = ids.filter(id => !seen.has(id))
    if (!missing.length) return 0

    const { error } = await supabase.from('contact_intelligence').insert(
      // network_tier is the one NOT NULL column with no default. Everyone
      // arriving through an import is owned network until something says
      // otherwise; claiming closer would overstate the relationship, and the
      // tier is what the ranker's hard filters read.
      missing.map(contact_id => ({ contact_id, network_tier: '4_owned_network', intel_method: STUB_METHOD })),
    )
    if (error) return 0
    return missing.length
  } catch {
    return 0
  }
}
