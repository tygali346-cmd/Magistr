import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

const NOT_FOUND_PATH = "/404";

export default function NotFound() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    if (window.location.pathname.replace(/\/$/, "") !== NOT_FOUND_PATH) window.location.replace(NOT_FOUND_PATH);
    return () => robots.remove();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "var(--app-paper)" }}>
      <Card className="w-full max-w-lg border shadow-sm" style={{ background: "var(--app-card)", borderColor: "var(--app-line)" }}>
        <CardContent className="py-9 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "#fff1ed", color: "var(--app-danger)" }}><AlertCircle size={27} /></div>
          <h1 className="mb-2 text-4xl font-bold" style={{ color: "var(--app-ink)" }}>404</h1>
          <h2 className="mb-3 text-lg font-semibold">Səhifə tapılmadı</h2>
          <p className="mx-auto mb-7 max-w-sm text-sm leading-6" style={{ color: "var(--app-muted)" }}>Axtardığınız səhifə mövcud deyil və ya ünvanı dəyişib.</p>
          <Button onClick={() => setLocation("/")} className="bg-primary text-primary-foreground"><Home className="mr-2 h-4 w-4" />Ana səhifəyə qayıt</Button>
        </CardContent>
      </Card>
    </div>
  );
}
