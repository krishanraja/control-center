/**
 * What each agent is doing, and what it is waiting on Krish for, across the
 * whole roster (OS > Org).
 *
 * Agents report into Control Center (ruling, Krish 2026-10-05, #386), but the
 * roster only said who each agent IS: most cards carried the same role
 * sentence, and the work lived one click away in the selected agent's detail.
 * This reads the open tasks, the recent runs and the fresh rulings once and
 * answers per agent: waiting on you, failing, working on, or idle.
 *
 * Agents are named three ways in the data (`cleo`, `Cleo`, the legacy `agent`
 * column), so every key goes through `agentKey`.
 */

export const agentKey = (s: string | null | undefined): string => (s || '').trim().toLowerCase()

export interface AgentWork {
  /** Rulings this agent is waiting on Krish for. */
  waiting: number
  waitingTitle: string | null
  /** The newest open task's title. */
  now: string | null
  open: number
  /** Failed runs among its recent ones. */
  failing: number
  recent: number
}

export interface RosterWork {
  byAgent: Map<string, AgentWork>
  /** The agent whose recent runs fail most, if any failed. */
  worstFailing: { agent: string; errors: number; of: number } | null
}

/** How many of an agent's latest runs count as "recent" for a failing verdict. */
export const RECENT_RUNS = 5

interface TaskLite { title?: string | null; status?: string | null; owner?: string | null; agent?: string | null }
interface RunLite { agent_id?: string | null; agent?: string | null; status?: string | null }
interface RulingLite { agent: string; title: string }

/**
 * Tasks arrive newest first; runs arrive newest first. A task is "work" when it
 * is open (anything but done or superseded, which the read already excludes).
 */
export function rosterWork(tasks: TaskLite[], runs: RunLite[], rulings: RulingLite[]): RosterWork {
  const byAgent = new Map<string, AgentWork>()
  const get = (k: string) => {
    let w = byAgent.get(k)
    if (!w) { w = { waiting: 0, waitingTitle: null, now: null, open: 0, failing: 0, recent: 0 }; byAgent.set(k, w) }
    return w
  }
  for (const t of tasks) {
    const k = agentKey(t.owner || t.agent)
    if (!k) continue
    const w = get(k)
    w.open += 1
    if (!w.now && t.title) w.now = t.title
  }
  for (const r of rulings) {
    const k = agentKey(r.agent)
    if (!k) continue
    const w = get(k)
    w.waiting += 1
    if (!w.waitingTitle) w.waitingTitle = r.title
  }
  for (const r of runs) {
    const k = agentKey(r.agent_id || r.agent)
    if (!k) continue
    const w = get(k)
    if (w.recent >= RECENT_RUNS) continue
    w.recent += 1
    if (r.status === 'error') w.failing += 1
  }
  let worstFailing: RosterWork['worstFailing'] = null
  for (const [agent, w] of byAgent) {
    if (w.failing > 0 && (!worstFailing || w.failing > worstFailing.errors)) worstFailing = { agent, errors: w.failing, of: w.recent }
  }
  return { byAgent, worstFailing }
}

/** A task status in words. The column holds `waiting` / `in_progress` / `pending-agatha-review` and friends. */
export function taskStatusWord(status: string | null | undefined): string {
  switch (status) {
    // Not "waiting on you": only a fresh ruling (useWaitingDecisions) earns that.
    case 'waiting': return 'Waiting'
    case 'in_progress': return 'In progress'
    case 'active': return 'Active'
    case 'blocked': return 'Blocked'
    case 'new': return 'New'
    case 'open': return 'Open'
    case 'paused': return 'Paused'
    case 'pending-agatha-review': return 'With Agatha for review'
    case 'pending-review': return 'In review'
    default: return status ? status.replace(/[_-]+/g, ' ') : 'Open'
  }
}
