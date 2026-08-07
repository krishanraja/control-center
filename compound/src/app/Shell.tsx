import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { indexBySymbol } from "../lib/agreement";
import type { CompoundConfig } from "../lib/env";
import { longDate } from "../lib/format";
import { themesFor } from "../lib/migration";
import { degradedFeeds } from "../lib/snapshot";
import { loadExclusions, readLocalExclusions, saveExclusions, toggleIn, writeLocalExclusions } from "../lib/settings";
import { getSupabase } from "../lib/supabase";
import { useMediaQuery } from "../lib/useMediaQuery";
import type { Quadrant, Snapshot, TabKey } from "../types";
import { GearIcon, TabIcon } from "./components/Icons";
import { SettingsSheet } from "./sheets/SettingsSheet";
import { StockSheet } from "./sheets/StockSheet";
import { ThemeSheet } from "./sheets/ThemeSheet";
import { AskTab } from "./tabs/AskTab";
import { MineTab } from "./tabs/MineTab";
import { NowTab } from "./tabs/NowTab";
import { ShiftsTab } from "./tabs/ShiftsTab";
import { StocksTab } from "./tabs/StocksTab";

const TABS: Array<[TabKey, string]> = [
  ["now", "Now"],
  ["shifts", "Shifts"],
  ["stocks", "Stocks"],
  ["mine", "Mine"],
  ["ask", "Ask"],
];

type Sheet =
  | { kind: "settings" }
  | { kind: "stock"; symbol: string }
  | { kind: "theme"; id: string }
  | null;

interface Props {
  snapshot: Snapshot;
  config: CompoundConfig;
  session: Session | null;
  tab: TabKey;
  onTab: (tab: TabKey) => void;
}

