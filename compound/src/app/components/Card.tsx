import type { ReactNode } from "react";
import type { InsightContext } from "../../lib/context";
import { longDate } from "../../lib/format";
import { useSplit } from "../DeviceProvider";
import { CaretIcon } from "./Icons";

export interface CardProps {
  id: string;
  /** What kind of claim this is, in three or four words. */
  tag: string;
  tone?: "up" | "down" | "mixed";
  /** A claim about what happens next, not a summary of what happened. */
  head: string;
  /** One line on what to watch for. */
  next: string;
  /** Bars or the check strip. Read before the words are. */
  visual?: ReactNode;
  /** The working. Folded away until someone asks for it. */
  children: ReactNode;
  /** The named source and date behind every number above. */
  source: string;
  /** The question this card hands to Ask. */
  ask: string;
  /** Real-world context that the numbers cannot see, always cited. */
  context?: InsightContext;
  open: boolean;
  onToggle: (id: string) => void;
  onAsk: (question: string) => void;
}

/**
 * The world-context layer, woven into the working so it reads as part of one
 * insight rather than a separate news feed. Every claim here names its sources.
 */
function ContextBlock({ context }: { context: InsightContext }) {
  return (
    <div className="cworld">
      <p className="cworld-h">In the wider world · {longDate(context.asOf)}</p>
      <p>{context.summary}</p>
      {context.citations.length > 0 && (
        <p className="cites">
          {context.citations.map((citation) => (
            <a key={citation.url} className="cite" href={citation.url} target="_blank" rel="noreferrer">
              {citation.title}
            </a>
          ))}
        </p>
      )}
    </div>
  );
}

/**
 * Desktop and phone disagree about what a card is.
 *
 * On a phone the whole card is the target, because a thumb wants a large one
 * and a list of tappable cards is the native pattern. On a desktop a card is
 * text with a small control under it, because a 400 pixel button is not how
 * desktop software behaves and a mouse does not need the extra area.
 */
export function Card({ id, tag, tone, head, next, visual, children, source, ask, context, open, onToggle, onAsk }: CardProps) {
  const split = useSplit();
  const bodyId = `card-body-${id}`;
  const toneClass = tone === "down" ? " dnc" : tone === "mixed" ? " mx" : "";
  const caret = <span className="caret"><CaretIcon /></span>;

  const working = (
    <div className="cbody" id={bodyId} hidden={!open}>
      {children}
      {context && <ContextBlock context={context} />}
      <div className="src">{source}</div>
      <button type="button" className="askbtn" onClick={() => onAsk(ask)}>Ask about this</button>
    </div>
  );

  if (split) {
    return (
      <div className={open ? "c open" : "c"}>
        <div className="ctop">
          <span className={`ctag${toneClass}`}>{tag}</span>
          <span className="ch">{head}</span>
          <span className="cnext">{next}</span>
          {visual}
        </div>
        <button
          type="button"
          className="chead"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(id)}
        >
          {caret}
          {open ? "Hide the working" : "Show the working"}
        </button>
        {working}
      </div>
    );
  }

  return (
    <div className={open ? "c open" : "c"}>
      <button
        type="button"
        className="chead"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onToggle(id)}
      >
        <span className={`ctag${toneClass}`}>{tag}</span>
        <span className="ch">{head}</span>
        <span className="cnext">{next}</span>
        {visual}
        <span className="cmore">
          {open ? "Hide the working" : "See how we worked it out"}
          {caret}
        </span>
      </button>
      {working}
    </div>
  );
}
