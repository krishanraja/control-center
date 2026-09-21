/**
 * The browser half of the edit ledger.
 *
 * `content_edit_events` is written by the engine at POST /api/content-edits, and
 * until now nothing in this repo called it. The richest signal in the product
 * was being computed and dropped on the floor: briefDiff works out, per
 * section, which of Cleo's changes Krish kept and which he binned, and
 * keepPreview used that to build the merged document and then discarded it.
 *
 * The visible cost of that was a false alarm. `learning/compile` reads this
 * table, correctly judged one edit event in 28 days too thin to learn from, and
 * said so; the response was to mark the lane starvation-normal so it stopped
 * reporting. The lane was not starving. Nothing was feeding it.
 *
 * TWO RULES FROM THE LEDGER'S OWN ADMISSION FILE, both load bearing here:
 *
 *   Bounded. Hashes, a structured diff and counts. Never two full bodies and
 *   never a conversation.
 *
 *   Anti-echo. This may inform form and craft. It must never rank a candidate
 *   higher because Krish showed interest in its subject. So nothing below sends
 *   a section key or a heading: briefDiff derives its key by slugging the
 *   heading, which makes it a topic, and a topic is the one thing this table is
 *   not allowed to carry.
 */

/**
 * POST one event, and be able to say when it did not land.
 *
 * `fetch` RESOLVES on 400, 401 and 500; it rejects only on a network fault. So
 * a bare `await fetch(...)` inside a try/catch cannot tell a rejected event
 * from an accepted one, and the catch never fires. That is the same shape as
 * the usage meter discarding supabase.rpc's returned error, and as the n8n
 * nodes that render a 404 as a green node: three ways of reporting success for
 * work that did not happen.
 *
 * Still non-blocking, still nothing the operator sees. But the failure reaches
 * a console line, so "Krish kept nothing" and "the ledger is rejecting us" stop
 * looking identical from here.
 */
async function postEvent(body: Record<string, unknown>): Promise<{ ok: boolean; error: string | null }> {
  try {
    const r = await fetch('/api/content-edits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Survives the composer closing in the same tick as the save.
      keepalive: true,
    })
    if (r.ok) return { ok: true, error: null }
    return { ok: false, error: `content-edits ${r.status}` }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e).slice(0, 120) }
  }
}

/** Hex SHA-256, or null where the platform will not do it.
 *
 *  `crypto.subtle` needs a secure context. Production is https and localhost
 *  counts, so the null path is for a hostile or very old browser. It is a real
 *  path rather than a throw because `section_kept` and `section_dropped` do not
 *  require a hash: an event with no hashes is still admissible and still says
 *  which way the decision went. */
