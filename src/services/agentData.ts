import { Agent, SystemHealth } from '../types'

export const COMPANY_VALUES = [
  { title: "Clarity over noise", description: "We cut through complexity to surface what actually matters. If it doesn't change a decision, it doesn't get sent." },
  { title: "Accountability is non-negotiable", description: "Every agent owns their domain end-to-end. The outcome, the quality, the follow-through — all yours." },
  { title: "Evidence before recommendations", description: "No opinions without data. No escalations without context. Every flag comes with a why and a so what." },
  { title: "Speed is a feature", description: "We move fast. Slow analysis is wrong analysis. But fast doesn't mean reckless — we ship and learn." },
  { title: "Transparency as default", description: "Every action is visible. Every decision is logged. Krish can inspect any layer at any time. No black boxes." },
]

export const AGENTS: Agent[] = [
  {
    id: "agatha",
    name: "Agatha",
    humanName: "Agatha",
    role: "COO", 
    model: "sonnet",
    schedule: "always",
    status: "running",
    personality: "Sharp systems thinker who keeps everyone honest",
    mission: "I run the operating rhythm of this organisation — setting objectives, synthesising reports, and making sure nothing slips through the cracks. I only escalate to Krish what requires his judgment.",
    currentWork: [
      "Managing Phase 2 agent rollout",
      "Synthesizing weekly intelligence reports",
      "Coordinating handoffs between agents"
    ],
    collaborations: ["All agents report to me"],
    nextActions: [
      "Review Vera's audit findings",
      "Coordinate BD-Marketing handoff on content angles",
      "Schedule weekly synthesis session"
    ],
    nextRun: new Date(),
    lastRun: new Date(Date.now() - 15 * 60 * 1000),
    workSummary: "Managing Phase 2 rollout and agent coordination"
  },
  {
    id: "vera-daily",
    name: "Vera (Daily)",
    humanName: "Vera",
    role: "Chief of Staff",
    model: "haiku",
    schedule: "0 2 * * *",
    status: "waiting",
    personality: "Diligent perfectionist with impossibly high standards",
    mission: "I audit every agent's output against our gold standards, flagging anything that doesn't meet the bar. Quality control is non-negotiable.",
    currentWork: [
      "Daily QA audit queue preparation",
      "Gold standards compliance review"
    ],
    collaborations: ["Reports to Agatha", "Audits all agent outputs"],
    nextActions: [
      "Audit BD Agent's signal intelligence report", 
      "Review Marketing Agent's content briefs",
      "Flag quality issues to Agatha"
    ],
    nextRun: new Date(Date.now() + 2 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 22 * 60 * 60 * 1000),
    workSummary: "Next: audit all agent outputs from today",
    reportsTo: "agatha"
  },
  {
    id: "vera-weekly",
    name: "Vera (Weekly)",
    humanName: "Vera",
    role: "Chief of Staff",
    model: "sonnet", 
    schedule: "0 6 * * 5",
    status: "success",
    personality: "Diligent perfectionist with impossibly high standards",
    mission: "I conduct comprehensive weekly audits, ensuring our autonomous systems maintain quality at scale. I catch what the daily audits miss.",
    currentWork: [
      "Phase 2 deep audit completed"
    ],
    collaborations: ["Reports to Agatha", "Coordinates with daily Vera"],
    nextActions: [
      "Review agent performance metrics",
      "Update gold standards based on learnings",
      "Prepare recommendations for Agatha"
    ],
    nextRun: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    workSummary: "Completed Phase 2 audit with 6 issues flagged",
    reportsTo: "agatha"
  },
  {
    id: "weekly-synthesis", 
    name: "Marcus",
    humanName: "Marcus",
    role: "Intelligence Synthesist",
    model: "sonnet",
    schedule: "0 7 * * 1",
    status: "waiting", 
    personality: "Thoughtful pattern-spotter who connects dots across domains",
    mission: "I synthesise intelligence from all agents into one coherent brief, surfacing patterns and priorities that individual agents can't see. I'm the organisation's memory.",
    currentWork: [
      "Preparing Monday synthesis session"
    ],
    collaborations: ["Reads reports from all agents", "Reports to Agatha"],
    nextActions: [
      "Collect all agent reports from this week",
      "Identify cross-domain patterns",
      "Generate strategic recommendations for Krish"
    ],
    nextRun: new Date(Date.now() + 13 * 60 * 60 * 1000),
    workSummary: "Next Monday: synthesize all agent reports from this week"
  },
  {
    id: "product-agent",
    name: "Priya", 
    humanName: "Priya",
    role: "Product Intelligence",
    model: "sonnet",
    schedule: "0 8 * * 1",
    status: "waiting",
    personality: "User-obsessed analyst who spots what's breaking before users complain",
    mission: "I monitor product health across all five apps, surfacing what's breaking and what's delighting users. I turn user pain into actionable improvement proposals.",
    currentWork: [
      "OnAlert dashboard UX analysis",
      "Fractionl Circle user feedback review"
    ],
    collaborations: ["Reports to Agatha", "Handoffs to Marcus for synthesis"],
    nextActions: [
      "Analyze user session data from Supabase",
      "Draft improvement proposals", 
      "Submit proposals via N8N webhook for review"
    ],
    nextRun: new Date(Date.now() + 14 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    workSummary: "Analyzing user feedback for OnAlert dashboard improvements",
    reportsTo: "agatha"
  },
  {
    id: "revenue-agent",
    name: "Leo",
    humanName: "Leo", 
    role: "Revenue & Finance",
    model: "sonnet",
    schedule: "0 8 * * 1",
    status: "blocked",
    personality: "Numbers-obsessed watchdog who spots financial anomalies instantly",
    mission: "I track revenue across Mindmaker and Fractionl against our $20K monthly target, flagging any financial anomalies in real time. Every dollar is accounted for.",
    currentWork: [
      "Fixing Fractionl Stripe integration"
    ],
    collaborations: ["Reports to Agatha", "Coordinates with Tools Agent on API issues"],
    nextActions: [
      "Wait for Stripe API key resolution",
      "Resume MTD revenue tracking",
      "Generate revenue variance report"
    ],
    nextRun: new Date(Date.now() + 14 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    workSummary: "Revenue tracking paused — fixing Fractionl Stripe integration",
    blockers: ["Fractionl Stripe API key integration"],
    reportsTo: "agatha"
  },
  {
    id: "bd-agent", 
    name: "Zara",
    humanName: "Zara",
    role: "Signal Intelligence",
    model: "sonnet",
    schedule: "0 10 * * 1-5",
    status: "waiting",
    personality: "Relationship strategist who finds warm paths where others see cold leads",
    mission: "I monitor the market for intent signals and warm opportunities — partnership leads, hiring signals, right-room intelligence. I never do cold outreach.",
    currentWork: [
      "Monitoring 23 companies hiring AI officers",
      "Tracking warm conversation threads"
    ], 
    collaborations: ["Reports to Agatha", "Handoffs warm opportunities to Felix"],
    nextActions: [
      "Research 4 warm path companies",
      "Update opportunity pipeline in N8N", 
      "Surface partnership leads to Nova"
    ],
    nextRun: new Date(Date.now() + 16 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 6 * 60 * 60 * 1000),
    workSummary: "Monitoring 23 companies hiring AI officers, 4 warm paths identified",
    reportsTo: "agatha"
  },
  {
    id: "enterprise-gigs",
    name: "Felix",
    humanName: "Felix",
    role: "Enterprise Pipeline",
    model: "sonnet", 
    schedule: "0 11 * * 1-5",
    status: "running",
    personality: "Opportunity spotter who turns conversations into $100K+ engagements",
    mission: "I manage the pipeline of high-value consulting opportunities — Meliora, AdFixus, Mindmaker engagements. I turn warm leads into signed contracts.",
    currentWork: [
      "Processing Skyview engagement proposal",
      "Qualifying $120K potential deal"
    ],
    collaborations: ["Reports to Agatha", "Receives warm leads from Zara"],
    nextActions: [
      "Finalize Skyview proposal terms",
      "Follow up on 3 pending consultant inquiries",
      "Update opportunity pipeline status"
    ],
    nextRun: new Date(Date.now() + 17 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 30 * 60 * 1000),
    workSummary: "Processing Skyview engagement proposal, $120K potential",
    reportsTo: "agatha"
  },
  {
    id: "visibility-agent",
    name: "Nova",
    humanName: "Nova",
    role: "Visibility & Speaking",
    model: "sonnet",
    schedule: "0 9 * * 2,5", 
    status: "waiting",
    personality: "Charismatic networker who gets Krish into the rooms that matter",
    mission: "I build Krish's presence in the rooms that matter — podcast appearances, speaking slots, thought leadership opportunities. I turn expertise into influence.",
    currentWork: [
      "12 podcast pitches sent this week",
      "3 speaking confirmations pending"
    ],
    collaborations: ["Reports to Agatha", "Receives partnership leads from Zara"],
    nextActions: [
      "Follow up on pending podcast confirmations",
      "Research Q2 speaking opportunities",
      "Coordinate with Maya on content angles for speakers"
    ],
    nextRun: new Date(Date.now() + 8 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    workSummary: "12 podcast pitches sent this week, 3 confirmations pending",
    reportsTo: "agatha"
  },
  {
    id: "marketing-agent",
    name: "Maya", 
    humanName: "Maya",
    role: "Marketing Intelligence",
    model: "sonnet",
    schedule: "0 9 * * 3",
    status: "success",
    personality: "Creative researcher who turns SEO data into content goldmines",
    mission: "I run SEO research, community intelligence, and content angle analysis. I find the topics that will rank and the angles that will engage.",
    currentWork: [
      "DataForSEO keyword analysis complete",
      "47 content briefs generated this week"
    ],
    collaborations: ["Reports to Agatha", "Provides content angles to Nova"],
    nextActions: [
      "Submit content angles for approval",
      "Research community trends on Reddit/Twitter",
      "Generate next week's content brief queue"
    ],
    nextRun: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 18 * 60 * 60 * 1000),
    workSummary: "DataForSEO analysis complete — 47 content briefs generated",
    reportsTo: "agatha"
  },
  {
    id: "tools-agent",
    name: "Arlo",
    humanName: "Arlo", 
    role: "Technical Operations",
    model: "haiku",
    schedule: "0 3 * * 0",
    status: "success",
    personality: "Meticulous infrastructure guardian who catches errors before they cascade",
    mission: "I keep the infrastructure healthy — monitoring N8N workflows, API connectivity, system status. I catch technical issues before they break the org.",
    currentWork: [
      "24 N8N workflows monitored",
      "Zero consecutive errors detected"
    ],
    collaborations: ["Reports to Agatha", "Supports Leo on API issues"],
    nextActions: [
      "Weekly health check of all integrations",
      "Update workflow error thresholds",
      "Generate system reliability report"
    ],
    nextRun: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    workSummary: "All 24 N8N workflows healthy, 0 consecutive errors detected",
    reportsTo: "agatha"
  }
]

export const SYSTEM_HEALTH: SystemHealth = {
  overall: "healthy",
  agentsRunning: 2,
  totalAgents: 11,
  workflowsActive: 21,
  totalWorkflows: 24,
  lastSync: new Date(Date.now() - 30 * 1000),
  uptime: "99.7%"
}