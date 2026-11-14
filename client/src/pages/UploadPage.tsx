import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowDownToLine, Check, CircleHelp, FileText, FileUp, LoaderCircle, LogOut, Plus, RotateCcw, ShieldAlert, Sparkles, UploadCloud, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import AnswerKeyImportPanel from "@/components/AnswerKeyImportPanel";
import { getAuthHeaders } from "@/lib/authToken";
import { trpc } from "@/lib/trpc";
import { errorMessage, formatBytes, formatDate, type TopicRecord } from "@/lib/study";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
type LocalFile = {
  file: File;
  status: "ready" | "working" | "done" | "error";
  note?: string;
  expectedQuestionCount?: string;
  examFileId?: number;
  startedAtMs?: number;
  finishedAtMs?: number;
};

type LiveImportProgress = {
  examFileId: number;
  jobId: number | null;
  stage: string;
  status: string;
  progress: number;
  message: string;
  expectedQuestionCount: number | null;
  detectedQuestionCount: number;
  processedQuestionCount: number;
  insertedCount: number;
  skippedDuplicateCount: number;
  needsReviewCount: number;
  startedAt: string | null;
  updatedAt: string;
};

export default function UploadPage() {
  const { logout } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [yearsText, setYearsText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [retryingIds, setRetryingIds] = useState<number[]>([]);
  const [retryStartedAt, setRetryStartedAt] = useState<Record<number, number>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [uploadError, setUploadError] = useState("");
  const [archiveNotice, setArchiveNotice] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [subjectSlug, setSubjectSlug] = useState<"informatika" | "mentiq">("informatika");
  const [topicSlug, setTopicSlug] = useState("");
  const [subtopicSlug, setSubtopicSlug] = useState("");
  const [year, setYear] = useState("");
  const [number, setNumber] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [options, setOptions] = useState([{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }, { label: "D", text: "" }, { label: "E", text: "" }]);
  const [manualMessage, setManualMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const examsQuery = trpc.questionBank.exams.useQuery();
  const topicsQuery = trpc.questionBank.topics.useQuery({ subjectSlug });
  const topics = (topicsQuery.data ?? []) as TopicRecord[];
  const mainTopics = topics.filter(topic => !topic.parentId);
  const children = topics.filter(topic => topic.parentId === mainTopics.find(topic => topic.slug === topicSlug)?.id);
  const utils = trpc.useUtils();
  const manualMutation = trpc.questionBank.manualQuestion.useMutation();
  const retryMutation = trpc.questionBank.retryImport.useMutation();
  const deleteMutation = trpc.questionBank.deleteExamFile.useMutation();
  const backupQuery = trpc.questionBank.exportBackup.useQuery(undefined, { enabled: false, retry: false });
  const years = yearsText.split(/[\s,;]+/).map(part => Number(part)).filter(value => Number.isInteger(value) && value >= 1900 && value <= 2100);

  const activeExamFileIds = useMemo(() => {
    const ids = new Set<number>();
    for (const item of files) {
      if (item.status === "working" && item.examFileId) ids.add(item.examFileId);
    }
    for (const id of retryingIds) ids.add(id);
    for (const exam of examsQuery.data ?? []) {
      if (exam.processingStatus === "processing") ids.add(exam.id);
    }
    return [...ids];
  }, [files, retryingIds, examsQuery.data]);

  const isAnyProcessing = working || activeExamFileIds.length > 0;

  useEffect(() => {
    if (!isAnyProcessing) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isAnyProcessing]);

  const progressQuery = trpc.questionBank.importProgress.useQuery(
    { examFileIds: activeExamFileIds },
    {
      enabled: activeExamFileIds.length > 0,
      refetchInterval: activeExamFileIds.length > 0 ? 700 : false,
    },
  );

  const progressByExamId = useMemo(() => {
    const map = new Map<number, LiveImportProgress>();
    for (const entry of (progressQuery.data ?? []) as LiveImportProgress[]) {
      map.set(entry.examFileId, entry);
    }
    return map;
  }, [progressQuery.data]);

  function addFiles(fileList: FileList | File[]) {
    const accepted: LocalFile[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.name.toLowerCase().endsWith(".pdf") || file.type && file.type !== "application/pdf") {
        setUploadError(`${file.name}: yalnız PDF faylları qəbul olunur.`);
        continue;
      }
      if (file.size > MAX_PDF_BYTES) {
        setUploadError(`${file.name}: fayl 50 MB limitindən böyükdür.`);
        continue;
      }
      accepted.push({ file, status: "ready", expectedQuestionCount: "" });
    }
    setFiles(previous => [...previous, ...accepted]);
    if (accepted.length) setUploadError("");
  }

  function updateFile(index: number, patch: Partial<LocalFile>) {
    setFiles(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function uploadAndImport() {
    if (working || !files.some(item => item.status === "ready" || item.status === "error")) return;
    setWorking(true);
    setUploadError("");
    for (let index = 0; index < files.length; index += 1) {
      const current = files[index];
      if (current.status !== "ready" && current.status !== "error") continue;
      const startedAtMs = Date.now();
      updateFile(index, {
        status: "working",
        startedAtMs,
        finishedAtMs: undefined,
        note: "PDF təhlükəsiz mənbə yaddaşına yüklənir…",
      });
      try {
        const response = await fetch("/api/import/pdf", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/pdf",
            "x-original-filename": encodeURIComponent(current.file.name),
            ...getAuthHeaders(),
            ...(years.length ? { "x-exam-years": years.join(",") } : {}),
            ...(current.expectedQuestionCount?.trim() ? { "x-expected-question-count": current.expectedQuestionCount.trim() } : {}),
          },
          body: current.file,
        });
        const uploaded = await response.json() as { examFileId?: number; duplicate?: boolean; filename?: string; processingStatus?: string; expectedQuestionCount?: number | null; error?: string };
        if (!response.ok || !uploaded.examFileId) throw new Error(uploaded.error || "PDF yüklənmədi.");
        updateFile(index, { examFileId: uploaded.examFileId });
        if (uploaded.duplicate) {
          if (uploaded.processingStatus === "failed" || uploaded.processingStatus === "uploaded") {
            const result = await utils.client.questionBank.retryImport.mutate({ examFileId: uploaded.examFileId });
            updateFile(index, {
              status: "done",
              finishedAtMs: Date.now(),
              note: `Eyni PDF tapıldı və yenidən emal edildi · ${result.detected} sual oxundu · ${result.inserted} yeni sual · ${result.needsReview} yoxlanış qeydi.`,
            });
          } else {
            updateFile(index, {
              status: "done",
              finishedAtMs: Date.now(),
              note: uploaded.processingStatus === "processing" ? "Eyni PDF hazırda emal olunur." : "Eyni fayl artıq arxivdə var; əlavə emal tələb olunmur.",
            });
          }
          continue;
        }
        updateFile(index, { status: "working", examFileId: uploaded.examFileId, note: "Sual mətni, cavab variantları və mövzular təhlil olunur…" });
        const result = await utils.client.questionBank.importPdf.mutate({ examFileId: uploaded.examFileId });
        updateFile(index, {
          status: "done",
          finishedAtMs: Date.now(),
          note: `${result.detected} sual oxundu · ${result.inserted} sual saxlanıldı · ${result.needsReview} sual yoxlanış siyahısında.`,
        });
      } catch (error) {
        updateFile(index, { status: "error", finishedAtMs: Date.now(), note: errorMessage(error, "PDF emalı uğursuz oldu.") });
      }
    }
    setWorking(false);
    void examsQuery.refetch();
    void utils.questionBank.dashboard.invalidate();
    void utils.questionBank.reviewQueue.invalidate();
  }

  async function retryFile(examFileId: number) {
    setUploadError("");
    setRetryingIds(prev => prev.includes(examFileId) ? prev : [...prev, examFileId]);
    setRetryStartedAt(prev => ({ ...prev, [examFileId]: Date.now() }));
    try {
      await retryMutation.mutateAsync({ examFileId });
      await Promise.all([examsQuery.refetch(), utils.questionBank.dashboard.invalidate(), utils.questionBank.reviewQueue.invalidate()]);
    } catch (error) {
      setUploadError(errorMessage(error, "PDF-i yenidən emal etmək alınmadı."));
    } finally {
      setRetryingIds(prev => prev.filter(id => id !== examFileId));
    }
  }

  async function deleteFile(examFileId: number) {
    setUploadError("");
    setArchiveNotice("");
    try {
      const result = await deleteMutation.mutateAsync({ examFileId });
      setArchiveNotice(`${result.deletedQuestionCount} sual və PDF mənbəyi silindi.`);
      setConfirmDeleteId(null);
      await Promise.all([
        examsQuery.refetch(),
        utils.questionBank.dashboard.invalidate(),
        utils.questionBank.reviewQueue.invalidate(),
        utils.questionBank.questions.invalidate(),
        utils.questionBank.topics.invalidate(),
        utils.questionBank.subjects.invalidate(),
      ]);
    } catch (error) {
      setUploadError(errorMessage(error, "PDF mənbəyini silmək alınmadı."));
    }
  }

  async function addManualQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualMessage("");
    const filledOptions = options.filter(option => option.text.trim());
    try {
      const result = await manualMutation.mutateAsync({ subjectSlug, topicSlug, subtopicSlug: subtopicSlug || null, examYear: year ? Number(year) : null, questionNumber: number ? Number(number) : null, questionText, options: filledOptions });
      setManualMessage(`Sual #${result.questionId} arxivə əlavə edildi. Cavab açarı təsdiqlənmədiyi üçün boş saxlanıb.`);
      setQuestionText("");
      setNumber("");
      setOptions([{ label: "A", text: "" }, { label: "B", text: "" }, { label: "C", text: "" }, { label: "D", text: "" }, { label: "E", text: "" }]);
      void utils.questionBank.dashboard.invalidate();
      void utils.questionBank.topics.invalidate();
      void examsQuery.refetch();
    } catch (error) { setManualMessage(errorMessage(error)); }
  }

  async function downloadBackup() {
    setExporting(true);
    setExportError("");
    try {
      const { data } = await backupQuery.refetch();
      if (!data) throw new Error("Ehtiyat nüsxəsi yüklənmədi.");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `qebulfit-ehtiyat-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { setExportError(errorMessage(error)); }
    finally { setExporting(false); }
  }

  return (
    <AppShell title="PDF arxivi" eyebrow="MƏNBƏLƏR · İDXAL VƏ EHTİYAT NÜSXƏSİ" actions={<><button className="btn btn-secondary" onClick={downloadBackup} disabled={exporting}><ArrowDownToLine size={14} /> {exporting ? "Hazırlanır…" : "JSON ehtiyat nüsxəsi"}</button><button className="btn btn-quiet" onClick={() => void logout()}><LogOut size={14} /> Çıxış</button></>}>
      <div className="notice-box" style={{ marginBottom: 15 }}><ShieldAlert size={14} style={{ display: "inline", verticalAlign: "-3px", marginRight: 5 }} /><strong>Gemini emalını yalnız admin başladır.</strong> Təhlil üçün PDF Google-a göndərilir; emal tamamlandıqdan sonra müvəqqəti Gemini faylı silinir. Sorğular konfiqurasiya edilmiş Google Gemini API açarının kvotasından istifadə edir. Sistem sualları və mövzuları çıxarır, düzgün cavab uydurmur; qeyri-müəyyən qeydlər yoxlanış siyahısında qalır.</div>
      <div className="upload-box">
        <label className={`drop-zone${dragging ? " dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple onChange={event => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
          <span><span className="drop-zone-icon"><UploadCloud size={22} /></span><h2>PDF fayllarını seçin və ya bura atın</h2><p>Bir və ya bir neçə imtahan PDF-i. Fayl ölçüsü hər biri üçün maksimum 50 MB.</p><span className="btn btn-secondary" style={{ marginTop: 13 }}><FileUp size={14} /> Fayl seç</span></span>
        </label>
        <section className="card upload-side"><h3>İdxal necə işləyir?</h3><p>Fayl əvvəlcə mənbə kimi saxlanır. Sonra AI-ni ayrıca başladırsınız. Orijinal PDF, sual nömrəsi, il və səhifə istinadı qorunur.</p><div className="processing-list"><div className="processing-item"><Check size={14} /> Skan edilmiş səhifələr üçün OCR</div><div className="processing-item"><Check size={14} /> Sabit fənn və mövzu kataloqu</div><div className="processing-item"><Check size={14} /> Təkrar və qeyri-müəyyən sual yoxlaması</div><div className="processing-item"><Check size={14} /> Etibarlı mənbə yoxdursa, cavab açarı boş qalır</div></div><div className="filter-field" style={{ marginTop: 15 }}><label htmlFor="years">İmtahan illəri (istəyə görə)</label><input id="years" className="field" placeholder="2010, 2011" value={yearsText} onChange={event => setYearsText(event.target.value)} /></div></section>
      </div>

      {files.length > 0 && <section className="card card-pad" style={{ marginTop: 15 }}>
        <div className="section-title-row"><div><h2>Yükləməyə hazır fayllar</h2><p>Fayl adından illər müəyyən edilə bilər; yuxarıdakı il dəyərləri hamısına tətbiq olunur.</p></div><button className="btn btn-quiet" onClick={() => setFiles([])} disabled={working}>Hamısını sil</button></div>
        <div className="upload-file-list">{files.map((item, index) => {
          const live = item.examFileId ? progressByExamId.get(item.examFileId) : undefined;
          const expectedCount = item.expectedQuestionCount?.trim() ? Number(item.expectedQuestionCount.trim()) : null;
          return (
            <div className="upload-file-row" key={`${item.file.name}-${index}`}>
              <FileText size={17} />
              <div>
                <strong>{item.file.name}</strong>
                <span>{formatBytes(item.file.size)}{item.note ? ` · ${item.note}` : " · Hazırdır"}{item.status === "done" && item.startedAtMs && item.finishedAtMs ? ` · Müddət: ${formatElapsed(item.finishedAtMs - item.startedAtMs)}` : ""}</span>
                {item.status === "working" ? (
                  <ImportProgressPanel
                    progress={live}
                    fallbackMessage={item.note ?? "PDF emal olunur…"}
                    startedAtMs={item.startedAtMs}
                    nowMs={nowMs}
                    expectedQuestionCount={Number.isInteger(expectedCount) ? expectedCount : null}
                  />
                ) : (
                  <label className="caption" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 5 }}>Gözlənilən sual sayı (istəyə görə)<input className="field" type="number" min="1" max="500" value={item.expectedQuestionCount ?? ""} disabled={working} onChange={event => updateFile(index, { expectedQuestionCount: event.target.value })} style={{ width: 105, padding: "5px 7px" }} /></label>
                )}
              </div>
              {item.status === "working" ? <LoaderCircle size={16} className="animate-spin" /> : item.status === "done" ? <Check size={16} color="#3a8a70" /> : <button className="icon-button" onClick={() => setFiles(previous => previous.filter((_, fileIndex) => fileIndex !== index))} disabled={working} aria-label="Faylı sil"><X size={14} /></button>}
            </div>
          );
        })}</div>
        {uploadError && <div className="error-box" style={{ marginTop: 12 }}>{uploadError}</div>}
        <button className="btn btn-primary" onClick={uploadAndImport} disabled={working || !files.some(item => item.status === "ready" || item.status === "error")} style={{ marginTop: 15 }}><Sparkles size={14} /> {working ? "PDF emal olunur…" : "Yüklə və AI ilə təhlil et"}</button>
      </section>}

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-title-row"><div><h2>Arxivdəki imtahanlar</h2><p>Orijinal PDF mənbələri və emal vəziyyəti</p></div><Archive size={17} color="#719284" /></div>
        {archiveNotice && <div className="notice-box" style={{ marginBottom: 12 }}>{archiveNotice}</div>}
        {examsQuery.isLoading && <div className="loading-state">Arxiv yüklənir…</div>}
        {examsQuery.isError && <div className="error-box">{errorMessage(examsQuery.error)} <button className="btn btn-secondary" onClick={() => examsQuery.refetch()}>Yenidən yoxla</button></div>}
        {!examsQuery.isLoading && examsQuery.data?.length === 0 && <div className="empty-state"><div className="empty-icon"><FileText size={17} /></div><h3>PDF mənbəyi yoxdur</h3><p>İlk imtahan faylını yükləyin; mənbə sənədlər bu siyahıda qalacaq.</p></div>}
        {uploadError && <div className="error-box" style={{ marginTop: 12 }}>{uploadError}</div>}
        <div className="upload-jobs">{examsQuery.data?.map(file => {
          const isRetryingThis = retryingIds.includes(file.id);
          const isActive = isRetryingThis || file.processingStatus === "processing";
          const live = isActive ? progressByExamId.get(file.id) : undefined;
          return (
            <div className="card upload-job" key={file.id}>
              <div>
                <h3>{file.title}</h3>
                <p>{file.years?.length ? file.years.join(" · ") : file.mimeType === "application/pdf" ? "İl göstərilməyib" : "Əl ilə əlavə olunan suallar"} · {file.questionCount} sual{file.expectedQuestionCount ? ` / gözlənilən ${file.expectedQuestionCount}` : ""} · {formatBytes(file.fileSize)}</p>
                <div className="upload-job-meta">
                  <span className={`tag${file.processingStatus === "needs_review" ? " warning" : file.processingStatus === "completed" ? " success" : ""}`}>{statusLabel(isRetryingThis ? "processing" : file.processingStatus)}</span>
                  <span className="caption">{formatDate(file.createdAt)}</span>
                  {file.sourceUrl && !file.sourceUrl.startsWith("manual://") && <a href={file.sourceUrl} target="_blank" rel="noreferrer" className="file-row-link"><FileText size={12} /> PDF-i aç</a>}
                  {["failed", "uploaded", "completed", "needs_review"].includes(file.processingStatus) && (
                    <button className="btn btn-secondary" disabled={isRetryingThis} onClick={() => void retryFile(file.id)}>
                      <RotateCcw size={12} className={isRetryingThis ? "animate-spin" : undefined} /> {isRetryingThis ? "Emal olunur…" : "Yenidən emal et"}
                    </button>
                  )}
                  {file.mimeType === "application/pdf" && (
                    confirmDeleteId === file.id ? (
                      <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                        <span className="caption" style={{ color: "#a33e37", fontWeight: 700 }}>Silinsin?</span>
                        <button className="btn btn-danger" style={{ minHeight: 28, padding: "0 8px", fontSize: 10 }} disabled={deleteMutation.isPending} onClick={() => void deleteFile(file.id)}>
                          {deleteMutation.isPending ? "Silinir…" : "Bəli"}
                        </button>
                        <button className="btn btn-secondary" style={{ minHeight: 28, padding: "0 8px", fontSize: 10 }} disabled={deleteMutation.isPending} onClick={() => setConfirmDeleteId(null)}>
                          Xeyr
                        </button>
                      </span>
                    ) : (
                      <button className="btn btn-secondary" disabled={deleteMutation.isPending || isRetryingThis} onClick={() => setConfirmDeleteId(file.id)}>
                        <X size={12} /> Faylı sil
                      </button>
                    )
                  )}
                </div>
                {isActive && (
                  <ImportProgressPanel
                    progress={live}
                    fallbackMessage="Yenidən emal başladılır…"
                    startedAtMs={retryStartedAt[file.id]}
                    nowMs={nowMs}
                    expectedQuestionCount={file.expectedQuestionCount}
                  />
                )}
              </div>
              <span className="tag">{file.filename}</span>
            </div>
          );
        })}</div>
      </section>

      <AnswerKeyImportPanel />

      <section className="card card-pad" style={{ marginTop: 16 }}>
        <div className="section-title-row"><div><h2>Əl ilə sual əlavə et</h2><p>İstifadəçi seçdiyi fənn və mövzu ilə sualı arxivə daxil edə bilər.</p></div><button className="btn btn-secondary" onClick={() => setManualOpen(value => !value)}><Plus size={14} /> {manualOpen ? "Bağla" : "Sual əlavə et"}</button></div>
        {manualOpen && <form onSubmit={addManualQuestion}>
          <div className="review-edit-grid"><div><label className="field-label" htmlFor="manual-subject">Fənn</label><select id="manual-subject" className="select-field" value={subjectSlug} onChange={event => { setSubjectSlug(event.target.value as "informatika" | "mentiq"); setTopicSlug(""); setSubtopicSlug(""); }}><option value="informatika">İnformatika</option><option value="mentiq">Məntiq</option></select></div><div><label className="field-label" htmlFor="manual-topic">Mövzu</label><select id="manual-topic" className="select-field" value={topicSlug} onChange={event => { setTopicSlug(event.target.value); setSubtopicSlug(""); }} required><option value="">Mövzu seçin</option>{mainTopics.map(topic => <option key={topic.id} value={topic.slug}>{topic.numberLabel}. {topic.name}</option>)}</select></div><div><label className="field-label" htmlFor="manual-subtopic">Alt mövzu</label><select id="manual-subtopic" className="select-field" value={subtopicSlug} onChange={event => setSubtopicSlug(event.target.value)} disabled={!children.length}><option value="">Alt mövzu yoxdur</option>{children.map(topic => <option key={topic.id} value={topic.slug}>{topic.numberLabel}. {topic.name}</option>)}</select></div></div>
          <div className="review-edit-grid" style={{ gridTemplateColumns: "1fr 1fr" }}><div><label className="field-label" htmlFor="manual-year">İmtahan ili (istəyə görə)</label><input id="manual-year" className="field" type="number" min="1900" max="2100" value={year} onChange={event => setYear(event.target.value)} /></div><div><label className="field-label" htmlFor="manual-number">Sual nömrəsi (istəyə görə)</label><input id="manual-number" className="field" type="number" min="1" value={number} onChange={event => setNumber(event.target.value)} /></div></div>
          <div style={{ marginTop: 12 }}><label className="field-label" htmlFor="manual-question">Sualın mətni</label><textarea id="manual-question" className="text-field" required value={questionText} onChange={event => setQuestionText(event.target.value)} /></div>
          <div className="review-edit-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>{options.map((option, index) => <div key={option.label}><label className="field-label" htmlFor={`manual-option-${option.label}`}>Variant {option.label}</label><input id={`manual-option-${option.label}`} className="field" value={option.text} onChange={event => setOptions(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, text: event.target.value } : row))} /></div>)}</div>
          {manualMessage && <div className={manualMutation.isError ? "error-box" : "notice-box"} style={{ marginTop: 12 }}>{manualMessage}</div>}
          <div className="notice-box" style={{ marginTop: 12 }}><CircleHelp size={14} style={{ display: "inline", verticalAlign: "-3px", marginRight: 5 }} /> Mənbə göstərilmədiyi üçün cavab açarı boş qalacaq. PDF-dən gələn suallarla eyni məzmunlu sual təkrar kimi rədd edilir.</div>
          <button type="submit" className="btn btn-primary" disabled={manualMutation.isPending || !topicSlug} style={{ marginTop: 13 }}>{manualMutation.isPending ? "Saxlanır…" : "Sualı saxla"} <Check size={14} /></button>
        </form>}
      </section>
      {exportError && <div className="error-box" style={{ marginTop: 12 }}>{exportError}</div>}
    </AppShell>
  );
}

