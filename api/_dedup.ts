import { supabase } from './_supabase.js'
import { canonicalUrl, emailNorm, linkedinNorm, titleNorm, contentHash } from './_text.js'
import { embed, vectorLiteral } from './_embeddings.js'

// Shared tiered dedup. Called from every ingest path (content-ideas POST,
// leads/import, contacts/import, guests/import, visibility-targets) plus the
// HTTP endpoint that N8N workflows hit before insert.
//
// Tiers, cheap to expensive:
//   1. Exact canonical-identity match (URL / email / linkedin) — duplicate
//   2. Exact title or content-hash match within recency window — duplicate
//   3. Embedding cosine > 0.92 within recency window — duplicate (syndicated)
//   4. Otherwise — not a duplicate
//
// The semantic tier (3) is skipped if OPENAI_API_KEY is missing, so the
// utility degrades gracefully in environments without it.

export type DedupTable = 'content_ideas' | 'leads' | 'contacts' | 'guests' | 'visibility_targets'

export interface DedupInput {
  /** Primary identifier-ish URL: source URL for content, profile URL for people, event URL for visibility. */
  url?: string | null
  /** Title-equivalent: headline for content, event title for visibility. */
  title?: string | null
  /** Free text used for content_hash + embedding (snippet / body / summary). */
  text?: string | null
  /** Person identity fields where applicable. */
  email?: string | null
  linkedin?: string | null
  /** Recency window in days for tier 2/3 (default 30). */
  recencyDays?: number
}

export interface DedupResult {
  is_duplicate: boolean
  match_id: string | null
  match_reason: 'canonical_url' | 'email' | 'linkedin' | 'title_norm' | 'content_hash' | 'embedding' | null
  similarity: number | null
  /** Whatever canonical keys we computed — callers reuse them at insert time. */
  keys: {
    canonical_url: string | null
    email_norm: string | null
    linkedin_url_norm: string | null
    personal_url_norm: string | null
    event_url_norm: string | null
    title_norm: string | null
    content_hash: string | null
    embedding: number[] | null
  }
}

const RECENCY_DEFAULT = 30
const SIM_DEDUP = 0.92

interface TableSpec {
  /** Exact-match columns to check first (tier 1). Order matters: first hit wins. */
  identityColumns: { col: string; value: (i: DedupInput, keys: DedupResult['keys']) => string | null }[]
  /** Title-equivalent column (tier 2). */
  titleColumn: string | null
  /** Content-hash column (tier 2). */
  contentHashColumn: string | null
  /** Embedding column (tier 3). */
  embeddingColumn: string | null
  /** Created-at column for recency window. */
  recencyColumn: string
}

const SPECS: Record<DedupTable, TableSpec> = {
  content_ideas: {
    identityColumns: [{ col: 'canonical_url', value: (_i, k) => k.canonical_url }],
    titleColumn: 'title_norm',
    contentHashColumn: 'content_hash',
    embeddingColumn: 'embedding',
    recencyColumn: 'created_at',
  },
  leads: {
    identityColumns: [
      { col: 'email_norm', value: (_i, k) => k.email_norm },
      { col: 'linkedin_url_norm', value: (_i, k) => k.linkedin_url_norm },
    ],
    titleColumn: null,
    contentHashColumn: null,
    embeddingColumn: 'identity_embedding',
    recencyColumn: 'created_at',
  },
  contacts: {
    identityColumns: [
      { col: 'email_normalized', value: (_i, k) => k.email_norm },
      { col: 'linkedin_url_norm', value: (_i, k) => k.linkedin_url_norm },
    ],
    titleColumn: null,
    contentHashColumn: null,
    embeddingColumn: 'identity_embedding',
    recencyColumn: 'created_at',
  },
  guests: {
    identityColumns: [
      { col: 'email_norm', value: (_i, k) => k.email_norm },
      { col: 'linkedin_url_norm', value: (_i, k) => k.linkedin_url_norm },
      { col: 'personal_url_norm', value: (_i, k) => k.personal_url_norm },
    ],
    titleColumn: null,
    contentHashColumn: null,
    embeddingColumn: 'identity_embedding',
    recencyColumn: 'created_at',
  },
  visibility_targets: {
    identityColumns: [{ col: 'event_url_norm', value: (_i, k) => k.event_url_norm }],
    titleColumn: 'title_norm',
    contentHashColumn: null,
    embeddingColumn: 'title_embedding',
    recencyColumn: 'created_at',
  },
}

/** Compute the canonical-identity fields the table cares about. Cheap — pure
 *  string normalization, no IO. */
export function computeKeys(table: DedupTable, input: DedupInput): DedupResult['keys'] {
  const url = canonicalUrl(input.url)
  return {
    canonical_url: table === 'content_ideas' ? url : null,
    email_norm: emailNorm(input.email),
    linkedin_url_norm: linkedinNorm(input.linkedin),
    personal_url_norm: table === 'guests' ? canonicalUrl(input.url) : null,
    event_url_norm: table === 'visibility_targets' ? url : null,
    title_norm: input.title ? titleNorm(input.title) : null,
    content_hash: input.text ? contentHash(input.text) : null,
    embedding: null,
  }
}

