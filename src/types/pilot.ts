// Pilot layer types. Mirrors public.pilot_checkins and public.ships
// (scripts/migrations/2026-07-27-pilot-layer.sql).

export type PilotMode = 'green' | 'red'
export type CheckinKind = 'morning' | 'evening'
export type ShipSource = 'manual' | 'webhook'

/** The fixed channel list. A ship left the machine through exactly one of these. */
export const SHIP_CHANNELS = ['email', 'publish', 'invoice', 'ask', 'campaign', 'other'] as const
export type ShipChannel = (typeof SHIP_CHANNELS)[number]

export interface PilotCheckin {
  id: string
  created_at: string
  kind: CheckinKind
  energy: number | null
  anxiety: number | null
  one_word: string | null
  mode: PilotMode | null
  shipped_today: string | null
  tomorrow_one: string | null
  tomorrow_one_url: string | null
  override_at: string | null
  checkin_date: string | null
  intent: string | null
  /** Morning rows only. The day was closed without a reading; energy and
   *  anxiety are null and are not a measurement of anything. */
  skipped?: boolean
}

export interface Ship {
  id: string
  created_at: string
  occurred_at: string
  source: ShipSource
  channel: string
  description: string
  external_ref: string | null
  dedup_key: string | null
}

/** What GET /api/pilot/ships returns. */
export interface ShipSummary {
  this_week: number
  /** Whole days since the most recent ship. Null when nothing has shipped yet. */
  days_since_last: number | null
  last_ten: Ship[]
  /** Median gap in days between consecutive ships over the trailing 60 days. */
  return_rate: number | null
}

/** What GET /api/pilot/checkin returns. */
export interface PilotState {
  /** Today's morning row, in the pilot zone. Null means the gate must render. */
  morning: PilotCheckin | null
  /** The most recent evening row, which carries today's ONE. */
  last_evening: PilotCheckin | null
  /** True once an evening row exists for today, so the shutdown stops prompting. */
  evening_done_today: boolean
  /** Yesterday's reading and output, for the one-line recap. */
  yesterday: YesterdayRecap | null
  today: string
}

export interface YesterdayRecap {
  date: string
  energy: number | null
  anxiety: number | null
  mode: PilotMode | null
  one_word: string | null
  intent: string | null
  skipped?: boolean
  ships: number
}

export interface LogShipInput {
  channel: ShipChannel
  description: string
}

// ── The daily ask (Focus & Purpose home) ─────────────────────────────────────
// Mirrors public.pilot_asks (scripts/migrations/2026-08-20-pilot-asks.sql).

export type PilotAskOutcome = 'yes' | 'no' | 'alternative' | 'no_reply'

export interface PilotAsk {
  id: string
  created_at: string
  ask_date: string
  ask_text: string
  /** The operator's own refusal forecast, 0 to 100, recorded before the send. */
  predicted_no_pct: number | null
  sent_at: string | null
  outcome: PilotAskOutcome | null
  resolved_at: string | null
}

/** What GET /api/pilot/asks returns. */
export interface AskState {
  /** Today's ask, or null until one is committed. */
  today_ask: PilotAsk | null
  /** The single oldest sent, unresolved ask from a past day. Never a list. */
  unresolved: PilotAsk | null
  today: string
}
