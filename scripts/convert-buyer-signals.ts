#!/usr/bin/env -S npx tsx
// Route Felix's buyer-signal tasks into the leads pipeline.
//
// Felix's n8n Enterprise Sales Pipeline workflow creates tasks titled
// "Signal: <Company> - buyer-signal" (agent='felix', status='waiting').
// That's lead-shaped data squatting in the tasks queue: no ICP scoring, no
// quality gate, and every one of them lands in Today's "Waiting on you".
//
// This script converts each open signal task into a `leads` row (status
// 'new', assignee felix, origin 'agent') so it flows through Agatha's ICP
// scoring and the backburner grader like every other lead, then marks the
// source task superseded.
//
// Idempotent: each created lead carries source_ref='task:<task_id>'; tasks
// whose ref already exists are skipped (their task is still marked
// superseded if needed). Re-run any time to catch new task-shaped signals
// until the n8n workflow is repointed to create leads directly.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/convert-buyer-signals.ts [--dry-run]

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const headers = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
}

interface SignalTask {
  id: string
  title: string
  description: string | null
  evidence: string | null
  next_step: string | null
  link_primary: string | null
  link_secondary: string | null
  lever_score: number | null
  tier: string | null
  status: string
}

function companyFrom(title: string): string {
  // "Signal: Acme Corp - buyer-signal" -> "Acme Corp"
  const m = title.match(/^Signal:\s*(.+?)\s*-\s*buyer.signal\s*$/i)
  if (m) return m[1].trim()
  return title.replace(/^Signal:\s*/i, '').trim() || '(unknown company)'
}

async function rest(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers, ...init })
  if (!r.ok) throw new Error(`${init?.method || 'GET'} ${path} -> ${r.status}: ${await r.text()}`)
  const text = await r.text()
  return text ? JSON.parse(text) : null
}

async function main() {
  const tasks: SignalTask[] = await rest(
    `tasks?select=id,title,description,evidence,next_step,link_primary,link_secondary,lever_score,tier,status` +
    `&title=like.Signal:*&agent=eq.felix&status=in.(waiting,new)`,
  )
  console.log(`Found ${tasks.length} open buyer-signal tasks.`)

  let created = 0
  let skipped = 0
  for (const t of tasks) {
    const ref = `task:${t.id}`
    const existing = await rest(`leads?select=id&source_ref=eq.${encodeURIComponent(ref)}&limit=1`)
    const company = companyFrom(t.title)

    if (existing?.length) {
      skipped++
    } else if (DRY_RUN) {
      console.log(`[dry-run] would create lead "${company}" from task ${t.id}`)
      created++
    } else {
      await rest('leads', {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          company,
          why_relevant: [t.description, t.evidence ? `Evidence: ${t.evidence}` : null].filter(Boolean).join('\n\n') || null,
          next_step: t.next_step,
          source_type: 'signal_inbox',
          source_ref: ref,
          source_url: t.link_primary || t.link_secondary || null,
          status: 'new',
          assignee_agent: 'felix',
          origin: 'agent',
          raw_extraction: {
            converted_from: 'buyer_signal_task',
            task_id: t.id,
            task_title: t.title,
            lever_score: t.lever_score,
            tier: t.tier,
          },
        }),
      })
      created++
      console.log(`Created lead "${company}" (task ${t.id})`)
    }

    if (!DRY_RUN) {
      await rest(`tasks?id=eq.${encodeURIComponent(t.id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'superseded', krish_reviewed: true, updated_at: new Date().toISOString() }),
      })
    }
  }

  if (!DRY_RUN) {
    await rest('audit_log', {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        event_type: 'buyer_signals_converted',
        actor: 'convert-buyer-signals-script',
        target: 'leads',
        details: JSON.stringify({ tasks: tasks.length, created, skipped }),
      }),
    })
  }

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Done: ${created} leads created, ${skipped} already converted, ${tasks.length} tasks ${DRY_RUN ? 'would be' : ''} superseded.`)
}

main().catch(e => { console.error(e); process.exit(1) })