export function Shell({ snapshot, config, session, tab, onTab }: Props) {
  const desktop = useMediaQuery("(min-width: 900px)");
  const userId = session?.user.id ?? null;

  const [force, setForce] = useState("ai");
  const [quadrant, setQuadrant] = useState<Quadrant>("early");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<string[]>(() => readLocalExclusions(userId));
  const [saveError, setSaveError] = useState("");
  const sheetRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // The saved row is the record. The local copy only keeps a toggle instant.
  useEffect(() => {
    if (config.mode !== "live" || !userId) return;
    let mounted = true;
    void loadExclusions(getSupabase(config), userId)
      .then((saved) => {
        if (!mounted) return;
        setExcluded(saved);
        writeLocalExclusions(userId, saved);
      })
      .catch((reason: unknown) => {
        if (mounted) setSaveError(reason instanceof Error ? reason.message : "Saved settings could not be read.");
      });
    return () => { mounted = false; };
  }, [config, userId]);

  useEffect(() => {
    if (sheet) sheetRef.current?.focus();
  }, [sheet]);

  const openSheet = useCallback((next: Sheet) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSheet(next);
  }, []);

  const closeSheet = useCallback(() => {
    setSheet(null);
    returnFocusRef.current?.focus();
  }, []);

  function toggleCard(id: string) {
    setOpen((current) => ({ ...current, [id]: !current[id] }));
  }

  function askAbout(question: string) {
    setSheet(null);
    setPendingAsk(question);
    onTab("ask");
  }

  function toggleIndustry(industry: string) {
    const next = toggleIn(excluded, industry);
    setExcluded(next);
    writeLocalExclusions(userId, next);
    setSaveError("");
    if (config.mode === "live" && userId) {
      void saveExclusions(getSupabase(config), userId, next).catch((reason: unknown) => {
        setSaveError(reason instanceof Error ? reason.message : "That setting was not saved to your account.");
      });
    }
  }

  function clearExclusions() {
    setExcluded([]);
    writeLocalExclusions(userId, []);
    setSaveError("");
    if (config.mode === "live" && userId) {
      void saveExclusions(getSupabase(config), userId, []).catch((reason: unknown) => {
        setSaveError(reason instanceof Error ? reason.message : "That setting was not saved to your account.");
      });
    }
  }

  const degraded = degradedFeeds(snapshot);

  function sheetTitle(): string {
    if (!sheet) return "";
    if (sheet.kind === "settings") return "Settings";
    if (sheet.kind === "stock") return sheet.symbol;
    return themesFor(snapshot).find((entry) => entry.definition.id === sheet.id)?.definition.name ?? "Theme";
  }

  function sheetBody() {
    if (!sheet) return null;
    if (sheet.kind === "settings") {
      return (
        <SettingsSheet
          snapshot={snapshot}
          excluded={excluded}
          saveError={saveError}
          onToggle={toggleIndustry}
          onClearAll={clearExclusions}
        />
      );
    }
    if (sheet.kind === "stock") {
      const row = indexBySymbol(snapshot.agreement)[sheet.symbol];
      const company = snapshot.companies.find((entry) => entry.symbol === sheet.symbol);
      if (!row) return <div className="pad"><p className="sub">No signals for {sheet.symbol} in today's run.</p></div>;
      return <StockSheet row={row} company={company} onAsk={askAbout} />;
    }
    const theme = themesFor(snapshot).find((entry) => entry.definition.id === sheet.id);
    if (!theme) return <div className="pad"><p className="sub">That theme is not in today's run.</p></div>;
    return <ThemeSheet theme={theme} snapshot={snapshot} onAsk={askAbout} />;
  }

  function tabBody() {
    if (tab === "now") return <NowTab snapshot={snapshot} open={open} onToggle={toggleCard} onAsk={askAbout} />;
    if (tab === "shifts") {
      return (
        <ShiftsTab
          snapshot={snapshot}
          force={force}
          quadrant={quadrant}
          excluded={excluded}
          open={open}
          onForce={setForce}
          onQuadrant={setQuadrant}
          onToggle={toggleCard}
          onAsk={askAbout}
          onTheme={(id) => openSheet({ kind: "theme", id })}
        />
      );
    }
    if (tab === "stocks") {
      return <StocksTab snapshot={snapshot} excluded={excluded} onStock={(symbol) => openSheet({ kind: "stock", symbol })} />;
    }
    if (tab === "mine") {
      return (
        <MineTab
          snapshot={snapshot}
          open={open}
          onToggle={toggleCard}
          onAsk={askAbout}
          onStock={(symbol) => openSheet({ kind: "stock", symbol })}
        />
      );
    }
    return (
      <AskTab
        snapshot={snapshot}
        config={config}
        session={session}
        pending={pendingAsk}
        onConsumed={() => setPendingAsk(null)}
      />
    );
  }

  const gear = (
    <button type="button" className="iconbtn" aria-label="Settings" onClick={() => openSheet({ kind: "settings" })}>
      <GearIcon />
    </button>
  );

  const content = sheet
    ? (
      <>
        <div className="sheethead">
          <button type="button" ref={sheetRef} onClick={closeSheet}>
            {sheet.kind === "settings" ? "Done" : "← Back"}
          </button>
          <span className="eyebrow">{sheetTitle()}</span>
        </div>
        <div className="scroll">{sheetBody()}</div>
      </>
    )
    : (
      <div className="scroll">
        <div className="pad">
          {degraded.length > 0 && (
            <div className="degraded" role="status">
              <span className="ctag dnc">Feeds not current</span>
              <p>{degraded.join(" · ")}. The sections that need them say so instead of showing an old number.</p>
            </div>
          )}
          {tabBody()}
        </div>
      </div>
    );

  if (desktop) {
    return (
      <div className="app desk">
        <nav className="sidenav" aria-label="Sections">
          <span className="brand">COMPOUND</span>
          {TABS.map(([key, name]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? "on" : ""}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => { onTab(key); setSheet(null); }}
            >
              <TabIcon tab={key} /><span>{name}</span>
            </button>
          ))}
          <div className="railfoot">
            <button type="button" onClick={() => openSheet({ kind: "settings" })}>
              <GearIcon /><span>Settings</span>
            </button>
          </div>
        </nav>
        <div className="deskmain">
          <div className="deskhead">
            <span className="eyebrow">Updated {longDate(snapshot.generated)}</span>
            {config.mode === "demo" && <span className="chip">Sample session</span>}
          </div>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="app phone">
      <div className="appbar">
        <span className="brand">COMPOUND</span>
        {gear}
      </div>
      {content}
      <nav className="botnav" aria-label="Sections">
        {TABS.map(([key, name]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "on" : ""}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => { onTab(key); setSheet(null); }}
          >
            <TabIcon tab={key} /><span>{name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
