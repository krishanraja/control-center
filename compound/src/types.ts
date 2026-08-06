export type Horizon = "3m" | "1y";
export type SnapshotState = "representative" | "partial" | "quiet" | "stale";

export interface Fact {
  label: string;
  value: string;
  attention?: boolean;
}

export interface HoldingView {
  name: string;
  share: string;
  summary: string;
  status: string;
  attention?: boolean;
  latest: string;
}

export interface EvidenceItem {
  id: string;
  label: string;
  detail: string;
  source: string;
  checkedAt: string;
  current: boolean;
}

export interface DashboardSnapshot {
  id: string;
  asOf: string;
  dateLabel: string;
  horizon: Horizon;
  status: SnapshotState;
  verdict: {
    lead: string;
    signal: string;
    tail: string;
  };
  freshness: {
    title: string;
    detail: string[];
  };
  facts: Fact[];
  dial: {
    count: string;
    label: string;
    detail: string[];
  };
  review: {
    badge: string;
    title: string;
    call: string;
    holdingValue: string;
    changed: string;
    changedSource: string;
    countercase: string;
    countercaseSource: string;
    serious: string;
    seriousSource: string;
  };
  holdings: HoldingView[];
  movements: Array<{ label: string; detail: string; status: string; attention?: boolean }>;
  warning: {
    feed: string;
    detail: string;
    status: string;
  };
  evidence: EvidenceItem[];
}

export interface ChatEvidence {
  id: string;
  label: string;
  source: string;
  checkedAt: string;
}

export type ChatEvent =
  | { event: "meta"; data: { threadId: string; snapshotAsOf: string } }
  | { event: "delta"; data: { text: string } }
  | { event: "evidence"; data: { items: ChatEvidence[]; excluded: string[] } }
  | { event: "done"; data: { messageId: string } }
  | { event: "error"; data: { message: string; retryable: boolean } };
