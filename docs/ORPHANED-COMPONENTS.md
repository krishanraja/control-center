# Orphaned components

Files under `src/` that are unreachable from `src/App.tsx` or `src/main.tsx`,
following both static `from '...'` imports and `import('...')` lazy imports.

Generated 2026-08-13 during the content-engine pass. Two files in that pass's
own blast radius were deleted at the time (`PodcastTargetCard`,
`VisibilityEventCard`, the latter superseded by `VisibilityTargetCard`). The
rest are listed rather than deleted, because a file can be unreachable in this
analysis and still be wanted: a component behind a flag that is currently off
looks identical to a dead one from here. Each needs a decision, not a sweep.

Most are v1 surfaces superseded by a v2 (`Sidebar` by `DesktopSidebar`,
`DesktopAcquisition` by the folded Growth tab), which is the same class of
leftover as the `content/` files removed in this pass.

## The list (45 files)

- `src/components/DailyLockBanner.tsx`
- `src/components/PipelineCard.tsx`
- `src/components/Sidebar.tsx`
- `src/components/acquisition/ContentToCapturePanel.tsx`
- `src/components/acquisition/GeoCitationsPanel.tsx`
- `src/components/acquisition/NurtureFunnelPanel.tsx`
- `src/components/acquisition/ReplyInbox.tsx`
- `src/components/acquisition/SendApprovalDeck.tsx`
- `src/components/acquisition/SequenceReviewSheet.tsx`
- `src/components/acquisition/TouchProgressPanel.tsx`
- `src/components/desktop/DesktopAcquisition.tsx`
- `src/components/desktop/LeadSourceLane.tsx`
- `src/components/desktop/PipelineLane.tsx`
- `src/components/desktop/PipelineQueue.tsx`
- `src/components/focus/FocusBar.tsx`
- `src/components/mobile/BlockerCard.tsx`
- `src/components/mobile/HealthStrip.tsx`
- `src/components/mobile/MobileAcquisition.tsx`
- `src/components/mobile/SkeletonLine.tsx`
- `src/components/mobile/SynthesisLine.tsx`
- `src/components/mobile/TeamStrip.tsx`
- `src/components/shared/LastUpdated.tsx`
- `src/components/shared/PodChip.tsx`
- `src/components/shared/index.ts`
- `src/components/ui/badge.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/index.ts`
- `src/components/ui/input.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/tooltip.tsx`
- `src/hooks/useNovaConferences.ts`
- `src/hooks/usePodchaserPodcasts.ts`
- `src/hooks/useSwipeActions.ts`
- `src/lib/pipelines.ts`
- `src/lib/utils.ts`
- `src/services/agentBriefs.ts`
- `src/services/agentData.ts`
- `src/types/plan-execution.ts`
- `src/types/sequences.ts`
- `src/utils/time.ts`
