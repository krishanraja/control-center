# Control Center Documentation

> Mission Control Dashboard for MindMaker OS — The Autonomous Organisation Operating System

## Quick Links

| Document | Description |
|----------|-------------|
| [Product](./PRODUCT.md) | Per-tab product spec — what each surface is for, what it reads/writes, behaviour rules, SLAs |
| [Agents](./AGENTS.md) | Agent roster, slug-as-key rule, taxonomy, lifecycle, manual trigger and flag flow |
| [Architecture](./ARCHITECTURE.md) | System architecture, data flow, and component overview |
| [Database Schema](./DATABASE.md) | Supabase tables, relationships, and RLS policies |
| [Components](./COMPONENTS.md) | React component library and usage patterns |
| [Data Pipeline](./DATA-PIPELINE.md) | Event-driven architecture and N8N integration |
| [API Reference](./API.md) | Supabase queries and realtime subscriptions |
| [Observability](./OBSERVABILITY.md) | Health model, alerts, SLIs, logging conventions |
| [Security](./SECURITY.md) | Threat model, secrets inventory, auth, rotation procedure |
| [Glossary](./GLOSSARY.md) | Canonical definitions for every product / data term |
| [Decisions (ADRs)](./DECISIONS/) | Architecture decisions: what was chosen, why, and trade-offs |
| [Deployment](./DEPLOYMENT.md) | Vercel deployment and environment setup |
| [Contributing](./CONTRIBUTING.md) | Development workflow and code standards |
| [Data Recommendations](./DATA-RECOMMENDATIONS.md) | Future improvements for data pipeline |

## Overview

Control Center is a real-time executive dashboard that provides:

- **Home**: Operational intelligence, revenue pulse, aging blockers, and live activity feed
- **Today**: Tasks requiring immediate attention with inline actions
- **Plans**: Full task backlog with status filtering and document links
- **Org**: Agent hierarchy organized by pod (Executive, Operations, Growth)
- **Exec**: Strategic metrics, KPIs, and agent economics
- **Flows**: N8N workflow monitoring and agent proposals
- **Systems**: Infrastructure health monitoring

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 4 |
| Styling | Tailwind CSS 3, Radix UI |
| Icons | Lucide React |
| Charts | Recharts |
| Backend | Supabase (PostgreSQL + Realtime) |
| Orchestration | N8N Workflows |
| Deployment | Vercel |

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type check
npx tsc --noEmit
```

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Control Center UI                         │
│  (React + TypeScript + Tailwind)                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Realtime                            │
│  (postgres_changes subscriptions)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase PostgreSQL                          │
│  (tasks, agents, goals, audit_log, system_health, etc.)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Webhooks (pg_net)                   │
│  (Triggers N8N workflows on data changes)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    N8N Agents                                   │
│  (Autonomous workflows that update Supabase)                    │
└─────────────────────────────────────────────────────────────────┘
```

## License

Proprietary - Krish Raja / MindMaker
