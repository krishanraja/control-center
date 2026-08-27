import { useAgentsContext } from '../contexts/AgentsContext'

/**
 * Every wait in this app that is worth a sentence, written down once.
 *
 * Two problems this solves at the same time.
 *
 * THE COPY. "Working…" tells you nothing you could not see from the disabled
 * button. Loading copy has to name the actual work, in the present continuous,
 * with one spelling of the ellipsis and one capitalisation. Scattering that
 * across forty files is how you end up with `Saving…`, `Saving...` and `Saving`
 * in the same product, plus a `Working...` in the one component whose own
 * doctrine comment forbids it.
 *
 * THE ATTRIBUTION. A model-backed wait should say who is doing the work, so a
 * long pause reads as delegation rather than latency. But agents get renamed
 * and retired (Felix and Hunter already have, see docs/AGENTS.md), and a wait
 * that confidently names a retired agent is worse than one that says nothing.
 * So no display name is written here. Each operation stores a SLUG, and the
 * name is resolved live through the agents roster at render time, with a
 * neutral fallback when the roster is unreachable.
 *
 * The slugs below are not guesses. Each one is the agent the route itself
 * already attributes the work to (its prompt preamble or its persona), or the
 * shared module it calls through.
 */

/** Present participle, lower case. Renders as "Cleo is rewriting the draft" or
 *  "Rewriting the draft" depending on whether the roster resolves. */
export interface WorkDef {
  /** Roster slug, omitted for work no agent performs (plain reads, exports). */
  agent?: string
  /** The work itself: "rewriting the draft", "scoring the five standards". */
  doing: string
  /** The reassuring second line. What is happening, or what you will get. */
  sub?: string
  /** Named stages for a wait long enough to need narrating. */
  stages?: string[]
  /** Roughly how long this normally takes. Past it, the UI says so plainly
   *  rather than repeating itself. Never rendered as a countdown. */
  expectedMs?: number
}

