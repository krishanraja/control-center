/**
 * POST /api/skills/revise
 *
 * Body: { skill: SkillData, instruction: string, client_name?: string }
 *
 * Targeted AI revision of a single already-generated skill (the review modal's
 * "refine with preview/undo" loop). Returns the revised skill plus a fresh
 * quality-gate result. No n8n; calls the LLM directly.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { reviseSkill, runQualityGate, type SkillData } from '../_skill-prompt.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const { skill, instruction, client_name } = (req.body || {}) as {
    skill?: SkillData
    instruction?: string
    client_name?: string
  }
  if (!skill || typeof skill !== 'object') return res.status(400).json({ ok: false, error: 'skill is required' })
  if (!instruction || !instruction.trim()) return res.status(400).json({ ok: false, error: 'instruction is required' })

  try {
    const revised = await reviseSkill({ skill, instruction: instruction.trim(), client_name })
    return res.status(200).json({ ok: true, skill: revised, quality_gate: runQualityGate(revised) })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: `Revise failed: ${e?.message || String(e)}` })
  }
}
