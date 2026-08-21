import { useMemo, useState } from 'react'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { contentV2Api } from '../../hooks/useContentV2'

// Read-only ambience (mockup set 1, pin 3). The Feed shows what the engine
// read this week and carries ZERO obligations. Its one action, Rescue, converts
// an item into an evergreen Library candidate before Monday's purge.

type FeedIdea = ContentIdeaRow & { shift_id?: string | null; library_at?: string | null; expires_at?: string | null; horizon?: string | null }

export function FeedRoom({ ideas }: { ideas: ContentIdeaRow[] }) {
  const [q, setQ] = useState('')
  const [rescued, setRescued] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  const feed = useMemo(() => {
    const weekAgo = Date.now() - 8 * 86_400_000
    let rows = (ideas as FeedIdea[]).filter(i =>
      ['pool_headline', 'inspiration_sweep', 'zara_signal', 'signal_inbox'].includes(i.source_type as string)
      && new Date(i.created_at).getTime() >= weekAgo,
    )
    const needle = q.trim().toLowerCase()
    if (needle) rows = rows.filter(i => `${i.idea} ${i.thesis || ''}`.toLowerCase().includes(needle))
    return rows
  }, [ideas, q])

  const rescue = async (id: string) => {
    setBusy(id)
    try {
      await contentV2Api('/api/content-ideas', { method: 'PATCH', body: JSON.stringify({ id, rescue: true }) })
      setRescued(prev => new Set(prev).add(id))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search what the engine read this week..."
          className="flex-1 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3.5 py-2 text-body text-white/85 placeholder:text-white/30 outline-none focus:border-white/25"
        />
        <span className="text-micro text-white/35 tabular-nums flex-shrink-0">{feed.length} items</span>
      </div>
      <p className="text-label text-white/30 mb-4">
        Nothing here needs you. Time-sensitive items purge Monday; anything that fed a shift is already kept in its dossier.
        Rescue moves an item to the Library instead.
      </p>
      <div className="flex flex-col gap-1.5">
        {feed.map(i => {
          const f = i as FeedIdea
          const kept = f.shift_id || f.library_at || rescued.has(i.id)
          return (
            <div key={i.id} className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.01] px-3.5 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-body text-white/80 leading-snug">
                  {i.source_url ? (
                    <a href={i.source_url} target="_blank" rel="noreferrer" className="hover:text-white">{i.idea}</a>
                  ) : i.idea}
                </div>
                <div className="text-micro text-white/30 mt-0.5">
                  {(i.meta as Record<string, any> | null)?.pool?.source || (i.meta as Record<string, any> | null)?.source_label || i.source_type}
                  {' · '}{new Date(i.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </div>
              </div>
              {kept ? (
                <span className="flex-shrink-0 rounded-full bg-emerald-400/12 text-emerald-300 px-2 py-0.5 text-micro font-semibold">
                  {f.shift_id ? 'feeds a shift' : 'kept'}
                </span>
              ) : (
                <button
                  onClick={() => rescue(i.id)}
                  disabled={busy === i.id}
                  className="flex-shrink-0 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/60 px-2.5 py-1 text-micro font-semibold disabled:opacity-40"
                >
                  Rescue
                </button>
              )}
            </div>
          )
        })}
        {feed.length === 0 ? (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-5 text-white/50 text-sm">
            The feed is empty. It refills daily at 11:30 UTC from the shared pool and your newsletters.
          </div>
        ) : null}
      </div>
    </div>
  )
}
