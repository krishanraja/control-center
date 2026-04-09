export interface SequenceLink {
  label: string
  url: string
}

export interface SequenceStep {
  id: string
  order: number
  description: string
  owner: string
  owner_note?: string
  estimated_mins?: number
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  blocked_by: string | null
  links?: SequenceLink[]
}

export interface Sequence {
  id: string
  agent: string
  title: string
  status: string
  priority: number
  source_doc: string
  steps: SequenceStep[]
}

export interface SequencesData {
  schema_version: string
  last_updated: string
  sequences: Sequence[]
}
