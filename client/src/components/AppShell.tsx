import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BookOpenCheck, Brain, CircleHelp, ClipboardCheck, FileUp, Home, LogIn, LogOut, type LucideIcon, PanelsTopLeft, User } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useFirebase } from "@/contexts/FirebaseContext";

type NavigationLink = { href: string; label: string; icon: LucideIcon };
const primaryLinks: NavigationLink[] = [
  { href: "/", label: "İcmal", icon: Home },
  { href: "/subjects/informatika", label: "İnformatika", icon: PanelsTopLeft },
  { href: "/subjects/mentiq", label: "Məntiq", icon: Brain },
];
const manageLinks: NavigationLink[] = [
  { href: "/uploads", label: "PDF arxivi", icon: FileUp },
  { href: "/review", label: "Yoxlanış siyahısı", icon: ClipboardCheck },
];

function Brand() {
  return (
    <Link href="/" className="brand-row" aria-label="QəbulFit ana səhifə">
      <span className="brand-mark"><img src="/qebulfit-mark.svg" alt="" /></span>
      <span className="brand-copy">
        <strong>QəbulFit</strong>
        <span>İmtahan arxivi</span>
      </span>
    </Link>
  );
}

function NavigationGroup({ label, links, location }: { label: string; links: NavigationLink[]; location: string }) {
  return (
    <section className="nav-group">
      <p className="nav-group-label">{label}</p>
      {links.map(({ href, label: itemLabel, icon: Icon }) => {
        const active = href === "/" ? location === "/" : location === href || location.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon size={17} strokeWidth={1.9} />
            <span>{itemLabel}</span>
            {itemLabel === "Yoxlanış siyahısı" && <CircleHelp className="nav-link-hint" size={14} />}
          </Link>
        );
      })}
    </section>
  );
}

export default function AppShell({
  title,
  eyebrow = "QƏBUL ARXİVİ",
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { authReady, firebaseUser, signingIn, signInWithGoogle } = useFirebase();
  const [authError, setAuthError] = useState("");

  async function handleGoogleSignIn() {
    setAuthError("");
    try {
      await signInWithGoogle();
    } catch {
      setAuthError("Google girişi tamamlanmadı.");
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-divider" />
        <NavigationGroup label="FƏNNLƏR" links={primaryLinks} location={location} />
        <NavigationGroup label="İDARƏETMƏ" links={manageLinks} location={location} />
        <div className="sidebar-spacer" />
        {authReady && (
          <div className="mb-3 grid gap-2 rounded-xl border border-[#e5ece6] bg-[#f5f8f3] p-2.5">
            {firebaseUser ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#e7f2ef] text-[var(--app-teal)]">
                    <User size={14} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-[#2d443c]">
                      {firebaseUser.displayName || firebaseUser.email || "Hesab"}
                    </div>
                    {firebaseUser.email && (
                      <div className="truncate text-[10px] text-[#7a8982]">{firebaseUser.email}</div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary w-full !min-h-[34px] text-xs"
                  onClick={() => void logout()}
                >
                  <LogOut size={13} /> Çıxış
                </button>
              </>
            ) : user?.role === "admin" ? (
              <button
                type="button"
                className="btn btn-secondary w-full !min-h-[34px] text-xs"
                onClick={() => void logout()}
              >
                <LogOut size={13} /> Admin çıxışı
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary w-full !min-h-[34px] text-xs"
                disabled={signingIn}
                onClick={() => void handleGoogleSignIn()}
              >
                <LogIn size={13} /> {signingIn ? "Giriş edilir…" : "Google ilə daxil ol"}
              </button>
            )}
            {authError && <p className="m-0 text-[10px] text-[#9e3e37]">{authError}</p>}
          </div>
        )}
        <div className="sidebar-note">
          <span className="sidebar-note-dot" />
          <div><strong>Mənbəyə bağlı</strong><span>Suallar PDF və il üzrə saxlanır</span></div>
        </div>
        <span className="sidebar-version">2010–2011 · 2 imtahan</span>
      </aside>

      <div className="app-main">
        <header className="mobile-header">
          <Brand />
          <Link href="/uploads" className="icon-button" aria-label="PDF yüklə"><FileUp size={19} /></Link>
        </header>
        <main className="content-area">
          <div className="page-header">
            <div className="page-heading-copy">
              <span className="eyebrow">{eyebrow}</span>
              <h1>{title}</h1>
            </div>
            {actions && <div className="page-header-actions">{actions}</div>}
          </div>
          <div className="page-content">{children}</div>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Əsas naviqasiya">
        {[
          { href: "/", label: "İcmal", icon: Home },
          { href: "/subjects/informatika", label: "Fənlər", icon: BookOpenCheck },
          { href: "/uploads", label: "PDF", icon: FileUp },
          { href: "/review", label: "Yoxlanış", icon: ClipboardCheck },
        ].map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : href === "/subjects/informatika" ? location.startsWith("/subjects/") || location.startsWith("/tests/") : location === href || location.startsWith(`${href}/`);
          return <Link key={href} href={href} className={`mobile-nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}><Icon size={19} /><span>{label}</span></Link>;
        })}
      </nav>
    </div>
  );
}
