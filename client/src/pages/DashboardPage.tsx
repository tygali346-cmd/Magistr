import { ArrowRight, BookOpenCheck, Brain, ClipboardCheck, FileStack, FileUp, Layers3, Search, Sparkles } from "lucide-react";
import { Link } from "wouter";
import AppShell from "@/components/AppShell";
import { trpc } from "@/lib/trpc";
import { errorMessage, type QuestionRecord } from "@/lib/study";

export default function DashboardPage() {
  const query = trpc.questionBank.dashboard.useQuery();
  const data = query.data;
  const informatika = data?.subjects.find(subject => subject.slug === "informatika");
  const mentiq = data?.subjects.find(subject => subject.slug === "mentiq");
  const topTopics = [...(data?.topics ?? [])].filter(topic => !topic.numberLabel.includes(".")).sort((a, b) => b.count - a.count).slice(0, 7);
  const recent = (data?.recent ?? []) as QuestionRecord[];

  return (
    <AppShell title="İllərin sualları, bir arxivdə" eyebrow="QƏBULFİT · İMTAHAN ARXİVİ" actions={<Link href="/uploads" className="btn btn-primary"><FileUp size={15} /> PDF yüklə</Link>}>
      {query.isLoading && <div className="loading-state">Məlumatlar yüklənir…</div>}
      {query.isError && <div className="error-box">{errorMessage(query.error)} <button className="btn btn-secondary" onClick={() => query.refetch()}>Yenidən yoxla</button></div>}
      {data && <>
        <section className="dashboard-hero">
          <div className="hero-panel">
            <div>
              <div className="hero-kicker"><Sparkles size={14} /> MÖVZUYA GÖRƏ HAZIRLIQ</div>
              <h2>Bu gün hansı mövzunu möhkəmləndirirsən?</h2>
              <p>İllərin qəbul suallarını fənn və mövzu üzrə seç. Hər sual öz PDF mənbəyi ilə birlikdə saxlanır.</p>
            </div>
            <div className="hero-actions">
              <Link href="/subjects/informatika" className="btn btn-primary">İnformatikaya keç <ArrowRight size={15} /></Link>
              <Link href="/subjects/mentiq" className="btn btn-secondary">Məntiq mövzuları</Link>
            </div>
          </div>
          <div className="hero-side">
            <div className="hero-side-label">İlkin arxiv</div>
            <div>
              <div className="hero-side-number">{data.totalQuestions}<span>sual</span></div>
              <p>2010 və 2011-ci illərin İnformatika imtahanlarından.</p>
            </div>
            <Link href="/subjects/informatika" className="hero-side-link">Sualları nəzərdən keçir <ArrowRight size={14} /></Link>
          </div>
        </section>

        <section className="stats-grid" aria-label="Arxiv statistikası">
          <Stat icon={BookOpenCheck} label="Ümumi sual" value={data.totalQuestions} sub="Bütün illər" />
          <Stat icon={FileStack} label="Yüklənmiş imtahan" value={data.totalExams} sub="PDF mənbə qeydləri" />
          <Stat icon={Layers3} label="Mövzu" value={38} sub="18 İnformatika · 20 Məntiq" />
          <Stat icon={ClipboardCheck} label="Yoxlanışda" value={data.needsReview} sub="Müəyyənlik tələb edən sual" />
        </section>

        <div className="dashboard-columns">
          <section className="card card-pad">
            <div className="section-title-row"><div><h2>Fənlər</h2><p>Seç və mövzular üzrə davam et</p></div><Search size={17} color="#819088" /></div>
            <div className="subject-card-grid">
              <SubjectCard slug="informatika" name="İnformatika" count={informatika?.questionCount ?? 0} topics={18} icon={BookOpenCheck} />
              <SubjectCard slug="mentiq" name="Məntiq" count={mentiq?.questionCount ?? 0} topics={20} icon={Brain} logic />
            </div>
            <div className="section-title-row" style={{ marginTop: 24 }}><div><h3>Ən çox sual olan mövzular</h3><p>Arxivdəki paylanma</p></div></div>
            {topTopics.length ? <div className="topic-count-chips">
              {topTopics.map(topic => <Link href={`/subjects/${topic.subjectId === mentiq?.id ? "mentiq" : "informatika"}/topics/${topic.slug}`} key={topic.id} className="topic-chip">
                <span className="topic-chip-number">{topic.numberLabel.padStart(2, "0")}</span>
                <span className="topic-chip-name">{topic.name}</span>
                <span className="topic-chip-count">{topic.count} sual</span>
              </Link>)}
            </div> : <div className="empty-state"><div className="empty-icon"><Layers3 size={18} /></div><h3>Hələ statistik məlumat yoxdur</h3><p>İlk suallar mövzulara əlavə edildikdə bölgü burada görünəcək.</p></div>}
          </section>

          <section className="card card-pad">
            <div className="section-title-row"><div><h2>Son əlavə edilən suallar</h2><p>Ən son arxiv qeydləri</p></div><Link href="/review" className="btn btn-quiet">Yoxlanış <ArrowRight size={14} /></Link></div>
            {recent.length ? <div className="recent-list">{recent.slice(0, 8).map(question => <Link key={question.id} href={`/questions/${question.id}`} className="recent-row">
              <span className="recent-number">{question.questionNumber ?? "—"}</span>
              <span className="recent-copy"><strong>{question.originalText}</strong><span className="recent-meta"><span>{question.examYear ?? "İl yoxdur"}</span><span>{question.topicName || "Mövzu yoxlanır"}</span>{question.reviewStatus === "needs_review" && <span>Yoxlanışda</span>}</span></span>
              <ArrowRight size={14} color="#9aa69f" />
            </Link>)}</div> : <div className="empty-state"><div className="empty-icon"><FileStack size={18} /></div><h3>Arxiv boşdur</h3><p>İlk PDF faylını yüklədikdə suallar burada görünəcək.</p><Link href="/uploads" className="btn btn-primary" style={{ marginTop: 14 }}>PDF yüklə</Link></div>}
            {data.needsReview > 0 && <Link href="/review" className="review-badge" aria-label={`${data.needsReview} sual yoxlanış üçün ayrılıb. Mətn və ya mövzu qeyri-müəyyən olduqda sual bu siyahıda qalır.`} title={`${data.needsReview} sual yoxlanış üçün ayrılıb. Mətn və ya mövzu qeyri-müəyyən olduqda sual bu siyahıda qalır.`}><ClipboardCheck size={15} /><span>Yoxlanışda {data.needsReview} sual</span><ArrowRight size={14} /></Link>}
          </section>
        </div>
      </>}
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof BookOpenCheck; label: string; value: number; sub: string }) {
  return (
    <div className="stat-card">
      <span className="stat-icon" aria-hidden="true"><Icon size={16} /></span>
      <span className="stat-copy">
        <span className="stat-label">{label}</span>
        <span className="stat-sub">{sub}</span>
      </span>
      <strong className="stat-value">{value}</strong>
    </div>
  );
}

function SubjectCard({ slug, name, count, topics, icon: Icon, logic = false }: { slug: string; name: string; count: number; topics: number; icon: typeof BookOpenCheck; logic?: boolean }) {
  return (
    <Link href={`/subjects/${slug}`} className="subject-card">
      <span className={`subject-icon${logic ? " logic" : ""}`} aria-hidden="true"><Icon size={19} /></span>
      <span className="subject-card-copy">
        <strong>{name}</strong>
        <span>{count ? "Suallar hazırdır" : "Mövzular hazır, suallar gözlənilir"}</span>
      </span>
      <span className="subject-card-stats" aria-label={`${count} sual, ${topics} mövzu`}>
        <span className="subject-card-metric"><span>sual</span><strong>{count}</strong></span>
        <span className="subject-card-metric"><span>mövzu</span><strong>{topics}</strong></span>
      </span>
      <ArrowRight size={15} color="#98a49d" aria-hidden="true" />
    </Link>
  );
}
