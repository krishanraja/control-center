import type { ReactNode } from "react";

/** Renders the `**value**` emphasis used in the offline answer set. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  const nodes: ReactNode[] = parts.map((part, index) => (
    index % 2 === 1 ? <b key={index}>{part}</b> : part
  ));
  return <>{nodes}</>;
}
