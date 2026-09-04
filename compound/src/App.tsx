import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Shell } from "./app/Shell";
import { loadCompoundDay } from "./lib/brief";
import { readConfig } from "./lib/env";
import { getSupabase } from "./lib/supabase";
import { SignInPage } from "./pages/SignInPage";
import type { CompoundDay, TabKey } from "./types";

const TAB_KEYS: TabKey[] = ["brief", "markets", "portfolio", "property", "ask"];

/** The tab lives in the URL so a shared link and the back button both work. */
function tabFromLocation(): TabKey {
  if (window.location.pathname === "/ask") return "ask";
  const requested = new URLSearchParams(window.location.search).get("tab");
  if (requested === "now") return "brief";
  if (requested === "shifts" || requested === "stocks") return "markets";
  if (requested === "mine") return "portfolio";
  return TAB_KEYS.find((key) => key === requested) ?? "brief";
}

export function App() {
  const config = useMemo(() => readConfig(), []);
  const [tab, setTab] = useState<TabKey>(tabFromLocation);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(config.mode === "demo" || Boolean(config.error));
  const [day, setDay] = useState<CompoundDay | null>(null);
  const [snapshotError, setSnapshotError] = useState("");

  useEffect(() => {
    const onPop = () => setTab(tabFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (config.mode !== "live" || config.error) return;
    const supabase = getSupabase(config);
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [config]);

  const signedIn = config.mode === "demo" || Boolean(session);

  useEffect(() => {
    if (config.error || !signedIn) return;
    const controller = new AbortController();
    setSnapshotError("");
    void loadCompoundDay({ mode: config.mode, accessToken: session?.access_token, signal: controller.signal })
      .then(setDay)
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setSnapshotError(reason instanceof Error ? reason.message : "Today's numbers could not be read.");
      });
    return () => controller.abort();
  }, [config.error, config.mode, session?.access_token, signedIn]);

  const changeTab = useCallback((next: TabKey) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "brief") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    window.history.pushState({}, "", query ? `/?${query}` : "/");
    document.querySelector(".scroll")?.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  if (config.error) return <Notice eyebrow="COMPOUND setup" title="COMPOUND is not connected yet." body={config.error} />;
  if (!authReady) return <Notice eyebrow="COMPOUND" title="Checking who you are…" />;
  if (config.mode === "live" && !session) return <SignInPage config={config} />;
  if (snapshotError) return <Notice eyebrow="COMPOUND" title="Nothing to show right now." body={snapshotError} />;
  if (!day) return <Notice eyebrow="COMPOUND" title="Preparing your market brief…" />;

  return <Shell day={day} config={config} session={session} tab={tab} onTab={changeTab} />;
}

function Notice({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <main className="center-screen" aria-live="polite">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {body && <p>{body}</p>}
    </main>
  );
}
