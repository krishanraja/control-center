import type { ReactNode, RefObject } from "react";
import { longDate } from "../../lib/format";
import { SECTION_BLURB, SECTION_LONG, SECTION_ORDER } from "../../lib/words";
import type { TabKey } from "../../types";
import { CalendarIcon, ChevronIcon, GearIcon, TabIcon } from "../components/Icons";

interface Props {
  tab: TabKey;
  onTab: (tab: TabKey) => void;
  onSettings: () => void;
  onHistory: () => void;
  generated: string;
  demo: boolean;
  /** Opens beside the content instead of on top of it. */
  panel: { title: string; body: ReactNode } | null;
  onClosePanel: () => void;
  closeRef: RefObject<HTMLButtonElement>;
  children: ReactNode;
}

/**
 * The desktop frame. The rail names every section and says what each one is
 * for, because there is width to say it and no thumb to keep clear. Number
 * keys switch sections and Escape closes the panel.
 *
 * Detail opens in a panel beside the content, not over it. On a phone,
 * covering the screen is right: there is no room for two things. On a desktop
 * it throws away the reason you have a wide screen, so the list you clicked
 * from stays visible next to what you clicked.
 */
export function DeskFrame({ tab, onTab, onSettings, onHistory, generated, demo, panel, onClosePanel, closeRef, children }: Props) {
  return (
    <div className="app">
      <nav className="sidenav" aria-label="Sections">
        <span className="brand">COMPOUND</span>
        {SECTION_ORDER.map((key, index) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "on" : ""}
            /* The blurb is there to orient the eye. A screen reader wants the
               section name on its own, the same one the phone bar says. */
            aria-label={SECTION_LONG[key]}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => onTab(key)}
          >
            <TabIcon tab={key} />
            <span aria-hidden="true">
              <span className="navname">{SECTION_LONG[key]}</span>
              <span className="navblurb">{SECTION_BLURB[key]}</span>
            </span>
            <span className="key" aria-hidden="true">{index + 1}</span>
          </button>
        ))}
        <div className="railfoot">
          <button type="button" aria-label="Settings" onClick={onSettings}>
            <GearIcon />
            <span aria-hidden="true"><span className="navname">Settings</span></span>
            <span className="key" aria-hidden="true" />
          </button>
        <p className="railnote">Press 1 to 4 to move between sections.</p>
        </div>
      </nav>

      <div className="deskmain">
        <div className="deskhead">
          <span className="where">
            <strong>{SECTION_LONG[tab]}</strong>
            <span>Updated {longDate(generated)}</span>
          </span>
          <span className="deskhead-actions">
            {demo && <span className="chip">Sample data</span>}
            <button type="button" className="historybtn" onClick={onHistory} aria-label={`Open market history for ${longDate(generated)}`}>
              <CalendarIcon />
              {longDate(generated)}
            </button>
          </span>
        </div>

        <div className={panel ? "workspace with-panel" : "workspace"}>
          <div className="scroll">{children}</div>
          {panel && (
            <aside className="panel" aria-label={panel.title}>
              <div className="panelhead">
                <span className="sheettitle">{panel.title}</span>
                <button type="button" className="backbtn" ref={closeRef} onClick={onClosePanel}>
                  <ChevronIcon />Close
                </button>
              </div>
              <div className="panelbody">{panel.body}</div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
