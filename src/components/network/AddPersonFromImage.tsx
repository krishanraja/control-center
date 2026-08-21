import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, ClipboardPaste, AlertTriangle, CheckCircle2, UserPlus, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '../shared/Modal'
import { Eyebrow } from '../shared/Eyebrow'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
import { VENTURE_OPTIONS } from '../../lib/ventureOptions'
import {
  useAddPersonFromImage, TIER_OPTIONS,
  type ScannedPerson, type ExistingMatch,
} from '../../hooks/useAddPersonFromImage'

// Add somebody to the network from a screenshot.
//
// The Network tab was search-only: under VITE_UI_V2_ENABLED there was no way to
// put a person INTO the network from this surface at all (ContactImportDropzone
// is mounted on the pre-v2 lanes, and it only reads CSV text). This is that
// missing half, shaped around what actually happens: Krish screenshots a
// LinkedIn profile on his phone and wants that person in the network.
//
// Four steps, and the middle one is the point:
//
//   capture   paste / drop / pick an image
//   review    the extraction, editable, with a duplicate check — because vision
//             misreads, and the fix costs one glance here versus a wrong person
//             living in a 10,670-row network forever
//   saving    contacts + contact_intelligence, so they are findable immediately
//   enriching PDL / Apollo / web / optional Apify, deepening the record
//
// A screenshot cannot supply provenance (which venture, which campaign) or
// consent tier, and the Relationship Engine needs both to know how it may speak
// to someone. Those are prefilled rather than asked, so the common case is one
// tap, but they are on screen and editable.

const FIELD = 'mt-1 w-full rounded-md border border-white/10 bg-base px-2 py-1.5 text-label text-white/85 placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none'
const LABEL = 'text-micro text-white/45'

/**
 * The flow behind one controlled modal, so it can be opened from anywhere.
 * On desktop the Network tab renders the inline trigger button below; on a
 * phone the + create sheet (CreateSheet.tsx) opens this directly.
 */
export function AddPersonModal({ open, onClose, onAdded }: {
  open: boolean
  onClose: () => void
  onAdded?: (contactId: string) => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add someone from a screenshot"
      description="Paste or drop a LinkedIn profile screenshot. You confirm what was read before anything is saved."
    >
      <AddPersonFlow onDone={onClose} onAdded={onAdded} active={open} />
    </Modal>
  )
}

