import { ArrowRight, BookOpenCheck, Brain, ChevronRight, FileUp, Layers3 } from "lucide-react";
import { Link, useRoute } from "wouter";
import AppShell from "@/components/AppShell";
import { trpc } from "@/lib/trpc";
import { errorMessage, type TopicRecord } from "@/lib/study";
import { INFORMATICS_TOPICS, LOGIC_TOPICS } from "@shared/topicCatalog";

export default function SubjectPage() {
  const [, params] = useRoute("/subjects/:subjectSlug");
  const subjectSlug = params?.subjectSlug === "mentiq" ? "mentiq" : "informatika";
  const subjectQuery = trpc.questionBank.subjects.useQuery();
  const topicQuery = trpc.questionBank.topics.useQuery({ subjectSlug });
  const subject = subjectQuery.data?.find(row => row.slug === subjectSlug);
  const topics = (topicQuery.data ?? []) as TopicRecord[];
  const mainTopics = topics.filter(topic => !topic.numberLabel.includes("."));
  const childTopics = topics.filter(topic => topic.numberLabel.includes("."));
  const expected = subjectSlug === "mentiq" ? LOGIC_TOPICS.length : INFORMATICS_TOPICS.length;

  return (
    <AppShell title={subjectSlug === "mentiq" ? "Məntiq" : "İnformatika"} eyebrow="FƏNNLƏR · MÖVZU SİYAHISI" actions={<Link href="/uploads" className="btn btn-primary"><FileUp size={15} /> Yeni PDF</Link>}>
      {(subjectQuery.isLoading || topicQuery.isLoading) && <div className="loading-state">Mövzular yüklənir…</div>}
      {(subjectQuery.isError || topicQuery.isError) && <div className="error-box">{errorMessage(subjectQuery.error ?? topicQuery.error)} <button className="btn btn-secondary" onClick={() => { void subjectQuery.refetch(); void topicQuery.refetch(); }}>Yenidən yoxla</button></div>}
      {subject && !topicQuery.isLoading && <>
        <section className="subject-intro">
          <div><strong>{subject.name} üzrə təkrar</strong><p>{subjectSlug === "mentiq" ? "Məntiq fənninin mövzuları hazırdır. Həmin fənnə aid imtahan PDF-lərini gələcəkdə ayrıca əlavə edin." : "2010 və 2011-ci illərin sualları mövzular üzrə qruplaşdırılıb. İstənilən mövzudan başlayın."}</p></div>
          <span className="tag success">{subject.questionCount} sual · {expected} əsas mövzu</span>
        </section>
        {subject.questionCount === 0 && <div className="notice-box" style={{ marginBottom: 14 }}>Bu fənn hələ boşdur. Mövzular dəyişməz saxlanıb; burada hazırda heç bir İnformatika faylı Məntiq sualı kimi göstərilmir.</div>}
        <section className="card card-pad">
          <div className="section-title-row"><div><h2>Mövzular</h2><p>{mainTopics.length} əsas mövzu · sual sayı seçilmiş arxivə görədir</p></div><span className="tag">{subject.questionCount} sual</span></div>
          <div className="topic-list">
            {mainTopics.map(topic => {
              const children = childTopics.filter(child => child.parentId === topic.id);
              return <div key={topic.id}>
                <Link href={`/subjects/${subjectSlug}/topics/${topic.slug}`} className="topic-row">
                  <span className="topic-number">{topic.numberLabel}</span>
                  <span className="topic-copy"><strong>{topic.name}</strong><span>{topic.questionCount} sual</span></span>
                  <span className="topic-question-count">{topic.questionCount} sual</span>
                  <ChevronRight className="topic-chevron" size={16} />
                </Link>
                {children.map(child => <Link key={child.id} href={`/subjects/${subjectSlug}/topics/${child.slug}`} className="topic-row" style={{ minHeight: 54, paddingLeft: 56, background: "#fbfcf8" }}>
                  <span className="topic-number" style={{ width: 33, height: 33, fontSize: 9 }}>{child.numberLabel}</span>
                  <span className="topic-copy"><strong>{child.name}</strong><span>Alt mövzu · {child.questionCount} sual</span></span>
                  <span className="topic-question-count">{child.questionCount} sual</span>
                  <ChevronRight className="topic-chevron" size={15} />
                </Link>)}
              </div>;
            })}
          </div>
        </section>
        {subjectSlug === "mentiq" && <div className="empty-state" style={{ marginTop: 15 }}><div className="empty-icon"><Brain size={18} /></div><h3>Məntiq sualları hələ əlavə edilməyib</h3><p>Bu bölmə 20 əsas mövzu ilə hazırdır və boş saxlanıb. Gələcəkdə Məntiq imtahanı PDF-i yükləyə bilərsiniz.</p><Link href="/uploads" className="btn btn-secondary" style={{ marginTop: 14 }}><FileUp size={14} /> Məntiq PDF-i əlavə et</Link></div>}
      </>}
    </AppShell>
  );
}
