import type { BriefStory } from "../../types";
import { ClassificationIcon, DomainIcon, SourceIcon } from "./Icons";

interface Props {
  story: BriefStory;
  onAsk: (question: string) => void;
}

function words(value: string): string {
  return value.replace(/_/g, " ");
}

export function StoryDetail({ story, onAsk }: Props) {
  return (
    <article className="story-detail page">
      <div className="detail-domain" aria-hidden="true"><DomainIcon domain={story.domain} /></div>
      <p className="story-meta">
        <span className="story-kind"><ClassificationIcon classification={story.classification} />{words(story.classification)}</span>
        <span>{words(story.domain)}</span>
        <span className="story-stance">{story.stance}</span>
      </p>
      <h2>{story.title}</h2>

      <div className="detail-metric">
        <strong>{story.decisiveMetric.value}</strong>
        <span>{story.decisiveMetric.label}</span>
      </div>
      <p className="detail-verdict">{story.verdict}</p>

      <section className="detail-block">
        <p className="detail-label">What would change this</p>
        <p>{story.falsifier}</p>
      </section>

      {story.worldContext && (
        <section className="detail-block world-detail">
          <p className="detail-label">In the wider world</p>
          <p>{story.worldContext.summary}</p>
          <div className="source-links">
            {story.worldContext.citations.map((item) => (
              <a href={item.url} target="_blank" rel="noreferrer" key={item.url}>
                <SourceIcon />
                <span>{item.title}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="detail-block">
        <p className="detail-label">Evidence</p>
        <div className="source-links">
          {story.citations.map((item) => (
            <a href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${item.sourceDate}`}>
              <SourceIcon />
              <span>{item.publisher} · {item.title}</span>
              <small>{item.sourceDate}</small>
            </a>
          ))}
        </div>
      </section>

      {story.portfolioAnnotation && <p className="portfolio-note">Relevant to your portfolio: {story.portfolioAnnotation}</p>}

      <button type="button" className="askbtn" onClick={() => onAsk(`What would change the call on ${story.title}?`)}>
        Ask about this signal
      </button>
    </article>
  );
}
