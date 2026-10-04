import { useEffect, useState } from 'react'
import { Users } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { Chip } from './VentureRecommender'

// Browse the network by what each person can do for Krish.
//
// Search answers "who matches these words". These five doors answer the
// question he actually brought on 2026-10-03, which was a list of the KINDS of
// people worth his time right now: the colleagues who watched him scale three
// businesses, the people who reach many buyers at once, the ones holding a
// budget, the ones who put him in rooms, and the builders worth a story.
//
// The alumni door opens a second row of his own employers, because "worked at
// Nine" and "worked at Microsoft" are not the same claim: Captify had 18 people
// under him and Microsoft has 220,000. The wide ones are labelled as such.
//
// The sixth door is his back catalogue: people he knows outside work, from
// Facebook and Instagram (the Meta export, 2026-10-04). It opens a row of his
// own schools, the same way alumni opens his employers.

export const PLAY_LABEL: Record<string, string> = {
  alumni: 'Worked where you worked',
  multiplier: 'Reach many buyers',
  buyer: 'Hold a budget',
  amplifier: 'Put you in rooms',
  subject: 'Worth a story',
  personal: 'Know you outside work',
}

/** Short names for the chips on a row, where the long ones would crowd. */
export const PLAY_SHORT: Record<string, string> = {
  alumni: 'Alumni',
  multiplier: 'Multiplier',
  buyer: 'Buyer',
  amplifier: 'Amplifier',
  subject: 'Story',
  personal: 'Personal',
}

const ORDER = ['alumni', 'personal', 'multiplier', 'buyer', 'amplifier', 'subject']

interface Employer { key: string; label: string; closeness: 'close' | 'wide' }

export function PlayPicker({ onBrowse, loading, active, onSize }: {
  onBrowse: (play: string, employer: string | null) => void
  loading: boolean
  active: { play: string; employer: string | null } | null
  /** How many people the network holds, for the tab's own sentences. */
  onSize?: (people: number) => void
}) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [employers, setEmployers] = useState<Employer[]>([])
  const [schools, setSchools] = useState<Employer[]>([])
  const [play, setPlay] = useState<string | null>(active?.play ?? null)

  useEffect(() => {
    let live = true
    fetch('/api/network/by-play')
      .then(r => r.json())
      .then(j => {
        if (!live || !j.ok) return
        setCounts(j.counts || {})
        setEmployers(j.employers || [])
        setSchools(j.schools || [])
        if (typeof j.people === 'number' && j.people > 0) onSize?.(j.people)
      })
      .catch(() => { /* the doors still work without their counts */ })
    return () => { live = false }
  }, [onSize])

  function choose(p: string) {
    setPlay(p)
    onBrowse(p, null)
  }

  return (
    <div className="border-t border-white/[0.06] px-4 py-3" data-testid="network-plays">
      <div className="mb-2 flex items-center gap-1.5">
        <Users size={12} className="text-violet-300/70" aria-hidden />
        <Eyebrow>Or browse by who they are to you</Eyebrow>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ORDER.map(p => (
          <Chip key={p} testId={`network-play-${p}`} on={play === p && !loading} onClick={() => choose(p)}>
            {PLAY_LABEL[p]}
            {counts && counts[p] ? <span className="ml-1 text-ink-faint">{counts[p].toLocaleString()}</span> : null}
          </Chip>
        ))}
      </div>

      {play === 'alumni' && employers.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5" data-testid="network-play-employers">
          {employers.map(e => (
            <Chip
              key={e.key}
              testId={`network-employer-${e.key}`}
              on={active?.employer === e.key}
              onClick={() => onBrowse('alumni', e.key)}
            >
              {e.label}
              {e.closeness === 'wide' && <span className="ml-1 text-ink-faint">(large)</span>}
            </Chip>
          ))}
        </div>
      )}

      {play === 'personal' && schools.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5" data-testid="network-play-schools">
          {schools.map(e => (
            <Chip
              key={e.key}
              testId={`network-school-${e.key}`}
              on={active?.employer === e.key}
              onClick={() => onBrowse('personal', e.key)}
            >
              {e.label.replace(/^the /, '')}
              {e.closeness === 'wide' && <span className="ml-1 text-ink-faint">(large)</span>}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}
