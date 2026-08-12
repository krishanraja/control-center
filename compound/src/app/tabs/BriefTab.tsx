import { isStale } from "../../lib/brief";
import type { BriefStory, CompoundDay } from "../../types";
import { AttentionIcon, ClassificationIcon, DomainIcon, SourceIcon } from "../components/Icons";

interface Props {
  day: CompoundDay;
  onStory: (story: BriefStory) => void;
}

function label(value: string): string {
  return value.replace(/_/g, " ");
}

function sourceLine(story: BriefStory): string {
  const publishers = [...new Set(story.citations.map((item) => item.publisher))];
  return `${publishers.join(" · ")} · ${story.decisiveMetric.sourceDate}`;
}

function publishedTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function StoryMeta({ story }: { story: BriefStory }) {
  return (
    <span className="story-meta">
      <span className="story-kind"><ClassificationIcon classification={story.classification} />{label(story.classification)}</span>
      <span>{label(story.domain)}</span>
      <span className="story-stance">{story.stance}</span>
    </span>
  );
}

export function BriefTab({ day, onStory }: Props) {
  const stale = isStale(day);
  const [lead, ...briefs] = day.archive.brief.stories;
  const quiet = day.archive.brief.state === "quiet";
  const limitations = day.archive.brief.coverageLimitations;

  return (
    <div className={`brief-page ${quiet ? "is-quiet" : ""}`}>
      <div className={`truthline ${stale ? "is-stale" : limitations.length ? "is-partial" : ""}`} role="status">
        <span className="truth-icon" aria-hidden="true">{stale || limitations.length ? <AttentionIcon /> : <SourceIcon />}</span>
        <span>
          {stale
            ? `Update delayed · last published ${day.archive.snapshot_date}`
            : limitations.length
              ? `Partial brief · ${limitations.length} source limitation${limitations.length === 1 ? "" : "s"}`
              : `Published ${publishedTime(day.archive.published_at)} ET · ${day.archive.coverage.sources.length} sources current`}
        </span>
      </div>

      <button type="button" className="lead-story" onClick={() => onStory(lead)} aria-label={`Open signal: ${lead.title}`}>
        <span className="domain-glyph" aria-hidden="true"><DomainIcon domain={lead.domain} /></span>
        <StoryMeta story={lead} />
        <h1>{lead.title}</h1>
        {!quiet && (
          <span className="lead-metric">
            <strong>{lead.decisiveMetric.value}</strong>
            <span>{lead.decisiveMetric.label}</span>
          </span>
        )}
        <span className="lead-verdict">{lead.verdict}</span>
        <span className="lead-falsifier"><b>Flips if</b>{lead.falsifier.replace(/^This changes if\s*/i, "")}</span>
        <span className="story-source"><SourceIcon />{sourceLine(lead)}</span>
        {lead.worldContext && <span className="world-proof">Wider world · {lead.worldContext.citations.length} citation{lead.worldContext.citations.length === 1 ? "" : "s"}</span>}
      </button>

      <div className="brief-rows">
        {briefs.map((story) => (
          <button type="button" className="brief-story" key={story.id} onClick={() => onStory(story)}>
            <span className="domain-glyph compact" aria-hidden="true"><DomainIcon domain={story.domain} /></span>
            <span className="brief-copy">
              <StoryMeta story={story} />
              <strong>{story.title}</strong>
              <span className="story-source"><SourceIcon />{sourceLine(story)}</span>
              {story.worldContext && <span className="world-proof">Wider world · {story.worldContext.citations.length} citation{story.worldContext.citations.length === 1 ? "" : "s"}</span>}
            </span>
            <span className="brief-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
