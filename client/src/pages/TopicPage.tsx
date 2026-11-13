import { useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, ChevronLeft, ChevronRight, Filter, Play, Search } from "lucide-react";
import { Link, useRoute } from "wouter";
import AppShell from "@/components/AppShell";
import QuestionCard from "@/components/QuestionCard";
import { trpc } from "@/lib/trpc";
import { errorMessage, type QuestionRecord, type TopicRecord } from "@/lib/study";

const PAGE_SIZE = 20;

export default function TopicPage() {
  const [, params] = useRoute("/subjects/:subjectSlug/topics/:topicSlug");
  const subjectSlug = params?.subjectSlug === "mentiq" ? "mentiq" : "informatika";
  const topicSlug = params?.topicSlug ?? "";
  const [year, setYear] = useState("");
  const [questionNumber, setQuestionNumber] = useState("");
  const [page, setPage] = useState(0);
  const topicsQuery = trpc.questionBank.topics.useQuery({ subjectSlug });
  const examsQuery = trpc.questionBank.exams.useQuery();
  const topics = (topicsQuery.data ?? []) as TopicRecord[];
  const selected = topics.find(topic => topic.slug === topicSlug);
  const parent = selected?.parentId ? topics.find(topic => topic.id === selected.parentId) : null;
  const mainTopic = parent ?? selected;
  const children = useMemo(() => topics.filter(topic => topic.parentId === mainTopic?.id), [topics, mainTopic?.id]);
  const [subtopic, setSubtopic] = useState("");
  const years = [...new Set((examsQuery.data ?? []).flatMap(file => file.years ?? []))].sort((a, b) => b - a);
  const validNumber = Number(questionNumber);
  const questionsQuery = trpc.questionBank.questions.useQuery({
    subjectSlug,
    topicSlug: mainTopic?.slug,
    subtopicSlug: selected?.parentId ? selected.slug : (subtopic || undefined),
    examYear: year ? Number(year) : undefined,
    questionNumber: questionNumber && Number.isInteger(validNumber) && validNumber > 0 ? validNumber : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort: "exam",
  }, { enabled: !!mainTopic });
  const questions = (questionsQuery.data ?? []) as QuestionRecord[];
  const hasNext = questions.length === PAGE_SIZE;
  const topicTitle = selected ? `${selected.numberLabel}. ${selected.name}` : "Mövzu tapılmadı";

  return (
    <AppShell title={topicTitle} eyebrow={`${subjectSlug === "mentiq" ? "MƏNTİQ" : "İNFORMATİKA"} · SUAL ARXİVİ`} actions={mainTopic && mainTopic.questionCount > 0 ? <Link href={`/tests/${mainTopic.slug}`} className="btn btn-primary"><Play size={14} /> Mövzunu həll et</Link> : undefined}>
      {topicsQuery.isLoading && <div className="loading-state">Mövzu yüklənir…</div>}
      {topicsQuery.isError && <div className="error-box">{errorMessage(topicsQuery.error)} <button className="btn btn-secondary" onClick={() => topicsQuery.refetch()}>Yenidən yoxla</button></div>}
      {selected && mainTopic && <>
        <div style={{ marginBottom: 13 }}><Link href={`/subjects/${subjectSlug}`} className="btn btn-quiet"><ArrowLeft size={14} /> Mövzulara qayıt</Link></div>
        <div className="subject-intro"><div><strong>{parent ? `Alt mövzu · ${parent.numberLabel}. ${parent.name}` : `${selected.questionCount} sual arxivdə`}</strong><p>İl və sual nömrəsi üzrə daraldın; mənbə PDF hər sual kartında göstərilir.</p></div><span className="tag">{mainTopic.questionCount} sual</span></div>
        <section className="filter-panel" aria-label="Sual filtrləri">
          <div className="filter-field"><label htmlFor="filter-year">İmtahan ili</label><select id="filter-year" className="select-field" value={year} onChange={event => { setYear(event.target.value); setPage(0); }}><option value="">Bütün illər</option>{years.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
          {children.length > 0 && !selected.parentId && <div className="filter-field"><label htmlFor="filter-subtopic">Alt mövzu</label><select id="filter-subtopic" className="select-field" value={subtopic} onChange={event => { setSubtopic(event.target.value); setPage(0); }}><option value="">Bütün alt mövzular</option>{children.map(item => <option key={item.id} value={item.slug}>{item.numberLabel}. {item.name}</option>)}</select></div>}
          <div className="filter-field"><label htmlFor="filter-number">Sual nömrəsi</label><input id="filter-number" className="field" inputMode="numeric" type="number" min="1" placeholder="Məsələn, 12" value={questionNumber} onChange={event => { setQuestionNumber(event.target.value); setPage(0); }} /></div>
          <button className="btn btn-secondary" onClick={() => { setYear(""); setSubtopic(""); setQuestionNumber(""); setPage(0); }}><Filter size={14} /> Təmizlə</button>
        </section>
        {questionsQuery.isLoading && <div className="loading-state">Suallar yüklənir…</div>}
        {questionsQuery.isError && <div className="error-box">{errorMessage(questionsQuery.error)} <button className="btn btn-secondary" onClick={() => questionsQuery.refetch()}>Yenidən yoxla</button></div>}
        {!questionsQuery.isLoading && !questionsQuery.isError && (questions.length ? <>
          <div className="section-title-row"><div><h2>Suallar</h2><p>{questions.length === 1 ? "1 nəticə" : `${questions.length} nəticə`} · {year || "bütün illər"}</p></div><span className="tag">Səhifə {page + 1}</span></div>
          <div className="question-list">{questions.map(question => <QuestionCard key={question.id} question={question} />)}</div>
          <div className="page-pagination"><span>{page > 0 ? `Səhifə ${page + 1}` : `İlk ${questions.length} sual`}</span><span><button className="btn btn-secondary" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}><ChevronLeft size={14} /> Əvvəlki</button> <button className="btn btn-secondary" disabled={!hasNext} onClick={() => setPage(value => value + 1)}>Növbəti <ChevronRight size={14} /></button></span></div>
        </> : <div className="empty-state"><div className="empty-icon"><Search size={18} /></div><h3>Bu filtrə uyğun sual yoxdur</h3><p>{subjectSlug === "mentiq" ? "Məntiq mövzuları hazırdır, amma bu fənnə aid suallar hələ yüklənməyib." : "Başqa il seçin və ya filtrləri təmizləyin."}</p><button className="btn btn-secondary" style={{ marginTop: 14 }} onClick={() => { setYear(""); setSubtopic(""); setQuestionNumber(""); setPage(0); }}>Filtrləri təmizlə</button></div>)}
      </>}
      {!topicsQuery.isLoading && !selected && <div className="empty-state"><div className="empty-icon"><BookOpenCheck size={18} /></div><h3>Mövzu tapılmadı</h3><p>Bu mövzu kataloqda mövcud deyil.</p><Link href={`/subjects/${subjectSlug}`} className="btn btn-secondary" style={{ marginTop: 14 }}>Fənnə qayıt</Link></div>}
    </AppShell>
  );
}
