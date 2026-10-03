import { useCallback, useEffect, useState } from 'react'
import { Eyebrow } from '../shared/Eyebrow'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
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
 */
export function WorkBoard() {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      <div className="flex flex-col gap-3 py-6" data-testid="work-board">
        <Eyebrow>Board</Eyebrow>
        {error
          ? <p className="text-body text-ink-muted">The board could not load ({error}). It tries again every 30 seconds.</p>
          : <p className="flex items-center gap-2 text-body text-ink-muted"><Working size={14} /> Loading the board</p>}
      </div>
    )
  }

  const lanes = boardLanes(board.items)
  const addReply = (reply: BoardReply) => setBoard(b => b ? { ...b, replies: [reply, ...b.replies] } : b)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-4" data-testid="work-board">
      <header className="flex flex-col gap-3">
        <Eyebrow>Board</Eyebrow>
        {board.state.headline ? <h1 className="text-lede font-semibold leading-snug text-ink">{board.state.headline}</h1> : null}
        {board.state.signals.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="How things are running">
            {board.state.signals.map(s => (
              <li key={s.label} className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 py-1 text-micro text-ink-muted">
                <span aria-hidden className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${s.state === 'ok' ? 'bg-emerald-400' : s.state === 'warn' ? 'bg-amber-400' : s.state === 'bad' ? 'bg-rose-400' : 'bg-white/30'}`} />
                <span className="font-medium text-ink">{s.label}</span>
                {s.text ? <span className="min-w-0 break-words">{s.text}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-micro text-ink-faint">
          Updated {boardTime(board.state.updated_at)} by {writerName(board.state.updated_by)}. Claude and Codex both update this board; reply to any item and the next session reads it.
        </p>
      </header>

      <Lane title="Waiting on you" testId="board-on-you" items={lanes.onYou} replies={board.replies} onReplied={addReply} empty="Nothing is waiting on you." openReply />
      <Lane title="In progress" testId="board-in-progress" items={lanes.inProgress} replies={board.replies} onReplied={addReply} empty="Nothing in progress." />
      <Lane title="Done recently" testId="board-done" items={lanes.done} replies={board.replies} onReplied={addReply} empty="Nothing finished yet." compact />
    </div>
  )
}

function Lane({ title, testId, items, replies, onReplied, empty, openReply, compact }: {
  title: string
  testId: string
  items: BoardItem[]
  replies: BoardReply[]
  onReplied: (r: BoardReply) => void
  empty: string
  openReply?: boolean
  compact?: boolean
}) {
  return (
    <section className="flex flex-col gap-2.5" data-testid={testId} aria-label={title}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-ui font-semibold text-ink">{title}</h2>
        <span className="text-micro text-ink-faint tabular-nums">{items.length}</span>
      </div>
      {items.length === 0
        ? <p className="text-label text-ink-faint">{empty}</p>
        : items.map(item => (
          <Card key={item.id} item={item} thread={repliesFor(item.id, replies)} onReplied={onReplied} openReply={openReply} compact={compact} />
        ))}
    </section>
  )
}

function Card({ item, thread, onReplied, openReply, compact }: {
  item: BoardItem
  thread: BoardReply[]
  onReplied: (r: BoardReply) => void
  openReply?: boolean
  compact?: boolean
}) {
  const [replying, setReplying] = useState(Boolean(openReply))
  const internal = item.link?.startsWith('https://controlcenter.krishraja.com/') ?? false
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4" data-testid={`board-item-${item.id}`}>
      {item.area ? <div className="text-micro uppercase tracking-[0.14em] text-ink-faint">{item.area}</div> : null}
      <h3 className="text-body font-semibold leading-snug text-ink">{item.title}</h3>
      {item.detail && !compact ? <p className="text-label leading-relaxed text-ink-muted">{item.detail}</p> : null}
      {item.detail && compact ? (
        <details className="text-label text-ink-muted">
          <summary className="cursor-pointer text-ink-faint">More</summary>
          <p className="mt-1.5 leading-relaxed">{item.detail}</p>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {item.link ? (
          <a
            href={item.link}
            {...(internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
            className="inline-flex min-h-[40px] items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3.5 text-label font-medium text-emerald-100 active:bg-emerald-400/20"
          >{item.link_label || 'Open'}</a>
        ) : null}
        {!replying ? (
          <button type="button" onClick={() => setReplying(true)} className="inline-flex min-h-[40px] items-center rounded-full border border-white/12 px-3.5 text-label text-ink-muted active:bg-white/[0.06]">
            Reply
          </button>
        ) : null}
      </div>
      {thread.length > 0 ? (
        <ul className="flex flex-col gap-1.5 border-t border-white/[0.06] pt-2" aria-label="Your replies">
          {thread.map(r => (
            <li key={r.id} className="text-label text-ink">
              <span className="text-ink-faint">You, {boardTime(r.at)}: </span>{r.text}
              <span className="ml-1.5 text-micro text-ink-faint">{r.seen_at ? `· read by ${writerName(r.seen_by)}` : '· not read yet'}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {replying ? <ReplyBox item={item} onReplied={onReplied} /> : null}
    </article>
  )
}

function ReplyBox({ item, onReplied }: { item: BoardItem; onReplied: (r: BoardReply) => void }) {
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
      onReplied(reply)
      change('')
      toast('Sent. The next Claude or Codex session reads it.', 'success')
    } catch (e) {
      toast(`Could not send: ${(e as Error).message}. Your words are kept here.`, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 pt-1">
      <textarea
        value={text}
        onChange={e => change(e.target.value)}
        rows={2}
        placeholder={item.prompt || 'Your reply'}
        aria-label={`Reply to: ${item.title}`}
        className="w-full resize-y rounded-xl border border-white/12 bg-transparent px-3 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-emerald-400/50 focus:outline-none"
      />
      <button
        type="button"
        disabled={!text.trim() || busy}
        onClick={send}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 text-label font-bold text-emerald-950 disabled:opacity-40"
      >
        {busy ? <Working size={14} /> : null} Send reply
      </button>
    </div>
  )
}
