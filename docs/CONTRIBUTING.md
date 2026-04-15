# Contributing Guide

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Clone and Install

```bash
git clone https://github.com/krishanraja/control-center.git
cd control-center
npm install
```

### Environment Setup

Create `.env.local`:

```env
VITE_SUPABASE_URL=https://gojpffsrxybbpbdzzrvs.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Start Development Server

```bash
npm run dev
```

Open http://localhost:5173

## Code Standards

### TypeScript

- Strict mode enabled
- No `any` types (use `unknown` if truly unknown)
- Explicit return types on exported functions
- Interface over type for object shapes

```typescript
// Good
interface TaskRow {
  id: string
  title: string
  status: 'active' | 'blocked' | 'done'
}

// Avoid
type TaskRow = {
  id: any
  title: any
}
```

### React

- Functional components only
- Hooks for state and effects
- Memoize expensive computations
- Cleanup subscriptions in useEffect

```typescript
// Good
function TaskList() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  
  useEffect(() => {
    const channel = supabase.channel('tasks')...
    return () => supabase.removeChannel(channel)
  }, [])
  
  return <div>...</div>
}
```

### Tailwind CSS

- Use design tokens from the system
- Mobile-first responsive design
- Avoid arbitrary values when possible

```tsx
// Good
<div className="px-3 py-4 md:px-6 md:py-6">

// Avoid
<div className="px-[13px] py-[17px]">
```

### File Organization

```
src/
├── components/
│   ├── desktop/        # Page components
│   ├── shared/         # Reusable components
│   └── *.tsx           # Layout components
├── hooks/              # Custom hooks
├── lib/                # Utilities and clients
└── App.tsx             # Root component
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `TaskDetail.tsx` |
| Hooks | camelCase with `use` | `useRealtimeTasks.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Constants | SCREAMING_SNAKE | `const MAX_ITEMS = 50` |
| CSS classes | kebab-case | `task-card-selected` |

## Git Workflow

### Branch Naming

```
feature/add-venture-filter
fix/realtime-subscription-error
refactor/split-pane-component
```

### Commit Messages

Follow conventional commits:

```
feat: add venture filter to Plans tab
fix: prevent duplicate realtime subscriptions
refactor: extract SectionHeader component
docs: add API reference documentation
style: improve task card spacing
```

### Pre-Commit Checklist

```bash
# Type check
npx tsc --noEmit

# Build check
npm run build

# Manual testing
npm run dev
# Test all tabs, mobile + desktop
```

### Pull Request Template

```markdown
## Summary
Brief description of changes

## Changes
- Added X
- Fixed Y
- Refactored Z

## Testing
- [ ] Tested on desktop (≥900px)
- [ ] Tested on mobile (<900px)
- [ ] All tabs render correctly
- [ ] Realtime updates working
- [ ] No console errors

## Screenshots
(if UI changes)
```

## Testing

### Manual Testing Checklist

**Desktop (≥900px)**
- [ ] Sidebar navigation works
- [ ] All tabs load without errors
- [ ] Split pane layouts correct
- [ ] Inline actions update Supabase
- [ ] Realtime updates appear

**Mobile (<900px)**
- [ ] Bottom nav visible
- [ ] Single column layout
- [ ] Touch targets adequate (44px+)
- [ ] Detail views navigate correctly
- [ ] Back button works

**Data**
- [ ] Empty states display correctly
- [ ] Loading states appear
- [ ] Error boundaries catch failures
- [ ] Timestamps humanized

### Browser Testing

Test in:
- Chrome (primary)
- Safari
- Firefox
- Mobile Safari (iOS)
- Chrome Mobile (Android)

## Adding New Features

### New Tab

1. Create component in `src/components/desktop/`
2. Add to `App.tsx` tab rendering
3. Add to `DesktopSidebar` and `BottomNav`
4. Add to `CommandPalette` actions
5. Wrap in `ErrorBoundary`

### New Supabase Table

1. Create table in Supabase dashboard
2. Add TypeScript interface
3. Create hook if needed (like `useRealtimeTasks`)
4. Document in `docs/DATABASE.md`

### New Component

1. Create in appropriate folder
2. Add TypeScript props interface
3. Document usage in `docs/COMPONENTS.md`
4. Consider mobile responsiveness

## Debugging

### Supabase Issues

```typescript
// Enable debug logging
const supabase = createClient(url, key, {
  realtime: {
    logger: console.log
  }
})
```

### React DevTools

Install React DevTools browser extension for:
- Component tree inspection
- Props/state viewing
- Performance profiling

### Network Debugging

1. Open DevTools Network tab
2. Filter by "supabase" or "ws" (WebSocket)
3. Check request/response payloads

## Getting Help

- Check existing documentation
- Search closed issues/PRs
- Ask in team Slack channel
- Create GitHub issue for bugs
