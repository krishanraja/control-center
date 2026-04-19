# Architecture & Engineering Contract

This document serves as the absolute truth for the data contracts, control flows, and global deployment facts of MindMaker OS v3 Control Center. It dictates **what** the UI is allowed to do, not how it looks.

## 1. Global Architecture & Environment Truths

### Single Source of Truth (SSOT)
- **Agent IDs & Fleet Composition:** The frontend code does **not** dictate Agent IDs. The canonical SSOT for all Agent and Workflow IDs is `hot/systems.md` on the OpenClaw orchestrator. The Control Center pulls active agents dynamically from the `agents` table.
- **Workflow Names:** The system relies on the `Agent | Venture | Function` naming convention for all downstream displays.

### Deployment Quirks (Vercel)
- **Vercel CLI is BANNED:** All deployments must happen by pushing directly to the `main` branch on GitHub.
- **ESM Import Requirements:** Because `package.json` specifies `"type": "module"`, all local imports inside the `api/` directory (serverless functions) **must** have a `.js` extension (e.g., `import { supabase } from './_supabase.js'`). Failure to do this causes silent Vercel 500 errors on deployment.
- **Authentication & Endpoints:** Vercel SSO blocks external access by default. Endpoints that require external reachability (like monitors hitting `/api/health`) must be explicitly handled or Vercel protection bypassed.

## 2. Tab-by-Tab Data Contracts

### 2.1 Home Intelligence (Command Center)
- **The Read:** 
  - `home_intelligence` (where `id = 'current'`)
  - `goals` (top 6 recent)
  - `audit_log` (top 30 recent)
- **The Write:** No direct mutations. This tab is strictly a consumer of Marcus's synthesised intelligence.
- **Failure State:** If `home_intelligence` is empty or unreachable, falls back to an empty state for the briefing. `goals` and `audit_log` will render as empty lists.

### 2.2 Today & Plans (Task Management)
- **The Read:** `tasks` table (subscribed via `useRealtimeTasks` for instant UI updates).
- **The Write:** 
  - Updates `status` ('active', 'done')
  - Toggles `krish_reviewed` = true
  - Updates `krish_notes` and `next_step`
  - Defers tasks by updating `due_date`
  - Inserts into `corrections` when a task requires a hard pivot or correction.
- **Failure State:** If `tasks` fails to load, the `ErrorBoundary` will catch it and display a retry button.

### 2.3 Exec (Strategic Metrics)
- **The Read:**
  - `home_intelligence.metrics` 
  - `audit_log` (top 20)
  - `workflow_runs` (top 20)
- **The Write:** Read-only dashboard.
- **Failure State:** Fails gracefully to empty arrays if `home_intelligence` or logs cannot be fetched.

### 2.4 Flows (Workflow Proposals & Health)
- **The Read:** 
  - `workflow_proposals` (where `status = 'pending'`)
  - `workflow_runs` (top 50)
- **The Write:**
  - Updates `workflow_proposals.status` (e.g., to 'approved' or 'rejected')
  - Updates `krish_reviewed` = true and records `completed_at` timestamps.
- **Failure State:** Errors isolated via `ErrorBoundary`. Missing proposals default to a "No pending workflows" empty state.

### 2.5 Org (Agent Hierarchy)
- **The Read:** 
  - `agents` (where `active = true`, ordered by `pod`)
  - `tasks`, `audit_log`, `workflow_runs` (filtered dynamically via `inList` queries based on selected Agent ID/tokens).
- **The Write:** Read-only view of agent health and recent activity.
- **Failure State:** If `agents` table fails, the hierarchy renders empty. Activity feeds fail gracefully to empty arrays if specific agent logs timeout.

### 2.6 Background Services & Global UI
- **Command Palette (Cmd+K):** Reads `tasks` (limit 50, active) and `agents` (active=true). Writes task status changes directly.
- **Pending Flag Modal:** Reads `pending_flags` and updates `fired = false` to dismiss active system alerts.
- **Inline Actions:** Generic component executing `supabase.from('tasks').update({...})`.

## 3. The Control Flow

1. **User Action:** User clicks an action button (e.g., Approve, Reject, Done).
2. **Supabase Mutation:** The UI updates the respective Supabase row (e.g., `tasks`, `workflow_proposals`).
3. **Webhook Trigger:** Supabase `pg_net` webhooks fire automatically on data change.
4. **Agent Execution:** An N8N workflow receives the payload and executes the required logic.
5. **Realtime Sync:** N8N updates Supabase, and the UI's `useRealtimeTasks` hook (via `postgres_changes`) instantly refreshes the interface.
