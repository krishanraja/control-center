/**
 * The one move on each surface, as rules rather than as components.
 *
 * Growth turns what it knows into one thing to do (`growth/MoveCard`, rendered
 * through `shared/DoThisNextHero`). Every other surface held to that standard
 * (Krish, 2026-10-05: "use the current Growth tab as the gold standard ... and
 * make sure the rest of the tabs are at that standard") decides its move here,
 * so the order each one follows is written down, tested without a browser
 * (tests/api/surfaceMoves.test.ts), and shared by the desk and the phone.
 *
 * Each rule returns a `SurfaceMove`:
 *   headline  WHAT to do, naming the thing it is about
 *   sub       one short line that carries a number, never the evidence itself
 *   why       the evidence, shown only when asked; it opens on what it MEANS
 *   clear     nothing to do: one line says why, once, and the surface says
 *             nothing else about the same nothing
 *
 * Pure: no clock reads, no fetches. Callers pass what they already loaded.
 */

export type MoveTone = 'emerald' | 'violet' | 'sky' | 'amber' | 'neutral'

export interface SurfaceMove<K extends string = string> {
  kind: K
  headline: string
  sub: string
  why?: string
  actionLabel?: string
  tone?: MoveTone
  clear?: boolean
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── Subscriptions ───────────────────────────────────────────────────────────

export interface SubscriptionsMoveInput {
  /** Paying customers flagged for a check-in and not emailed in a week, biggest first. */
  checkIns: Array<{ id: string; name: string; mrrUsd: number | null }>
  revenue: { paying: number; committedLabel: string } | null
  /** Hours since Stripe was last read; null when it never was. */
  ageHours: number | null
  behind: boolean
  /** Unwired numbers, already in priority order (src/lib/portfolioBoard.ts). */
  gaps: Array<{ productLabel: string; venture: string; tier: number; label: string; gap: string; fix: string | null }>
  loading: boolean
}

export type SubscriptionsMoveKind = 'check_in' | 'sync' | 'wire' | 'clear'

/**
 * Money first, then the truth of the numbers, then what the numbers cannot
 * see yet. A paying customer waiting on a check-in outranks a stale sync,
 * which outranks wiring: wiring makes the board more complete, the other two
 * protect revenue that already exists.
 */
export function subscriptionsMove(i: SubscriptionsMoveInput): SurfaceMove<SubscriptionsMoveKind> | null {
  if (i.loading && !i.revenue && i.checkIns.length === 0) return null
  const top = i.checkIns[0]
  if (top) {
    const money = top.mrrUsd && top.mrrUsd > 0 ? `$${Math.round(top.mrrUsd)} a month` : 'A paying customer'
    return {
      kind: 'check_in',
      headline: `Check in with ${top.name}`,
      sub: i.checkIns.length > 1
        ? `${money}. ${plural(i.checkIns.length - 1, 'more paying account')} after this one.`
        : `${money}. Maya flagged them, and nobody has written in a week.`,
      why: 'Maya flags a paying customer when the account looks ready to grow or quiet enough to lose. The biggest flagged account comes first, and anyone emailed in the last seven days waits.',
      actionLabel: 'Draft the check-in',
      tone: 'emerald',
    }
  }
  if (i.behind) {
    return {
      kind: 'sync',
      headline: i.ageHours == null ? 'Read Stripe for the first time' : 'Stripe is out of date. Sync it',
      sub: i.ageHours == null
        ? 'No revenue figure here has been read yet.'
        : `Last read ${i.ageHours < 48 ? `${Math.round(i.ageHours)} hours` : `${Math.round(i.ageHours / 24)} days`} ago. The money below may be wrong.`,
      why: 'Every figure on this tab is Stripe\'s own. Older than a day and a half and a new or lost subscriber may be missing from it, so the numbers come before anything else on the board.',
      actionLabel: 'Sync now',
      tone: 'amber',
    }
  }
  const gap = i.gaps[0]
  if (gap) {
    return {
      kind: 'wire',
      headline: `Wire ${gap.label} for ${gap.productLabel}`,
      sub: gap.fix ?? gap.gap,
      why: `${gap.productLabel} is priority ${gap.tier}, so its blank numbers come first. ${gap.gap}${i.gaps.length > 1 ? ` ${plural(i.gaps.length - 1, 'more number')} to wire after this one.` : ''}`,
      actionLabel: `Open ${gap.productLabel}`,
      tone: 'sky',
    }
  }
  return {
    kind: 'clear',
    headline: 'Nothing here needs you',
    sub: i.revenue
      ? `${plural(i.revenue.paying, 'paying subscriber')}, ${i.revenue.committedLabel} a month. Every number is wired and nobody is waiting on a check-in.`
      : 'Every number is wired and nobody is waiting on a check-in.',
    clear: true,
  }
}

// ── Hunt ────────────────────────────────────────────────────────────────────

export interface HuntMoveInput {
  status: {
    failing: boolean
    failLine: string | null
    waitingOnKrish: number | null
    approvedAwaitingBuild: number | null
  } | null
  /** Roles he said Yes to, in the order the lane shows them. */
  roles: Array<{ id: string; title: string; company: string; person: string | null; applied: boolean; contactable: boolean }>
  /** Warm paths still proposed, warmest first. */
  paths: Array<{ id: string; person: string; title: string | null; company: string | null }>
  /** A queued or running hunter command, if any. */
  running: string | null
}

export type HuntMoveKind = 'fix' | 'contact' | 'path' | 'verdicts' | 'build' | 'running' | 'clear'

const COMMAND_WORD: Record<string, string> = { process: 'Process', source: 'Find roles', packages: 'Build packages' }

/**
 * A broken hunter first, because nothing else on the lane is true while it is
 * broken. Then a person to write to (a role he said Yes to beats a path still
 * waiting for one), then the sheet, then the packages.
 */
export function huntMove(i: HuntMoveInput): SurfaceMove<HuntMoveKind> {
  if (i.status?.failing) {
    return {
      kind: 'fix',
      headline: 'Hunter\'s last run failed',
      sub: i.status.failLine || 'The run reported an error and nothing new landed.',
      why: 'Every role, package and path on this lane comes from a hunter run, so a failed run means the list below is as old as the last good one. Running Process again is the quickest test of whether it was a one-off.',
      actionLabel: 'Run Process again',
      tone: 'amber',
    }
  }
  const role = i.roles.find(r => r.person && r.contactable)
  if (role) {
    const others = i.roles.filter(r => r.person && r.contactable).length - 1
    return {
      kind: 'contact',
      headline: role.applied
        ? `Follow up with ${role.person} about ${role.title} at ${role.company}`
        : `Write to ${role.person} about ${role.title} at ${role.company}`,
      sub: role.applied
        ? `You have already applied, so this is the follow-up.${others > 0 ? ` ${plural(others, 'more role')} with a person after it.` : ''}`
        : `A role you said Yes to, with the person who can get you in.${others > 0 ? ` ${plural(others, 'more')} after it.` : ''}`,
      why: 'Roles you said Yes to come before warm paths still waiting for one, and the role nearest the top of your sheet comes first. The draft is already written; nothing sends until you press send in your own mail.',
      actionLabel: 'Write now',
      tone: 'violet',
    }
  }
  const path = i.paths[0]
  if (path) {
    const where = [path.title, path.company].filter(Boolean).join(' at ')
    return {
      kind: 'path',
      headline: `Send ${path.person} the draft${where ? ` about ${where}` : ''}`,
      sub: i.paths.length > 1 ? `The warmest of ${i.paths.length} paths waiting.` : 'The one warm path waiting.',
      why: 'A path is someone you know who can open a door into a role. They are ranked by how warm the relationship is, and each card below carries the draft.',
      actionLabel: 'Show the draft',
      tone: 'violet',
    }
  }
  const waiting = i.status?.waitingOnKrish ?? 0
  if (waiting > 0) {
    return {
      kind: 'verdicts',
      headline: `Give your verdict on ${plural(waiting, 'role')}`,
      sub: 'They wait in column A of the Pipeline sheet. Mark them, then press Process.',
      why: 'Hunter finds roles; you decide which are worth going for on the sheet, and a Process run builds the package and finds the person for each Yes.',
      actionLabel: 'Open the sheet',
      tone: 'violet',
    }
  }
  const build = i.status?.approvedAwaitingBuild ?? 0
  if (build > 0) {
    return {
      kind: 'build',
      headline: `Build the ${plural(build, 'package')} for roles you said Yes to`,
      sub: 'A CV and a cover letter for each, ready to send.',
      actionLabel: 'Build packages',
      tone: 'violet',
    }
  }
  if (i.running) {
    return {
      kind: 'running',
      headline: `${COMMAND_WORD[i.running] ?? i.running} is running`,
      sub: 'What it finds lands on this lane. There is nothing to do until then.',
      clear: true,
    }
  }
  return {
    kind: 'clear',
    headline: 'Nothing in the hunt needs you',
    sub: 'No role is marked Yes on the sheet and no warm path is waiting. Mark a row Yes and press Process to start one.',
    clear: true,
  }
}

// ── Advisory ────────────────────────────────────────────────────────────────

export const PILOT_PLAN_ASKS = 25

export interface AdvisoryMoveInput {
  /** People on the list with their state, in the lane's order. */
  deals: Array<{ id: string; name: string; state: string }>
  /** How many have been written to, at any rung. */
  asked: number
  /** People who replied and are waiting on him (they may sit outside the default view). */
  replies: number
  onList: number
  proposals: number
  seeding: boolean
  findNote: string | null
  error: boolean
}

export type AdvisoryMoveKind = 'reply' | 'send' | 'triage' | 'finding' | 'find' | 'wait'

/**
 * A reply first (someone is waiting on him), then a drafted note to send, then
 * the people just found, then finding more. The plan's arithmetic rides in the
 * supporting line because it is the answer to "why these people".
 */
export function advisoryMove(i: AdvisoryMoveInput): SurfaceMove<AdvisoryMoveKind> | null {
  if (i.error) return null
  const progress = `${i.asked} of the ${PILOT_PLAN_ASKS} asks the plan needs.`
  const why = 'The plan is about 25 asks for 5 calls and one paid three week pilot by 5 December. A reply waiting on you comes first, then a drafted note to send.'
  const replied = i.deals.find(d => d.state === 'replied')
  if (replied || i.replies > 0) {
    return {
      kind: 'reply',
      headline: replied && i.replies <= 1 ? `${replied.name} replied. Book the call` : `${plural(Math.max(i.replies, 1), 'person', 'people')} replied. Book the calls`,
      sub: progress, why, actionLabel: i.replies > 1 ? 'Show the replies' : 'Show the reply', tone: 'emerald',
    }
  }
  const drafted = i.deals.find(d => d.state === 'drafted')
  if (drafted) {
    const more = i.deals.filter(d => d.state === 'drafted').length - 1
    return {
      kind: 'send', headline: `Send ${drafted.name} the note`,
      sub: `${more > 0 ? `${plural(more, 'more draft')} after this one. ` : ''}${progress}`,
      why, actionLabel: 'Show the note', tone: 'violet',
    }
  }
  if (i.proposals > 0) {
    return {
      kind: 'triage', headline: `Keep or skip the ${plural(i.proposals, 'person', 'people')} just found`,
      sub: 'They come from your own contacts. Nothing is added until you keep one.',
      why, tone: 'violet',
    }
  }
  if (i.seeding) {
    return {
      kind: 'finding', headline: 'Looking through your network for five who fit',
      sub: 'Nothing is added until you keep one.', clear: true,
    }
  }
  if (i.onList === 0) {
    return i.findNote
      ? {
          kind: 'find', headline: 'Search your network again for five who fit',
          sub: `Nobody is on the list yet. ${i.findNote}`,
          why, actionLabel: 'Search again', tone: 'violet',
        }
      : {
          kind: 'find', headline: 'Find five people who could pay for a pilot',
          sub: 'Nobody is on the list yet. The Monday run drafts a note for each one you keep.',
          why, actionLabel: 'Find five', tone: 'violet',
        }
  }
  return {
    kind: 'wait', headline: 'Nothing to send yet',
    sub: `The Monday run drafts a note for the ${plural(i.onList, 'person', 'people')} on your list. ${progress}`,
    why, actionLabel: 'Find five more', tone: 'neutral',
  }
}

// ── OS > Org ────────────────────────────────────────────────────────────────

export interface OrgMoveInput {
  /** Vera's brief edits, oldest first. */
  corrections: Array<{ id: string; agent: string; reason: string | null; downvotes: number }>
  /** Fresh rulings owned by an agent (task, returned capture, persistent gap), newest first. */
  rulings: Array<{ id: string; kind: string; title: string; agent: string; detail: string | null }>
  agentCount: number
  /** Agents with open work. */
  working: number
  /** The agent whose recent runs fail most, if any failed. */
  failing?: { agent: string; errors: number; of: number } | null
}

export type OrgMoveKind = 'ruling' | 'correction' | 'failing' | 'clear'

const AGENT = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'An agent')

