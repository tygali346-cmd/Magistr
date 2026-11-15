import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CircleHelp, FileQuestion, RotateCcw, X } from "lucide-react";
import { Link, useRoute } from "wouter";
import AppShell from "@/components/AppShell";
import ExpandableText from "@/components/ExpandableText";
import QuestionMediaBlock, { ZoomableMediaImage, isMediaImage } from "@/components/QuestionMediaBlock";
import { trpc } from "@/lib/trpc";
import { useFirebase } from "@/contexts/FirebaseContext";
import { errorMessage, getLearnerKey, type QuestionRecord, type TopicRecord } from "@/lib/study";

type PracticeQuestion = Omit<QuestionRecord, "correctOption" | "correctAnswerSource">;
type AttemptResult = { attemptId: number | null; totalQuestions: number; scoredQuestions: number; correctCount: number; incorrectCount: number; unscoredCount: number; scorePercent: number | null; answers: { questionId: number; selectedOption: string | null; verifiedCorrectOption: string | null; isScored: boolean; isCorrect: boolean | null }[] };

export default function PracticePage() {
  const [, params] = useRoute("/tests/:topicSlug");
  const routeTopicSlug = params?.topicSlug ?? "";
  const subjectSlug = routeTopicSlug.startsWith("mentiq-") ? "mentiq" : "informatika";
  const topicQuery = trpc.questionBank.topics.useQuery({ subjectSlug });
  const examsQuery = trpc.questionBank.exams.useQuery();
  const topics = (topicQuery.data ?? []) as TopicRecord[];
  const selectedTopic = topics.find(topic => topic.slug === routeTopicSlug);
  const parent = selectedTopic?.parentId ? topics.find(topic => topic.id === selectedTopic.parentId) : null;
  const topic = parent ?? selectedTopic;
  const topicSlug = topic?.slug ?? routeTopicSlug;
  const [year, setYear] = useState("");
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { firebaseUser, attempts, saveAttemptToFirestore } = useFirebase();
  const practiceQuery = trpc.questionBank.practiceQuestions.useQuery({ subjectSlug, topicSlug, examYear: year ? Number(year) : undefined, limit: 200 }, { enabled: !!topic });
  const startAttemptMutation = trpc.questionBank.startAttempt.useMutation();
  const saveAttempt = trpc.questionBank.saveAttempt.useMutation();
  const practiceQuestions = (practiceQuery.data ?? []) as PracticeQuestion[];
  const topicAttemptsCount = useMemo(() => attempts.filter(attempt => attempt.topicSlug === topicSlug).length, [attempts, topicSlug]);
  const years = [...new Set((examsQuery.data ?? []).flatMap(file => file.years ?? []))].sort((a, b) => b - a);
  const current = practiceQuestions[step];
  const resultByQuestion = useMemo(() => new Map((result?.answers ?? []).map(answer => [answer.questionId, answer])), [result]);
  const wrong = practiceQuestions.filter(question => resultByQuestion.get(question.id)?.isScored && resultByQuestion.get(question.id)?.isCorrect === false);

  async function beginTest() {
    if (!practiceQuestions.length || starting) return;
    setStarting(true);
    setSaveError("");
    try {
      const session = await startAttemptMutation.mutateAsync({
        learnerKey: getLearnerKey(),
        subjectSlug,
        topicSlug,
        examYear: year ? Number(year) : null,
        questionIds: practiceQuestions.map(question => question.id),
      });
      setSessionToken(session.sessionToken);
      setStarted(true);
      setStep(0);
      setAnswers({});
    } catch (error) {
      setSaveError(errorMessage(error, "Test sessiyası başlatmaq alınmadı. Sualları yeniləyib təkrar cəhd edin."));
      void practiceQuery.refetch();
    } finally {
      setStarting(false);
    }
  }

  async function finish() {
    if (!practiceQuestions.length || saving) return;
    if (!sessionToken) {
      setSaveError("Test sessiyası bitib. Nəticəni görmək üçün testi yenidən başladın.");
      setStarted(false);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const response = await saveAttempt.mutateAsync({
        learnerKey: getLearnerKey(), sessionToken,
        answers: practiceQuestions.map(question => ({ questionId: question.id, selectedOption: answers[question.id] ?? null })),
      });
      const typedResult = response as AttemptResult;
      setResult(typedResult);
      setSessionToken("");
      setStarted(false);
      if (firebaseUser?.emailVerified) {
        try {
          await saveAttemptToFirestore({
            subjectSlug: subjectSlug as "informatika" | "mentiq",
            topicSlug,
            examYear: year ? Number(year) : null,
            totalQuestions: typedResult.totalQuestions,
            scoredQuestions: typedResult.scoredQuestions,
            correctCount: typedResult.correctCount,
            incorrectCount: typedResult.incorrectCount,
            unscoredCount: typedResult.unscoredCount,
            scorePercent: typedResult.scorePercent,
          });
        } catch (firestoreError) {
          console.error(firestoreError);
        }
      }
    } catch (error) {
      setSaveError(errorMessage(error, "Nəticə saxlanmadı. Yenidən cəhd edin."));
    } finally {
      setSaving(false);
    }
  }

  function restart() {
    setResult(null);
    setAnswers({});
    setStep(0);
    setSessionToken("");
    setStarted(false);
    setSaveError("");
  }

  const title = topic ? `${topic.numberLabel}. ${topic.name}` : "Mövzu testi";
  return (
    <AppShell title="Mövzu testi" eyebrow={`${subjectSlug === "mentiq" ? "MƏNTİQ" : "İNFORMATİKA"} · PRAKTİKA`} actions={<Link href={topic ? `/subjects/${subjectSlug}/topics/${topic.slug}` : `/subjects/${subjectSlug}`} className="btn btn-secondary"><ArrowLeft size={14} /> Mövzuya qayıt</Link>}>
      {topicQuery.isLoading && <div className="loading-state">Mövzu yüklənir…</div>}
      {topicQuery.isError && <div className="error-box">{errorMessage(topicQuery.error)} <button className="btn btn-secondary" onClick={() => topicQuery.refetch()}>Yenidən yoxla</button></div>}
      {topic && <div className="quiz-layout">
        <div className="subject-intro"><div><strong>{title}</strong><p>Suallar ardıcıllıqla göstərilir. Yalnız mənbəsi yoxlanmış cavablar nəticəyə daxil edilir.</p></div><span className="tag">{topic.questionCount} sual</span></div>
        {practiceQuery.isLoading && <div className="loading-state">Test sualları hazırlanır…</div>}
        {practiceQuery.isError && <div className="error-box">{errorMessage(practiceQuery.error)} <button className="btn btn-secondary" onClick={() => practiceQuery.refetch()}>Yenidən yoxla</button></div>}
        {!practiceQuery.isLoading && !practiceQuery.isError && !practiceQuestions.length && <div className="empty-state"><div className="empty-icon"><FileQuestion size={18} /></div><h3>Bu mövzuda hələ sual yoxdur</h3><p>{subjectSlug === "mentiq" ? "Məntiq sualları hələ ayrıca yüklənməyib." : "Başqa mövzu seçə və ya bütün illərin suallarını gözləyə bilərsiniz."}</p><Link href={`/subjects/${subjectSlug}`} className="btn btn-secondary" style={{ marginTop: 14 }}>Mövzulara qayıt</Link></div>}
        {!practiceQuery.isLoading && !practiceQuery.isError && practiceQuestions.length > 0 && !started && !result && <section className="card card-pad">
          <div className="section-title-row"><div><h2>Testi başlat</h2><p>Suallar: {practiceQuestions.length}{practiceQuestions.length === 200 ? " · ilk 200 sual" : ""}</p></div><span className="tag">{practiceQuestions.filter(question => question.options.length > 0).length} cavab variantlı sual</span></div>
          <div className="filter-field" style={{ maxWidth: 260 }}><label htmlFor="practice-year">İmtahan ili</label><select id="practice-year" className="select-field" value={year} onChange={event => { setYear(event.target.value); setResult(null); setAnswers({}); setSessionToken(""); setStep(0); }}><option value="">Bütün illər</option>{years.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
          <div className="notice-box" style={{ marginTop: 14 }}><CircleHelp size={14} style={{ display: "inline", verticalAlign: "-3px", marginRight: 5 }} /> Cavab açarı məlum olmayan suallar “yoxlanılmamış” kimi sayılır; sistem cavabı özü uydurmur.</div>
          {saveError && <div className="error-box" style={{ marginTop: 12 }}>{saveError}</div>}
          <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={starting} onClick={() => void beginTest()}><ArrowRight size={14} /> {starting ? "Test hazırlanır…" : "Testə başla"}</button>
        </section>}
        {started && current && <>
          <div className="quiz-progress-head"><span>Sual {step + 1} / {practiceQuestions.length}</span><span>{Object.keys(answers).length} cavab seçilib</span></div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${((step + 1) / practiceQuestions.length) * 100}%` }} /></div>
          <section className="card quiz-card">
            <div className="quiz-question-top"><h2>{current.examYear ?? "İl göstərilməyib"} · Sual {current.questionNumber ?? "—"}</h2><span className="tag">Nəticə testi bitirdikdən sonra göstəriləcək</span></div>
            <p className="quiz-question">{current.originalText}</p>
            {current.media?.map((media, index) => <QuestionMediaBlock media={media} questionNumber={current.questionNumber} key={`${media.kind}-${index}`} />)}
            <div className="quiz-options">
              {current.options.map(option => {
                const optionMedias = (current.media ?? []).filter(
                  m => m.role === "option" && m.optionLabel?.toLowerCase() === option.label.toLowerCase(),
                );
                return (
                  <button type="button" key={option.id} className={`quiz-option${answers[current.id] === option.label ? " selected" : ""}`} onClick={() => setAnswers(previous => ({ ...previous, [current.id]: option.label }))} aria-pressed={answers[current.id] === option.label}>
                    <span className="quiz-option-mark">{option.label}</span>
                    <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                      {option.optionText && <span>{option.optionText}</span>}
                      {optionMedias.map((optionMedia, idx) =>
                        isMediaImage(optionMedia) ? (
                          <ZoomableMediaImage
                            key={idx}
                            src={optionMedia.value}
                            alt={`Sual ${current.questionNumber ?? ""} şəkli`}
                            compact
                          />
                        ) : (
                          <pre key={idx} className="caption">{optionMedia.value}</pre>
                        ),
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="quiz-footer"><span className="caption">Mənbə: {current.sourceTitle || current.sourceFilename} · səh. {current.sourcePage ?? "—"}</span><span className="quiz-footer-actions">
              <button className="btn btn-secondary" disabled={step === 0} onClick={() => setStep(value => Math.max(0, value - 1))}>Əvvəlki</button>
              {step < practiceQuestions.length - 1 ? <button className="btn btn-primary" onClick={() => setStep(value => value + 1)}>Növbəti <ArrowRight size={14} /></button> : <button className="btn btn-primary" disabled={saving} onClick={finish}>{saving ? "Nəticə saxlanır…" : "Testi bitir"} <Check size={14} /></button>}
            </span></div>
          </section>
          {saveError && <div className="error-box" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 12 }}><span>{saveError}</span><button className="btn btn-secondary" type="button" onClick={restart}>Testi yenidən qur</button></div>}
        </>}
        {result && <section className="card results-panel">
          <div className="section-title-row"><div><h2>Test nəticəsi</h2><p>Yoxlanmış cavablar əsasında hesablanıb</p></div><button className="btn btn-secondary" onClick={restart}><RotateCcw size={14} /> Yenidən başla</button></div>
          <div className="result-score">{result.scorePercent !== null ? <strong className="result-score-number">{result.scorePercent}%</strong> : <CircleHelp size={28} color="#a27935" />}<div><h3>{result.scorePercent !== null ? "Nəticə hazırdır" : "Qiymət hesablana bilmədi"}</h3><p>{result.scorePercent !== null ? "Faiz yalnız yoxlanmış cavab açarı olan suallara əsaslanır." : "Bu testdə etibarlı cavab açarı olan sual yoxdur; faiz və bal hesablanmadı."}</p></div></div>
          <div className="result-stats"><div className="result-stat good"><strong>{result.correctCount}</strong><span>Düzgün</span></div><div className="result-stat bad"><strong>{result.incorrectCount}</strong><span>Səhv</span></div><div className="result-stat neutral"><strong>{result.unscoredCount}</strong><span>Yoxlanılmamış</span></div></div>
          {wrong.length > 0 ? <><div className="section-title-row"><div><h3>Səhv cavablar</h3><p>Yenidən nəzərdən keçirin</p></div></div><div className="review-stack">{wrong.map(question => {
            const answer = resultByQuestion.get(question.id);
            const optionMedias = (question.media ?? []).filter(m => m.role === "option");
            return (
              <div className="card review-card" key={question.id}>
                <div className="question-tags"><span className="question-number">Sual {question.questionNumber}</span><span className="tag warning"><X size={12} /> Səhv</span></div>
                <ExpandableText text={question.originalText} />
                {question.media?.map((media, index) => <QuestionMediaBlock media={media} questionNumber={question.questionNumber} key={`${media.kind}-${index}`} />)}
                {optionMedias.length > 0 && (
                  <div className="question-options" style={{ marginBottom: 10 }}>
                    {question.options.map(option => {
                      const matched = optionMedias.filter(m => m.optionLabel?.toLowerCase() === option.label.toLowerCase());
                      if (!matched.length) return null;
                      return (
                        <div className="option-line" key={option.id}>
                          <span className="option-line-label">{option.label}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {option.optionText && <span>{option.optionText}</span>}
                            {matched.map((m, idx) => isMediaImage(m) ? <ZoomableMediaImage key={idx} src={m.value} alt={`Sual ${question.questionNumber ?? ""} şəkli`} compact /> : <pre key={idx} className="caption">{m.value}</pre>)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="caption">Seçiminiz: {answer?.selectedOption ?? "Cavab seçilməyib"} · Təsdiqlənmiş cavab: {answer?.verifiedCorrectOption ?? "—"}</p>
              </div>
            );
          })}</div></> : <div className="notice-box">Yoxlanmış suallar arasında səhv cavab yoxdur.</div>}
          <p className="caption" style={{ marginTop: 14 }}>
            {firebaseUser?.emailVerified
              ? `Bu nəticə hesabınıza saxlanılıb${topicAttemptsCount > 0 ? ` · bu mövzuda ${topicAttemptsCount} cəhd` : ""}. `
              : "Bu nəticə anonim brauzer açarınızla saxlanıb. "}
            Nəticələr hesablananda düzgün cavabı məlum olmayan suallar çıxarılır.
          </p>
        </section>}
      </div>}
    </AppShell>
  );
}
