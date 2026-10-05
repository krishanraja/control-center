import React, { useCallback, useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { Working } from '../shared/Working'
import { SurfaceHeader } from '../shared/SurfaceHeader'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { DrawnCheck } from '../shared/DrawnCheck'
import { StatusLane, EmptyLanes } from '../desktop/StatusLane'
import { useToast } from '../shared/Toast'
import { useContainerWidth } from '../../hooks/useContainerWidth'
import {
  boardLanes,
  boardTime,
  fetchBoard,
  repliesFor,
  sendReply,
  writerName,
  type Board,
  type BoardItem,
  type BoardReply,
} from '../../lib/workBoard'

/**
 * The work board: what is waiting on Krish, what is in progress, what is done.
 *
 * Krish, 2026-10-03: "I need the boards to not be Claude pages, but accessible
 * by Codex too and workable using Codex too". Agent sessions (Claude Code,
 * Codex) write the items through the engine; Krish reads them here and replies
 * to any item. A reply is his words: only this page, with his cookie, can
 * write one. The page refreshes itself every 30 seconds and when it comes back
 * into view, so what a session just did shows up without a reload.
 *
 * Built to Growth's standard (Krish, 2026-10-05):
 *
 *   Data, compressed  three counts at a glance, each a number and a word.
 *   Action, singular  ONE item waiting on him is the card, through the house
 *                     hero, with one primary (send the reply it asks for) and
 *                     one secondary (open what it is about). The verdict lands
 *                     where he pressed, and "Next" is a press: nothing
 *                     advances on its own.
 *   Insight, asked    what is in progress and what is done fold behind their
 *                     lane headers; a row's detail is one more tap.
 *   Honest emptiness  nothing waiting says so once, with the one number that
 *                     matters next; empty lanes are named together in one line.
 *   Recomposed        a phone stacks; a wide box puts the card beside the
 *                     queue, chosen by the box's own width, never the window's.
 */
export function WorkBoard() {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The item he chose to answer next, by id. Null means the first in rank.
  const [currentId, setCurrentId] = useState<string | null>(null)
  // The item he just replied to: its verdict stays on the card until he
  // presses Next, so a refetch cannot slide a new item under his thumb.
  const [answeredId, setAnsweredId] = useState<string | null>(null)
  const [boxRef, width] = useContainerWidth()

  const load = useCallback(async () => {
    try {
      setBoard(await fetchBoard())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30_000)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  if (!board) {
    return (
      <div ref={boxRef} className="mx-auto flex w-full max-w-5xl flex-col gap-3 py-4" data-testid="work-board">
        <SurfaceHeader title="Board" />
        {error
          ? <p className="text-body text-ink-muted">The board could not load ({error}). It tries again every 30 seconds.</p>
          : <p className="flex items-center gap-2 text-body text-ink-muted"><Working size={14} /> Loading the board</p>}
      </div>
    )
  }

  const lanes = boardLanes(board.items)
  const addReply = (reply: BoardReply) => setBoard(b => b ? { ...b, replies: [reply, ...b.replies] } : b)
  // A wide box puts the card beside the queue; anything narrower stacks.
  const wide = width >= 1000
  const narrow = width > 0 && width < 640

  // The one item on the card: the one he pressed, else the first in rank. One
  // he has just answered stays on the card with its verdict until Next.
  const current =
    lanes.onYou.find(i => i.id === (answeredId ?? currentId)) ??
    (answeredId ? board.items.find(i => i.id === answeredId) : undefined) ??
    lanes.onYou[0] ?? null
  const rest = lanes.onYou.filter(i => i.id !== current?.id)
  const position = current ? lanes.onYou.findIndex(i => i.id === current.id) + 1 : 0

  const next = () => {
    const after = rest.find(i => i.id !== answeredId)
    setAnsweredId(null)
    setCurrentId(after?.id ?? null)
  }

  const empties = [
    lanes.inProgress.length === 0 ? 'progress' : null,
    lanes.done.length === 0 ? 'the done list' : null,
  ].filter(Boolean) as string[]

  const numbers = (
    <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2" aria-label="The board at a glance" data-testid="board-numbers">
      {[
        { label: 'Waiting on you', value: lanes.onYou.length },
        { label: 'In progress', value: lanes.inProgress.length },
        { label: 'Done recently', value: lanes.done.length },
      ].map(n => (
        <div key={n.label} className="flex items-baseline gap-2">
          <dt><Eyebrow>{n.label}</Eyebrow></dt>
          <dd className="font-mono tabular-nums text-ui text-ink">{n.value}</dd>
        </div>
      ))}
    </dl>
  )

  const signals = board.state.signals.length > 0 ? (
    <ul className="flex flex-wrap gap-1.5" aria-label="How things are running">
      {board.state.signals.map(s => (
        <li key={s.label} className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1 text-micro text-ink-muted">
          <span aria-hidden className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${s.state === 'ok' ? 'bg-emerald-400' : s.state === 'warn' ? 'bg-amber-400' : s.state === 'bad' ? 'bg-rose-400' : 'bg-white/30'}`} />
          <span className="font-medium text-ink">{s.label}</span>
          {s.text ? <span className="min-w-0 break-words">{s.text}</span> : null}
        </li>
      ))}
    </ul>
  ) : null

  const card = current ? (
    <NextCard
      key={current.id}
      item={current}
      position={position}
      of={lanes.onYou.length}
      thread={repliesFor(current.id, board.replies)}
      answered={answeredId === current.id}
      hasNext={rest.length > 0}
      narrow={narrow}
      onReplied={r => { addReply(r); setAnsweredId(current.id) }}
      onNext={next}
    />
  ) : (
    <DoThisNextHero
      narrow={narrow}
      descriptor={{
        clear: true,
        headline: 'Nothing is waiting on you.',
        sub: lanes.inProgress.length > 0
          ? `${lanes.inProgress.length} ${lanes.inProgress.length === 1 ? 'thing is' : 'things are'} in progress. A session puts anything that needs you here.`
          : 'Nothing is in progress either. A session puts anything that needs you here.',
      }}
    />
  )

  const queue = (
    <div className="flex min-w-0 flex-col gap-3">
      {rest.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Also waiting on you">
          <Eyebrow>Also waiting on you</Eyebrow>
          {rest.map(item => (
            <QueueRow
              key={item.id}
              item={item}
              last={repliesFor(item.id, board.replies).slice(-1)[0] ?? null}
              onPick={() => { setAnsweredId(null); setCurrentId(item.id) }}
            />
          ))}
        </section>
      )}
      <div data-testid="board-in-progress">
        <StatusLane
          status="in_progress"
          title="In progress"
          description="What Claude and Codex are working on now."
          items={lanes.inProgress}
          keyOf={i => i.id}
          renderItem={item => <LaneRow item={item} />}
        />
      </div>
      <div data-testid="board-done">
        <StatusLane
          status="done"
          title="Done recently"
          description="Finished, newest first."
          items={lanes.done}
          keyOf={i => i.id}
          renderItem={item => <LaneRow item={item} />}
          defaultCollapsed
        />
      </div>
      <EmptyLanes names={empties} />
    </div>
  )

  return (
    <div ref={boxRef} className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-4" data-testid="work-board" data-shape={wide ? 'wide' : narrow ? 'phone' : 'desk'}>
      <div className="flex flex-col gap-3">
        <SurfaceHeader
          title="Board"
          description={board.state.headline || undefined}
          meta={!narrow ? <span>Updated {boardTime(board.state.updated_at)} by {writerName(board.state.updated_by)}</span> : undefined}
        />
        {numbers}
        {signals}
      </div>

      {wide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start gap-6">
          <section data-testid="board-on-you" aria-label="Waiting on you">{card}</section>
          {queue}
        </div>
      ) : (
        <>
          <section data-testid="board-on-you" aria-label="Waiting on you">{card}</section>
          {queue}
        </>
      )}

      <p className="text-micro text-ink-faint">
        {narrow ? `Updated ${boardTime(board.state.updated_at)} by ${writerName(board.state.updated_by)}. ` : ''}
        Claude and Codex both update this board, and the next session reads every reply.
      </p>
    </div>
  )
}

/** THE card: one item, one reply, and the verdict where he pressed. */
function NextCard({ item, position, of, thread, answered, hasNext, narrow, onReplied, onNext }: {
  item: BoardItem
  position: number
  of: number
  thread: BoardReply[]
  answered: boolean
  hasNext: boolean
  narrow: boolean
  onReplied: (r: BoardReply) => void
  onNext: () => void
}) {
  const internal = item.link?.startsWith('https://controlcenter.krishraja.com/') ?? false
  const open = item.link ? (
    <a
      href={item.link}
      {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
      className="tap-44 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/12 px-4 text-label font-medium text-ink-muted transition-colors hover:text-ink"
    >
      {item.link_label || 'Open'} {internal ? <ArrowRight size={12} /> : <ArrowUpRight size={12} />}
    </a>
  ) : null

  return (
    <div data-testid={`board-item-${item.id}`}>
      <DoThisNextHero
        layout="card"
        narrow={narrow}
        testId="board-next"
        eyebrow={<Eyebrow tone="accent">{item.area || 'Waiting on you'}</Eyebrow>}
        meta={of > 1 ? <span className="text-micro font-mono tabular-nums text-ink-faint">{position} of {of}</span> : undefined}
        descriptor={{ headline: item.title, sub: item.detail, tone: 'violet' }}
      >
        {thread.length > 0 && <Thread thread={thread} />}
        {answered ? (
          <div className="flex flex-col gap-3" data-testid="board-verdict" role="status">
            <p className="flex items-center gap-2 text-ui text-ink">
              <span className="flex-shrink-0"><DrawnCheck size={22} stroke="rgb(var(--accent))" /></span> Sent. The next Claude or Codex session reads it.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {hasNext && (
                <button
                  type="button"
                  onClick={onNext}
                  data-testid="board-next-item"
                  className="tap-44 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-300 px-4 text-label font-bold text-emerald-950"
                >
                  Next <ArrowRight size={12} />
                </button>
              )}
              {open}
            </div>
          </div>
        ) : (
          <ReplyBox item={item} onReplied={onReplied} secondary={open} />
        )}
      </DoThisNextHero>
    </div>
  )
}

function Thread({ thread }: { thread: BoardReply[] }) {
  return (
    <ul className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-3" aria-label="Your replies">
      {thread.map(r => (
        <li key={r.id} className="text-label text-ink">
          <span className="text-ink-faint">You, {boardTime(r.at)}: </span>{r.text}
          <span className="ml-1.5 text-micro text-ink-faint">{r.seen_at ? `· read by ${writerName(r.seen_by)}` : '· not read yet'}</span>
        </li>
      ))}
    </ul>
  )
}

/** Another item waiting on him: its name, his last word on it, and a press to
 *  make it the card. Nothing to answer in place; one card answers at a time. */
function QueueRow({ item, last, onPick }: { item: BoardItem; last: BoardReply | null; onPick: () => void }) {
  return (
    <article className="surface flex flex-col gap-1.5 rounded-xl p-3.5" data-testid={`board-item-${item.id}`}>
      {item.area ? <Eyebrow>{item.area}</Eyebrow> : null}
      <h3 className="text-body font-semibold leading-snug text-ink">{item.title}</h3>
      {last && (
        <p className="text-label text-ink-muted">
          <span className="text-ink-faint">You, {boardTime(last.at)}: </span>{last.text}
          <span className="ml-1.5 text-micro text-ink-faint">{last.seen_at ? `· read by ${writerName(last.seen_by)}` : '· not read yet'}</span>
        </p>
      )}
      <button
        type="button"
        onClick={onPick}
        className="tap-44 self-start inline-flex min-h-[32px] items-center gap-1 text-label font-semibold text-accent hover:text-ink"
      >
        Answer this one <ArrowRight size={12} />
      </button>
    </article>
  )
}

/** A row in progress or done: the name, and the detail one tap away. */
function LaneRow({ item }: { item: BoardItem }) {
  return (
    <article className="flex flex-col gap-1" data-testid={`board-item-${item.id}`}>
      {item.area ? <span className="text-micro uppercase tracking-[0.14em] text-ink-faint">{item.area}</span> : null}
      <p className="text-label font-semibold leading-snug text-ink">{item.title}</p>
      {item.detail ? (
        <details className="text-label text-ink-muted">
          <summary className="tap-44 cursor-pointer text-ink-faint">More</summary>
          <p className="mt-1.5 leading-relaxed">{item.detail}</p>
        </details>
      ) : null}
    </article>
  )
}

function ReplyBox({ item, onReplied, secondary }: { item: BoardItem; onReplied: (r: BoardReply) => void; secondary: React.ReactNode }) {
  const key = `board-draft:${item.id}`
  const [text, setText] = useState(() => { try { return localStorage.getItem(key) || '' } catch { return '' } })
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  const change = (value: string) => {
    setText(value)
    try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key) } catch { /* drafts are a convenience */ }
  }
  const send = async () => {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      const reply = await sendReply(item.id, value)
      change('')
      onReplied(reply)
    } catch (e) {
      toast(`Could not send: ${(e as Error).message}. Your words are kept here.`, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2.5">
      <textarea
        value={text}
        onChange={e => change(e.target.value)}
        rows={2}
        placeholder={item.prompt || 'Your reply'}
        aria-label={`Reply to: ${item.title}`}
        className="w-full resize-y rounded-xl border border-white/12 bg-transparent px-3 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-emerald-400/50 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!text.trim() || busy}
          onClick={send}
          className="tap-44 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 text-label font-bold text-emerald-950 disabled:opacity-40"
        >
          {busy ? <Working size={14} /> : null} Send reply
        </button>
        {secondary}
      </div>
    </div>
  )
}