export async function sha256Hex(text: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(text ?? '')
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

export type SectionOutcome = 'section_kept' | 'section_dropped'

export interface SectionVerdict {
  /** 'changed' | 'added' | 'removed' from briefDiff. Structure, not subject. */
  status: string
  before: string
  after: string
  kept: boolean
}

function client(): 'desktop' | 'mobile' {
  return typeof window !== 'undefined' && window.innerWidth < 900 ? 'mobile' : 'desktop'
}

/** The admissible row for one section verdict.
 *
 *  Pure, and exported so the anti-echo rule is provable without a browser or a
 *  database: tests/api/editLedger.test.ts asserts that no heading, no section
 *  key and no body text can reach the ledger through it. */
export function briefSectionEvent(input: {
  week: string
  mode: string | null
  section: SectionVerdict
  idempotencyKey: string
  beforeHash: string | null
  afterHash: string | null
  client: 'desktop' | 'mobile'
}): Record<string, unknown> {
  const { week, mode, section, idempotencyKey, beforeHash, afterHash } = input
  return {
    idempotency_key: idempotencyKey,
    subject_table: 'weekly_briefs',
    subject_id: week,
    artifact_kind: 'brief_section',
    action: section.kept ? 'section_kept' : 'section_dropped',
    surface: 'brief_editor',
    client: input.client,
    mode,
    before_hash: beforeHash,
    after_hash: afterHash,
    chars_before: section.before.length,
    chars_after: section.after.length,
    // Structural only. `status` says whether the section was changed, added or
    // removed; it never says what the section was about.
    delta_features: [section.status],
  }
}

/**
 * One event per section Cleo changed, recording which way it went.
 *
 * Fire and forget by design. This is ambient evidence, not an operator write:
 * it has no end, no toast and no retry, and a ledger that is down must never be
 * the reason a brief fails to save. That is the same posture the engine takes
 * on its own side, where recordContentRun swallows its errors so the ledger can
 * never be why a cron fails.
 */
export async function recordBriefSectionVerdicts(input: {
  week: string
  /** The edit that produced the revision, e.g. 'tighten'. Form, not subject. */
  mode: string | null
  sections: SectionVerdict[]
}): Promise<void> {
  const { week, mode, sections } = input
  if (!week || !sections.length) return

  await Promise.all(sections.map(async section => {
    try {
      const [before_hash, after_hash] = await Promise.all([
        sha256Hex(section.before),
        sha256Hex(section.after),
      ])
      const body = briefSectionEvent({
        week, mode, section,
        idempotencyKey: crypto.randomUUID(),
        beforeHash: before_hash,
        afterHash: after_hash,
        client: client(),
      })
      const posted = await postEvent(body)
      if (!posted.error) return
      console.warn(`[edit-ledger] brief section verdict not recorded: ${posted.error}`)
    } catch {
      // Ambient. Silence is correct for the work; the POST says its own failure.
    }
  }))
}

/**
 * The other half of a magic edit: what Krish did with what the machine offered.
 *
 * THE GAP THIS CLOSES. api/content-ideas/:id/revise writes a `magic_invoked`
 * row for every preset run, and returns edit_event_id so the composer "can
 * later resolve the same event to accepted or rejected" — its own words.
 * Nothing ever did. There is no resolver anywhere in the fleet, and nothing in
 * this repo so much as reads edit_event_id.
 *
 * That is not a missing nicety, it is the learning bank's whole comparison.
 * learning/compile's presetProposals gates on `resolved = accepted + rejected`
 * and skips any preset with fewer than three. With no writer for either verdict
 * `resolved` is permanently zero, so the detector cannot emit a proposal no
 * matter how hard the composer is used. The ruling is that everything the
 * machine suggests gets compared against what Krish did to it; the suggestion
 * was recorded and the verdict was not.
 *
 * PAIRING. content_edit_events is append-only — a trigger rejects UPDATE and
 * DELETE — so a verdict is a NEW row, not a patch of the invoked one. They pair
 * on before_hash, which is why the caller must pass the SAME source text the
 * revise ran on, and on (mode, value), which is the key presetProposals counts.
 * Both hashes are plain lowercase-hex SHA-256 of the raw string on either side.
 *
 * ANTI-ECHO. Form only: which preset, which way it went, how long the decision
 * took, how the length moved. No heading, no body, no subject. The idea id is
 * admissible and already carried by the invoked row; the compiler uses it only
 * to cite a counterexample.
 */
export function magicVerdictEvent(input: {
  ideaId: string
  mode: string
  value: string | null
  kept: boolean
  idempotencyKey: string
  beforeHash: string | null
  afterHash: string | null
  charsBefore: number
  charsAfter: number
  dwellMs: number | null
  client: 'desktop' | 'mobile'
}): Record<string, unknown> {
  return {
    idempotency_key: input.idempotencyKey,
    subject_table: 'content_ideas',
    subject_id: input.ideaId,
    artifact_kind: 'draft',
    action: input.kept ? 'magic_accepted' : 'magic_rejected',
    surface: 'composer',
    client: input.client,
    mode: input.mode,
    value: input.value,
    // Required by content_edit_events_resolution_has_parent, and the thing that
    // pairs this row to its invocation.
    before_hash: input.beforeHash,
    // Required by content_edit_events_change_has_result when kept. A rejected
    // verdict has no result, so it carries none.
    after_hash: input.kept ? input.afterHash : null,
    chars_before: input.charsBefore,
    chars_after: input.charsAfter,
    dwell_ms: input.dwellMs,
    delta_features: [input.kept ? 'kept' : 'dropped'],
  }
}

/**
 * Record one verdict on one magic edit.
 *
 * Fire and forget, same posture as the section verdicts: the rewrite is the
 * product and the ledger is the record of it, so a ledger that is down must
 * never be why an edit fails to apply.
 */
export async function recordMagicVerdict(input: {
  ideaId: string
  mode: string
  value: string | null
  /** The text the revise ran on. Must be the same string revise was sent. */
  sourceText: string
  /** What the machine came back with. */
  revisedText: string
  kept: boolean
  /** How long the preview was open before he decided. */
  dwellMs?: number | null
}): Promise<void> {
  const { ideaId, mode, sourceText, revisedText, kept } = input
  if (!ideaId || !mode || !sourceText) return
  try {
    const [beforeHash, afterHash] = await Promise.all([sha256Hex(sourceText), sha256Hex(revisedText)])
    // A verdict with no before_hash would be rejected by the table's own
    // constraint, and a row that cannot pair teaches nothing anyway.
    if (!beforeHash) return
    const posted = await postEvent(magicVerdictEvent({
      ideaId,
      mode,
      value: input.value,
      kept,
      idempotencyKey: crypto.randomUUID(),
      beforeHash,
      afterHash,
      charsBefore: sourceText.length,
      charsAfter: revisedText.length,
      dwellMs: input.dwellMs ?? null,
      client: client(),
    }))
    if (posted.error) console.warn(`[edit-ledger] magic verdict not recorded: ${posted.error}`)
  } catch {
    // Ambient.
  }
}
