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
      await fetch('/api/content-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // Survives the composer closing in the same tick as the save.
        keepalive: true,
      })
    } catch {
      // Ambient. Silence is correct.
    }
  }))
}