export const WORK = {
  // ── Content, Cleo (Content Production & Voice) ──────────────────────────
  'content.revise':      { agent: 'cleo', doing: 'rewriting the draft', sub: 'Locking the draft while it works', expectedMs: 40_000 },
  'content.rewriteSel':  { agent: 'cleo', doing: 'rewriting the selected passage', sub: 'Locking the draft while it works', expectedMs: 30_000 },
  'content.score':       { agent: 'cleo', doing: 'checking it against the five standards', sub: 'Reading it the way a reader would', expectedMs: 35_000 },
  'content.finalPass':   { agent: 'cleo', doing: 'running the final review', sub: 'Last pass before it leaves the building', expectedMs: 45_000 },
  'content.rerun':       { agent: 'cleo', doing: 're-reading', sub: 'Re-running with your lenses', expectedMs: 40_000 },
  'content.diveDeeper':  { agent: 'cleo', doing: 'working out what research would strengthen this', expectedMs: 30_000 },
  'content.research':    { agent: 'cleo', doing: 'researching', sub: 'Pulling sources for the claim', expectedMs: 45_000 },
  'content.channelCut':  { agent: 'cleo', doing: 'trimming it for the channel', expectedMs: 30_000 },
  'content.synthesize':  { agent: 'cleo', doing: 'drafting one narrative from these cards', expectedMs: 40_000 },
  'content.cluster':     { agent: 'cleo', doing: 'grouping similar ideas' },
  'content.likelyReasons': { agent: 'cleo', doing: 'working out why this landed the way it did', expectedMs: 20_000 },
  'brief.revise':        { agent: 'cleo', doing: 'revising the brief', sub: 'Applying your instruction', expectedMs: 40_000 },
  'brief.assemble':      { agent: 'zara', doing: 'assembling the week', sub: 'Reading everything that moved', expectedMs: 60_000 },
  'skills.draft':        { agent: 'cleo', doing: 'drafting skills', sub: 'Building them from the transcript', expectedMs: 60_000 },
  'skills.refine':       { agent: 'cleo', doing: 'refining this skill', sub: 'Applying your instruction', expectedMs: 40_000 },
  'skills.regenerate':   { agent: 'cleo', doing: 'rebuilding the skills', expectedMs: 60_000 },
  'skills.ship':         { agent: 'cleo', doing: 'shipping the skills', sub: 'Saving and emailing the client', expectedMs: 25_000 },
  'email.draft':         { agent: 'cleo', doing: 'drafting the email', sub: 'Composing in your voice for review', expectedMs: 45_000 },
  'publish.build':       {
    agent: 'cleo',
    doing: 'building the piece',
    sub: 'It lands as a draft you finish. Nothing publishes itself.',
    stages: ['Reading your source material', 'Drafting in your voice', 'Holding it to the five standards'],
    expectedMs: 60_000,
  },
  'docs.ship':           { doing: 'shipping to Google Docs', sub: 'Building the formatted draft', expectedMs: 20_000 },

  // ── Intelligence, Marcus (BD Intelligence / Synthesis) ──────────────────
  'ask.marcus':          { agent: 'marcus', doing: 'thinking', sub: 'Grounded in live customers, leads and bets', expectedMs: 25_000 },
  'tab.chat':            { agent: 'marcus', doing: 'reading this tab', sub: "Grounded in the rows this tab is showing", expectedMs: 25_000 },
  'focus.slate':         { agent: 'marcus', doing: 'putting the shortlist together', sub: 'Reading the week against your goals', expectedMs: 30_000 },
  'objectives.voice':    { agent: 'marcus', doing: 'reading that back', expectedMs: 20_000 },
  'objectives.propose':  { agent: 'marcus', doing: 'proposing milestones', expectedMs: 30_000 },
  'pilot.resolveAsk':    { agent: 'marcus', doing: 'working out what you are asking for', expectedMs: 20_000 },
  'network.explain':     { agent: 'marcus', doing: 'working out why each one matches', expectedMs: 25_000 },
  'network.search':      { agent: 'marcus', doing: 'searching your network', expectedMs: 15_000 },
  'signals.promote':     { agent: 'marcus', doing: 'promoting the signal to a bet' },

  // ── Quality, Vera (Chief of Staff & Quality) ────────────────────────────
  'triage.sweep':        { agent: 'vera', doing: 'classifying the cards', sub: 'Scoring each one against the current lenses', expectedMs: 60_000 },

  // ── Market, Zara (Signal Intelligence & Market Research) ────────────────
  'shifts.detect':       { agent: 'zara', doing: 'detecting shifts', expectedMs: 60_000 },
  'intel.signals':       { agent: 'zara', doing: 'reading fresh signals' },

  // ── Acquisition, Maya (Marketing / SEO) ─────────────────────────────────
  'lead.enrich':         { agent: 'maya', doing: 'researching now', sub: 'Apollo, the web and Cleo are building a brief', expectedMs: 45_000 },
  'lead.icpScore':       { agent: 'maya', doing: 'scoring against the ICP', expectedMs: 20_000 },

  // ── Booking, Nell (Outbound + Podcast Guest Booking) ────────────────────
  'guests.scout':        { agent: 'nell', doing: 'scouting guests', expectedMs: 60_000 },

  // ── Infrastructure, Arlo (Technical Operations) ─────────────────────────
  'systems.poll':        { agent: 'arlo', doing: 'polling the services' },

  // ── Work no agent performs: plain reads, local transforms, IO ───────────
  'agent.trigger':       { doing: 'starting the agent run' },
  'file.import':         { doing: 'importing' },
  'voice.transcribe':    { doing: 'transcribing', expectedMs: 12_000 },
  'record.save':         { doing: 'saving' },
} as const satisfies Record<string, WorkDef>

export type WorkKey = keyof typeof WORK

/** Sentence-case the participle when no agent is named. */
function neutral(doing: string): string {
  return doing.charAt(0).toUpperCase() + doing.slice(1)
}

export interface ResolvedWork {
  /** The one line: "Cleo is rewriting the draft" or "Rewriting the draft". */
  label: string
  sub?: string
  stages?: string[]
  expectedMs?: number
}

/** Pure resolution, so this is testable and usable outside React. */
export function resolveWork(key: WorkKey, agentName?: string): ResolvedWork {
  const w = WORK[key] as WorkDef
  return {
    label: agentName ? `${agentName} is ${w.doing}` : neutral(w.doing),
    sub: w.sub,
    stages: w.stages ? [...w.stages] : undefined,
    expectedMs: w.expectedMs,
  }
}

/**
 * The hook every call site uses. Resolves the agent's CURRENT display name from
 * the live roster; falls back to the neutral phrasing when the operation has no
 * agent, when the roster has not loaded, or when the named agent has been
 * retired out of it. A wait never blocks on knowing who is doing the work.
 */
export function useWork(key: WorkKey): ResolvedWork {
  const { resolveAgent } = useAgentsContext()
  const slug = (WORK[key] as WorkDef).agent
  const agent = slug ? resolveAgent(slug) : undefined
  return resolveWork(key, agent?.humanName || undefined)
}
