/**
 * The work board: what is waiting on Krish, what is in progress, what is done.
 *
 * Krish, 2026-10-03: "I need the boards to not be Claude pages, but accessible
 * by Codex too and workable using Codex too". The board lives in the shared
 * database and is served by the content engine at /api/workbench (rewritten
 * here by vercel.json). Krish reads it and replies with his cookie; agent
 * sessions in Claude Code or Codex write it with the engine key. Only Krish's
 * cookie can write a reply.
 */

export type BoardLane = 'on_you' | 'in_progress' | 'done' | 'archived'

export interface BoardItem {
  id: string
  lane: BoardLane
  rank: number
  area: string
  title: string
  detail: string
  link: string | null
  link_label: string | null
  prompt: string | null
  updated_by: string
  updated_at: string
}

export interface BoardReply {
  id: string
  item_id: string
  text: string
  by: string
  at: string
  seen_at: string | null
  seen_by: string | null
}

export interface BoardSignal { label: string; state: '' | 'ok' | 'warn' | 'bad'; text: string }

export interface Board {
  state: { headline: string; signals: BoardSignal[]; updated_by: string | null; updated_at: string | null }
  items: BoardItem[]
  replies: BoardReply[]
  unseen_replies: number
}

export async function fetchBoard(): Promise<Board> {
  const r = await fetch('/api/workbench', { headers: { Accept: 'application/json' } })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || body?.ok === false) throw new Error(body?.error || `HTTP ${r.status}`)
  return {
    state: body.state ?? { headline: '', signals: [], updated_by: null, updated_at: null },
    items: Array.isArray(body.items) ? body.items : [],
    replies: Array.isArray(body.replies) ? body.replies : [],
    unseen_replies: Number(body.unseen_replies) || 0,
  }
}

export async function sendReply(itemId: string, text: string): Promise<BoardReply> {
  const r = await fetch('/api/workbench', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reply', item_id: itemId, text }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || body?.ok === false) throw new Error(body?.error || `HTTP ${r.status}`)
  return body.reply as BoardReply
}

/** Items by lane, each lane in its own order: waiting and in progress by rank,
 *  done newest first. */
export function boardLanes(items: BoardItem[]) {
  const byRank = (a: BoardItem, b: BoardItem) => a.rank - b.rank || b.updated_at.localeCompare(a.updated_at)
  return {
    onYou: items.filter(i => i.lane === 'on_you').sort(byRank),
    inProgress: items.filter(i => i.lane === 'in_progress').sort(byRank),
    done: items.filter(i => i.lane === 'done').sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  }
}

/** Replies for one item, oldest first, so the thread reads top to bottom. */
export function repliesFor(itemId: string, replies: BoardReply[]): BoardReply[] {
  return replies.filter(r => r.item_id === itemId).sort((a, b) => a.at.localeCompare(b.at))
}

/** Who did the last write, in plain words. */
export function writerName(by: string | null | undefined): string {
  if (!by) return 'someone'
  if (by === 'Krish') return 'you'
  if (by === 'claude_code' || by === 'claude') return 'Claude'
  if (by === 'codex') return 'Codex'
  return by
}

/** "10:58am" today, "2 Oct, 10:58am" otherwise, in the viewer's time zone. */
export function boardTime(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '')
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay ? time : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`
}
