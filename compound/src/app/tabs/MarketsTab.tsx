import { buildGroups, type IndustryEntry } from "../../lib/industryGroups";
import type { BriefStory, CompoundDay, IndustryRow } from "../../types";
import { ClassificationIcon, DomainIcon, SourceIcon } from "../components/Icons";

interface Props {
  day: CompoundDay;
  entries: IndustryEntry[];
  excluded: string[];
  onStory: (story: BriefStory) => void;
  onSector: (sector: string) => void;
}

export function MarketsTab({ day, entries, excluded, onStory, onSector }: Props) {
  const hidden = new Set(excluded);
  const opportunities = day.archive.brief.stories.filter((story) => story.classification === "opportunity");
  const groups = buildGroups(entries);
  const richRows = new Map<string, IndustryRow>((day.legacy?.industries ?? []).map((row) => [row.industry, row]));
  const simpleRows = new Map((day.archive.payload.evidence?.industries ?? []).map((row) => [row.industry, row]));

  return (
    <div className="markets-page">
      <p className="eyebrow">Ranked by market significance</p>
      <h2 className="big">Opportunities first.</h2>
      <p className="sub">Holdings and bookmarks do not change this order.</p>

      <section className="market-opportunities" aria-label="Curated opportunities">
        {opportunities.length === 0 && <p className="market-empty">No opportunity cleared the bar. COMPOUND is not filling the space with a weaker idea.</p>}
        {opportunities.map((story) => (
          <button type="button" key={story.id} className="market-signal" onClick={() => onStory(story)}>
            <span className="domain-glyph" aria-hidden="true"><DomainIcon domain={story.domain} /></span>
            <span>
              <span className="story-kind"><ClassificationIcon classification={story.classification} />{story.classification}</span>
              <strong>{story.title}</strong>
              <small>{story.verdict}</small>
              <span className="story-source"><SourceIcon />{story.coverage.join(" · ")}</span>
            </span>
            <span className="market-value"><b>{story.decisiveMetric.value}</b><small>{story.stance}</small></span>
          </button>
        ))}
      </section>

      <div className="section-title">
        <span>
          <p className="eyebrow">Full market</p>
          <h3>Explore all industries</h3>
        </span>
        <span>{entries.length}</span>
      </div>

      <div className="sector-explorer">
        {groups.map((group) => {
          const visibleMembers = group.members.filter((member) => !hidden.has(member.industry));
          const richTop = group.members
            .map((member) => richRows.get(member.industry))
            .filter((row): row is IndustryRow => Boolean(row))
            .sort((a, b) => Math.abs(b.r3m) - Math.abs(a.r3m))[0];
          const simpleTop = group.members
            .map((member) => simpleRows.get(member.industry))
            .filter((row): row is NonNullable<typeof row> => Boolean(row))
            .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];
          const move = richTop?.r3m ?? simpleTop?.changePercent;
          const leader = richTop?.industry ?? simpleTop?.industry;
          return (
            <button type="button" className="sector-row" key={group.group} onClick={() => onSector(group.group)}>
              <span className="sector-icon" aria-hidden="true"><DomainIcon domain="equities" /></span>
              <span className="sector-copy">
                <strong>{group.group}</strong>
                <small>{visibleMembers.length} of {group.members.length} shown{leader ? ` · ${leader} leads` : ""}</small>
              </span>
              {move != null && <span className={move >= 0 ? "num up" : "num dn"}>{move >= 0 ? "+" : ""}{move.toFixed(1)}%</span>}
              <span className="brief-arrow" aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