/**
 * A ruling an agent is blocked on comes before a correction to an agent's
 * brief: the first stops work today, the second improves work next week.
 */
export function orgMove(i: OrgMoveInput): SurfaceMove<OrgMoveKind> {
  const r = i.rulings[0]
  if (r) {
    return {
      kind: 'ruling',
      headline: r.title,
      sub: `${AGENT(r.agent)} is waiting on you.${i.rulings.length > 1 ? ` ${plural(i.rulings.length - 1, 'more ruling')} after this one.` : ''}`,
      why: r.detail || `${AGENT(r.agent)} asked for this and holds the work until you answer. Rulings an agent is waiting on come before changes to how an agent works.`,
      actionLabel: r.kind === 'task' ? undefined : `Open ${AGENT(r.agent)}`,
      tone: 'amber',
    }
  }
  const c = i.corrections[0]
  if (c) {
    return {
      kind: 'correction',
      headline: `Review Vera's change to ${AGENT(c.agent)}'s brief`,
      sub: `${c.downvotes ? `${plural(c.downvotes, 'downvote')} led to it. ` : ''}${i.corrections.length > 1 ? `${plural(i.corrections.length - 1, 'more')} after this one.` : 'Approve it to ship it.'}`,
      why: `Vera noticed the same complaint about ${AGENT(c.agent)}'s work more than once${c.reason ? ` (${c.reason.replace(/_/g, ' ')})` : ''} and wrote a change to its brief. Nothing changes until you approve it.`,
      actionLabel: 'Review it',
      tone: 'amber',
    }
  }
  const f = i.failing
  if (f && f.errors > 0) {
    return {
      kind: 'failing',
      headline: `Look at why ${AGENT(f.agent)}'s runs are failing`,
      sub: `${f.errors} of its last ${f.of} runs failed. Nothing is waiting on you otherwise.`,
      why: 'No agent is waiting on a ruling and no brief change needs review, so the next most useful thing is the agent whose recent runs fail most. Its runs are listed on its page.',
      actionLabel: `Open ${AGENT(f.agent)}`,
      tone: 'sky',
    }
  }
  return {
    kind: 'clear',
    headline: 'No agent is waiting on you',
    sub: `${plural(i.agentCount, 'agent')}, ${i.working} with open work. Nothing to rule on and no brief change to review.`,
    clear: true,
  }
}

