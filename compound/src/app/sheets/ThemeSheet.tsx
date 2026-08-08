import { pct1, plain1, tone } from "../../lib/format";
import type { GroupStats, ThemeMigration } from "../../lib/migration";
import type { Snapshot } from "../../types";
import { useSplit } from "../DeviceProvider";
import { AgreementMeter } from "../components/AgreementMeter";
import { TableHead } from "../components/StockRow";
import { indexBySymbol } from "../../lib/agreement";

function Side({ stats, role, snapshot }: { stats: GroupStats; role: string; snapshot: Snapshot }) {
  const split = useSplit();
  const bySymbol = indexBySymbol(snapshot.agreement);

  return (
    <>
      <div className="sechead">
        <h3>{stats.group}</h3>
        <span className="eyebrow">{role}</span>
      </div>
      <p className="sub">
        Sales grew {pct1(stats.avgGrowth)} last year, against {pct1(stats.avgPrev)} the year before. That is{" "}
        {stats.accelerating ? "speeding up" : "slowing down"} by {plain1(Math.abs(stats.avgDelta))} a year.
      </p>
      <div className="rowbox">
        <TableHead columns="cols-pair" labels={["Company", "Sales growth", "Checks", "Change"]} />
        {stats.members.map((member) => {
          const pair = `${pct1(member.prev)} to ${pct1(member.now)}${member.gm != null ? ` · keeps ${plain1(member.gm)}` : ""}`;
          const change = <span className={`sval ${tone(member.delta)}`}>{pct1(member.delta)}</span>;

          if (split) {
            return (
              <div className="srow cols-pair" key={member.symbol}>
                <span className="rowname">{member.symbol}</span>
                <span className="rowsay">{pair}</span>
                <AgreementMeter row={bySymbol[member.symbol]} showLabel={false} />
                {change}
              </div>
            );
          }

          return (
            <div className="srow" key={member.symbol}>
              <span className="rowmain">
                <span className="rowtop">
                  <span className="rowname">{member.symbol}</span>
                  {change}
                </span>
                <span className="rowunder">
                  <span className="rowsay">{pair}</span>
                  <AgreementMeter row={bySymbol[member.symbol]} showLabel={false} />
                </span>
              </span>
            </div>
          );
        })}
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
    <div className="page">
      <h2 className="big nomargin">{theme.definition.name}</h2>
      <p className="sub">{theme.definition.claim}</p>

      <div className="verdict">
        <div className="ctag">What the accounts actually say</div>
        <p>{theme.verdict}</p>
        {theme.gap != null && (
          <p>
            One side is growing <b>{plain1(theme.gap)}</b> faster than the other, and that gap is{" "}
            <b>{theme.gapDelta != null && theme.gapDelta < 0 ? "closing" : "getting wider"}</b> by{" "}
            <b>{theme.gapDelta != null ? plain1(Math.abs(theme.gapDelta)) : "an unknown amount"}</b> a year.
          </p>
        )}
      </div>

      {theme.beneficiary && <Side stats={theme.beneficiary} role="the story says this side wins" snapshot={snapshot} />}
      {theme.disrupted && <Side stats={theme.disrupted} role="the story says this side loses" snapshot={snapshot} />}

      <button
        type="button"
        className="askbtn"
        onClick={() => onAsk(`Who actually wins in ${theme.definition.name}?`)}
      >
        Ask about this
      </button>

      <div className="footnote">
        Sales growth compares the last full year a company reported against the year before it. Source: company
        accounts through FMP. "Keeps" is how much of every dollar of sales is left as profit before running costs.
      </div>
    </div>
  );
}
