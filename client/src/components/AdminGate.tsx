import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useFirebase } from "@/contexts/FirebaseContext";
import AppShell from "./AppShell";
import "./AdminGate.css";

export default function AdminGate({ children }: { children: ReactNode }) {
  const { user, loading, logout, refresh } = useAuth();
  const { authReady, signInWithGoogle, signingIn } = useFirebase();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role === "admin") return;
    let active = true;
    fetch("/api/admin/status", { credentials: "include" })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { configured?: boolean } | null) => {
        if (active && data) setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (active) setConfigured(false);
      });
    return () => {
      active = false;
    };
  }, [user?.role]);

  async function handleGoogleLogin() {
    if (signingIn || submitting) return;
    setError("");
    try {
      await signInWithGoogle();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google ilə giriş alınmadı.");
    }
  }

  async function submitPasscode(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !passcode.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ passcode }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Admin girişi alınmadı.");
      }
      setPasscode("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Admin girişi alınmadı.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !authReady || (!user && configured === null)) {
    return (
      <AppShell title="Admin girişi" eyebrow="QORUNAN BÖLMƏ">
        <section className="card card-pad admin-gate" aria-live="polite">Sessiya yoxlanılır…</section>
      </AppShell>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <AppShell title="Admin girişi" eyebrow="QORUNAN BÖLMƏ">
        <section className="card card-pad admin-gate">
          <div className="admin-gate-icon"><ShieldCheck size={21} /></div>
          <h2>{user ? "Bu hesabda admin icazəsi yoxdur" : "Admin girişi"}</h2>
          <p>
            {user
              ? `Cari hesab (${user.email ?? user.name ?? "istifadəçi"}) admin icazəsinə malik deyil. Çıxış edib səlahiyyətli Google hesabı və ya admin şifrəsi ilə daxil olun.`
              : "PDF yükləmək, Gemini AI emalını başlatmaq və sualları yoxlamaq üçün səlahiyyətli Google hesabı və ya admin şifrəsi ilə daxil olun."}
          </p>
          {user ? (
            <button className="btn btn-secondary" onClick={() => void logout()}><LogOut size={16} /> Çıxış et</button>
          ) : (
            <div className="grid w-full max-w-xs gap-3">
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={signingIn || submitting}
                onClick={() => void handleGoogleLogin()}
              >
                {signingIn ? <LoaderCircle size={16} className="animate-spin" /> : <LogIn size={16} />}
                {signingIn ? "Google ilə yoxlanılır…" : "Google ilə daxil ol"}
              </button>

              {configured !== false && (
                <>
                  <div className="flex items-center gap-2 text-xs text-[var(--app-muted)]">
                    <span className="h-px flex-1 bg-[var(--app-line)]" />
                    <span>və ya</span>
                    <span className="h-px flex-1 bg-[var(--app-line)]" />
                  </div>
                  <form onSubmit={submitPasscode} className="grid w-full gap-2.5">
                    <input
                      type="password"
                      className="field"
                      placeholder="Admin şifrəsi"
                      value={passcode}
                      onChange={event => setPasscode(event.target.value)}
                      disabled={submitting || signingIn}
                      required
                      autoComplete="current-password"
                    />
                    <button type="submit" className="btn btn-secondary w-full" disabled={submitting || signingIn || !passcode.trim()}>
                      {submitting ? <LoaderCircle size={16} className="animate-spin" /> : <LogIn size={16} />}
                      {submitting ? "Yoxlanılır…" : "Şifrə ilə daxil ol"}
                    </button>
                  </form>
                </>
              )}
              {error && <div className="error-box w-full">{error}</div>}
            </div>
          )}
        </section>
      </AppShell>
    );
  }

  return <>{children}</>;
}
