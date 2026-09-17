import { useState } from 'react'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'

// "Fix missing surnames" — the button, because the terminal was the wrong place.
//
// 1,882 contacts are a first name and nothing else: "Bill", "James", "Chelsea".
// Unreadable in this tab, and unmatchable by every enrichment vendor, because a
// person API needs a surname. The surnames were never missing — they are in the
// From header of those people's own mail.
//
// This lived as a CLI script first, which meant it needed a cloned repo, a node
// install, and two environment variables copied out of Vercel before Krish
// could see a single result. He is already authenticated here; the route is
// already behind the same cookie. So the whole credential problem was an
// artifact of running it in the wrong place.
//
// Preview, then apply. Never one button: these are real people's names and the
// repairs go under them in this tab and into the first line of emails to them,
// so they get looked at before they get written.

interface Repair { id: string; from: string; to: string }
interface Result {
  ok: boolean
  dry: boolean
  examined: number
  repaired: number
  skipped: Record<string, number>
  sample: Repair[]
  error?: string
}

const BATCH = 200

export function RepairNamesPanel() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [preview, setPreview] = useState<Result | null>(null)
  const [applied, setApplied] = useState<Result | null>(null)

  const call = async (dry: boolean): Promise<Result> => {
    const r = await fetch('/api/network/repair-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: BATCH, dry }),
    })
    return (await r.json()) as Result
  }

  const run = async (dry: boolean) => {
    setBusy(dry ? 'preview' : 'apply')
    try {
      const j = await call(dry)
      if (!j.ok) { toast(j.error || 'Could not reach the mailbox.', 'error'); return }
      if (dry) { setPreview(j); setApplied(null) }
      else {
        // No success toast. The panel below states the outcome and keeps
        // stating it, which a toast that vanishes in two seconds does not.
        // Two surfaces saying the same number is noise.
        setApplied(j)
        setPreview(null)
      }
    } catch {
      toast('Could not reach the mailbox.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        data-testid="network-repair-names"
        className="min-h-[36px] rounded-lg border border-white/[0.12] px-3 text-label font-medium text-ink-muted transition-colors hover:bg-white/[0.04]"
      >
        {open ? 'Close' : 'Fix missing surnames'}
      </button>

      {open && (
        <section
          className="absolute left-4 right-4 z-20 mt-2 rounded-xl border border-white/[0.08] bg-[#0f0f12] p-3 shadow-xl"
          data-testid="network-repair-names-panel"
        >
          <p className="text-label leading-relaxed text-ink-faint">
            1,882 contacts are a first name with no surname — unreadable here, and impossible for any
            enrichment service to look up. Their surnames are in the From header of their own email.
            This reads one header per person and fills the gap. It never changes a name that already
            has two parts.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => run(true)}
              disabled={busy !== null}
              data-testid="network-repair-preview"
              className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-white/[0.12] px-3 text-label font-medium text-ink-muted transition-colors hover:bg-white/[0.04] disabled:opacity-40"
            >
              {busy === 'preview' && <Working size={12} />}
              Preview next {BATCH}
            </button>

            {/* Apply only exists once there is something to apply, and it says
                how many. A button that writes an unknown number of changes to
                real people is not a button anyone should have to trust. */}
            {preview && preview.repaired > 0 && (
              <button
                type="button"
                onClick={() => run(false)}
                disabled={busy !== null}
                data-testid="network-repair-apply"
                className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-violet-400/40 bg-violet-500/15 px-3 text-label font-semibold text-violet-100 transition-colors hover:bg-violet-500/25 disabled:opacity-40"
              >
                {busy === 'apply' && <Working size={12} />}
                Apply these {preview.repaired}
              </button>
            )}
          </div>

          {applied && (
            <p className="mt-3 text-label text-emerald-300">
              {applied.repaired} names written. Run the preview again for the next {BATCH}.
            </p>
          )}

          {preview && (
            <div className="mt-3">
              <p className="text-label text-ink-faint">
                Checked {preview.examined}. Found {preview.repaired} surnames.
                {preview.repaired === 0 && ' Nothing to apply in this batch.'}
              </p>

              {preview.sample.length > 0 && (
                <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-white/[0.06]">
                  {preview.sample.map(r => (
                    <li key={r.id} className="flex items-baseline gap-2 border-b border-white/[0.05] px-3 py-1.5 text-label last:border-b-0">
                      <span className="text-ink-faint">{r.from}</span>
                      <span className="text-ink-faint/50" aria-hidden>→</span>
                      <span className="font-medium text-ink">{r.to}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* The two reasons a name did not come back mean different things
                  and lead to different next steps, so they are never merged into
                  one "failed" count. */}
              <p className="mt-2 text-micro leading-relaxed text-ink-faint">
                {preview.skipped.no_messages || 0} had no mail from that address — no service can fix those either.
                {' '}{preview.skipped.no_display_name || 0} sent mail but never set a name on it.
                {preview.skipped.error ? ` ${preview.skipped.error} could not be read.` : ''}
              </p>
            </div>
          )}
        </section>
      )}
    </>
  )
}
