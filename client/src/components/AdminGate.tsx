import type { ReactNode } from "react";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "./AppShell";
import "./AdminGate.css";

export default function AdminGate({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <AppShell title="Admin girişi" eyebrow="QORUNAN BÖLMƏ">
        <section className="card card-pad admin-gate" aria-live="polite">Hesab yoxlanılır…</section>
      </AppShell>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <AppShell title="Admin girişi" eyebrow="QORUNAN BÖLMƏ">
        <section className="card card-pad admin-gate">
          <div className="admin-gate-icon"><ShieldCheck size={21} /></div>
          <h2>{user ? "Bu hesabda admin icazəsi yoxdur" : "Bu bölmə admin üçündür"}</h2>
          <p>
            {user
              ? "Daxil olduğunuz Manus hesabı QəbulFit administratoru kimi konfiqurasiya edilməyib. İcazəli hesabla yenidən daxil olun."
              : "PDF yükləmək, Gemini emalını başlatmaq və sualları yoxlamaq üçün əvvəlcədən təyin edilmiş admin Manus hesabı ilə daxil olun."}
          </p>
          {user ? (
            <button className="btn btn-secondary" onClick={() => void logout()}><LogOut size={16} /> Hesabdan çıx</button>
          ) : (
            <button className="btn btn-primary" onClick={() => startLogin()}><LogIn size={16} /> Manus ilə daxil ol</button>
          )}
        </section>
      </AppShell>
    );
  }

  return <>{children}</>;
}
