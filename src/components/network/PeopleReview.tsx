import { useCallback, useEffect, useState } from 'react'
import { GitMerge, Linkedin, ExternalLink } from '@/lib/icons'
import { SegmentedNav } from '../shared/SegmentedNav'
import { SlideOver } from '../shared/SlideOver'
import { BottomSheet } from '../mobile/BottomSheet'
import { Eyebrow } from '../shared/Eyebrow'
import { Working } from '../shared/Working'
import { Tap } from '../pilot/controls'
import { useToast } from '../shared/Toast'
import { knownFromWords } from '../../lib/knownFrom'

// The two questions about people only Krish can answer.
//
//   Same person?    two records that may be one person, side by side
//   Which profile?  a LinkedIn profile Apify guessed for someone he knows,
//                   where nothing he already has confirms it
//
// Both come from work that refused to guess: the merge pass merged only rows
// sharing a LinkedIn profile or a work address, and the Meta import wrote no
// profile it could not confirm (api/_metaImport.ts has the measurements). What
// it could not prove waits here. Nothing is lost while it waits, and a "no" is
// recorded so the same pair is never asked again.
//
// One card at a time, most valuable first (people he has a measured
// relationship with, or who can buy or open doors). He can stop whenever.

type Surface = 'contact_merge' | 'contact_link'

interface Person {
  id: string
  name: string | null
  title: string | null
  company: string | null
  location: string | null
  email_domain: string | null
  linkedin_slug: string | null
  known_from: string[]
  evidence: string | null
  warmth: number | null
  warmth_measured: boolean
}

interface Candidate {
  url: string
  slug: string | null
  title: string | null
  /** This candidate is the memorial page. The search results beside it are
   *  other people. */
  memorial?: boolean
  profile: null | {
    headline: string | null
    role: string | null
    company: string | null
    location: string | null
    education: Array<{ school: string; period: string | null }>
    career: Array<{ title: string | null; company: string | null; dates: string | null }>
  }
}

type Item =
  | { id: string; surface: 'contact_merge'; reason: string; a: Person; b: Person }
  | { id: string; surface: 'contact_link'; reason: string; person: Person; memorial: boolean; networks: string[]; candidates: Candidate[] }

interface Counts { contact_merge: number; contact_link: number }

