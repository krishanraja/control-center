import type { TabKey } from "../../types";

const shared = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, "aria-hidden": true } as const;

export function TabIcon({ tab }: { tab: TabKey }) {
  if (tab === "now") {
    return <svg {...shared}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>;
  }
  if (tab === "shifts") {
    return <svg {...shared}><path d="M4 17l6-6 4 3 6-8" /><path d="M14 6h6v6" /></svg>;
  }
  if (tab === "stocks") {
    return <svg {...shared}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>;
  }
  if (tab === "mine") {
    return <svg {...shared}><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M8 7V5h8v2" /></svg>;
  }
  return <svg {...shared}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
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
