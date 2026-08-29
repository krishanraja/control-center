import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CompoundConfig } from "../../lib/env";
import { streamCompoundAnswer } from "../../lib/stream";
import type { ChatEvidence, CompoundDay } from "../../types";
import { ChevronIcon, HistoryIcon, SourceIcon } from "../components/Icons";

type Scope = "current" | "compare" | "range";

interface Props {
  day: CompoundDay;
  config: CompoundConfig;
  session: Session | null;
  pending: string | null;
  onConsumed: () => void;
}

export function AskTab({ day, config, session, pending, onConsumed }: Props) {
  const [scope, setScope] = useState<Scope>("current");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(day.archive.snapshot_date);
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState("");
  const [streamed, setStreamed] = useState("");
  const [evidence, setEvidence] = useState<ChatEvidence[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [threadId, setThreadId] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const live = config.mode === "live" && Boolean(session);

  const suggestions = useMemo(() => {
    const [lead, second] = day.archive.brief.stories;
    return [
      `What would change the call on ${lead.title}?`,
      `Why does ${second.decisiveMetric.label} matter?`,
      "What is the strongest market-wide opportunity?",
    ];
  }, [day]);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { setThreadId(undefined); }, [scope, from, to]);

  async function ask(next: string) {
    const trimmed = next.trim();
    if (!trimmed || busy) return;
    if (scope !== "current" && (!from || !to || from >= to)) {
      setError("Choose an earlier start date and a later end date.");
      return;
    }
    setQuestion(trimmed);
    setInput("");
    setError("");
    setStreamed("");
    setEvidence([]);

    if (!live || !session) {
      const match = day.archive.brief.stories.find((story) => trimmed.toLowerCase().includes(story.title.toLowerCase().slice(0, 18)))
        ?? day.archive.brief.stories[0];
      setStreamed(`${match.verdict} ${match.falsifier}`);
      setEvidence(match.citations.map((item, index) => ({
        id: `${match.id}-${index}`,
        label: item.title,
        source: item.publisher,
        checkedAt: item.sourceDate,
      })));
      return;
    }

    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamCompoundAnswer(
        config,
        session,
        {
          question: trimmed,
          horizon: day.archive.horizon,
          snapshotId: day.archive.id,
          threadId,
          requestId: crypto.randomUUID(),
          scope,
          from: scope === "current" ? undefined : from,
          to: scope === "current" ? undefined : to,
        },
        (event) => {
          if (event.event === "meta") setThreadId(event.data.threadId);
          if (event.event === "delta") setStreamed((current) => current + event.data.text);
          if (event.event === "evidence") setEvidence(event.data.items);
          if (event.event === "error") setError(event.data.message);
        },
        controller.signal,
      );
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "COMPOUND could not answer just now.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!pending) return;
    onConsumed();
    void ask(pending);
  }, [pending]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <div className="ask-page">
      <p className="eyebrow">Grounded in the archive</p>
      <h2 className="big">Ask COMPOUND.</h2>
      <p className="sub">Start from this brief, compare two dates, or ask across a range.</p>

      <div className="ask-scope" role="group" aria-label="Answer scope">
        {(["current", "compare", "range"] as const).map((value) => (
          <button type="button" className={scope === value ? "on" : ""} aria-pressed={scope === value} key={value} onClick={() => setScope(value)}>
            {value === "current" ? <SourceIcon /> : <HistoryIcon />}
            {value === "current" ? "Current" : value === "compare" ? "Compare" : "Range"}
          </button>
        ))}
      </div>

      {scope !== "current" && (
        <div className="date-range">
          <label>From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>To<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
      )}

      <div className="prompt-list">
        {suggestions.map((suggestion) => (
          <button type="button" key={suggestion} onClick={() => void ask(suggestion)}>
            <span>{suggestion}</span><ChevronIcon />
          </button>
        ))}
      </div>

      <form className="composer" onSubmit={submit}>
        <label htmlFor="ask-input">Ask your own question</label>
        <div className="composer-row">
          <input id="ask-input" maxLength={800} value={input} onChange={(event) => setInput(event.target.value)} placeholder="What changed, and why?" />
          <button type="submit" disabled={busy || !input.trim()}>Ask</button>
        </div>
      </form>

      {(question || busy || streamed || error) && (
        <section className="ans" aria-live="polite">
          <p className="asked">{question}</p>
          {busy && !streamed && <p className="mut">Reading the evidence…</p>}
          {streamed && <p className={busy ? "streaming" : undefined}>{streamed}</p>}
          {error && <p className="dn">{error}</p>}
          {evidence.length > 0 && (
            <div className="used">
              <p className="detail-label">Evidence</p>
              {evidence.map((item) => <div className="evline" key={item.id}><span>{item.label}</span><span>{item.source} · {item.checkedAt}</span></div>)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
