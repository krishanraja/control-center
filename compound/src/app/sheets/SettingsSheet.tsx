import { useMemo, useState } from "react";
import type { Snapshot } from "../../types";
import { useSplit } from "../DeviceProvider";

interface Props {
  snapshot: Snapshot;
  excluded: string[];
  saveError: string;
  onToggle: (industry: string) => void;
  onClearAll: () => void;
}

/**
 * Every industry in today's run gets a switch. Turning one off hides it on
 * Stocks and in the industry list on Trends, and the setting follows you
 * rather than the browser you happened to open.
 */
export function SettingsSheet({ snapshot, excluded, saveError, onToggle, onClearAll }: Props) {
  const split = useSplit();
  const [filter, setFilter] = useState("");
  const hidden = new Set(excluded);

  const industries = useMemo(() => {
    const names = new Set<string>([
      ...snapshot.industries.map((row) => row.industry),
      ...snapshot.agreement.map((row) => row.industry),
      ...snapshot.companies.map((row) => row.industry),
    ]);
    const counts = new Map<string, number>();
    for (const row of snapshot.agreement) counts.set(row.industry, (counts.get(row.industry) ?? 0) + 1);
    return [...names].sort().map((industry) => ({ industry, names: counts.get(industry) ?? 0 }));
  }, [snapshot]);

  const needle = filter.trim().toLowerCase();
  const shown = needle ? industries.filter((entry) => entry.industry.toLowerCase().includes(needle)) : industries;

  return (
    <div className="page">
      <h2 className="big nomargin">What you want to see</h2>
      <p className="sub">Switch off any industry you never want to look at. It disappears everywhere in the app.</p>

      <div className="settingsbar">
        <input
          type="search"
          aria-label="Search industries"
          placeholder={`Search ${industries.length} industries`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button type="button" className="pill" onClick={onClearAll} disabled={excluded.length === 0}>
          Show all again
        </button>
      </div>

      <p className="eyebrow">
        {excluded.length === 0 ? "Nothing hidden" : `${excluded.length} hidden`}
        {needle && ` · ${shown.length} match`}
      </p>
      {saveError && <p className="dn small">{saveError}</p>}

      <div className="rowbox">
        <div className={split ? "toglist" : undefined}>
          {shown.length === 0 && <p className="sub empty">No industry matches that.</p>}
          {shown.map((entry) => {
            const visible = !hidden.has(entry.industry);
            return (
              <button
                type="button"
                className="tog toggle"
                key={entry.industry}
                role="switch"
                aria-checked={visible}
                onClick={() => onToggle(entry.industry)}
              >
                <span>
                  <span className="tn">{entry.industry}</span>
                  <span className="ts">
                    {entry.names === 0 ? "nothing today" : `${entry.names} ${entry.names === 1 ? "company" : "companies"}`}
                  </span>
                </span>
                <span className={visible ? "sw on" : "sw"} aria-hidden="true"><i /></span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