/** The tiered check. Returns is_duplicate=true on the first hit; embedding
 *  generation (the only network call) is only triggered if tiers 1-2 pass. */
export async function checkDuplicate(table: DedupTable, input: DedupInput): Promise<DedupResult> {
  const spec = SPECS[table]
  const keys = computeKeys(table, input)
  const recencyDays = input.recencyDays ?? RECENCY_DEFAULT
  const sinceISO = new Date(Date.now() - recencyDays * 86_400_000).toISOString()

  // ── Tier 1: identity columns (any hit wins) ────────────────────────────────
  for (const ic of spec.identityColumns) {
    const v = ic.value(input, keys)
    if (!v) continue
    const { data } = await supabase
      .from(table)
      .select('id')
      .eq(ic.col, v)
      .limit(1)
      .maybeSingle()
    if (data?.id) {
      return {
        is_duplicate: true,
        match_id: data.id,
        match_reason: (ic.col.endsWith('email_norm') || ic.col === 'email_normalized')
          ? 'email'
          : ic.col.startsWith('linkedin')
          ? 'linkedin'
          : 'canonical_url',
        similarity: 1,
        keys,
      }
    }
  }

  // ── Tier 2a: exact title_norm match within window ──────────────────────────
  if (spec.titleColumn && keys.title_norm) {
    const { data } = await supabase
      .from(table)
      .select('id')
      .eq(spec.titleColumn, keys.title_norm)
      .gte(spec.recencyColumn, sinceISO)
      .limit(1)
      .maybeSingle()
    if (data?.id) {
      return { is_duplicate: true, match_id: data.id, match_reason: 'title_norm', similarity: 1, keys }
    }
  }

  // ── Tier 2b: exact content_hash match within window ────────────────────────
  if (spec.contentHashColumn && keys.content_hash) {
    const { data } = await supabase
      .from(table)
      .select('id')
      .eq(spec.contentHashColumn, keys.content_hash)
      .gte(spec.recencyColumn, sinceISO)
      .limit(1)
      .maybeSingle()
    if (data?.id) {
      return { is_duplicate: true, match_id: data.id, match_reason: 'content_hash', similarity: 1, keys }
    }
  }

  // ── Tier 3: embedding similarity within window ─────────────────────────────
  if (spec.embeddingColumn && process.env.OPENAI_API_KEY) {
    const embedTitle = input.title || input.url || null
    const embedBody = input.text || null
    try {
      const vec = await embed({ title: embedTitle, body: embedBody })
      if (vec) {
        keys.embedding = vec
        // pgvector cosine distance via PostgREST: use the RPC pattern. We
        // build a tiny inline RPC name per table to avoid one growing god-RPC.
        const { data } = await supabase.rpc('dedup_nearest', {
          p_table: table,
          p_column: spec.embeddingColumn,
          p_vector: vectorLiteral(vec),
          p_since: sinceISO,
          p_threshold: SIM_DEDUP,
        })
        if (Array.isArray(data) && data.length > 0 && data[0]?.id) {
          return {
            is_duplicate: true,
            match_id: data[0].id,
            match_reason: 'embedding',
            similarity: typeof data[0].similarity === 'number' ? data[0].similarity : null,
            keys,
          }
        }
      }
    } catch {
      // Embedding failures are non-fatal — fall through to "not a duplicate"
      // and let the row insert. The unique partial indexes are the backstop.
    }
  }

  return { is_duplicate: false, match_id: null, match_reason: null, similarity: null, keys }
}

/** When a duplicate is detected at ingest, this records the new source as
 *  provenance on the matched row instead of dropping the info. Callers do this
 *  themselves if they want to be specific (e.g. merge meta.duplicate_sources
 *  into a content_ideas row); this helper is the boring default. */
export async function recordDuplicateSource(
  table: DedupTable,
  matchedId: string,
  source: { source_type?: string | null; source_ref?: string | null; source_url?: string | null; at?: string },
): Promise<void> {
  // We only do this for content_ideas today — other tables don't have a
  // dedicated provenance JSONB column. Extend per-table as needed.
  if (table !== 'content_ideas') return
  const { data: row } = await supabase
    .from('content_ideas')
    .select('meta')
    .eq('id', matchedId)
    .maybeSingle()
  const meta = (row?.meta && typeof row.meta === 'object') ? row.meta : {}
  const sources = Array.isArray((meta as any).duplicate_sources) ? (meta as any).duplicate_sources.slice() : []
  sources.push({
    source_type: source.source_type || null,
    source_ref: source.source_ref || null,
    source_url: source.source_url || null,
    at: source.at || new Date().toISOString(),
  })
  // Cap at 25 entries to bound JSONB growth on a story that keeps re-arriving.
  const capped = sources.slice(-25)
  await supabase
    .from('content_ideas')
    .update({ meta: { ...meta, duplicate_sources: capped }, updated_at: new Date().toISOString() })
    .eq('id', matchedId)
}
