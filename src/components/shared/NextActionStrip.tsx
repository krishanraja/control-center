import { ChevronRight, type LucideIcon } from 'lucide-react'

interface Props {
  /** Big tabular number — the page's headline metric. */
  headline: string | number
  /** Short label sitting next to the headline (e.g. "due today", "pending"). */
  headlineLabel?: string
  /** One sentence explaining what the number means right now. */
  insight: string
  /** Primary CTA — clicking should drive the most likely next action. */
  ctaLabel: string
  onCta: () => void
  /** Optional icon for the headline area. */
  icon?: LucideIcon
  /** Optional accent (tailwind text-color class). Defaults to violet. */
  accent?: string
  /** Optional second-tier CTA (e.g. "Skip", "Show all"). */
  secondaryLabel?: string
  onSecondary?: () => void
  /** Disable the primary CTA — e.g. when there's nothing to act on. */
  disabled?: boolean
}

/**
 * Top-of-tab "what to do next" strip. Converts the tab's headline number
 * into a one-tap action so every page lands at data → insight → action.
 * See plan note in /root/.claude/plans/can-you-help-me-cozy-kitten.md (Part 3).
 */
export function NextActionStrip({
  headline,
  headlineLabel,
  insight,
  ctaLabel,
  onCta,
  icon: Icon,
  accent = 'text-violet-300',
  secondaryLabel,
  onSecondary,
  disabled = false,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl border border-white/[0.07] bg-gradient-to-r from-white/[0.025] to-transparent px-4 py-3">
      <div className="flex items-baseline gap-2 flex-shrink-0">
        {Icon && <Icon size={18} className={accent} />}
        <span className={`text-2xl font-semibold tabular-nums ${accent}`}>{headline}</span>
        {headlineLabel && (
          <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">{headlineLabel}</span>
        )}
      </div>
      <p
        className="text-[13px] text-white/70 flex-1 min-w-0 sm:truncate line-clamp-2 sm:line-clamp-none"
        title={insight}
      >
        {insight}
      </p>
      <div className="flex items-center gap-2 sm:contents">
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="flex-shrink-0 text-[12px] font-medium text-white/55 hover:text-white/85 px-2 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors"
          >
            {secondaryLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onCta}
          disabled={disabled}
          className="flex-1 sm:flex-initial flex-shrink-0 flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 rounded-md text-[13px] sm:text-[12px] font-semibold bg-violet-500/90 text-white hover:bg-violet-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {ctaLabel}
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
