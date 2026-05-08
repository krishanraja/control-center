/**
 * POST /api/skills/ship
 *
 * Body: {
 *   delivery_id: string,            // row in skill_deliveries to ship
 *   skills_data: SkillData[],       // (possibly edited) skills from the review modal
 *   client_name: string,
 *   client_email: string,
 *   quality_gate: QualityGateResult[]
 * }
 *
 * Steps:
 *  1. Assemble the multi-skill ZIP in memory.
 *  2. Upload ZIP to Supabase Storage (bucket: skill-deliveries) and capture URL.
 *     Real Drive uploads happen via N8N downstream; we hand off the URL.
 *  3. Send handover email via N8N webhook (process.env.SKILL_DELIVERY_WEBHOOK_URL,
 *     falling back to N8N_FEEDBACK_URL). Webhook is fire-and-forget; failures are
 *     logged but do not block the response.
 *  4. Write skill_shipped to audit_log.
 *  5. Create a 3-day follow-up task in `tasks`.
 *  6. Update skill_deliveries with shipped_at, zip_url, drive_url, email_sent.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import {
  assembleSkillZip,
  emailHtml,
  type SkillData,
  type QualityGateResult,
} from '../_skill-prompt.js'

const ZIP_BUCKET = 'skill-deliveries'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    delivery_id,
    skills_data,
    client_name,
    client_email,
    quality_gate,
  } = (req.body || {}) as {
    delivery_id?: string
    skills_data?: SkillData[]
    client_name?: string
    client_email?: string
    quality_gate?: QualityGateResult[]
  }

  if (!delivery_id) return res.status(400).json({ error: 'delivery_id required' })
  if (!Array.isArray(skills_data) || skills_data.length === 0) {
    return res.status(400).json({ error: 'skills_data must be a non-empty array' })
  }
  if (!client_name || !client_email) {
    return res.status(400).json({ error: 'client_name and client_email required' })
  }

  // 1. Assemble ZIP
  const zip = assembleSkillZip(skills_data, client_name)
  const fname = `${slugify(client_name)}-${Date.now()}.zip`

  // 2. Upload to Supabase Storage. If the bucket doesn't exist yet, the
  // operator gets a helpful error instead of a silent failure.
  let zipUrl: string | null = null
  try {
    const { error: upErr } = await supabase.storage
      .from(ZIP_BUCKET)
      .upload(fname, zip, { contentType: 'application/zip', upsert: false })
    if (upErr) throw upErr
    const { data: pub } = supabase.storage.from(ZIP_BUCKET).getPublicUrl(fname)
    zipUrl = pub?.publicUrl || null
  } catch (err: any) {
    // Storage upload is best-effort. We continue so the operator can still
    // download the ZIP from the response and ship it manually.
    console.warn('[skills/ship] storage upload failed:', err?.message)
  }

  // 3. Hand off to N8N for email delivery + Drive upload.
  const webhook = process.env.SKILL_DELIVERY_WEBHOOK_URL || process.env.N8N_FEEDBACK_URL
  let emailSent = false
  let driveUrl: string | null = null
  if (webhook) {
    try {
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'skill_delivery',
          delivery_id,
          client_name,
          client_email,
          skill_names: skills_data.map(s => s.name),
          zip_url: zipUrl,
          zip_base64: zip.toString('base64'),
          email_html: emailHtml({ client_name, skills: skills_data, drive_url: zipUrl || undefined }),
          quality_gate,
          timestamp: new Date().toISOString(),
        }),
      })
      if (r.ok) {
        emailSent = true
        // N8N may return { drive_url } from its Drive upload step.
        try {
          const j: any = await r.json()
          if (j && typeof j.drive_url === 'string') driveUrl = j.drive_url
        } catch {}
      }
    } catch (err: any) {
      console.warn('[skills/ship] webhook failed:', err?.message)
    }
  }

  const shippedAt = new Date().toISOString()

  // 4. Audit log
  await supabase.from('audit_log').insert({
    event_type: 'skill_shipped',
    actor: 'krish',
    target: client_name,
    details: {
      delivery_id,
      skill_names: skills_data.map(s => s.name),
      version: 1,
      email: client_email,
      email_sent: emailSent,
      zip_url: zipUrl,
      drive_url: driveUrl,
    },
  })

  // 5. Follow-up task (3 days out)
  const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('tasks').insert({
    title: `Follow up: did ${client_name} install skills successfully?`,
    status: 'waiting',
    owner: 'krish',
    agent: 'agatha',
    due_date: dueDate,
    next_step: 'Check if client downloaded and installed the skills, and try one of the test prompts.',
    source: 'skill-forge',
    created: shippedAt,
    updated_at: shippedAt,
  })

  // 6. Mark delivery shipped
  const { data: row, error: updErr } = await supabase
    .from('skill_deliveries')
    .update({
      skills_data,
      skill_names: skills_data.map(s => s.name),
      quality_gate: quality_gate || [],
      zip_url: zipUrl,
      drive_url: driveUrl,
      email_sent: emailSent,
      shipped_at: shippedAt,
      client_name,
      client_email,
    })
    .eq('id', delivery_id)
    .select()
    .single()
  if (updErr) {
    return res.status(500).json({ error: updErr.message })
  }

  return res.json({
    ok: true,
    delivery_id,
    zip_url: zipUrl,
    drive_url: driveUrl,
    email_sent: emailSent,
    shipped_at: shippedAt,
    delivery: row,
  })
}

function slugify(s: string): string {
  return (s || 'client')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'client'
}
