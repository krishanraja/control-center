import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { indexBySymbol } from "../lib/agreement";
import { useDevice } from "../lib/device";
import type { CompoundConfig } from "../lib/env";
import { themesFor } from "../lib/migration";
import { degradedFeeds } from "../lib/snapshot";
import { loadExclusions, readLocalExclusions, saveExclusions, toggleIn, writeLocalExclusions } from "../lib/settings";
import { getSupabase } from "../lib/supabase";
import { SECTION_ORDER } from "../lib/words";
import type { Quadrant, Snapshot, TabKey } from "../types";
import { DeviceProvider } from "./DeviceProvider";
import { DeskFrame } from "./frames/DeskFrame";
import { PhoneFrame } from "./frames/PhoneFrame";
import { SettingsSheet } from "./sheets/SettingsSheet";
import { StockSheet } from "./sheets/StockSheet";
import { ThemeSheet } from "./sheets/ThemeSheet";
import { AskTab } from "./tabs/AskTab";
import { MineTab } from "./tabs/MineTab";
import { NowTab } from "./tabs/NowTab";
import { ShiftsTab } from "./tabs/ShiftsTab";
import { StocksTab } from "./tabs/StocksTab";

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
  const device = useDevice();
  const split = device.layout === "split";
  const userId = session?.user.id ?? null;

  const [force, setForce] = useState("ai");
  const [quadrant, setQuadrant] = useState<Quadrant>("early");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<string[]>(() => readLocalExclusions(userId));
  const [saveError, setSaveError] = useState("");
  const closeRef = useRef<HTMLButtonElement | null>(null);
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
        if (mounted) setSaveError(reason instanceof Error ? reason.message : "Your saved settings could not be read.");
      });
    return () => { mounted = false; };
  }, [config, userId]);

  // Focus follows the sheet in both directions. Restoring focus has to wait
  // for the frame to release the content it made inert while the sheet was up,
  // which is why this runs as an effect and not inside the close handler.
  useEffect(() => {
    if (sheet) closeRef.current?.focus();
    else returnFocusRef.current?.focus();
  }, [sheet]);

  const openSheet = useCallback((next: Sheet) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSheet(next);
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);

  // Keyboard is a desktop input. A number key moves between sections and
  // Escape closes the panel, so a mouse is never the only way through.
  useEffect(() => {
    if (!split) return;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const typing = target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "Escape") {
        setSheet((current) => (current ? null : current));
        return;
      }
      if (typing) return;
      const index = Number(event.key);
      if (Number.isInteger(index) && index >= 1 && index <= SECTION_ORDER.length) {
        onTab(SECTION_ORDER[index - 1]);
        setSheet(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [split, onTab]);

  function toggleCard(id: string) {
    setOpen((current) => ({ ...current, [id]: !current[id] }));
  }

  function askAbout(question: string) {
    setSheet(null);
    setPendingAsk(question);
    onTab("ask");
  }

  function persist(next: string[]) {
    setExcluded(next);
    writeLocalExclusions(userId, next);
    setSaveError("");
    if (config.mode === "live" && userId) {
      void saveExclusions(getSupabase(config), userId, next).catch((reason: unknown) => {
        setSaveError(reason instanceof Error ? reason.message : "That setting was not saved to your account.");
      });
    }
  }

  const degraded = degradedFeeds(snapshot);

  function sheetTitle(): string {
    if (!sheet) return "";
    if (sheet.kind === "settings") return "Settings";
    if (sheet.kind === "stock") return sheet.symbol;
    return themesFor(snapshot).find((entry) => entry.definition.id === sheet.id)?.definition.name ?? "Trend";
  }

  function sheetBody() {
    if (!sheet) return null;
    if (sheet.kind === "settings") {
      return (
        <SettingsSheet
          snapshot={snapshot}
          excluded={excluded}
          saveError={saveError}
          onToggle={(industry) => persist(toggleIn(excluded, industry))}
          onClearAll={() => persist([])}
        />
      );
    }
    if (sheet.kind === "stock") {
      const row = indexBySymbol(snapshot.agreement)[sheet.symbol];
      const company = snapshot.companies.find((entry) => entry.symbol === sheet.symbol);
      if (!row) return <div className="page"><p className="sub">Nothing came back for {sheet.symbol} today.</p></div>;
      return <StockSheet row={row} company={company} onAsk={askAbout} />;
    }
    const theme = themesFor(snapshot).find((entry) => entry.definition.id === sheet.id);
    if (!theme) return <div className="page"><p className="sub">That trend is not in today's numbers.</p></div>;
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

  const page = (
    <div className="page">
      {degraded.length > 0 && (
        <div className="degraded" role="status">
          <span className="ctag dnc">Some data is out of date</span>
          <p>{degraded.join(" · ")}. Anything that needs it says so instead of showing you an old number.</p>
        </div>
      )}
      {tabBody()}
    </div>
  );

  const panel = sheet ? { title: sheetTitle(), body: sheetBody() } : null;

  return (
    <DeviceProvider device={device}>
      <div className={`shell ${device.layout} ${device.input}`}>
        {split
          ? (
            <DeskFrame
              tab={tab}
              onTab={(next) => { onTab(next); setSheet(null); }}
              onSettings={() => openSheet({ kind: "settings" })}
              generated={snapshot.generated}
              demo={config.mode === "demo"}
              panel={panel}
              onClosePanel={closeSheet}
              closeRef={closeRef}
            >
              {page}
            </DeskFrame>
          )
          : (
            <PhoneFrame
              tab={tab}
              onTab={(next) => { onTab(next); setSheet(null); }}
              onSettings={() => openSheet({ kind: "settings" })}
              generated={snapshot.generated}
              demo={config.mode === "demo"}
              sheet={panel}
              onCloseSheet={closeSheet}
              closeRef={closeRef}
            >
              {page}
            </PhoneFrame>
          )}
      </div>
    </DeviceProvider>
  );
}
