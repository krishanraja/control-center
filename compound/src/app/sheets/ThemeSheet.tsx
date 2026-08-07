import { pct1, plain1, tone } from "../../lib/format";
import type { GroupStats, ThemeMigration } from "../../lib/migration";
import type { Snapshot } from "../../types";
import { AgreementMeter } from "../components/AgreementMeter";
import { indexBySymbol } from "../../lib/agreement";

function Side({ stats, role, snapshot }: { stats: GroupStats; role: string; snapshot: Snapshot }) {
  const bySymbol = indexBySymbol(snapshot.agreement);
  return (
    <>
      <div className="sechead">
        <h3>{stats.group}</h3>
        <span className="eyebrow">{role}</span>
      </div>
      <p className="sub">
        Average growth {pct1(stats.avgGrowth)}, was {pct1(stats.avgPrev)}. That is{" "}
        {stats.accelerating ? "speeding up" : "slowing"} by {plain1(Math.abs(stats.avgDelta))} a year.
      </p>
      <div className="rowbox">
        {stats.members.map((member) => (
          <div className="srow static" key={member.symbol}>
            <span className="stk">{member.symbol}</span>
            <span className="snm stack">
              {pct1(member.prev)} → {pct1(member.now)}
              {member.gm != null && ` · ${plain1(member.gm)} margin`}
            </span>
            <AgreementMeter row={bySymbol[member.symbol]} showLabel={false} />
            <span className={`sval ${tone(member.delta)}`}>{pct1(member.delta)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function ThemeSheet({
  theme,
  snapshot,
  onAsk,
}: {
  theme: ThemeMigration;
  snapshot: Snapshot;
  onAsk: (question: string) => void;
}) {
  return (
    <div className="pad">
      <h2 className="big nomargin">{theme.definition.name}</h2>
      <p className="sub">{theme.definition.claim}</p>

      <div className="verdict">
        <div className="ctag">What the filings say</div>
        <p>{theme.verdict}</p>
        {theme.gap != null && (
          <p>
            The growth gap is <b>{plain1(theme.gap)}</b> and it is{" "}
            <b>{theme.gapDelta != null && theme.gapDelta < 0 ? "closing" : "widening"}</b> by{" "}
            <b>{theme.gapDelta != null ? plain1(Math.abs(theme.gapDelta)) : "n/a"}</b> a year.
          </p>
        )}
      </div>

      {theme.beneficiary && <Side stats={theme.beneficiary} role="story says wins" snapshot={snapshot} />}
      {theme.disrupted && <Side stats={theme.disrupted} role="story says loses" snapshot={snapshot} />}

      <div className="footnote">
        Growth is the change in revenue in the latest full year filed against the year before it. Source: FMP income
        statements. Margin is gross margin on that revenue.
      </div>
      <button
        type="button"
        className="askbtn"
        onClick={() => onAsk(`Who actually wins in ${theme.definition.name}?`)}
      >
        Ask about this →
      </button>
    </div>
  );
}
