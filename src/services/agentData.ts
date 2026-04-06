import { Agent, SystemHealth } from '../types'

export const AGENTS: Agent[] = [
  {
    id: "agatha",
    name: "Agatha",
    role: "COO",
    model: "sonnet",
    schedule: "always",
    status: "running",
    description: "Chief Operating Officer — manages all agents, synthesises reports, escalates decisions",
    nextRun: new Date(),
    lastRun: new Date(Date.now() - 15 * 60 * 1000),
    workSummary: "Managing Phase 2 rollout and agent coordination"
  },
  {
    id: "vera-daily",
    name: "Vera (Daily)",
    role: "Chief of Staff",
    model: "haiku",
    schedule: "0 2 * * *",
    status: "waiting",
    description: "Daily QA audit — checks agent outputs against gold standards",
    nextRun: new Date(Date.now() + 2 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 22 * 60 * 60 * 1000),
    workSummary: "Next: audit all agent outputs from today",
    reportsTo: "agatha"
  },
  {
    id: "vera-weekly",
    name: "Vera (Weekly)",
    role: "Chief of Staff",
    model: "sonnet",
    schedule: "0 6 * * 5",
    status: "success",
    description: "Weekly deep audit — comprehensive quality review",
    nextRun: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    workSummary: "Completed Phase 2 audit with 6 issues flagged",
    reportsTo: "agatha"
  },
  {
    id: "weekly-synthesis",
    name: "Weekly Synthesis",
    role: "Intelligence",
    model: "sonnet",
    schedule: "0 7 * * 1",
    status: "waiting",
    description: "Cross-domain intelligence sharing — agents read each others context",
    nextRun: new Date(Date.now() + 13 * 60 * 60 * 1000),
    workSummary: "Next Monday: synthesize all agent reports from this week"
  },
  {
    id: "product-agent",
    name: "Product Agent",
    role: "Product Intelligence",
    model: "sonnet",
    schedule: "0 8 * * 1",
    status: "waiting",
    description: "Improvement proposals for 5 products based on real user data",
    nextRun: new Date(Date.now() + 14 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    workSummary: "Analyzing user feedback for OnAlert dashboard improvements",
    reportsTo: "agatha"
  },
  {
    id: "revenue-agent",
    name: "Revenue Finance",
    role: "Financial Tracking", 
    model: "sonnet",
    schedule: "0 8 * * 1",
    status: "blocked",
    description: "MTD revenue tracking vs $20K target across all products",
    nextRun: new Date(Date.now() + 14 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    workSummary: "Revenue tracking paused — fixing Fractionl Stripe integration",
    blockers: ["Fractionl Stripe API key integration"],
    reportsTo: "agatha"
  },
  {
    id: "bd-agent",
    name: "BD Agent",
    role: "Signal Intelligence",
    model: "sonnet", 
    schedule: "0 10 * * 1-5",
    status: "waiting",
    description: "Intent signals and warm path identification — no cold outreach",
    nextRun: new Date(Date.now() + 16 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 6 * 60 * 60 * 1000),
    workSummary: "Monitoring 23 companies hiring AI officers, 4 warm paths identified",
    reportsTo: "agatha"
  },
  {
    id: "enterprise-gigs",
    name: "Enterprise Gigs",
    role: "Consulting Pipeline",
    model: "sonnet",
    schedule: "0 11 * * 1-5", 
    status: "running",
    description: "Manages consulting opportunities (Meliora, AdFixus, Mindmaker)",
    nextRun: new Date(Date.now() + 17 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 30 * 60 * 1000),
    workSummary: "Processing Skyview engagement proposal, $120K potential",
    reportsTo: "agatha"
  },
  {
    id: "visibility-agent", 
    name: "Visibility Agent",
    role: "PR + Speaking",
    model: "sonnet",
    schedule: "0 9 * * 2,5",
    status: "waiting",
    description: "Podcast pitches, speaking slots, public profile building", 
    nextRun: new Date(Date.now() + 8 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    workSummary: "12 podcast pitches sent this week, 3 confirmations pending",
    reportsTo: "agatha"
  },
  {
    id: "marketing-agent",
    name: "Marketing Agent", 
    role: "SEO + Growth",
    model: "sonnet",
    schedule: "0 9 * * 3",
    status: "success",
    description: "SEO analysis, content briefs, organic growth strategy",
    nextRun: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    lastRun: new Date(Date.now() - 18 * 60 * 60 * 1000),
    workSummary: "DataForSEO analysis complete — 47 content briefs generated",
    reportsTo: "agatha"
  },
  {
    id: "tools-agent",
    name: "Tools Agent",
    role: "Technical Health", 
    model: "haiku",
    schedule: "0 3 * * 0",
    status: "success", 
    description: "N8N health monitoring, API connectivity, system status",
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
