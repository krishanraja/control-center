import { useCallback, useState } from 'react'

// The screenshot → network state machine.
//
// Split from the component because it is three sequential network calls with
// three different failure shapes, and one of those shapes — "an API is out of
// credits" — must not be collapsed into a generic error. Krish: "if there are
// not enough api credits anywhere, I need an alert rather than just half
// enriching." The `blocked` step is that requirement's home in the UI.
//
//   capture → scanning → review → saving → enriching → done
//                                        ↘ blocked   (credits; nothing partial written)
//
// Save and enrich are separate requests on purpose: a Vercel function dies at
// 60s and a LinkedIn profile scrape alone can take 45. Saving first means a
// person is never lost to an enrichment timeout — they are in the network, and
// the enrichment either completes or says why it could not.

export type Step = 'capture' | 'scanning' | 'review' | 'saving' | 'enriching' | 'done' | 'blocked'

export interface ScannedPerson {
  full_name: string | null
  headline: string | null
  title: string | null
  company: string | null
  location: string | null
  linkedin_url: string | null
  linkedin_handle: string | null
  email: string | null
  followers: number | null
  mutuals: number | null
  source_kind: string | null
  confidence: 'low' | 'medium' | 'high'
  other_people: string[]
  notes: string | null
}

export interface ExistingMatch {
  id: string
  full_name: string | null
  company: string | null
  title: string | null
  consent_tier: string
  enrichment_status: string | null
  matched_on: string
}

export interface EnrichmentSummary {
  status: string
  who?: string | null
  why_them?: string | null
  hook?: string | null
  confidence?: string
  used?: string[]
  skipped?: string[]
  degraded?: string[]
  detail?: string
}

export const TIER_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  // Warm is first and is the default: somebody worth screenshotting off a
  // profile is, by the act of being screenshotted, not a scraped cold lead.
  { value: 'warm', label: 'Warm', hint: 'Known to you — met, replied, or connected.' },
  { value: 'permissioned', label: 'Permissioned', hint: 'On an owned list that opted in.' },
  { value: 'customer', label: 'Customer', hint: 'Paying or past customer.' },
  { value: 'cold_engaged', label: 'Cold · engaged', hint: 'Engaged with you, but no consent given.' },
  { value: 'cold_scraped', label: 'Cold · scraped', hint: 'No relationship. Outbound rules apply.' },
]

const TODAY = () => new Date().toISOString().slice(0, 10)

interface JsonReply { status: number; data: Record<string, any> }

/** POST JSON and always resolve, so a network drop takes the same branch as a
 *  4xx instead of throwing past the state machine and leaving the UI on a
 *  spinner. `status: 0` means the request never reached the server. */