export function AddPersonFromImage({ onAdded }: { onAdded?: (contactId: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="network-add-person-open"
        className="gap-1.5"
      >
        <ImagePlus size={13} aria-hidden />
        Add from screenshot
      </Button>
      <AddPersonModal open={open} onClose={() => setOpen(false)} onAdded={onAdded} />
    </>
  )
}

function AddPersonFlow({ active, onDone, onAdded }: { active: boolean; onDone: () => void; onAdded?: (id: string) => void }) {
  const { toast } = useToast()
  const flow = useAddPersonFromImage()
  const [hover, setHover] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const takeFile = useCallback((file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('That is not an image. Paste or drop a screenshot.', 'error')
      return
    }
    void flow.scan(file)
  }, [flow, toast])

  // Paste is the primary route on a desktop: screenshot to clipboard, Cmd-V.
  // Bound to the document rather than an input so it works wherever focus
  // happens to be inside the sheet, and only while the sheet is open.
  useEffect(() => {
    if (!active || flow.step !== 'capture') return
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'))
      if (!item) return
      e.preventDefault()
      takeFile(item.getAsFile())
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [active, flow.step, takeFile])

  // ── Capture ───────────────────────────────────────────────────────────────
  if (flow.step === 'capture' || flow.step === 'scanning') {
    return (
      <div className="space-y-3" data-testid="network-add-person-capture">
        <div
          onDragOver={e => { e.preventDefault(); setHover(true) }}
          onDragLeave={() => setHover(false)}
          onDrop={e => { e.preventDefault(); setHover(false); takeFile(e.dataTransfer.files?.[0]) }}
          className={`rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors ${
            hover ? 'border-emerald-500/40 bg-emerald-500/[0.04]' : 'border-white/10 bg-white/[0.015]'
          }`}
        >
          {flow.step === 'scanning' ? (
            <div className="flex flex-col items-center gap-2">
              <Working size={18} />
              <p className="text-body text-white/70">Reading the screenshot…</p>
              <p className="text-micro text-white/40">Nothing is saved until you confirm.</p>
            </div>
          ) : (
            <>
              <ClipboardPaste size={22} className="mx-auto text-white/40" aria-hidden />
              <p className="mt-2 text-body font-medium text-white/75">Paste a screenshot</p>
              <p className="mt-0.5 text-micro text-white/45">
                Or drop an image here. A LinkedIn profile works best — a badge or an email signature also reads.
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="network-add-person-pick">
                  Pick an image
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={e => { takeFile(e.target.files?.[0]); if (fileRef.current) fileRef.current.value = '' }}
                />
              </div>
            </>
          )}
        </div>
        {flow.error && <Problem title="Could not read that" detail={flow.error} alert={flow.alert} />}
      </div>
    )
  }

  // ── Review ────────────────────────────────────────────────────────────────
  if (flow.step === 'review' || flow.step === 'saving') {
    const p = flow.person
    if (!p) return null
    const busy = flow.step === 'saving'
    return (
      <div className="space-y-3" data-testid="network-add-person-review">
        {p.confidence !== 'high' && (
          <Note tone="amber" icon={AlertTriangle}>
            Read with <strong>{p.confidence}</strong> confidence{p.notes ? ` — ${p.notes}` : ''}. Check the fields before saving.
          </Note>
        )}
        {p.other_people.length > 0 && (
          <Note tone="neutral" icon={AlertTriangle}>
            Other names in the image: {p.other_people.join(', ')}. Confirm the one below is the profile you meant.
          </Note>
        )}
        {flow.existing && <ExistingNote match={flow.existing} mergeInto={flow.mergeInto} onToggle={flow.setMergeInto} />}

        <Card variant="outline" className="space-y-2.5 p-3">
          <Row label="Name" value={p.full_name || ''} onChange={v => flow.edit({ full_name: v })} testId="field-full-name" />
          <Row label="Title" value={p.title || ''} onChange={v => flow.edit({ title: v })} testId="field-title" />
          <Row label="Company" value={p.company || ''} onChange={v => flow.edit({ company: v })} testId="field-company" />
          <Row label="Location" value={p.location || ''} onChange={v => flow.edit({ location: v })} testId="field-location" />
          <Row
            label="LinkedIn URL"
            value={p.linkedin_url || ''}
            onChange={v => flow.edit({ linkedin_url: v })}
            testId="field-linkedin"
            placeholder="Not in the screenshot — paste it to unlock profile enrichment"
          />
          {!p.linkedin_url && (
            // Said plainly rather than left to be discovered when the enrichment
            // comes back thin: the profile scrape and PDL's strongest lookup key
            // both need this URL, and a profile screenshot rarely shows it.
            <p className="text-micro leading-relaxed text-amber-200/70">
              No LinkedIn URL was visible in the screenshot, and one is never guessed. Without it, enrichment falls back to
              name + company matching, which is weaker.
            </p>
          )}
        </Card>

        <Card variant="outline" className="space-y-2.5 border-violet-400/25 bg-violet-500/[0.04] p-3">
          <p><Eyebrow tone="accent">Where does this person come from?</Eyebrow></p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={LABEL}>Venture</span>
              <select value={flow.venture} onChange={e => flow.setVenture(e.target.value)} className={FIELD} data-testid="field-venture">
                {VENTURE_OPTIONS.map(v => <option key={v.slug} value={v.slug}>{v.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Consent tier</span>
              <select value={flow.tier} onChange={e => flow.setTier(e.target.value)} className={FIELD} data-testid="field-tier">
                {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className={LABEL}>Campaign / list</span>
            <input value={flow.campaign} onChange={e => flow.setCampaign(e.target.value)} className={FIELD} data-testid="field-campaign" />
          </label>
          <label className="block">
            <span className={LABEL}>How do you know them? (optional, but it is the best line in the record)</span>
            <input
              value={flow.note}
              onChange={e => flow.setNote(e.target.value)}
              placeholder="e.g. Met at the Philadelphia CDP dinner, runs agentic web delivery"
              className={FIELD}
              data-testid="field-note"
            />
          </label>
          <p className="text-micro text-white/40">{TIER_OPTIONS.find(t => t.value === flow.tier)?.hint}</p>
        </Card>

        <label className="flex items-start gap-2 rounded-card border border-white/[0.08] px-3 py-2">
          <input
            type="checkbox"
            checked={flow.useApify}
            onChange={e => flow.setUseApify(e.target.checked)}
            className="mt-0.5 accent-violet-400"
            data-testid="field-apify"
          />
          <span className="text-label leading-relaxed text-white/60">
            Scrape the full LinkedIn profile via Apify — costs one paid actor run, and needs the URL above.
            Without it, enrichment still runs People Data Labs, Apollo and web research.
          </span>
        </label>

        {flow.error && <Problem title="Could not save" detail={flow.error} alert={flow.alert} />}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={flow.reset} disabled={busy}>Start over</Button>
          <Button
            size="sm"
            onClick={() => void flow.save()}
            disabled={busy || !p.full_name?.trim() || !flow.campaign.trim()}
            data-testid="network-add-person-save"
            className="gap-1.5"
          >
            {busy ? <><Working size={12} /> Saving…</> : <><UserPlus size={13} aria-hidden /> {flow.mergeInto ? 'Update + enrich' : 'Add + enrich'}</>}
          </Button>
        </div>
      </div>
    )
  }

  // ── Saved / enriching / done ─────────────────────────────────────────────
  return (
    <div className="space-y-3" data-testid="network-add-person-result">
      <Note tone={flow.searchable ? 'emerald' : 'amber'} icon={flow.searchable ? CheckCircle2 : AlertTriangle}>
        <strong>{flow.person?.full_name}</strong>{' '}
        {flow.merged ? 'was already in your network and has been updated.' : 'is in your network.'}{' '}
        {flow.searchable
          ? 'They are searchable now.'
          : 'They are NOT searchable yet — see below.'}
      </Note>
      {flow.saveWarning && <Note tone="amber" icon={AlertTriangle}>{flow.saveWarning}</Note>}

      {flow.step === 'enriching' && (
        <Card variant="outline" className="flex items-center gap-2 p-3">
          <Working size={14} />
          <p className="text-label text-white/70">
            Enriching{flow.useApify ? ' — including the LinkedIn profile scrape, which is the slow one' : ''}…
          </p>
        </Card>
      )}

      {flow.step === 'blocked' && (
        <Problem
          title="Enrichment stopped — not enough API credits"
          detail={flow.error || ''}
          alert={flow.alert}
          alertSent={flow.alertSent}
        >
          <p className="mt-2 text-label leading-relaxed text-white/60">
            Nothing partial was written. {flow.person?.full_name} is saved and marked <code className="text-white/75">blocked_quota</code>,
            so re-running enrichment after a top-up will pick them up — they will not be mistaken for a finished record.
          </p>
        </Problem>
      )}

      {flow.step === 'done' && flow.enrichment && (
        <Card variant="outline" className="space-y-2 p-3" data-testid="network-add-person-brief">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="text-violet-300" aria-hidden />
            <Eyebrow>
              {flow.enrichment.status === 'no_evidence' ? 'No evidence found' : `Enriched · ${flow.enrichment.confidence} confidence`}
            </Eyebrow>
          </div>
          {flow.enrichment.who && <p className="text-body leading-relaxed text-white/85">{flow.enrichment.who}</p>}
          {flow.enrichment.why_them && <p className="text-label leading-relaxed text-white/65">{flow.enrichment.why_them}</p>}
          {flow.enrichment.hook && (
            <p className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 text-label leading-relaxed text-white/70">
              <span className="text-white/40">Hook · </span>{flow.enrichment.hook}
            </p>
          )}
          {flow.enrichment.detail && <p className="text-label leading-relaxed text-white/50">{flow.enrichment.detail}</p>}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {flow.enrichment.used?.map(s => <Badge key={s} variant="outline" className="text-micro">{s}</Badge>)}
          </div>
          {/* Degraded and skipped are shown, not hidden behind a success tick.
              "PDL ran and found nothing" is something to know before trusting a
              thin brief; "PDL has no key" is not a fault but is still why the
              brief is thin. */}
          {flow.enrichment.degraded?.length ? (
            <p className="text-micro leading-relaxed text-amber-200/70">Ran but returned nothing: {flow.enrichment.degraded.join('; ')}</p>
          ) : null}
          {flow.enrichment.skipped?.length ? (
            <p className="text-micro leading-relaxed text-white/40">Not configured: {flow.enrichment.skipped.join(', ')}</p>
          ) : null}
        </Card>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={flow.reset}>Add another</Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { if (flow.contactId) onAdded?.(flow.contactId); onDone() }}
          disabled={flow.step === 'enriching'}
          data-testid="network-add-person-close"
        >
          Done
        </Button>
      </div>
    </div>
  )
}

// ── Bits ────────────────────────────────────────────────────────────────────

function Row({ label, value, onChange, testId, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; testId: string; placeholder?: string
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} data-testid={testId} className="mt-1 h-9 text-label" />
    </label>
  )
}

function Note({ tone, icon: Icon, children }: {
  tone: 'amber' | 'emerald' | 'neutral'
  icon: typeof AlertTriangle
  children: React.ReactNode
}) {
  const styles = {
    amber: 'border-amber-400/20 bg-amber-500/[0.06] text-amber-100/85',
    emerald: 'border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-100/85',
    neutral: 'border-white/[0.08] bg-white/[0.02] text-white/60',
  }[tone]
  return (
    <div className={`flex items-start gap-2 rounded-card border px-3 py-2.5 ${styles}`}>
      <Icon size={13} className="mt-0.5 shrink-0" aria-hidden />
      <p className="text-label leading-relaxed">{children}</p>
    </div>
  )
}

/** The credit-wall panel. Deliberately loud and deliberately specific: it names
 *  which provider, why, and whether the phone alert actually sent. */
function Problem({ title, detail, alert, alertSent, children }: {
  title: string; detail: string; alert?: string | null; alertSent?: boolean; children?: React.ReactNode
}) {
  return (
    <div className="rounded-card border border-rose-400/25 bg-rose-500/[0.06] px-3 py-2.5" data-testid="network-add-person-problem">
      <div className="flex items-start gap-2">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-rose-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-label font-semibold text-rose-100">{title}</p>
          {detail && <p className="mt-0.5 text-label leading-relaxed text-rose-100/75">{detail}</p>}
          {alert && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-rose-400/20 bg-black/20 px-2 py-1.5 text-micro leading-relaxed text-rose-100/80">
              {alert}
            </pre>
          )}
          {alertSent !== undefined && (
            <p className="mt-1.5 text-micro text-white/45">
              {alertSent
                ? 'Alert sent to your Telegram.'
                : 'Telegram alert could NOT be sent — this panel is the only notice.'}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

function ExistingNote({ match, mergeInto, onToggle }: {
  match: ExistingMatch; mergeInto: string | null; onToggle: (id: string | null) => void
}) {
  const weak = match.matched_on === 'name_only' || match.matched_on === 'name_and_company'
  return (
    <div className="rounded-card border border-sky-400/25 bg-sky-500/[0.06] px-3 py-2.5" data-testid="network-add-person-existing">
      <p className="text-label leading-relaxed text-sky-100/85">
        Already in your network: <strong>{match.full_name}</strong>
        {match.title ? ` — ${match.title}` : ''}{match.company ? ` at ${match.company}` : ''}.
        {' '}Matched on <span className="text-sky-200/70">{match.matched_on.replace(/_/g, ' ')}</span>.
      </p>
      {weak && (
        // A name match is not an identity. Saying so is the difference between
        // merging the right person and quietly overwriting a different one.
        <p className="mt-1 text-micro leading-relaxed text-amber-200/75">
          That is a name match, not a hard identifier — check it is the same person before merging.
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          variant={mergeInto ? 'primary' : 'outline'}
          onClick={() => onToggle(mergeInto ? null : match.id)}
          data-testid="network-add-person-merge"
          className="gap-1.5"
        >
          {mergeInto ? <><CheckCircle2 size={12} aria-hidden /> Updating them</> : 'Update this person'}
        </Button>
        {mergeInto && (
          <Button size="sm" variant="ghost" onClick={() => onToggle(null)} className="gap-1">
            <X size={12} aria-hidden /> Create separate
          </Button>
        )}
      </div>
    </div>
  )
}

export type { ScannedPerson }
