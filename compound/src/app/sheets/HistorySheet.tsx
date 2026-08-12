import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { z } from "zod";
import { parseArchivedTimeline } from "../../lib/brief";
import type { ArchivedSnapshotRow, CompoundDay } from "../../types";
import { HistoryIcon, SourceIcon } from "../components/Icons";

interface CompareResult {
  from: string;
  to: string;
  changedVerdicts: Array<{ key: string; domain: string; from: { verdict: string; stance: string }; to: { verdict: string; stance: string } }>;
  newEvidence: Array<{ story: string; publisher: string; title: string; sourceDate: string }>;
  falsifierTransitions: Array<{ key: string; falsifier: string; from: string; to: string }>;
  capitalMovement: Array<{ key: string; label: string; from: string; to: string; direction?: string }>;
  coverageDifferences: Array<{ source: string; from: string; to: string }>;
}

const compareResultSchema = z.object({
  from: z.string(),
  to: z.string(),
  changedVerdicts: z.array(z.object({
    key: z.string(),
    domain: z.string(),
    from: z.object({ verdict: z.string(), stance: z.string() }),
    to: z.object({ verdict: z.string(), stance: z.string() }),
  })),
  newEvidence: z.array(z.object({ story: z.string(), publisher: z.string(), title: z.string(), sourceDate: z.string() })),
  falsifierTransitions: z.array(z.object({ key: z.string(), falsifier: z.string(), from: z.string(), to: z.string() })),
  capitalMovement: z.array(z.object({ key: z.string(), label: z.string(), from: z.string(), to: z.string(), direction: z.string().optional() })),
  coverageDifferences: z.array(z.object({ source: z.string(), from: z.string(), to: z.string() })),
});

interface Props {
  day: CompoundDay;
  session: Session | null;
  demo: boolean;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function HistorySheet({ day, session, demo }: Props) {
  const [rows, setRows] = useState<ArchivedSnapshotRow[]>([day.archive]);
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(!demo);

  useEffect(() => {
    if (demo || !session) return;
    const controller = new AbortController();
    setBusy(true);
    void fetch("/api/snapshots/timeline?limit=60", {
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then(async (response) => {
      const body: unknown = await response.json();
      if (!response.ok) throw new Error("COMPOUND history could not be read.");
      setRows(parseArchivedTimeline(body));
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "COMPOUND history could not be read.");
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => controller.abort();
  }, [demo, session]);

  const orderedSelection = useMemo(() => [...selected].sort(), [selected]);

  useEffect(() => {
    if (demo || !session || orderedSelection.length !== 2) {
      setCompare(null);
      return;
    }
    const [from, to] = orderedSelection;
    const controller = new AbortController();
    void fetch(`/api/snapshots/compare?from=${from}&to=${to}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then(async (response) => {
      const body: unknown = await response.json();
      if (!response.ok) throw new Error("Those two dates could not be compared.");
      const parsed = compareResultSchema.safeParse(body);
      if (!parsed.success) throw new Error("That comparison arrived in an unsupported shape.");
      setCompare(parsed.data);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Those two dates could not be compared.");
    });
    return () => controller.abort();
  }, [demo, orderedSelection, session]);

  function toggle(date: string) {
    setError("");
    setSelected((current) => current.includes(date)
      ? current.filter((item) => item !== date)
      : current.length < 2 ? [...current, date] : [current[1], date]);
  }

  return (
    <div className="page history-page">
      <div className="detail-domain" aria-hidden="true"><HistoryIcon /></div>
      <h2 className="big nomargin">Market history</h2>
      <p className="sub">Choose two days to see what changed and why. Reconstructed days are labelled.</p>

      {busy && <p className="history-state">Reading the archive…</p>}
      {error && <p className="history-state dn">{error}</p>}

      <div className="timeline" aria-label="Brief dates">
        {rows.map((row) => {
          const checked = selected.includes(row.snapshot_date);
          return (
            <button
              type="button"
              key={row.id}
              className={checked ? "timeline-row selected" : "timeline-row"}
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggle(row.snapshot_date)}
            >
              <span className="timeline-mark" aria-hidden="true"><i /></span>
              <span>
                <strong>{dateLabel(row.snapshot_date)}</strong>
                <small>{row.brief.stories[0]?.title ?? "Archived brief"}</small>
              </span>
              <span className={`origin origin-${row.origin}`}>{row.origin}</span>
            </button>
          );
        })}
      </div>

      {selected.length === 1 && <p className="history-hint">Choose one more date to compare.</p>}
      {compare && (
        <section className="compare-result" aria-live="polite">
          <p className="eyebrow">What changed · {compare.from} to {compare.to}</p>
          {compare.changedVerdicts.map((item) => (
            <div className="compare-item" key={`verdict-${item.key}`}>
              <HistoryIcon />
              <span><strong>{item.domain}: {item.from.stance} → {item.to.stance}</strong><small>{item.to.verdict}</small></span>
            </div>
          ))}
          {compare.falsifierTransitions.map((item) => (
            <div className="compare-item" key={`flip-${item.key}`}>
              <HistoryIcon />
              <span><strong>Falsifier {item.to}</strong><small>{item.falsifier}</small></span>
            </div>
          ))}
          {compare.newEvidence.slice(0, 5).map((item, index) => (
            <div className="compare-item" key={`evidence-${item.story}-${index}`}>
              <SourceIcon />
              <span><strong>New evidence from {item.publisher}</strong><small>{item.title} · {item.sourceDate}</small></span>
            </div>
          ))}
          {compare.changedVerdicts.length + compare.falsifierTransitions.length + compare.newEvidence.length === 0 && (
            <p className="history-state">No verdict, falsifier, or source changed between these dates.</p>
          )}
        </section>
      )}
    </div>
  );
}
