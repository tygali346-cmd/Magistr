import { useEffect, useMemo, useState } from "react";
import { CheckCheck, FileText, Filter, Save, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import ExpandableText from "@/components/ExpandableText";
import QuestionMediaBlock from "@/components/QuestionMediaBlock";
import { trpc } from "@/lib/trpc";
import { errorMessage, type RouterOutput, type TopicRecord } from "@/lib/study";

type ReviewQuestion = RouterOutput["questionBank"]["reviewQueue"][number];

export default function ReviewPage() {
  const [location] = useLocation();
  const selectedId = Number(new URLSearchParams(window.location.search).get("question"));
  const queueQuery = trpc.questionBank.reviewQueue.useQuery();
  const subjectsQuery = trpc.questionBank.subjects.useQuery();
  const inforQuery = trpc.questionBank.topics.useQuery({ subjectSlug: "informatika" });
  const logicQuery = trpc.questionBank.topics.useQuery({ subjectSlug: "mentiq" });
  const topics = [
    ...(inforQuery.data ?? []).map(topic => ({ ...topic, subjectSlug: "informatika" as const })),
    ...(logicQuery.data ?? []).map(topic => ({ ...topic, subjectSlug: "mentiq" as const })),
  ];
  const queue = useMemo(() => {
    const rows = [...(queueQuery.data ?? [])];
    if (selectedId) rows.sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
    return rows;
  }, [queueQuery.data, selectedId]);
  const [search, setSearch] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const filtered = queue.filter(question => !search || `${question.originalText} ${question.examYear} ${question.questionNumber}`.toLocaleLowerCase("az").includes(search.toLocaleLowerCase("az")));
  const utils = trpc.useUtils();
  const saveMutation = trpc.questionBank.saveReview.useMutation({ onSuccess: async () => { await Promise.all([utils.questionBank.reviewQueue.invalidate(), utils.questionBank.dashboard.invalidate(), utils.questionBank.questions.invalidate(), utils.questionBank.question.invalidate()]); } });
  const highConfidenceCountQuery = trpc.questionBank.highConfidenceReviewCount.useQuery();
  const bulkApproveMutation = trpc.questionBank.approveHighConfidenceReview.useMutation({
    onSuccess: async result => {
      setBulkMessage(`${result.approved} sual “Yoxlanılıb” kimi işarələndi. Cavab açarları və sual mətnləri dəyişdirilmədi.`);
      await Promise.all([utils.questionBank.reviewQueue.invalidate(), utils.questionBank.highConfidenceReviewCount.invalidate(), utils.questionBank.dashboard.invalidate(), utils.questionBank.questions.invalidate()]);
    },
    onError: async error => {
      setBulkMessage(errorMessage(error));
      await highConfidenceCountQuery.refetch();
    },
  });

  function approveHighConfidenceQuestions() {
    const expectedCount = highConfidenceCountQuery.data ?? 0;
    if (expectedCount < 1 || bulkApproveMutation.isPending) return;
    const confirmed = window.confirm(`${expectedCount} sualın mövzu təsnifatı ən azı 95% əmindir. Onları “Yoxlanılıb” kimi qeyd edək? Bu əməliyyat sual mətnini və cavab açarını dəyişməyəcək.`);
    if (!confirmed) return;
    setBulkMessage("");
    bulkApproveMutation.mutate({ expectedCount });
  }

  useEffect(() => { if (selectedId) document.getElementById(`review-${selectedId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [selectedId, queue.length, location]);

  return (
    <AppShell title="Yoxlanış siyahısı" eyebrow="MƏNBƏ MÜQAYİSƏSİ · MÖVZU TƏSDİQİ">
      <div className="subject-intro"><div><strong>Qeyri-müəyyən suallar itmir</strong><p>Mətni, OCR təklifini və mövzu təyinatını orijinal PDF-lə müqayisə edin. Etibarlı cavab açarı yalnız mənbəsi göstərildikdə saxlanır.</p></div><span className="tag warning">{queue.length} sual</span></div>
      <section className="review-bulk-approve" aria-label="95 faiz və daha yüksək əminlikli sualları toplu təsdiq et">
        <div className="review-bulk-copy">
          <strong>Yüksək əminlikli təsnifat</strong>
          <p>Yalnız yoxlanış qeydi boş olan, ili və nömrəsi məlum, ən azı bir variantı olan, fənni və əsas mövzusu seçilmiş suallardan əminliyi 95% və yuxarı olanları “Yoxlanılıb” kimi işarələyir. Cavab açarı və sualın mətni dəyişmir.</p>
          <span className="caption" role="status">{highConfidenceCountQuery.isLoading ? "Uyğun suallar sayılır…" : highConfidenceCountQuery.isError ? "Say hesablana bilmədi — yenidən yükləyin." : `${highConfidenceCountQuery.data ?? 0} uyğun sual`}</span>
        </div>
        <button className="btn btn-primary" onClick={approveHighConfidenceQuestions} disabled={highConfidenceCountQuery.isLoading || highConfidenceCountQuery.isError || !highConfidenceCountQuery.data || bulkApproveMutation.isPending}>
          <CheckCheck size={15} /> {bulkApproveMutation.isPending ? "Təsdiqlənir…" : `95%+ sualları təsdiqlə (${highConfidenceCountQuery.data ?? 0})`}
        </button>
        {bulkMessage && <p className="review-bulk-message" role="status">{bulkMessage}</p>}
      </section>
      <section className="filter-panel"><div className="filter-field wide"><label htmlFor="review-search">Axtar</label><input id="review-search" className="field" placeholder="Mətn, il və ya sual nömrəsi" value={search} onChange={event => setSearch(event.target.value)} /></div><span className="caption"><Filter size={13} style={{ display: "inline", verticalAlign: "-3px" }} /> İdxal zamanı əminlik aşağı olduqda sual bura düşür.</span></section>
      {(queueQuery.isLoading || subjectsQuery.isLoading || inforQuery.isLoading || logicQuery.isLoading) && <div className="loading-state">Yoxlanış qeydləri yüklənir…</div>}
      {(queueQuery.isError || subjectsQuery.isError || inforQuery.isError || logicQuery.isError) && <div className="error-box">{errorMessage(queueQuery.error ?? subjectsQuery.error ?? inforQuery.error ?? logicQuery.error)} <button className="btn btn-secondary" onClick={() => { void queueQuery.refetch(); void subjectsQuery.refetch(); void inforQuery.refetch(); void logicQuery.refetch(); }}>Yenidən yoxla</button></div>}
      {!queueQuery.isLoading && !queueQuery.isError && filtered.length === 0 && <div className="empty-state"><div className="empty-icon"><ShieldCheck size={18} /></div><h3>{queue.length ? "Axtarışa uyğun sual yoxdur" : "Yoxlanış siyahısı boşdur"}</h3><p>{queue.length ? "Başqa söz və ya sual nömrəsi daxil edin." : "Yoxlanış tələb edən suallar əlavə olunduqda burada görünəcək."}</p></div>}
      {filtered.length > 0 && <div className="review-stack">{filtered.map(question => <ReviewEditor key={question.id} question={question} topics={topics} subjects={subjectsQuery.data ?? []} onSave={data => saveMutation.mutateAsync(data)} saving={saveMutation.isPending} />)}</div>}
    </AppShell>
  );
}

type ReviewInput = { questionId: number; subjectId: number | null; topicId: number | null; subtopicId: number | null; correctedText: string | null; correctOption: string | null; correctAnswerSource: string | null; answerKeyAction: "unchanged" | "set" | "clear"; reviewStatus: "checked" | "needs_review"; reviewNote: string | null };

function ReviewEditor({ question, topics, subjects, onSave, saving }: { question: ReviewQuestion; topics: (TopicRecord & { subjectSlug: "informatika" | "mentiq" })[]; subjects: { id: number; slug: string; name: string }[]; onSave: (input: ReviewInput) => Promise<unknown>; saving: boolean }) {
  const [subjectId, setSubjectId] = useState(question.subjectId ? String(question.subjectId) : "");
  const [topicId, setTopicId] = useState(question.topicId ? String(question.topicId) : "");
  const [subtopicId, setSubtopicId] = useState(question.subtopicId ? String(question.subtopicId) : "");
  const [correctedText, setCorrectedText] = useState(question.correctionSuggestion ?? "");
  const [correctOption, setCorrectOption] = useState("");
  const [correctAnswerSource, setCorrectAnswerSource] = useState("");
  const [answerKeyAction, setAnswerKeyAction] = useState<"unchanged" | "set" | "clear">("unchanged");
  const [reviewStatus, setReviewStatus] = useState<"checked" | "needs_review">(question.reviewStatus);
  const [reviewNote, setReviewNote] = useState(question.reviewNote ?? "");
  const [message, setMessage] = useState("");
  const selectedSubjectSlug = subjects.find(subject => String(subject.id) === subjectId)?.slug;
  const choices = topics.filter(topic => !topic.parentId && (!selectedSubjectSlug || topic.subjectSlug === selectedSubjectSlug));
  const selectedTopic = Number(topicId) || null;
  const subtopics = topics.filter(topic => topic.parentId === selectedTopic);
  const availableSubtopic = subtopics.some(topic => String(topic.id) === subtopicId);

  async function save() {
    setMessage("");
    try {
      await onSave({ questionId: question.id, subjectId: subjectId ? Number(subjectId) : null, topicId: selectedTopic, subtopicId: availableSubtopic && subtopicId ? Number(subtopicId) : null, correctedText: correctedText.trim() || null, correctOption: correctOption || null, correctAnswerSource: correctAnswerSource.trim() || null, answerKeyAction, reviewStatus, reviewNote: reviewNote.trim() || null });
      setMessage("Dəyişikliklər saxlanıldı.");
    } catch (error) { setMessage(errorMessage(error)); }
  }

  return (
    <article id={`review-${question.id}`} className="card review-card">
      {question.sourceUrl && !question.sourceUrl.startsWith("manual://") && <div className="question-pdf-sticky"><a className="btn btn-secondary question-pdf-button" href={question.sourcePage ? `${question.sourceUrl}#page=${question.sourcePage}` : question.sourceUrl} target="_blank" rel="noreferrer"><FileText size={14} /> PDF yüklə</a></div>}
      <div className="question-card-head"><div className="question-tags"><span className="question-number">{question.examYear ?? "İl məlum deyil"} · Sual {question.questionNumber ?? "—"}</span><span className="tag warning">Əminlik {question.classificationConfidence === null ? "—" : `${Math.round(question.classificationConfidence * 100)}%`}</span><span className="tag">{question.sourceFilename ?? "Mənbə bilinmir"}</span>{question.hasVerifiedAnswer && <span className="tag success">Mənbəli cavab mövcuddur</span>}</div></div>
      <ExpandableText text={question.originalText} />
      {question.options.length > 0 && <div className="question-options">{question.options.map(option => <div className="option-line" key={option.id}><span className="option-line-label">{option.label}</span><span>{option.optionText}</span></div>)}</div>}
      {question.media?.map((media, index) => <QuestionMediaBlock media={media} key={`${media.kind}-${index}`} />)}
      {question.classificationReason && <p className="caption" style={{ marginTop: 10 }}><strong>Təsnifat səbəbi:</strong> {question.classificationReason}</p>}
      <div className="review-edit-grid">
        <div><label className="field-label" htmlFor={`subject-${question.id}`}>Fənn</label><select id={`subject-${question.id}`} className="select-field" value={subjectId} onChange={event => { setSubjectId(event.target.value); setTopicId(""); setSubtopicId(""); }}><option value="">Fənn seçin</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div>
        <div><label className="field-label" htmlFor={`topic-${question.id}`}>Əsas mövzu</label><select id={`topic-${question.id}`} className="select-field" value={topicId} onChange={event => { setTopicId(event.target.value); setSubtopicId(""); }}><option value="">Mövzu seçin</option>{choices.map(topic => <option key={topic.id} value={topic.id}>{topic.numberLabel}. {topic.name}</option>)}</select></div>
        <div><label className="field-label" htmlFor={`subtopic-${question.id}`}>Alt mövzu</label><select id={`subtopic-${question.id}`} className="select-field" value={subtopicId} onChange={event => setSubtopicId(event.target.value)} disabled={!subtopics.length}><option value="">Alt mövzu yoxdur</option>{subtopics.map(topic => <option key={topic.id} value={topic.id}>{topic.numberLabel}. {topic.name}</option>)}</select></div>
      </div>
      <div style={{ marginTop: 12 }}><label className="field-label" htmlFor={`correction-${question.id}`}>OCR düzəliş təklifi (orijinal mətn dəyişmir)</label><textarea id={`correction-${question.id}`} className="text-field" placeholder="Mənbə ilə müqayisə etdikdən sonra təklif olunan düzəliş" value={correctedText} onChange={event => setCorrectedText(event.target.value)} /></div>
      <div className="review-edit-grid">
        <div><label className="field-label" htmlFor={`answer-${question.id}`}>Cavab açarı</label><select id={`answer-${question.id}`} className="select-field" value={answerKeyAction === "set" ? `set:${correctOption}` : answerKeyAction} onChange={event => { const value = event.target.value; if (value === "unchanged" || value === "clear") { setAnswerKeyAction(value); setCorrectOption(""); } else { setAnswerKeyAction("set"); setCorrectOption(value.slice(4)); } }}><option value="unchanged">Mövcud cavab açarını dəyişmədən saxla</option><option value="clear">Cavab açarını sil</option>{question.options.map(option => <option key={option.id} value={`set:${option.label}`}>{option.label} · {option.optionText.slice(0, 60)}</option>)}</select></div>
        <div><label className="field-label" htmlFor={`answer-source-${question.id}`}>Etibarlı cavab mənbəyi</label><input id={`answer-source-${question.id}`} className="field" placeholder="Mənbənin adı / səhifə / rəsmi açar" value={correctAnswerSource} disabled={answerKeyAction !== "set"} onChange={event => setCorrectAnswerSource(event.target.value)} /></div>
        <div><label className="field-label" htmlFor={`status-${question.id}`}>Yoxlanış statusu</label><select id={`status-${question.id}`} className="select-field" value={reviewStatus} onChange={event => setReviewStatus(event.target.value as "checked" | "needs_review")}><option value="needs_review">Yoxlanış tələb edir</option><option value="checked">Yoxlanılıb</option></select></div>
      </div>
      <div style={{ marginTop: 12 }}><label className="field-label" htmlFor={`note-${question.id}`}>Yoxlanış qeydi</label><textarea id={`note-${question.id}`} className="text-field" style={{ minHeight: 68 }} placeholder="Mətn, şəkil, təsnifat və ya cavabla bağlı qeyd" value={reviewNote} onChange={event => setReviewNote(event.target.value)} /></div>
      <div className="review-actions">{message && <span className="caption" style={{ alignSelf: "center", marginRight: "auto" }}>{message}</span>}<button className="btn btn-primary" disabled={saving} onClick={save}><Save size={14} /> {saving ? "Saxlanır…" : "Dəyişiklikləri saxla"}</button></div>
    </article>
  );
}
