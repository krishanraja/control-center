// Shared types for the Skill Forge UI. These mirror api/_skill-prompt.ts.

export interface SkillReference {
  filename: string
  content: string
}

export interface SkillData {
  name: string
  description: string
  body: string
  references: SkillReference[]
  test_prompts: string[]
  gotchas: string[]
  archetype: string
}

export interface QualityCheck {
  id: string
  label: string
  pass: boolean
  detail?: string
}

export interface QualityGateResult {
  skill_name: string
  passed: number
  total: number
  checks: QualityCheck[]
}

export interface TriageResult {
  passed: boolean
  result: string
  reasoning?: string
}

export interface SkillDelivery {
  id: string
  client_name: string
  client_email?: string | null
  skill_names: string[]
  transcript: string
  additional_context?: string | null
  skills_data?: SkillData[]
  quality_gate?: QualityGateResult[]
  zip_url?: string | null
  drive_url?: string | null
  email_sent?: boolean
  shipped_at?: string | null
  created_at: string
}
