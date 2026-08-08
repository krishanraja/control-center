import { useMemo, useState } from "react";
import type { Snapshot } from "../../types";
import { useSplit } from "../DeviceProvider";
import { Segmented } from "../components/Segmented";

type View = "all" | "active" | "hidden";

interface Props {
  snapshot: Snapshot;
  excluded: string[];
  saveError: string;
  onToggle: (industry: string) => void;
  /** Hide or show a whole list at once. The list is whatever is on screen. */
  onBulk: (industries: string[], hidden: boolean) => void;
}

/**
 * Every industry in today's run gets a switch. Turning one off hides it on
 * Stocks and in the industry list on Trends, and the setting follows you
 * rather than the browser you happened to open.
 *
 * There are 123 of them and most carry nothing on any given day, so one tap
 * per industry is not a way to spend an evening. Search and the view filter
 * narrow the list, and the two buttons above it act on everything currently
 * listed: search "Oil", hide all eight, done in two taps.
 */
export function SettingsSheet({ snapshot, excluded, saveError, onToggle, onBulk }: Props) {
  const split = useSplit();
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<View>("all");
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
  const shown = industries.filter((entry) => {
    if (needle && !entry.industry.toLowerCase().includes(needle)) return false;
    if (view === "active" && entry.names === 0) return false;
    if (view === "hidden" && !hidden.has(entry.industry)) return false;
    return true;
  });

  const names = shown.map((entry) => entry.industry);
  const canHide = names.filter((name) => !hidden.has(name)).length;
  const canShow = names.filter((name) => hidden.has(name)).length;
  const withCompanies = industries.filter((entry) => entry.names > 0).length;

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
      </div>

      <Segmented
        label="Which industries to list"
        choices={[
          { id: "all", name: "All", count: industries.length },
          { id: "active", name: "Have companies today", short: "Have companies", count: withCompanies },
          { id: "hidden", name: "Hidden", count: excluded.length },
        ]}
        value={view}
        onChange={(id) => setView(id as View)}
        wrap
      />

      {/* The two buttons act on the list below them, so what they will do is
          always visible. Narrow the list first, then act on all of it. */}
      <div className="bulk">
        <p className="eyebrow">
          {shown.length} listed{excluded.length > 0 && ` · ${excluded.length} hidden`}
        </p>
        <div className="bulk-actions">
          <button type="button" className="pill" disabled={canHide === 0} onClick={() => onBulk(names, true)}>
            Hide these {canHide > 0 ? canHide : ""}
          </button>
          <button type="button" className="pill" disabled={canShow === 0} onClick={() => onBulk(names, false)}>
            Show these {canShow > 0 ? canShow : ""}
          </button>
        </div>
      </div>

      {saveError && <p className="dn small">{saveError}</p>}

      <div className="rowbox">
        <div className={split ? "toglist" : undefined}>
          {shown.length === 0 && (
            <p className="sub empty">
              {view === "hidden" ? "You have not hidden anything yet." : "No industry matches that."}
            </p>
          )}
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

      {excluded.length > 0 && (
        <button type="button" className="askbtn ghost" onClick={() => onBulk(excluded, false)}>
          Show everything again
        </button>
      )}
    </div>
  );
}