// ── OS > Systems ────────────────────────────────────────────────────────────

export interface SystemsMoveInput {
  down: Array<{ name: string; note: string; url?: string }>
  warning: Array<{ name: string; note: string; url?: string }>
  healthy: number
  unchecked: number
}

export type SystemsMoveKind = 'down' | 'warning' | 'unchecked' | 'clear'

export function systemsMove(i: SystemsMoveInput): SurfaceMove<SystemsMoveKind> {
  const total = i.down.length + i.warning.length + i.healthy + i.unchecked
  const tally = [
    i.down.length ? `${i.down.length} down` : null,
    i.warning.length ? `${i.warning.length} warning` : null,
    i.healthy ? `${i.healthy} healthy` : null,
    i.unchecked ? `${i.unchecked} unchecked` : null,
  ].filter(Boolean).join(', ')
  const d = i.down[0]
  if (d) {
    return {
      kind: 'down',
      headline: `${d.name} is down`,
      sub: `${d.note ? `${d.note}. ` : ''}${tally}.`.replace(/\.\./g, '.'),
      why: 'A service that is down stops the agents that use it, so it comes before a warning. Down services are listed first below.',
      actionLabel: d.url ? `Open ${d.name}` : 'Check again',
      tone: 'amber',
    }
  }
  const w = i.warning[0]
  if (w) {
    return {
      kind: 'warning',
      headline: i.warning.length === 1 ? `${w.name} needs a look` : `${w.name} and ${plural(i.warning.length - 1, 'other')} need a look`,
      sub: `${w.note ? `${w.note}. ` : ''}${tally}.`.replace(/\.\./g, '.'),
      why: 'A warning is a service still answering but not as it should: slow, low on credit, or returning errors some of the time. Nothing is down. Warnings are listed first below.',
      actionLabel: 'Check again',
      tone: 'amber',
    }
  }
  if (total > 0 && i.unchecked === total) {
    return {
      kind: 'unchecked',
      headline: 'No service has been checked yet',
      sub: `${plural(total, 'service')} waiting for Arlo's first check.`,
      actionLabel: 'Check now',
      tone: 'sky',
    }
  }
  return {
    kind: 'clear',
    headline: 'Nothing here needs you',
    sub: total ? `${tally}. A real failure also shows on Home.` : 'No services are being watched yet.',
    clear: true,
  }
}

