// OpenAI text-embedding-3-small. Used for two purposes:
//
//   1. Near-dup detection at ingest (cosine > 0.92 = duplicate)
//   2. Narrative clustering across the content backlog (cosine > 0.78 = same
//      story, candidates for synthesis into one piece)
//
// Single dimension (1536) so the schema is fixed and pgvector ivfflat indexes
// can be tuned. ~$0.02 per 1k cards at current OpenAI pricing.

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIM = 1536

// Resolve the OpenAI key from the deploy env, falling back to the service-role-only
// app_secrets table (so clustering/dedup work even when the key isn't in the Vercel
// env). Cached per process. The anon client cannot read app_secrets (RLS), so this
// is safe. Importing _supabase is fine — every embedding caller runs server-side.
let cachedOpenAIKey: string | null | undefined
async function getOpenAIKey(): Promise<string | null> {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  if (cachedOpenAIKey !== undefined) return cachedOpenAIKey
  try {
    const { supabase } = await import('./_supabase.js')
    const { data } = await supabase.from('app_secrets').select('value').eq('key', 'openai_api_key').maybeSingle()
    cachedOpenAIKey = data && typeof (data as { value?: unknown }).value === 'string' ? (data as { value: string }).value : null
  } catch {
    cachedOpenAIKey = null
  }
  return cachedOpenAIKey
}

/** Truncate input so we never blow the model's context budget. The model
 *  itself accepts 8191 tokens but anything past ~1500 chars rarely adds
 *  semantic signal for the headline-and-snippet shape we feed it. */
function clip(s: string, max = 1500): string {
  const t = (s || '').trim().replace(/\s+/g, ' ')
  return t.length > max ? t.slice(0, max) : t
}

export interface EmbedInput {
  /** Headline or primary identifier. */
  title?: string | null
  /** Optional secondary text (thesis, snippet, summary). */
  body?: string | null
}

/** Build the canonical embedding text from a title + body pair. Same shape
 *  whether we're embedding a content_idea, a guest, or a visibility target so
 *  the call site is consistent. */
function buildInputText(parts: EmbedInput): string {
  const t = clip(parts.title || '')
  const b = clip(parts.body || '')
  if (!t && !b) return ''
  if (!b) return t
  if (!t) return b
  return `${t}\n\n${b}`
}

/** Compute one embedding. Returns null if OPENAI_API_KEY is missing or the
 *  input is empty — callers should treat null as "skip the semantic tier" and
 *  fall back to exact-match dedup. */
export async function embed(input: EmbedInput): Promise<number[] | null> {
  const apiKey = await getOpenAIKey()
  if (!apiKey) return null
  const text = buildInputText(input)
  if (!text) return null
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, dimensions: EMBEDDING_DIM }),
  })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(`openai_${r.status}:${txt.slice(0, 200)}`)
  }
  const j: any = await r.json().catch(() => null)
  const vec = j?.data?.[0]?.embedding
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) return null
  return vec
}

/** Batch embedding. Same shape, but pass an array. Returns a parallel array of
 *  embeddings (or null at positions where input was empty/invalid). */
export async function embedBatch(inputs: EmbedInput[]): Promise<(number[] | null)[]> {
  const apiKey = await getOpenAIKey()
  if (!apiKey) return inputs.map(() => null)
  const texts = inputs.map(buildInputText)
  // OpenAI accepts up to 2048 inputs per call. Chunk just in case.
  const out: (number[] | null)[] = new Array(inputs.length).fill(null)
  const CHUNK = 256
  for (let start = 0; start < texts.length; start += CHUNK) {
    const slice = texts.slice(start, start + CHUNK)
    const indices: number[] = []
    const nonEmpty: string[] = []
    slice.forEach((t, i) => { if (t) { indices.push(start + i); nonEmpty.push(t) } })
    if (!nonEmpty.length) continue
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: nonEmpty, dimensions: EMBEDDING_DIM }),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw new Error(`openai_${r.status}:${txt.slice(0, 200)}`)
    }
    const j: any = await r.json().catch(() => null)
    const items = Array.isArray(j?.data) ? j.data : []
    items.forEach((it: any, k: number) => {
      const idx = indices[k]
      if (typeof idx === 'number' && Array.isArray(it?.embedding) && it.embedding.length === EMBEDDING_DIM) {
        out[idx] = it.embedding
      }
    })
  }
  return out
}

/** Cosine similarity between two equal-dimension vectors. Returns 0 if either
 *  vector is degenerate. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

/** Serialize a number array into the pgvector text literal pgvector expects
 *  when written through PostgREST. */
export function vectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}
