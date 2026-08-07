import { useEffect, useState, type FormEvent } from "react";
import type { CompoundConfig } from "../lib/env";
import { getSupabase } from "../lib/supabase";

export function SignInPage({ config }: { config: CompoundConfig }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);

  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = window.setInterval(() => setRetrySeconds((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [retrySeconds]);

  async function requestEmail() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/compound-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "The email could not be sent. Try again shortly.");
      setStep("code");
      setRetrySeconds(60);
      setMessage(body.message ?? "Email sent. Check your inbox and spam folder.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The email could not be sent. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestEmail();
  }

  async function handleCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanCode = code.replace(/\s/g, "");
    if (!/^\d{8}$/.test(cleanCode)) {
      setMessage("Enter the 8-digit code from the newest COMPOUND email.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await getSupabase(config).auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: cleanCode,
      type: "email",
    });
    setBusy(false);
    if (error) setMessage("That code was not accepted. Use the newest email or request another one.");
  }

  function changeEmail() {
    setStep("email");
    setCode("");
    setMessage("");
  }

  return (
    <main className="signin-shell">
      <div className="signin-card">
        <span className="brand">COMPOUND</span>
        <p className="eyebrow">PRIVATE ACCESS</p>
        {step === "email" ? (
          <>
            <h1>See today's view.</h1>
            <p>Enter your approved email. We will send a private sign-in link and an 8-digit backup code.</p>
            <form onSubmit={handleSubmit}>
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" inputMode="email" />
              <button type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
            </form>
          </>
        ) : (
          <>
            <h1>Check your email.</h1>
            <p>Open the link we sent to <strong>{email.trim()}</strong>, or enter the 8-digit code from that email.</p>
            <form onSubmit={handleCode}>
              <label htmlFor="code">8-digit code</label>
              <input id="code" type="text" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} />
              <button type="submit" disabled={busy}>{busy ? "Checking…" : "Open COMPOUND"}</button>
            </form>
            <div className="signin-actions">
              <button type="button" className="text-button" onClick={() => void requestEmail()} disabled={busy || retrySeconds > 0}>
                {retrySeconds > 0 ? `Send again in ${retrySeconds}s` : "Send another email"}
              </button>
              <button type="button" className="text-button" onClick={changeEmail} disabled={busy}>Change email</button>
            </div>
          </>
        )}
        {message && <p className="form-message" role="status" aria-live="polite">{message}</p>}
      </div>
    </main>
  );
}
