import { useState, type FormEvent } from "react";
import type { CompoundConfig } from "../lib/env";
import { getSupabase } from "../lib/supabase";

export function SignInPage({ config }: { config: CompoundConfig }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await getSupabase(config).auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        shouldCreateUser: false,
      },
    });
    setBusy(false);
    setMessage(error ? "That sign-in link could not be sent. Please try again." : "Check your email for your private sign-in link.");
  }

  return (
    <main className="signin-shell">
      <div className="signin-card">
        <span className="brand">COMPOUND</span>
        <p className="eyebrow">PRIVATE ACCESS</p>
        <h1>See today's view.</h1>
        <p>Enter the approved email address. COMPOUND will send a one-time sign-in link.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send sign-in link"}</button>
        </form>
        {message && <p className="form-message" role="status">{message}</p>}
      </div>
    </main>
  );
}
