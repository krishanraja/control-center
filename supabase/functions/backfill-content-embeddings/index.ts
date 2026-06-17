// One-off server-side backfill: embed the active-window content_ideas that lack
// an embedding, using the OpenAI key from app_secrets and the service-role client
// (so it bypasses RLS and doesn't depend on the Vercel env). Mirrors the embed
// step of api/content-ideas/cluster.ts. Safe to re-run; only touches rows where
// embedding IS NULL.
//
// Deployed via the Supabase MCP as a stopgap so clustering works on the current
// Vercel deployment without waiting for the API code fix to ship.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const DIM = 1536
const WINDOW_DAYS = 21
const ACTIVE = ['seeded', 'researching', 'drafting']

function clip(s: string, max = 1500): string {
  const t = (s || '').trim().replace(/\s+/g, ' ')
  return t.length > max ? t.slice(0, max) : t
}
function buildText(idea: string | null, body: string | null): string {
  const t = clip(idea || ''), b = clip(body || '')
  if (!t && !b) return ''
  if (!b) return t
  if (!t) return b
  return `${t}\n\n${b}`
}

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(url, key)

  const { data: secret } = await sb.from('app_secrets').select('value').eq('key', 'openai_api_key').maybeSingle()
  const openaiKey = (secret as { value?: string } | null)?.value
  if (!openaiKey) return Response.json({ ok: false, error: 'no openai_api_key in app_secrets' }, { status: 500 })

  const sinceISO = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()
  const { data, error } = await sb
    .from('content_ideas')
    .select('id, idea, thesis, source_snippet, embedding')
    .in('state', ACTIVE)
    .is('buried_at', null)
    .gte('created_at', sinceISO)
    .limit(2000)
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })

  const needs = (data || []).filter((r) => !r.embedding)
  if (!needs.length) return Response.json({ ok: true, embedded: 0, total: (data || []).length })

  const inputs = needs.map((r) => buildText(r.idea, r.thesis || r.source_snippet))
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { authorization: `Bearer ${openaiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs, dimensions: DIM }),
  })
  if (!resp.ok) return Response.json({ ok: false, error: `openai_${resp.status}: ${(await resp.text()).slice(0, 200)}` }, { status: 500 })
  const j = await resp.json()
  const vecs: number[][] = j.data.map((d: { embedding: number[] }) => d.embedding)

  let embedded = 0
  for (let i = 0; i < needs.length; i++) {
    const v = vecs[i]
    if (!Array.isArray(v) || v.length !== DIM) continue
    const { error: upErr } = await sb.from('content_ideas').update({ embedding: `[${v.join(',')}]` }).eq('id', needs[i].id)
    if (!upErr) embedded++
  }
  return Response.json({ ok: true, embedded, total: (data || []).length })
})