function ImportProgressPanel({
  progress,
  fallbackMessage,
  startedAtMs,
  nowMs,
  expectedQuestionCount,
}: {
  progress?: LiveImportProgress;
  fallbackMessage: string;
  startedAtMs?: number;
  nowMs: number;
  expectedQuestionCount?: number | null;
}) {
  const pct = progress?.progress ?? 4;
  const serverStartMs = progress?.startedAt ? Date.parse(progress.startedAt) : NaN;
  const effectiveStartMs = Number.isFinite(serverStartMs) ? serverStartMs : (startedAtMs ?? nowMs);
  const elapsedMs = Math.max(0, nowMs - effectiveStartMs);
  const expected = progress?.expectedQuestionCount ?? expectedQuestionCount ?? null;
  const detected = progress?.detectedQuestionCount ?? 0;
  const processed = progress?.processedQuestionCount ?? 0;
  const inserted = progress?.insertedCount ?? 0;
  const duplicates = progress?.skippedDuplicateCount ?? 0;
  const needsReview = progress?.needsReviewCount ?? 0;
  const stageText = stageLabel(progress?.stage ?? "preparing_pdf");
  const message = progress?.message || fallbackMessage;

  return (
    <div className="import-progress-panel" aria-live="polite">
      <div className="import-progress-head">
        <span className="import-progress-stage">
          <LoaderCircle size={13} className="animate-spin" />
          {stageText}
        </span>
        <span className="import-progress-nums">
          <span>Keçən vaxt: {formatElapsed(elapsedMs)}</span>
          <span aria-hidden="true">·</span>
          <strong>{pct}%</strong>
        </span>
      </div>
      <div className="import-progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="import-progress-fill" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <p className="import-progress-message">{message}</p>
      <div className="import-progress-metrics">
        <span>
          Oxunan sual: <strong>{detected}{expected ? ` / ${expected}` : ""}</strong>
        </span>
        {(processed > 0 || progress?.stage === "saving" || progress?.stage === "syncing_cloud") && (
          <span>
            Emal olunan: <strong>{processed} / {detected}</strong>
          </span>
        )}
        {(inserted > 0 || processed > 0) && (
          <span>
            Saxlanılan: <strong>{inserted}</strong>
          </span>
        )}
        {duplicates > 0 && (
          <span>
            Təkrar: <strong>{duplicates}</strong>
          </span>
        )}
        {needsReview > 0 && (
          <span>
            Yoxlanış: <strong>{needsReview}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function stageLabel(stage: string) {
  return ({
    queued: "Növbədədir",
    preparing_pdf: "PDF hazırlanır",
    uploading_to_ai: "AI-a göndərilir",
    extracting: "Suallar oxunur",
    saving: "Bazaya yazılır",
    syncing_cloud: "Bulud bazasına yazılır",
    completed: "Tamamlandı",
    needs_review: "Yoxlanış lazımdır",
    failed: "Xəta",
  } as Record<string, string>)[stage] ?? "Emal olunur";
}

function statusLabel(status: string) {
  return ({ uploaded: "Yükləndi", processing: "Emal olunur", completed: "Tamamlandı", needs_review: "Yoxlanış lazımdır", failed: "Xəta" } as Record<string, string>)[status] ?? status;
}
