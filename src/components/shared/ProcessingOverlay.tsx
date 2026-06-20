import { Loader2 } from 'lucide-react'

// A blocking, clearly-visual processing state. While an agent is working, this
// covers the surface so (a) it's obvious something is happening and (b) no second
// action can be fired mid-flight (no double-drafts, double-triggers, double-ships).
// Use it for DISCRETE async actions the user waits on. Do NOT use it for
// background/queue jobs that return immediately and finish minutes later (those
// belong on the card as a status, not a full-screen block).
export function ProcessingOverlay({ label, sub }: { label: string; sub?: string }) {
  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in"
      role="alertdialog"
      aria-busy="true"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-3 px-8 text-center">
        <Loader2 size={30} className="animate-spin text-violet-300" />
        <p className="text-[15px] font-medium text-white/90">{label}</p>
        <p className="text-[12px] text-white/45">{sub || 'One moment…'}</p>
      </div>
    </div>
  )
}
