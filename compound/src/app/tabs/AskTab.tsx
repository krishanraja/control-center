import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { buildAnswers, findAnswer, type Answer } from "../../lib/answers";
import type { CompoundConfig } from "../../lib/env";
import { DEFAULT_HORIZON } from "../../lib/horizon";
import { loadAskSnapshotId } from "../../lib/askSnapshot";
import { streamCompoundAnswer } from "../../lib/stream";
import { getSupabase } from "../../lib/supabase";
import type { ChatEvidence, Snapshot } from "../../types";
import { RichText } from "../components/RichText";

interface Props {
  snapshot: Snapshot;
  config: CompoundConfig;
  session: Session | null;
  /** A question handed over by a card's "Ask about this" button. */
  pending: string | null;
  onConsumed: () => void;
}

export function AskTab({ snapshot, config, session, pending, onConsumed }: Props) {
  const answers = useMemo(() => buildAnswers(snapshot), [snapshot]);
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState("");
  const [offline, setOffline] = useState<Answer | null>(null);
  const [streamed, setStreamed] = useState("");
  const [evidence, setEvidence] = useState<ChatEvidence[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [threadId, setThreadId] = useState<string>();
  const [askId, setAskId] = useState<string | null>(null);
  const [askIdError, setAskIdError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const live = config.mode === "live" && Boolean(session);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!live || !session) return;
    let mounted = true;
    void loadAskSnapshotId(getSupabase(config), DEFAULT_HORIZON)
      .then((id) => {
        if (!mounted) return;
        setAskId(id);
        if (!id) setAskIdError("There is no stored view to answer against yet, so live answers are off today.");
      })
      .catch((reason: unknown) => {
        if (mounted) setAskIdError(reason instanceof Error ? reason.message : "Live answers are unavailable.");
      });
    return () => { mounted = false; };
  }, [config, live, session]);

  async function ask(next: string) {
    const trimmed = next.trim();
    if (!trimmed || busy) return;
    setQuestion(trimmed);
    setInput("");
    setError("");
    setStreamed("");
    setEvidence([]);
    setExcluded([]);

    const canned = findAnswer(answers, trimmed);
    if (!live || !session || !askId) {
      // Offline, or live with nothing to pin an answer to.
      setOffline(canned ?? null);
      if (!canned) {
        setError(live
          ? (askIdError || "Live answers are not connected, so only the suggested questions can be answered.")
          : "That one needs a live session. Pick one of the suggested questions to see how answers are put together.");
      }
      return;
    }

    setOffline(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamCompoundAnswer(
        config,
        session,
        { question: trimmed, horizon: DEFAULT_HORIZON, snapshotId: askId, threadId, requestId: crypto.randomUUID() },
        (event) => {
          if (event.event === "meta") setThreadId(event.data.threadId);
          if (event.event === "delta") setStreamed((current) => current + event.data.text);
          if (event.event === "evidence") {
            setEvidence(event.data.items);
            setExcluded(event.data.excluded);
          }
          if (event.event === "error") setError(event.data.message);
        },
        controller.signal,
      );
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "COMPOUND could not answer right now.");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!pending) return;
    onConsumed();
    void ask(pending);
    // The handed-over question is the only trigger. ask() is rebuilt each
    // render, so listing it here would re-fire the same question.

  }, [pending]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  const answered = Boolean(offline || streamed || busy || error);

  return (
    <>
      <p className="eyebrow">Follow anything up</p>
      <h2 className="big">Ask.</h2>
      <p className="sub">Answers use today's data and show what they used.</p>

      <div className="pills">
        {answers.map((answer) => (
          <button key={answer.question} type="button" className="pill" onClick={() => void ask(answer.question)}>
            {answer.question}
          </button>
        ))}
      </div>

      {answered && (
        <div className="ans" aria-live="polite">
          <div className="eyebrow">{question}</div>
          {busy && !streamed && <p className="mut">Answering now…</p>}
          {offline?.paragraphs.map((paragraph) => <p key={paragraph}><RichText text={paragraph} /></p>)}
          {streamed && <p className={busy ? "streaming" : undefined}>{streamed}</p>}
          {error && <p className="dn">{error}</p>}

          {(offline || evidence.length > 0) && (
            <div className="used">
              <div className="ctag">What this used</div>
              {offline?.evidence.map((item) => (
                <div className="evline" key={item.label}>
                  <span>{item.label}</span>
                  <span className="mono mut">{item.source}</span>
                </div>
              ))}
              {evidence.map((item) => (
                <div className="evline" key={item.id}>
                  <span>{item.label}</span>
                  <span className="mono mut">{item.source} · checked {item.checkedAt}</span>
                </div>
              ))}
            </div>
          )}
          {excluded.map((item) => <p className="excluded" key={item}>{item}</p>)}
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        <label htmlFor="ask-input">{question ? "Ask another question" : "Ask a question"}</label>
        <div className="composer-row">
          <input
            id="ask-input"
            name="question"
            autoComplete="off"
            maxLength={800}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask anything about today's data"
          />
          <button type="submit" disabled={busy || !input.trim()}>Ask</button>
        </div>
      </form>

      <div className="footnote">
        {live && askId
          ? "Live answers read today's stored view and cite the numbers behind them."
          : "Suggested answers are built from the same file the cards read, so the numbers match."}{" "}
        COMPOUND explains the data and never places a trade.
      </div>
    </>
  );
}
