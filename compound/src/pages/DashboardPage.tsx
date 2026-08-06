import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getDemoSnapshot } from "../data/fixtures";
import type { CompoundConfig } from "../lib/env";
import { loadLatestSnapshot } from "../lib/snapshots";
import { getSupabase } from "../lib/supabase";
import type { DashboardSnapshot, Horizon, SnapshotState } from "../types";

interface Props {
  config: CompoundConfig;
  session: Session | null;
  search: string;
  navigate: (href: string) => void;
}

function getViewSettings(search: string): { horizon: Horizon; state: SnapshotState } {
  const params = new URLSearchParams(search);
  const horizon = params.get("horizon") === "1y" ? "1y" : "3m";
  const requested = params.get("state");
  const state: SnapshotState = requested === "quiet" || requested === "stale" || requested === "representative" ? requested : "partial";
  return { horizon, state };
}

export function DashboardPage({ config, session, search, navigate }: Props) {
  const settings = useMemo(() => getViewSettings(search), [search]);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(config.mode === "demo" ? getDemoSnapshot(settings.state, settings.horizon) : null);
  const [error, setError] = useState("");
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    setError("");
    if (config.mode === "demo") {
      setSnapshot(getDemoSnapshot(settings.state, settings.horizon));
      return;
    }
    if (!session) return;
    setSnapshot(null);
    void loadLatestSnapshot(getSupabase(config), settings.horizon)
      .then(setSnapshot)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Today's view could not be loaded."));
  }, [config, session, settings]);

  function changeHorizon(horizon: Horizon) {
    const params = new URLSearchParams(search);
    params.set("horizon", horizon);
    navigate(`/?${params.toString()}`);
  }

  if (error) return <DashboardError message={error} />;
  if (!snapshot) return <main className="center-screen"><p className="eyebrow">COMPOUND</p><h1>Loading today's view…</h1></main>;

  const quiet = snapshot.status === "quiet";
  const askSearch = new URLSearchParams({ horizon: settings.horizon });
  if (config.mode === "demo") askSearch.set("state", settings.state);

  return (
    <main className={`dashboard-shell state-${snapshot.status}`}>
      <header className="topbar">
        <div className="brand-row">
          <span className="brand">COMPOUND</span>
          {config.mode === "demo" && <span className="demo-flag">SAMPLE DATA</span>}
        </div>
        <div className="topbar-actions">
          <button className="ask-link" type="button" onClick={() => navigate(`/ask?${askSearch.toString()}`)}>Ask COMPOUND</button>
          <div className="horizon" aria-label="Time period">
            <button type="button" className={settings.horizon === "3m" ? "active" : ""} aria-pressed={settings.horizon === "3m"} onClick={() => changeHorizon("3m")}>3 months</button>
            <button type="button" className={settings.horizon === "1y" ? "active" : ""} aria-pressed={settings.horizon === "1y"} onClick={() => changeHorizon("1y")}>1 year</button>
          </div>
        </div>
      </header>

      <section className="today" aria-labelledby="today-title">
        <div>
          <p className="eyebrow">Today · {snapshot.dateLabel}</p>
          <h1 id="today-title">
            {snapshot.verdict.lead && `${snapshot.verdict.lead} `}
            <span className="signal-text">{snapshot.verdict.signal}</span>
            {snapshot.verdict.tail && ` ${snapshot.verdict.tail}`}
          </h1>
        </div>
        <div className="freshness" aria-label="Data freshness">
          <strong>{snapshot.freshness.title}</strong>
          <span>{snapshot.freshness.detail.map((line) => <span key={line}>{line}</span>)}</span>
        </div>
      </section>

      <section className="facts" aria-label="Summary of your money">
        {snapshot.facts.map((fact) => <div className="fact" key={fact.label}><small>{fact.label}</small><strong className={fact.attention ? "attention-text" : ""}>{fact.value}</strong></div>)}
      </section>

      <section className="decision-grid">
        <div className="instrument">
          <div className="section-head"><h2>Your money at a glance</h2><button type="button" aria-expanded={showTable} onClick={() => setShowTable((open) => !open)}>{showTable ? "Hide the list" : "See the list"}</button></div>
          <p className="dial-help">Bigger slice means more money. Yellow means something changed.</p>
          <div className="dial-stage" role="img" aria-label="Chart showing Solana as 42.1 percent of invested money and one thing to check">
            <div className="dial" />
            <div className="dial-grid" aria-hidden="true" />
            <div className="hub"><strong>{snapshot.dial.count}</strong><span>{snapshot.dial.label}</span><small>{snapshot.dial.detail.map((line) => <span key={line}>{line}</span>)}</small></div>
            <div className="dial-label sol"><strong>Solana · 42%</strong><span>{quiet ? "looks healthy" : "needs a look"}</span></div>
            <div className="dial-label nvda"><strong>Nvidia · 13%</strong><span>looks healthy</span></div>
            <div className="dial-label sym"><strong>Symbotic · 13%</strong><span>looks healthy</span></div>
            <div className="dial-label soun"><strong>SoundHound · 10%</strong><span>watch spending</span></div>
            <div className="dial-label crypto"><strong>CRYPTO GROUP</strong><span>often moves together</span></div>
            {!quiet && <span className="gate" aria-hidden="true">1</span>}
          </div>
          <div className="dial-key" aria-hidden="true"><div><strong>SLICE SIZE</strong><span>how much money</span></div><div><strong>INNER RING</strong><span>how strong the reasons look</span></div><div><strong>YELLOW</strong><span>something changed</span></div></div>
          {showTable && <HoldingsTable snapshot={snapshot} />}
        </div>

        <article className="argument" aria-labelledby="gate-title">
          <div className="gate-meta"><span className={quiet ? "chip" : "chip signal-chip"}>{snapshot.review.badge}</span><span className="chip">{settings.horizon === "1y" ? "Next 1 year" : "Next 3 months"}</span><span className="chip">{snapshot.review.holdingValue}</span></div>
          <p className="eyebrow">{quiet ? "Your money today" : "How Solana looks"}</p>
          <h2 id="gate-title">{snapshot.review.title}</h2>
          <p className="call">{snapshot.review.call}</p>
          {!quiet && <div className="proof-grid">
            <Proof label="What changed" copy={snapshot.review.changed} source={snapshot.review.changedSource} />
            <Proof label="Why this may be temporary" copy={snapshot.review.countercase} source={snapshot.review.countercaseSource} />
            <Proof label="When this becomes serious" copy={snapshot.review.serious} source={snapshot.review.seriousSource} wide />
          </div>}
        </article>
      </section>

      <section className="lower-grid">
        <div className="lower-section"><div className="section-head"><h2>How each investment looks</h2><span className="chip">4 shown · 7 total</span></div>{snapshot.holdings.map((holding) => <div className="data-row" key={holding.name}><strong>{holding.name}</strong><span>{holding.summary}</span><span className={holding.attention ? "status attention-text" : "status"}>{holding.status}</span></div>)}</div>
        <div className="lower-section"><div className="section-head"><h2>Where money is moving</h2><span className="chip">{settings.horizon === "1y" ? "Next 1 year" : "Next 3 months"}</span></div>{snapshot.movements.map((movement) => <div className="data-row" key={movement.label}><strong>{movement.label}</strong><span>{movement.detail}</span><span className={movement.attention ? "status attention-text" : "status"}>{movement.status}</span></div>)}</div>
      </section>

      <section className="integrity" aria-label="Data warning"><div className="issue"><strong>{snapshot.warning.feed}</strong><p>{snapshot.warning.detail}</p><span>{snapshot.warning.status}</span></div></section>
      <p className="footer-note">{config.mode === "demo" ? "Sample data for design testing. " : ""}COMPOUND explains the data but never places a trade.</p>
    </main>
  );
}

function Proof({ label, copy, source, wide = false }: { label: string; copy: string; source: string; wide?: boolean }) {
  return <section className={wide ? "proof wide" : "proof"}><p className="eyebrow">{label}</p><p>{copy}</p><span className="source">{source}</span></section>;
}

function HoldingsTable({ snapshot }: { snapshot: DashboardSnapshot }) {
  return <div className="table-equivalent"><table><caption className="eyebrow">All companies and coins</caption><thead><tr><th>Company or coin</th><th>% of your invested money</th><th>How it looks</th><th>What changed</th><th>Latest data</th></tr></thead><tbody>{snapshot.holdings.map((holding) => <tr key={holding.name}><td>{holding.name}</td><td>{holding.share}</td><td>{holding.status}</td><td>{holding.summary}</td><td>{holding.latest}</td></tr>)}</tbody></table></div>;
}

function DashboardError({ message }: { message: string }) {
  return <main className="center-screen"><p className="eyebrow">TODAY'S VIEW</p><h1>There is nothing current to show.</h1><p>{message}</p></main>;
}
