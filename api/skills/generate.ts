/**
 * POST /api/skills/generate
 *
 * Body: { transcript: string, client_name: string, client_email?: string,
 *         additional_context?: string }
 *
 * Calls the Skill Builder LLM, runs the quality gate on each generated skill,
 * persists a draft row in `skill_deliveries`, and returns the generated data
 * plus quality gate results so the operator can review before shipping.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import {
  callSkillLLM,
  runQualityGate,
  type SkillData,
  type QualityGateResult,
} from '../_skill-prompt.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    transcript,
    client_name,
    client_email,
    additional_context,
    delivery_id,
  } = (req.body || {}) as {
    transcript?: string
    client_name?: string
    client_email?: string
    additional_context?: string
    delivery_id?: string
  }

  if (!transcript || transcript.trim().length < 20) {
    return res.status(400).json({ error: 'transcript (min 20 chars) required' })
  }
  if (!client_name || !client_name.trim()) {
    return res.status(400).json({ error: 'client_name required' })
  }

  let llm
  try {
    llm = await callSkillLLM({
      transcript: transcript.trim(),
      client_name: client_name.trim(),
      additional_context: additional_context?.trim() || undefined,
    })
  } catch (err: any) {
    return res.status(502).json({ error: 'LLM call failed: ' + (err?.message || 'unknown') })
  }

  // Triage failure: nothing to ship, surface the routing recommendation.
  if (!llm.triage.passed) {
    return res.json({
      triage: llm.triage,
      skills: [] as SkillData[],
      quality_gate: [] as QualityGateResult[],
      delivery_id: null,
    })
  }

  const qualityGate: QualityGateResult[] = llm.skills.map(runQualityGate)
  const skillNames = llm.skills.map(s => s.name)

  // Persist (or update) draft row so the review modal can resume later if
  // the operator closes it. shipped_at stays null until /api/skills/ship runs.
  let row
  if (delivery_id) {
    const { data, error } = await supabase
      .from('skill_deliveries')
      .update({
        client_name: client_name.trim(),
        client_email: client_email?.trim() || null,
        skill_names: skillNames,
        transcript: transcript.trim(),
        additional_context: additional_context?.trim() || null,
        skills_data: llm.skills,
        quality_gate: qualityGate,
        version: 1,
      })
      .eq('id', delivery_id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    row = data
  } else {
    const { data, error } = await supabase
      .from('skill_deliveries')
      .insert({
        client_name: client_name.trim(),
        client_email: client_email?.trim() || null,
        skill_names: skillNames,
        transcript: transcript.trim(),
        additional_context: additional_context?.trim() || null,
        skills_data: llm.skills,
        quality_gate: qualityGate,
      })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    row = data
  }

  return res.json({
    triage: llm.triage,
    skills: llm.skills,
    quality_gate: qualityGate,
    delivery_id: row?.id || null,
  })
}
