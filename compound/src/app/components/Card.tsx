import type { ReactNode } from "react";
import { CaretIcon } from "./Icons";

export interface CardProps {
  id: string;
  /** The kind of claim, in three or four words. */
  tag: string;
  tone?: "up" | "down" | "mixed";
  /** A forward claim, not a summary of what happened. */
  head: string;
  /** One line on what happens next. */
  next: string;
  /** A bar set or the agreement strip. Read before the words are. */
  visual?: ReactNode;
  /** The working. Collapsed until asked for. */
  children: ReactNode;
  /** The named feed and the date behind every number above. */
  source: string;
  /** The question this card hands to Ask. */
  ask: string;
  open: boolean;
  onToggle: (id: string) => void;
  onAsk: (question: string) => void;
}

export function Card({ id, tag, tone, head, next, visual, children, source, ask, open, onToggle, onAsk }: CardProps) {
  const bodyId = `card-body-${id}`;
  const toneClass = tone === "down" ? " dnc" : tone === "mixed" ? " mx" : "";

  return (
    <div className={open ? "c open" : "c"}>
      <button
        type="button"
        className="chead"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onToggle(id)}
      >
        <span className="ct">
          <span className={`ctag${toneClass}`}>{tag}</span>
          <span className="ch">{head}</span>
          <span className="cnext">{next}</span>
          {visual}
        </span>
        <span className="caret"><CaretIcon /></span>
      </button>
      <div className="cbody" id={bodyId} hidden={!open}>
        {children}
        <div className="src">{source}</div>
        <button type="button" className="askbtn" onClick={() => onAsk(ask)}>Ask about this →</button>
      </div>
    </div>
  );
}
