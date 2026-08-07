import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AskPage } from "./pages/AskPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SignInPage } from "./pages/SignInPage";
import { readConfig } from "./lib/env";
import { getSupabase } from "./lib/supabase";

interface RouteState {
  pathname: string;
  search: string;
}

function currentRoute(): RouteState {
  return { pathname: window.location.pathname, search: window.location.search };
}

export function App() {
  const config = useMemo(() => readConfig(), []);
  const [route, setRoute] = useState<RouteState>(currentRoute);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(config.mode === "demo" || Boolean(config.error));

  useEffect(() => {
    const handlePopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (config.mode !== "live" || config.error) return;
    const supabase = getSupabase(config);
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setAuthReady(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [config]);

  function navigate(href: string) {
    window.history.pushState({}, "", href);
    setRoute(currentRoute());
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  if (config.error) return <SetupError message={config.error} />;
  if (!authReady) return <LoadingScreen />;
  if (config.mode === "live" && !session) return <SignInPage config={config} />;

  if (route.pathname === "/ask") {
    return <AskPage config={config} session={session} search={route.search} navigate={navigate} />;
  }

  return <DashboardPage config={config} session={session} search={route.search} navigate={navigate} />;
}

function LoadingScreen() {
  return (
    <main className="center-screen" aria-live="polite">
      <p className="eyebrow">COMPOUND</p>
      <h1>Loading today's view…</h1>
    </main>
  );
}

function SetupError({ message }: { message: string }) {
  return (
    <main className="center-screen">
      <p className="eyebrow">COMPOUND SETUP</p>
      <h1>COMPOUND is not connected yet.</h1>
      <p>{message}</p>
    </main>
  );
}
