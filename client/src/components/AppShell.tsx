import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { BookOpenCheck, Brain, CircleHelp, ClipboardCheck, FileUp, Home, type LucideIcon, PanelsTopLeft } from "lucide-react";

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
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-divider" />
        <NavigationGroup label="FƏNNLƏR" links={primaryLinks} location={location} />
        <NavigationGroup label="İDARƏETMƏ" links={manageLinks} location={location} />
        <div className="sidebar-spacer" />
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
          {children}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Əsas naviqasiya">
        {[
          { href: "/", label: "İcmal", icon: Home },
          { href: "/subjects/informatika", label: "Fənlər", icon: BookOpenCheck },
          { href: "/uploads", label: "PDF", icon: FileUp },
          { href: "/review", label: "Yoxlanış", icon: ClipboardCheck },
        ].map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location === href || location.startsWith(`${href}/`);
          return <Link key={href} href={href} className={`mobile-nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}><Icon size={19} /><span>{label}</span></Link>;
        })}
      </nav>
    </div>
  );
}
