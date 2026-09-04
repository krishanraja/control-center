import type { StoryClassification, StoryDomain, TabKey } from "../../types";

const shared = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, "aria-hidden": true } as const;

export function TabIcon({ tab }: { tab: TabKey }) {
  if (tab === "brief") {
    return <svg {...shared}><path d="M5 4.5h14M5 9.5h9M5 14.5h14M5 19.5h7" /><circle cx="18" cy="9.5" r="1.5" /></svg>;
  }
  if (tab === "markets") {
    return <svg {...shared}><path d="M3.5 17.5 8.5 12l3.6 2.8L20.5 6" /><path d="M15.5 6h5v5" /><path d="M3.5 21h17" /></svg>;
  }
  if (tab === "portfolio") {
    return <svg {...shared}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5V12l7.3 4.3" /><path d="M12 12 6.2 18.2" /></svg>;
  }
  if (tab === "property") {
    return <svg {...shared}><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10.5V19h12v-8.5" /><path d="M10 19v-5h4v5" /></svg>;
  }
  if (tab === "spend") {
    return <svg {...shared}><path d="M6.5 3.5h11v17l-2.2-1.5-2.2 1.5-2.2-1.5-2.2 1.5-2.2-1.5z" /><path d="M9.5 8.5h5M9.5 12h5M9.5 15.5h3" /></svg>;
  }
  return <svg {...shared}><path d="M4 5.5h16v11H9l-5 4z" /><path d="M8 10.5h8M8 13.5h5" /></svg>;
}

/** Bespoke market-domain glyphs. These are labels, not decoration. */
export function DomainIcon({ domain }: { domain: StoryDomain }) {
  if (domain === "rates") {
    return <svg {...shared}><path d="M4 17c3.2-6.7 7.8-9.7 16-10" /><path d="M4 12.5c4.2-3.8 8.7-5.1 15-4.5" /><path d="M4 20h16" /></svg>;
  }
  if (domain === "equities") {
    return <svg {...shared}><path d="M4 19V12h3v7M10.5 19V7h3v12M17 19V4h3v15" /><path d="M3 19.5h18" /></svg>;
  }
  if (domain === "credit") {
    return <svg {...shared}><path d="M4 7h16M4 17h16" /><path d="M7 7c0 5 3 5 3 10M17 7c0 5-3 5-3 10" /><circle cx="12" cy="12" r="1.6" /></svg>;
  }
  if (domain === "currencies") {
    return <svg {...shared}><path d="M4 8h14" /><path d="m15 5 3 3-3 3" /><path d="M20 16H6" /><path d="m9 13-3 3 3 3" /></svg>;
  }
  if (domain === "commodities") {
    return <svg {...shared}><path d="m12 3 7 6-2.5 9h-9L5 9z" /><path d="m5 9 7 3 7-3M12 3v9M7.5 18 12 12l4.5 6" /></svg>;
  }
  if (domain === "crypto") {
    return <svg {...shared}><path d="m12 3 7.5 4.5v9L12 21l-7.5-4.5v-9z" /><path d="m8 9 4-2 4 2-4 2zM8 9v5l4 2.2 4-2.2V9" /></svg>;
  }
  return <svg {...shared}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.3 3.5 5.1 3.5 8.5S14.3 18.2 12 20.5M12 3.5C9.7 5.8 8.5 8.6 8.5 12s1.2 6.2 3.5 8.5" /></svg>;
}

export function ClassificationIcon({ classification }: { classification: StoryClassification }) {
  if (classification === "opportunity") {
    return <svg {...shared}><path d="M5 16 11 10l3 3 5-6" /><path d="M14 7h5v5" /><circle cx="7" cy="18" r="2" /></svg>;
  }
  if (classification === "risk") {
    return <svg {...shared}><path d="M12 3 3.5 19h17z" /><path d="M12 9v4.5M12 17h.01" /></svg>;
  }
  return <svg {...shared}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /><path d="M4.5 6.5 7 6M17 18l2.5-.5" /></svg>;
}

export function CalendarIcon() {
  return <svg {...shared}><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M7.5 3v5M16.5 3v5M3.5 10h17" /><circle cx="8" cy="14" r=".8" fill="currentColor" stroke="none" /><circle cx="12" cy="14" r=".8" fill="currentColor" stroke="none" /><circle cx="16" cy="14" r=".8" fill="currentColor" stroke="none" /></svg>;
}

export function SourceIcon() {
  return <svg {...shared}><path d="M8.5 12.5 6 15a3.5 3.5 0 0 0 5 5l3-3" /><path d="m15.5 11.5 2.5-2.5a3.5 3.5 0 1 0-5-5l-3 3" /><path d="m9 15 6-6" /></svg>;
}

export function HistoryIcon() {
  return <svg {...shared}><path d="M4 5v5h5" /><path d="M5.4 9.2A8 8 0 1 1 6 17" /><path d="M12 7.5V12l3 2" /></svg>;
}

export function AttentionIcon() {
  return <svg {...shared}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v6M12 16.5h.01" /></svg>;
}

export function GearIcon() {
  return (
    <svg {...shared}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.5.6.87 1.14 1H21a2 2 0 0 1 0 4h-.09c-.54.13-1 .5-1.14 1z" />
    </svg>
  );
}

export function CaretIcon() {
  return <svg {...shared} strokeWidth={2}><path d="M6 9l6 6 6-6" /></svg>;
}

export function ChevronIcon() {
  return <svg {...shared} strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg>;
}
