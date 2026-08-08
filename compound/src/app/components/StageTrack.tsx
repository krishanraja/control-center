import { plainStage } from "../../lib/words";
import type { Stage } from "../../types";
import { useSplit } from "../DeviceProvider";

const FALLBACK: Stage[] = [
  { stage: 1, name: "Nothing yet", desc: "No visible effect" },
  { stage: 2, name: "Story only", desc: "Headlines, no numbers" },
  { stage: 3, name: "Numbers move", desc: "Growth or margin shifts" },
  { stage: 4, name: "Repriced", desc: "Valuation resets" },
  { stage: 5, name: "Settled", desc: "Winners and losers clear" },
];

/**
 * Five stages, from nobody noticing to everybody knowing. Stages already
 * passed read as done rather than as empty.
 *
 * Desktop labels all five under the track. A phone cannot fit five labels
 * across 358 pixels without shrinking them into noise, so it names the one
 * stage the thing is actually at.
 */
export function StageTrack({ stage, stages }: { stage: number; stages: Stage[] }) {
  const split = useSplit();
  const names = stages.length ? stages : FALLBACK;
  const current = names.find((entry) => entry.stage === stage);

  return (
    <div className="stagewrap">
      <div
        className="track"
        role="img"
        aria-label={`Stage ${stage} of ${names.length}: ${plainStage(current?.name ?? "unknown")}.`}
      >
        {names.map((entry) => (
          <div
            key={entry.stage}
            className={entry.stage === stage ? "on" : entry.stage < stage ? "past" : ""}
          />
        ))}
      </div>
      {split
        ? (
          <div className="tracklab" aria-hidden="true">
            {names.map((entry) => (
              <span key={entry.stage} className={entry.stage === stage ? "sig" : ""}>{plainStage(entry.name)}</span>
            ))}
          </div>
        )
        : (
          <p className="tracknow" aria-hidden="true">
            Stage {stage} of {names.length}: <b>{plainStage(current?.name ?? "unknown")}</b>
          </p>
        )}
    </div>
  );
}
