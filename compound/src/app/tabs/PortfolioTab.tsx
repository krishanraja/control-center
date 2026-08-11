import { aud } from "../../lib/format";
import type { CompoundDay, Holding } from "../../types";
import { DomainIcon } from "../components/Icons";

interface Props { day: CompoundDay }

export function PortfolioTab({ day }: Props) {
  const portfolio = day.legacy?.portfolio ?? day.archive.payload.evidence?.portfolio;
  const holdings = day.legacy?.holdings ?? day.archive.payload.evidence?.holdings ?? [];

  if (!portfolio) {
    return (
      <div className="portfolio-empty">
        <span aria-hidden="true"><DomainIcon domain="macro" /></span>
        <p className="eyebrow">Portfolio</p>
        <h2>Portfolio history starts with the first captured day.</h2>
        <p>Market ranking is already live. Exposure and concentration will appear here only when supported holdings evidence is archived.</p>
      </div>
    );
  }

  const largest = holdings.find((holding) => holding.symbol === portfolio.largest) ?? [...holdings].sort((a, b) => b.pct - a.pct)[0];
  const cashPct = portfolio.totalAud > 0 ? portfolio.cashAud / portfolio.totalAud * 100 : 0;
  const crypto = holdings.filter((holding) => holding.kind === "crypto");
  const sorted = [...holdings].sort((a, b) => b.pct - a.pct);

  return (
    <div className="portfolio-page">
      <p className="eyebrow">Separate from market ranking</p>
      <h2 className="big">Exposure before performance.</h2>
      <p className="sub">This is where your holdings matter. They never choose the Brief.</p>

      <div className="exposure-lead">
        <div className="exposure-ring" style={{ "--exposure": `${portfolio.largestPct * 3.6}deg` } as React.CSSProperties}>
          <span><strong>{portfolio.largestPct}%</strong><small>largest position</small></span>
        </div>
        <div>
          <p className="detail-label">Concentration</p>
          <h3>{largest?.name ?? portfolio.largest} decides too much of the outcome.</h3>
          <p>{largest ? `${aud(largest.valueAud)} in one position.` : "One position dominates the portfolio."}</p>
        </div>
      </div>

      <div className="portfolio-checks">
        <div><span aria-hidden="true"><DomainIcon domain="currencies" /></span><small>Available capacity</small><strong>{aud(portfolio.cashAud)}</strong><p>{cashPct.toFixed(1)}% held as cash</p></div>
        <div><span aria-hidden="true"><DomainIcon domain="crypto" /></span><small>Correlated exposure</small><strong>{portfolio.cryptoPct.toFixed(1)}%</strong><p>{crypto.length} crypto positions tend to move together</p></div>
      </div>

      <div className="section-title">
        <span><p className="eyebrow">Holdings</p><h3>Where the risk sits</h3></span>
        <span>{holdings.length}</span>
      </div>
      <div className="holding-list">
        {sorted.map((holding: Holding) => (
          <div className="holding-row" key={holding.symbol}>
            <span className="sector-icon" aria-hidden="true"><DomainIcon domain={holding.kind === "crypto" ? "crypto" : "equities"} /></span>
            <span><strong>{holding.name}</strong><small>{holding.symbol}</small></span>
            <span className="holding-value"><strong>{holding.pct.toFixed(1)}%</strong><small>{aud(holding.valueAud)}</small></span>
          </div>
        ))}
      </div>
    </div>
  );
}