export function PeopleReview({ narrow, className }: { narrow: boolean; className?: string }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [surface, setSurface] = useState<Surface>('contact_merge')
  const [counts, setCounts] = useState<Counts | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (s: Surface) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/network/review?surface=${s}&limit=12`)
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'failed')
      setCounts(j.counts)
      setItems(j.items || [])
    } catch {
      // The entry point simply does not show; nothing here is urgent.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(surface) }, [load, surface])

  const answer = async (item: Item, verdict: 'accepted' | 'rejected' | 'deferred', extra: Record<string, unknown> = {}) => {
    setBusy(true)
    // Optimistic: the next card is already there while this one is written.
    setItems(list => list.filter(i => i.id !== item.id))
    if (verdict !== 'deferred') setCounts(c => (c ? { ...c, [item.surface]: Math.max(0, c[item.surface] - 1) } : c))
    try {
      const r = await fetch('/api/network/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_id: item.id, verdict, ...extra }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'failed')
    } catch (e) {
      toast(`That answer did not save: ${String((e as Error).message).slice(0, 80)}`, 'error')
      void load(surface)
    } finally {
      setBusy(false)
    }
  }

  // Top the queue up before it runs dry, so the next card never waits.
  useEffect(() => {
    if (open && !loading && items.length < 3 && counts && counts[surface] > items.length) void load(surface)
  }, [open, loading, items.length, counts, surface, load])

  const total = counts ? counts.contact_merge + counts.contact_link : 0
  if (!counts || total === 0) return null

  const current = items[0]
  const body = (
    <div data-testid="people-review" className="flex flex-col gap-4">
      <SegmentedNav<Surface>
        label="Questions about people"
        variant="pill"
        testIdPrefix="people-review"
        value={surface}
        onChange={s => { setSurface(s); setItems([]) }}
        segments={[
          { id: 'contact_merge', label: 'Same person?', badge: counts.contact_merge || undefined },
          { id: 'contact_link', label: 'Which profile?', badge: counts.contact_link || undefined },
        ]}
      />
      {loading && !current && <p className="text-label text-ink-faint inline-flex items-center gap-2"><Working size={12} /> Loading the next questions</p>}
      {!loading && !current && (
        <p className="text-body text-ink-muted" data-testid="people-review-empty">
          Nothing left to check here.
        </p>
      )}
      {current && current.surface === 'contact_merge' && (
        <MergeCard item={current} busy={busy} onAnswer={answer} stack={narrow} />
      )}
      {current && current.surface === 'contact_link' && (
        <LinkCard item={current} busy={busy} onAnswer={answer} />
      )}
    </div>
  )

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="people-review-open"
        className="tap-44 min-h-[36px] rounded-lg border border-amber-400/30 bg-amber-500/[0.06] px-3 text-label font-medium text-amber-100 transition-colors hover:bg-amber-500/[0.12]"
      >
        {total.toLocaleString()} {total === 1 ? 'person' : 'people'} to check
      </button>
      {narrow ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} ariaLabel="People to check">
          <div className="px-4 pb-6 pt-2">{body}</div>
        </BottomSheet>
      ) : (
        <SlideOver open={open} onClose={() => setOpen(false)} ariaLabel="People to check" label="People to check">
          {body}
        </SlideOver>
      )}
    </div>
  )
}

function Side({ p, testId }: { p: Person; testId: string }) {
  const role = [p.title, p.company].filter(Boolean).join(' at ')
  const from = knownFromWords(p.known_from)
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3" data-testid={testId}>
      <p className="text-ui font-semibold text-ink">{p.name || 'No name on file'}</p>
      {role && <p className="mt-0.5 text-label text-ink-muted">{role}</p>}
      <dl className="mt-2 space-y-1 text-label">
        {from && <Fact k="Known from" v={from} />}
        {p.location && <Fact k="Where" v={p.location} />}
        {p.email_domain && <Fact k="Email at" v={p.email_domain} />}
        {p.linkedin_slug && <Fact k="LinkedIn" v={p.linkedin_slug} />}
        {p.evidence && <Fact k="With you" v={p.evidence} />}
      </dl>
    </div>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-ink-faint">{k}</dt>
      <dd className="min-w-0 break-words text-ink-muted">{v}</dd>
    </div>
  )
}

function MergeCard({ item, busy, onAnswer, stack }: {
  item: Extract<Item, { surface: 'contact_merge' }>
  busy: boolean
  /** On a phone the two records stack; side by side they squeeze. The tab
   *  knows whether it is narrow; a viewport breakpoint does not. */
  stack: boolean
  onAnswer: (i: Item, v: 'accepted' | 'rejected' | 'deferred', extra?: Record<string, unknown>) => void
}) {
  return (
    <section data-testid="people-review-merge" className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <GitMerge size={12} className="text-amber-200/80" aria-hidden />
        <Eyebrow>Are these the same person?</Eyebrow>
      </div>
      <p className="text-label text-ink-faint">{item.reason}</p>
      <div className={`flex gap-2 ${stack ? 'flex-col' : 'flex-row'}`}>
        <Side p={item.a} testId="people-review-a" />
        <Side p={item.b} testId="people-review-b" />
      </div>
      <p className="text-micro text-ink-faint">
        A yes keeps everything from both records on one person: every address, every message, every note.
      </p>
      <div className="flex flex-wrap gap-2">
        <Tap onTap={() => onAnswer(item, 'accepted')} disabled={busy}>Same person</Tap>
        <Tap onTap={() => onAnswer(item, 'rejected', { reason_code: 'different_people' })} disabled={busy} variant="secondary">Different people</Tap>
        <Tap onTap={() => onAnswer(item, 'deferred')} disabled={busy} variant="quiet">Not sure</Tap>
      </div>
    </section>
  )
}

function LinkCard({ item, busy, onAnswer }: {
  item: Extract<Item, { surface: 'contact_link' }>
  busy: boolean
  onAnswer: (i: Item, v: 'accepted' | 'rejected' | 'deferred', extra?: Record<string, unknown>) => void
}) {
  const from = knownFromWords(item.person.known_from)
  return (
    <section data-testid="people-review-link" className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <Linkedin size={12} className="text-sky-300/80" aria-hidden />
        <Eyebrow>{item.memorial ? 'Is this them?' : 'Is this their LinkedIn?'}</Eyebrow>
      </div>
      <div>
        <p className="text-ui font-semibold text-ink">{item.person.name}</p>
        {from && <p className="text-label text-ink-muted">On your {from}</p>}
      </div>
      <p className="text-label text-ink-faint">{item.reason}</p>
      <ul className="flex flex-col gap-2">
        {item.candidates.map((c, i) => (
          <li key={c.url} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3" data-testid="people-review-candidate">
            {c.profile ? (
              <>
                <p className="text-ui text-ink">{[c.profile.role, c.profile.company].filter(Boolean).join(' at ') || c.profile.headline || c.title}</p>
                {c.profile.location && <p className="text-label text-ink-muted">{c.profile.location}</p>}
                {c.profile.education.length > 0 && (
                  <p className="mt-1 text-label text-ink-faint">
                    Studied at {c.profile.education.slice(0, 3).map(e => e.period ? `${e.school} (${e.period})` : e.school).join(', ')}
                  </p>
                )}
                {c.profile.career.length > 1 && (
                  <p className="mt-1 text-label text-ink-faint">
                    Before: {c.profile.career.slice(1, 4).map(w => [w.title, w.company].filter(Boolean).join(' at ')).filter(Boolean).join('; ')}
                  </p>
                )}
              </>
            ) : (
              <p className="text-ui text-ink">{c.title || c.slug}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Tap onTap={() => onAnswer(item, 'accepted', { choice: i })} disabled={busy}>
                {(c.memorial ?? (item.memorial && i === 0)) ? 'Yes, they have passed away' : "That's them"}
              </Tap>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="tap-44 inline-flex items-center gap-1 text-label text-ink-faint underline underline-offset-2 hover:text-ink-muted"
              >
                Open profile <ExternalLink size={11} aria-hidden />
              </a>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Tap onTap={() => onAnswer(item, 'rejected', { reason_code: 'not_their_profile' })} disabled={busy} variant="secondary">
          {item.candidates.length > 1 ? 'None of these' : 'Not them'}
        </Tap>
        <Tap onTap={() => onAnswer(item, 'deferred')} disabled={busy} variant="quiet">Not sure</Tap>
      </div>
    </section>
  )
}
