import { useMemo, useState } from 'react'
import { Check, Search, Users, X } from '@/lib/icons'
import { BoardSkeleton } from '../shared/Skeleton'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
import { RoomCard } from '../room/RoomCard'
import {
  addRoomTarget, ROOM_STATE_LABEL, ROOM_STATES, seedRoom, useRoom,
} from '../../hooks/useRoom'
import type { RoomProposal, RoomState } from '../../hooks/useRoom'

// The Room, job 1 (docs/plans/one-swing/CHARTER.md): the 25 leaders who fit
// the face. The OS drafts, Krish sends. Listed and drafted show by default
// because that is where the work waits; every other state is one chip away
// so a sent approach can be moved along when the reply comes.

const SUBTITLE = 'The 25 leaders who fit the face. The OS drafts, you send.'

/** The counts line, in ladder order, only the states that have anyone. */
function countsLine(counts: Record<string, number>): string {
  return ROOM_STATES
    .filter(s => counts[s])
    .map(s => `${counts[s]} ${ROOM_STATE_LABEL[s].toLowerCase()}`)
    .join(', ')
}

export function RoomBody({ narrow }: { narrow: boolean }) {
  const { toast } = useToast()
  const [view, setView] = useState<RoomState | null>(null)
  const { targets, stateCounts, loading, refetch } = useRoom(view)
  const [seeding, setSeeding] = useState(false)
  const [proposals, setProposals] = useState<RoomProposal[] | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)

  const counts = useMemo(() => countsLine(stateCounts), [stateCounts])

  // The default view plus any state that has someone in it. Chips, not a
  // select: the set is small and it changes with the counts.
  const views = useMemo(() => {
    const out: Array<{ id: RoomState | null; label: string }> = [{ id: null, label: 'Listed and drafted' }]
    for (const s of ROOM_STATES) {
      if (s === 'listed' || s === 'drafted') continue
      if (stateCounts[s]) out.push({ id: s, label: ROOM_STATE_LABEL[s] })
    }
    return out
  }, [stateCounts])

  const findMore = async () => {
    if (seeding) return
    setSeeding(true)
    try {
      const found = await seedRoom(5)
      setProposals(found)
      if (!found.length) toast('Nobody new fits closely enough right now.')
    } catch (err) {
      toast(`Could not search: ${(err as Error)?.message || 'try again'}`, 'error')
    } finally {
      setSeeding(false)
    }
  }

  const accept = async (p: RoomProposal) => {
    if (accepting) return
    setAccepting(p.contact_id)
    try {
      await addRoomTarget({ contact_id: p.contact_id, why_face: p.why_face, sourced_by: 'os' })
      setProposals(prev => (prev || []).filter(x => x.contact_id !== p.contact_id))
      toast(`${p.full_name || 'Added'} is on the list.`, 'success')
      refetch()
    } catch (err) {
      const msg = (err as Error)?.message || ''
      toast(msg === 'already_listed' ? 'Already on the list.' : `Could not add: ${msg || 'try again'}`, 'error')
    } finally {
      setAccepting(null)
    }
  }

  const skip = (p: RoomProposal) => {
    setProposals(prev => (prev || []).filter(x => x.contact_id !== p.contact_id))
  }

  const header = !narrow && (
    <header>
      <h1 className="text-title font-semibold text-white tracking-tight flex items-center gap-2">
        <Users size={20} className="text-violet-300" />
        The Room
      </h1>
      <p className="text-body text-white/55 mt-1">{SUBTITLE}</p>
    </header>
  )

  if (loading && targets.length === 0) {
    return (
      <div className={narrow ? 'space-y-4 px-5' : 'space-y-5'}>
        {header}
        <BoardSkeleton lanes={1} cardsPerLane={3} hero={false} />
      </div>
    )
  }

  return (
    <div className={narrow ? 'space-y-4 px-5' : 'space-y-5'}>
      {header}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p data-testid="room-counts" className="text-label text-white/55">
          {counts || 'Nobody listed yet.'}
        </p>
        <button
          type="button"
          data-testid="room-find-more"
          onClick={findMore}
          disabled={seeding}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-label font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40 transition-colors"
          title="Searches your own network for people who fit the face. Nothing is added until you accept one."
        >
          {seeding ? <Working size={12} /> : <Search size={12} />}
          Find five more
        </button>
      </div>

      {views.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Room states">
          {views.map(v => {
            const on = v.id === view
            return (
              <button
                key={v.id || 'working'}
                type="button"
                aria-pressed={on}
                data-testid={`room-view-${v.id || 'working'}`}
                onClick={() => setView(v.id)}
                className={`min-h-[32px] rounded-full border px-3 py-1 text-label transition-colors ${
                  on
                    ? 'border-violet-400/50 bg-violet-500/15 text-violet-100'
                    : 'border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]'
                }`}
              >
                {v.label}
              </button>
            )
          })}
        </div>
      )}

      {proposals && proposals.length > 0 && (
        <section aria-label="Proposed leaders" className="space-y-2">
          <p className="text-label text-white/55">
            Found in your network. Accept puts them on the list; nothing is added on its own.
          </p>
          {proposals.map(p => (
            <div
              key={p.contact_id}
              data-testid="room-proposal"
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex items-start justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0 basis-40 grow">
                <p className="text-ui font-semibold text-white">
                  {p.linkedin_url ? (
                    <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="hover:text-violet-200 transition-colors">
                      {p.full_name || 'Unnamed contact'}
                    </a>
                  ) : (p.full_name || 'Unnamed contact')}
                </p>
                {(p.title || p.company) && (
                  <p className="text-label text-white/55 mt-0.5">{[p.title, p.company].filter(Boolean).join(' at ')}</p>
                )}
                <p className="text-label text-white/70 mt-1">{p.why_face}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => accept(p)}
                  disabled={accepting !== null}
                  className="min-h-[32px] inline-flex items-center gap-1 rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1 text-label text-violet-100 disabled:opacity-40 transition-colors"
                >
                  {accepting === p.contact_id ? <Working size={12} /> : <Check size={12} />}
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => skip(p)}
                  disabled={accepting !== null}
                  className="min-h-[32px] inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-label text-white/55 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
                >
                  <X size={12} />
                  Skip
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {targets.length === 0 ? (
        <p data-testid="room-empty" className="text-body text-white/45">
          {view ? `Nobody is ${ROOM_STATE_LABEL[view].toLowerCase()} right now.` : 'Nobody listed yet. Find five to start.'}
        </p>
      ) : (
        <div className={narrow ? 'space-y-3' : 'grid grid-cols-1 xl:grid-cols-2 gap-4'}>
          {targets.map(t => (
            <RoomCard key={t.id} target={t} onChanged={refetch} />
          ))}
        </div>
      )}
    </div>
  )
}

export function DesktopRoom() {
  return <RoomBody narrow={false} />
}