// ── OS > Flows ──────────────────────────────────────────────────────────────

export interface FlowsMoveInput {
  proposals: Array<{ id: string; title: string; agent: string | null }>
  /** Workflows whose last run failed, worst first. */
  failing: Array<{ id: string; name: string; errors: number; runs: number }>
  workflows: number
}

export type FlowsMoveKind = 'proposal' | 'failing' | 'clear'

export function flowsMove(i: FlowsMoveInput): SurfaceMove<FlowsMoveKind> {
  const p = i.proposals[0]
  if (p) {
    return {
      kind: 'proposal',
      headline: `Approve or reject: ${p.title}`,
      sub: `${p.agent ? `${AGENT(p.agent)} proposed it. ` : ''}${i.proposals.length > 1 ? `${plural(i.proposals.length - 1, 'more proposal')} after this one.` : 'The only proposal waiting.'}`,
      why: 'A proposal is an agent asking to change how a workflow runs. Nothing changes until you approve it, so it waits on you before anything else here.',
      actionLabel: 'Show it',
      tone: 'violet',
    }
  }
  const f = i.failing[0]
  if (f) {
    return {
      kind: 'failing',
      headline: `${f.name} failed on its last run`,
      sub: `${f.errors} of its last ${f.runs} runs failed.${i.failing.length > 1 ? ` ${plural(i.failing.length - 1, 'more workflow')} failing too.` : ''}`,
      why: 'The workflow with the most recent failures comes first. A rerun is the quickest test of whether it was a one-off; a second failure needs the agent that owns it.',
      actionLabel: 'Rerun it',
      tone: 'amber',
    }
  }
  return {
    kind: 'clear',
    headline: 'Nothing here needs you',
    sub: i.workflows ? `${plural(i.workflows, 'workflow')} ran, and every last run worked. No proposal is waiting.` : 'No workflow has run yet and no proposal is waiting.',
    clear: true,
  }
}