async function postJson(url: string, body: unknown): Promise<JsonReply> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The /api/network/* routes re-check the cc_access cookie, and their CORS
      // headers pin the origin precisely so credentials can ride along.
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const data = (await r.json().catch(() => ({}))) as Record<string, any>
    return { status: r.status, data }
  } catch (e: unknown) {
    return { status: 0, data: { ok: false, error: String((e as Error)?.message || e) } }
  }
}

export function useAddPersonFromImage() {
  const [step, setStep] = useState<Step>('capture')
  const [person, setPerson] = useState<ScannedPerson | null>(null)
  const [existing, setExisting] = useState<ExistingMatch | null>(null)
  const [mergeInto, setMergeInto] = useState<string | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [merged, setMerged] = useState(false)
  const [searchable, setSearchable] = useState(false)
  const [saveWarning, setSaveWarning] = useState<string | null>(null)
  const [enrichment, setEnrichment] = useState<EnrichmentSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [alert, setAlert] = useState<string | null>(null)
  const [alertSent, setAlertSent] = useState<boolean | undefined>(undefined)
  const [fileName, setFileName] = useState<string | null>(null)

  const [venture, setVenture] = useState('mindmaker')
  const [campaign, setCampaign] = useState(`linkedin-screenshot-${TODAY()}`)
  const [tier, setTier] = useState('warm')
  const [note, setNote] = useState('')
  const [useApify, setUseApify] = useState(true)

  const reset = useCallback(() => {
    setStep('capture'); setPerson(null); setExisting(null); setMergeInto(null)
    setContactId(null); setMerged(false); setSearchable(false); setSaveWarning(null)
    setEnrichment(null); setError(null); setAlert(null); setAlertSent(undefined); setFileName(null)
  }, [])

  const scan = useCallback(async (file: File) => {
    setStep('scanning'); setError(null); setAlert(null); setAlertSent(undefined)
    setFileName(file.name || 'screenshot')
    try {
      // Raw bytes, not multipart or base64: the route runs with bodyParser off
      // and base64 would inflate a phone screenshot by a third for no gain.
      const r = await fetch('/api/network/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'image/png' },
        credentials: 'include',
        body: file,
      })
      const data = await r.json().catch(() => ({}))

      if (r.status === 402) {
        setError(data.error === 'api_credits' ? 'Anthropic could not serve the request.' : String(data.error || ''))
        setAlert(data.alert || null); setAlertSent(data.alert_sent)
        setStep('capture')
        return
      }
      if (!r.ok || data.ok === false) {
        setError(data.detail || data.error || `HTTP ${r.status}`)
        setStep('capture')
        return
      }
      if (!data.usable) {
        setError(data.reason || 'No identifiable person in that image.')
        setStep('capture')
        return
      }

      const p = data.person as ScannedPerson
      setPerson(p)
      setExisting((data.existing as ExistingMatch) || null)
      // A hard identifier match is safe to preselect; a name match is not, and
      // preselecting it would make "merge into the wrong person" the default.
      const m = data.existing as ExistingMatch | null
      setMergeInto(m && (m.matched_on === 'linkedin' || m.matched_on === 'email') ? m.id : null)
      setStep('review')
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e))
      setStep('capture')
    }
  }, [])

  const edit = useCallback((patch: Partial<ScannedPerson>) => {
    setPerson(prev => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const save = useCallback(async () => {
    if (!person?.full_name?.trim()) return
    setStep('saving'); setError(null); setAlert(null); setAlertSent(undefined)

    const saved = await postJson('/api/network/add-person', {
      full_name: person.full_name.trim(),
      headline: person.headline,
      title: person.title,
      company: person.company,
      location: person.location,
      linkedin_url: person.linkedin_url,
      email: person.email,
      followers: person.followers,
      origin_venture: venture,
      origin_campaign: campaign.trim(),
      consent_tier: tier,
      note: note.trim() || null,
      source_document_name: fileName,
      merge_into: mergeInto,
    })

    if (saved.status === 0 || !saved.data.ok) {
      setError(saved.data.error || `HTTP ${saved.status}`)
      setAlert(saved.data.alert || null); setAlertSent(saved.data.alert_sent)
      setStep('review')
      return
    }

    const id = String(saved.data.contact_id)
    setContactId(id)
    setMerged(Boolean(saved.data.merged))
    setSearchable(Boolean(saved.data.searchable))
    setSaveWarning(saved.data.warning || null)
    // The person exists from here on. Enrichment can fail without taking the
    // record with it, which is the whole reason these are two calls.
    setStep('enriching')

    const enriched = await postJson('/api/network/enrich-person', {
      contact_id: id,
      use_apify: useApify,
    })

    if (enriched.status === 402) {
      setError(enriched.data.detail || 'One or more APIs are out of credits.')
      setAlert(enriched.data.alert || null)
      setAlertSent(enriched.data.alert_sent)
      setStep('blocked')
      return
    }
    if (enriched.status === 0 || enriched.data.ok === false) {
      // A failed enrichment is not a failed add. Say what happened and keep the
      // person; the record is already in the network and re-runnable.
      setEnrichment({ status: 'failed', detail: enriched.data.error || `Enrichment failed (HTTP ${enriched.status}). The person is saved — retry enrichment from their profile.` })
      setStep('done')
      return
    }

    setEnrichment({
      status: String(enriched.data.status || 'enriched'),
      who: enriched.data.who,
      why_them: enriched.data.why_them,
      hook: enriched.data.hook,
      confidence: enriched.data.confidence,
      used: enriched.data.used,
      skipped: enriched.data.skipped,
      degraded: enriched.data.degraded,
      detail: enriched.data.detail,
    })
    if (enriched.data.searchable) setSearchable(true)
    setStep('done')
  }, [person, venture, campaign, tier, note, fileName, mergeInto, useApify])

  return {
    step, person, existing, mergeInto, setMergeInto, contactId, merged, searchable,
    saveWarning, enrichment, error, alert, alertSent,
    venture, setVenture, campaign, setCampaign, tier, setTier, note, setNote,
    useApify, setUseApify,
    scan, edit, save, reset,
  }
}
