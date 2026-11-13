import { ArrowLeft, ArrowRight, BookOpenCheck, CircleHelp, FileText, Play } from "lucide-react";
import { Link, useRoute } from "wouter";
import NotFound from "@/pages/NotFound";
import AppShell from "@/components/AppShell";
import QuestionCard from "@/components/QuestionCard";
import { trpc } from "@/lib/trpc";
import { errorMessage, type QuestionRecord } from "@/lib/study";

export default function QuestionPage() {
  const [, params] = useRoute("/questions/:questionId");
  const questionId = Number(params?.questionId);
  const query = trpc.questionBank.question.useQuery({ questionId }, { enabled: Number.isInteger(questionId) && questionId > 0 });
  const question = query.data as QuestionRecord | undefined;

  if (query.isLoading) return <AppShell title="Sual yüklənir"><div className="loading-state">Mənbə qeydi açılır…</div></AppShell>;
  if (query.error?.data?.code === "NOT_FOUND" || (!query.isLoading && !query.isError && !question)) return <NotFound />;
  if (query.isError) return <AppShell title="Sual açıla bilmədi"><div className="error-box">{errorMessage(query.error)} <button className="btn btn-secondary" onClick={() => query.refetch()}>Yenidən yoxla</button></div></AppShell>;
  if (!question) return <NotFound />;

  const subjectSlug = question.subjectSlug ?? "informatika";
  return (
    <AppShell title={`Sual ${question.questionNumber ?? "—"}`} eyebrow={`${question.examYear ?? "İmtahan ili məlum deyil"} · MƏNBƏ QEYDİ`} actions={<Link href={`/subjects/${subjectSlug}/topics/${question.topicSlug}`} className="btn btn-secondary"><ArrowLeft size={14} /> Mövzuya qayıt</Link>}>
      <div className="dashboard-columns" style={{ gridTemplateColumns: "minmax(0, 1.55fr) minmax(260px, .65fr)" }}>
        <section><QuestionCard question={question} />
          <div className="notice-box" style={{ marginTop: 13 }}><CircleHelp size={15} style={{ display: "inline", verticalAlign: "-3px", marginRight: 5 }} /> Düzgün cavab bu səhifədə göstərilmir. Test tamamlandıqdan sonra yalnız mənbə ilə təsdiqlənmiş cavablar nəticədə görünür.</div>
        </section>
        <aside className="card card-pad">
          <div className="section-title-row"><div><h2>Mənbə və təsnifat</h2><p>İmtahan məlumatları</p></div><FileText size={17} color="#689383" /></div>
          <div className="topic-count-list">
            <MetaRow label="Fənn" value={question.subjectName || "Yoxlanmalıdır"} />
            <MetaRow label="Mövzu" value={`${question.topicNumber ?? "—"}. ${question.topicName ?? "Yoxlanmalıdır"}`} />
            <MetaRow label="İl və nömrə" value={`${question.examYear ?? "—"} · ${question.questionNumber ?? "—"}`} />
            <MetaRow label="Səhifə" value={question.sourcePage ? String(question.sourcePage) : "Məlum deyil"} />
            <MetaRow label="Əminlik" value={question.classificationConfidence === null ? "Yoxlanmayıb" : `${Math.round(question.classificationConfidence * 100)}%`} />
            <MetaRow label="Status" value={question.reviewStatus === "needs_review" ? "Yoxlanış tələb edir" : "Yoxlanıb"} />
          </div>
          {question.sourceUrl && !question.sourceUrl.startsWith("manual://") && <a className="btn btn-secondary" style={{ width: "100%", marginTop: 17 }} href={question.sourcePage ? `${question.sourceUrl}#page=${question.sourcePage}` : question.sourceUrl} target="_blank" rel="noreferrer"><FileText size={14} /> Orijinal PDF-i aç <ArrowRight size={14} /></a>}
          <Link href={`/review?question=${question.id}`} className="btn btn-secondary" style={{ width: "100%", marginTop: 8 }}><BookOpenCheck size={14} /> Sualı yoxla/redaktə et</Link>
          {question.topicSlug && <Link href={`/tests/${question.topicSlug}`} className="btn btn-primary" style={{ width: "100%", marginTop: 8 }}><Play size={14} /> Mövzu testi</Link>}
        </aside>
      </div>
    </AppShell>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #edf0ec", paddingBottom: 9 }}><span className="caption">{label}</span><strong style={{ textAlign: "right", color: "#43594f", fontSize: 10 }}>{value}</strong></div>;
}
