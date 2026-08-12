import type { IndustryEntry } from "../../lib/industryGroups";
import type { IndustryRow } from "../../types";
import { DomainIcon } from "./Icons";

interface Props {
  sector: string;
  members: IndustryEntry[];
  rows: Map<string, IndustryRow>;
  excluded: string[];
  onToggle: (industry: string) => void;
}

export function SectorDetail({ sector, members, rows, excluded, onToggle }: Props) {
  const hidden = new Set(excluded);
  return (
    <div className="page sector-detail">
      <div className="detail-domain" aria-hidden="true"><DomainIcon domain="equities" /></div>
      <p className="eyebrow">Market explorer</p>
      <h2 className="big nomargin">{sector}</h2>
      <p className="sub">{members.length} industries. Hiding one declutters Markets and Ask, never a significant Brief story.</p>
      <div className="sector-list">
        {members.map((member) => {
          const row = rows.get(member.industry);
          const visible = !hidden.has(member.industry);
          return (
            <button
              type="button"
              className="sector-industry"
              role="switch"
              aria-checked={visible}
              key={member.industry}
              onClick={() => onToggle(member.industry)}
            >
              <span>
                <strong>{member.industry}</strong>
                <small>{member.names ? `${member.names} tracked companies` : "Industry performance only"}</small>
              </span>
              <span className="industry-end">
                {row && <span className={row.r3m >= 0 ? "num up" : "num dn"}>{row.r3m >= 0 ? "+" : ""}{row.r3m.toFixed(1)}%</span>}
                <span className={visible ? "sw on" : "sw"} aria-hidden="true"><i /></span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
