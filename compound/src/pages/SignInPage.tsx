import { useState, type FormEvent } from "react";
import type { CompoundConfig } from "../lib/env";
import { getSupabase } from "../lib/supabase";

export function SignInPage({ config }: { config: CompoundConfig }) {
  const [magicWord, setMagicWord] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/compound-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magicWord }),
      });
      const body = await response.json().catch(() => ({})) as { message?: string; tokenHash?: string };
      if (!response.ok) throw new Error(body.message ?? "That magic word did not work.");
      if (!body.tokenHash) throw new Error("COMPOUND could not open right now. Try again shortly.");

      const { error } = await getSupabase(config).auth.verifyOtp({
        token_hash: body.tokenHash,
        type: "email",
      });
      if (error) throw new Error("COMPOUND could not open right now. Try again shortly.");
      setMagicWord("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "COMPOUND could not open right now. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signin-shell">
      <div className="signin-card">
        <span className="brand">COMPOUND</span>
        <p className="eyebrow">PRIVATE ACCESS</p>
        <h1>See today's view.</h1>
        <p>Enter your magic word to open your private view. No email needed.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="magic-word">Magic word</label>
          <input id="magic-word" type="password" value={magicWord} onChange={(event) => setMagicWord(event.target.value)} required autoComplete="current-password" autoCapitalize="none" spellCheck={false} maxLength={128} />
          <button type="submit" disabled={busy}>{busy ? "Opening..." : "Open COMPOUND"}</button>
        </form>
        {message && <p className="form-message" role="status" aria-live="polite">{message}</p>}
      </div>
    </main>
  );
}
