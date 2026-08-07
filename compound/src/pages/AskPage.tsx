import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getDemoAnswer, getDemoSnapshot } from "../data/fixtures";
import type { CompoundConfig } from "../lib/env";
import { loadLatestSnapshot } from "../lib/snapshots";
import { streamCompoundAnswer } from "../lib/stream";
import { getSupabase } from "../lib/supabase";
import type { ChatEvidence, DashboardSnapshot, Horizon, SnapshotState } from "../types";

interface Props {
  config: CompoundConfig;
  session: Session | null;
  search: string;
  navigate: (href: string) => void;
}

const suggestions = ["What changed today?", "Why not buy more Solana?", "What is my biggest risk?"];

function getSettings(search: string): { horizon: Horizon; state: SnapshotState } {
  const params = new URLSearchParams(search);
  const horizon = params.get("horizon") === "1y" ? "1y" : "3m";
  const requested = params.get("state");
  const state: SnapshotState = requested === "quiet" || requested === "stale" || requested === "representative" ? requested : "partial";
  return { horizon, state };
}

export function AskPage({ config, session, search, navigate }: Props) {
  const settings = useMemo(() => getSettings(search), [search]);
  const initialSnapshot = config.mode === "demo" ? getDemoSnapshot(settings.state, settings.horizon) : null;
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(initialSnapshot);
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState(config.mode === "demo" ? "Why shouldn't I buy more Solana?" : "");
  const [answer, setAnswer] = useState(config.mode === "demo" ? getDemoAnswer(settings.state) : "");
  const [evidence, setEvidence] = useState<ChatEvidence[]>(() => initialSnapshot ? initialSnapshot.evidence.filter((item) => item.current).slice(0, 2).map((item) => ({ id: item.id, label: `${item.label}: ${item.detail}`, source: item.source, checkedAt: item.checkedAt })) : []);
  const [excluded, setExcluded] = useState<string[]>(config.mode === "demo" ? [settings.state === "stale" ? "The latest complete data is too old for a current answer." : "News updates are late, so this answer does not use them."] : []);
  const [status, setStatus] = useState(config.mode === "demo" ? "Answer ready" : "Ready for your question");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snapshotError, setSnapshotError] = useState("");
  const [threadId, setThreadId] = useState<string>();
  const [lastRequestId, setLastRequestId] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (config.mode !== "live" || !session) return;
    setSnapshot(null);
    setSnapshotError("");
    void loadLatestSnapshot(getSupabase(config), settings.horizon)
      .then(setSnapshot)
      .catch((reason: unknown) => setSnapshotError(reason instanceof Error ? reason.message : "Today's view could not be loaded."));
  }, [config, session, settings.horizon]);

  async function submit(nextQuestion: string, requestId: string = crypto.randomUUID()) {
    const trimmed = nextQuestion.trim();
    if (!trimmed || busy || !snapshot) return;
    setQuestion(trimmed);
    setLastRequestId(requestId);
    setInput("");
    setAnswer("");
    setEvidence([]);
    setExcluded([]);
    setError("");
    setBusy(true);
    setStatus("Answering now");

    if (config.mode === "demo") {
      const demoAnswer = getDemoAnswer(snapshot.status);
      const demoExcluded = [snapshot.status === "stale" ? "The latest complete data is too old for a current answer." : "News updates are late, so this answer does not use them."];
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        setAnswer(demoAnswer);
        setEvidence(snapshot.evidence.filter((item) => item.current).slice(0, 2).map((item) => ({ id: item.id, label: `${item.label}: ${item.detail}`, source: item.source, checkedAt: item.checkedAt })));
        setExcluded(demoExcluded);
        setStatus("Answer ready");
        setBusy(false);
        return;
      }
      const words = demoAnswer.split(" ");
      let index = 0;
      timerRef.current = window.setInterval(() => {
        setAnswer((current) => `${current}${current ? " " : ""}${words[index]}`);
        index += 1;
        if (index >= words.length) {
          if (timerRef.current !== null) window.clearInterval(timerRef.current);
          timerRef.current = null;
          setEvidence(snapshot.evidence.filter((item) => item.current).slice(0, 2).map((item) => ({ id: item.id, label: `${item.label}: ${item.detail}`, source: item.source, checkedAt: item.checkedAt })));
          setExcluded(demoExcluded);
          setStatus("Answer ready");
          setBusy(false);
        }
      }, 42);
      return;
    }

    if (!session) {
      setError("Your sign-in has expired. Refresh the page and sign in again.");
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamCompoundAnswer(config, session, { question: trimmed, horizon: settings.horizon, snapshotId: snapshot.id, threadId, requestId }, (event) => {
        if (event.event === "meta") setThreadId(event.data.threadId);
        if (event.event === "delta") setAnswer((current) => current + event.data.text);
        if (event.event === "evidence") {
          setEvidence(event.data.items);
          setExcluded(event.data.excluded);
        }
        if (event.event === "error") setError(event.data.message);
        if (event.event === "done") setStatus("Answer ready");
      }, controller.signal);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "COMPOUND could not answer right now.");
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStatus("Answer ready");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(input);
  }

  const dashboardSearch = new URLSearchParams({ horizon: settings.horizon });
  if (config.mode === "demo") dashboardSearch.set("state", settings.state);

  return (
    <main className="ask-shell" aria-labelledby="ask-title">
      <header className="ask-topbar">
        <div className="brand-row"><span className="brand">COMPOUND</span>{config.mode === "demo" && <span className="demo-flag">SAMPLE DATA</span>}</div>
        <button className="back-link" type="button" onClick={() => navigate(`/?${dashboardSearch.toString()}`)}>Back to today</button>
      </header>

      <div className="ask-layout">
        <aside className="ask-context" aria-labelledby="context-title">
          <p className="eyebrow">Today's view</p>
          <h2 id="context-title">{snapshot?.verdict.lead || snapshot?.verdict.signal || "Loading today's view…"}</h2>
          {snapshot && <><p className="context-call">{snapshot.verdict.lead ? `${snapshot.verdict.signal} ${snapshot.verdict.tail}` : snapshot.verdict.tail}</p><p className="context-data">{snapshot.freshness.detail.map((line) => <span key={line}>{line}</span>)}</p></>}
          <p className="eyebrow">Try asking</p>
          <div className="suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => { setInput(suggestion); document.getElementById("ask-input")?.focus(); }}>{suggestion}</button>)}</div>
        </aside>

        <section className="conversation" aria-labelledby="ask-title">
          <header><p className="eyebrow">Ask COMPOUND</p><h1 id="ask-title">Ask about your money.</h1><p className="conversation-intro">COMPOUND answers from today's data and shows what it used.</p></header>

          {snapshotError && <div className="answer-error standalone-error" role="alert"><p>{snapshotError}</p><button type="button" onClick={() => navigate(`/?${dashboardSearch.toString()}`)}>Back to today</button></div>}

          {(question || error) && <div className="thread" aria-live="polite">
            {question && <div className="question"><small>You asked</small><p>{question}</p></div>}
            {(answer || busy || error) && <article className="answer" aria-labelledby="answer-status">
              <div className="answer-status" id="answer-status"><span className={busy ? "live-dot active" : "live-dot"} aria-hidden="true" /><span>{error ? "Answer unavailable" : status}</span></div>
              {answer && <p className={busy ? "answer-copy streaming" : "answer-copy"}>{answer}</p>}
              {error && <div className="answer-error"><p>{error}</p><button type="button" onClick={() => void submit(question, lastRequestId ?? crypto.randomUUID())} disabled={busy}>Try again</button></div>}
              {(evidence.length > 0 || excluded.length > 0) && <section className="answer-evidence" aria-labelledby="used-title"><h2 id="used-title">{evidence.length > 0 ? "Used for this answer" : "Why there is no current answer"}</h2>{evidence.map((item) => <div className="evidence-line" key={item.id}><strong>{item.label}</strong><span>{item.source} · checked {item.checkedAt}</span></div>)}{excluded.map((item) => <p className="unused-note" key={item}>{item}</p>)}</section>}
            </article>}
          </div>}

          <form className="composer" onSubmit={handleSubmit}>
            <label htmlFor="ask-input">{question ? "Ask another question" : "Ask a question"}</label>
            <div className="composer-row"><input id="ask-input" name="question" autoComplete="off" maxLength={800} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask anything about today's view" /><button type="submit" disabled={busy || !input.trim() || !snapshot}>Ask</button></div>
            <p className="composer-note">Your questions stay in COMPOUND. Answers explain the data but never place a trade.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
