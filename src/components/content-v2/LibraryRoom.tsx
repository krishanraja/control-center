import { useMemo } from 'react'
import { contentV2Api, type useContentV2 } from '../../hooks/useContentV2'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { monthLabel } from '../../lib/contentV2'

// The tap-anytime bank (mockup set 1, fate 3). Two shelves: settled shifts
// (retired with a verdict, full dossier attached) and graduated evergreen
// pieces. Opening either seeds the Composer, so the Library is where extra
// publishing weeks start.

type LibIdea = ContentIdeaRow & { library_at?: string | null }

export function LibraryRoom({ v2, ideas }: { v2: ReturnType<typeof useContentV2>; ideas: ContentIdeaRow[] }) {
  const settledShifts = useMemo(
    () => v2.shifts.filter(s => ['retired', 'library'].includes(s.status)),
    [v2.shifts],
  )
  const evergreens = useMemo(
    () => (ideas as LibIdea[]).filter(i => i.library_at).sort((a, b) => (b.library_at || '').localeCompare(a.library_at || '')),
    [ideas],
  )

  if (!settledShifts.length && !evergreens.length) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-6 text-white/50 text-sm max-w-xl">
        Nothing in the Library yet. It fills two ways: shifts you retire with a settled verdict, and pieces you
        graduate before the weekly purge. Both keep their receipts forever.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {settledShifts.length ? (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40 mb-2.5">Settled shifts</h3>
          <div className="flex flex-col gap-2">
            {settledShifts.map(s => (
              <div key={s.id} className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.02] px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-emerald-300/70">Shift · {s.category}</span>
                  <span className="text-[10px] text-white/30 tabular-nums">{s.story_count} stories · {monthLabel(s.first_seen_on)} to {s.last_evidence_on ? monthLabel(s.last_evidence_on) : 'now'}</span>
                </div>
                <div className="text-[13.5px] font-semibold text-white/90 mt-1">{s.title}</div>
                <div className="text-[12px] text-white/45 mt-0.5 leading-relaxed">{s.summary}</div>
                <button
                  onClick={async () => {
                    const r = await contentV2Api<{ idea_id: string }>(`/api/shifts/${s.id}/write`, { method: 'POST', body: '{}' })
                    window.location.hash = `#/content?idea=${r.idea_id}`
                  }}
                  className="mt-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/70 px-3 py-1.5 text-[11.5px] font-semibold"
                >
                  Write from this
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {evergreens.length ? (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40 mb-2.5">Evergreen pieces</h3>
          <div className="flex flex-col gap-2">
            {evergreens.map(i => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-white/85 leading-snug">{i.idea}</div>
                  <div className="text-[10.5px] text-white/30 mt-0.5">graduated {i.library_at ? monthLabel(i.library_at.slice(0, 10)) : ''}</div>
                </div>
                <button
                  onClick={() => { window.location.hash = `#/content?idea=${i.id}` }}
                  className="flex-shrink-0 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/70 px-3 py-1.5 text-[11.5px] font-semibold"
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
