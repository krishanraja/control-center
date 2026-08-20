import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ChipOverflow, Chip, type ChipItem } from './ChipOverflow'
import { useToast } from './Toast'
import { useHaptics } from '../../hooks/useHaptics'
import { VENTURE_OPTIONS } from '../../lib/ventureOptions'

// The edits you can make to a person, wherever you are looking at them.
//
// This exists as one component because it was previously two problems. The lead
// sheet had a single native <select> for venture, seven options at 12px behind
// an OS picker, and no room to put a second field next to it. The network person
// sheet, which is the surface actually reachable in production (LeadSheet only
// renders when isUiV2() is false), had no edits at all.
//
// So the rule here is that adding an editable field is a line in a list, not a
// layout decision. Chips are 30px tap targets, a long option list folds behind
// the same overflow sheet the network filters use, and the optimistic
// write-and-revert is written once rather than per field.

const VENTURE_ITEMS: ChipItem[] = VENTURE_OPTIONS.map(v => ({ id: v.slug, label: v.label }))

// The vocabulary declared in useRealtimeContacts and accepted by
// PATCH /api/contacts/:id. Four values fit on one line, so no overflow.
const STATUS_OPTIONS: Array<[string, string]> = [
  ['active', 'Active'],
  ['dormant', 'Dormant'],
  ['closed', 'Closed'],
  ['do_not_contact', 'Do not contact'],
]

type Field = 'primary_venture' | 'status'

export function ContactEditChips({ contactId, venture, status, onSaved, className }: {
  contactId: string
  venture: string | null
  status: string | null
  /** Fired after a successful write so the surrounding surface can update the
   *  row it already has, rather than refetching to learn what it just did. */
  onSaved?: (patch: { primary_venture?: string | null; status?: string }) => void
  className?: string
}) {
  const { toast } = useToast()
  const h = useHaptics()
  const [v, setV] = useState<string | null>(venture)
  const [st, setSt] = useState<string>(status || 'active')
  const [saving, setSaving] = useState<Field | null>(null)

  // Re-seed when the sheet is pointed at a different person.
  useEffect(() => { setV(venture); setSt(status || 'active'); setSaving(null) }, [contactId])

  const patch = async (field: Field, value: string | null, apply: (x: any) => void, prev: any, label: string) => {
    apply(value)
    setSaving(field)
    h.select()
    try {
      const r = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`)
      toast(`${label} updated.`, 'success')
      onSaved?.({ [field]: value } as { primary_venture?: string | null; status?: string })
    } catch (e: unknown) {
      // Revert to what was on screen before the tap. A chip that stays lit after
      // a failed write is worse than no chip: the next decision is made against
      // a state the database does not have.
      apply(prev)
      toast(`Could not update ${label.toLowerCase()}: ${(e as Error)?.message || 'try again'}`, 'error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className={`space-y-2 ${className || ''}`}>
      <EditRow label="Venture" saving={saving === 'primary_venture'}>
        <ChipOverflow
          items={VENTURE_ITEMS}
          selected={v ? [v] : []}
          onToggle={next => {
            const value = next === v ? null : next
            void patch('primary_venture', value, setV, v, 'Venture')
          }}
          inline={3}
          single
          busy={saving !== null}
          title="Venture"
          testIdPrefix="contact-venture"
          searchThreshold={99}
        />
      </EditRow>

      {/* The one edit with teeth. network_search hard-filters do_not_contact and
          networkScore drops them, but nothing could set it per person: the bulk
          action on the desktop leads table was the only route, which is why all
          10,767 contacts are 'active' and a filter the scorer honours had never
          actually been reachable. */}
      <EditRow label="Status" saving={saving === 'status'}>
        {STATUS_OPTIONS.map(([value, label]) => (
          <Chip
            key={value}
            on={st === value}
            tone={value === 'do_not_contact' ? 'danger' : 'accent'}
            disabled={saving !== null}
            onClick={() => { if (value !== st) void patch('status', value, setSt, st, 'Status') }}
            testId={`contact-status-${value}`}
          >
            {label}
          </Chip>
        ))}
      </EditRow>

      {st === 'do_not_contact' && (
        <p className="text-[11.5px] leading-relaxed text-rose-200/70">
          Excluded from network search and from every outreach surface.
        </p>
      )}
    </div>
  )
}

/** Label, controls, and the one place a save is allowed to show itself. */
function EditRow({ label, saving, children }: {
  label: string
  saving: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
        {label}
        {saving && <Loader2 size={9} className="animate-spin" aria-hidden />}
      </span>
      {children}
    </div>
  )
}
