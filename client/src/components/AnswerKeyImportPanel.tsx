import { useState } from "react";
import { AlertTriangle, Check, FileKey2, FileText, LoaderCircle, ShieldCheck, UploadCloud, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { errorMessage, formatBytes, formatDate } from "@/lib/study";

const MAX_ANSWER_KEY_BYTES = 40 * 1024 * 1024;

export default function AnswerKeyImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [subjectSlug, setSubjectSlug] = useState<"informatika" | "mentiq">("informatika");
  const [yearsText, setYearsText] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedQuestions, setSelectedQuestions] = useState<Record<number, number>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string>>({});
  const [replaceExisting, setReplaceExisting] = useState<Record<number, boolean>>({});
  const utils = trpc.useUtils();
  const filesQuery = trpc.answerKeys.files.useQuery();
  const queueQuery = trpc.answerKeys.reviewQueue.useQuery();
  const processMutation = trpc.answerKeys.processPdf.useMutation();
  const retryMutation = trpc.answerKeys.retryPdf.useMutation();
  const approveMutation = trpc.answerKeys.approveEntry.useMutation();
  const dismissMutation = trpc.answerKeys.dismissEntry.useMutation();
  const busy = processMutation.isPending || retryMutation.isPending || approveMutation.isPending || dismissMutation.isPending;

  function chooseFile(candidate: File | null) {
    setError("");
    setMessage("");
    if (!candidate) { setFile(null); return; }
    if (!candidate.name.toLowerCase().endsWith(".pdf") || (candidate.type && candidate.type !== "application/pdf")) {
      setError("Cavab açarı üçün yalnız PDF faylı qəbul olunur.");
      setFile(null);
      return;
    }
    if (candidate.size > MAX_ANSWER_KEY_BYTES) {
      setError("Cavab açarı PDF-i 40 MB limitindən böyükdür.");
      setFile(null);
      return;
    }
    setFile(candidate);
  }

  async function refreshAnswerKeyData() {
    await Promise.all([
      utils.answerKeys.files.invalidate(),
      utils.answerKeys.reviewQueue.invalidate(),
      utils.questionBank.dashboard.invalidate(),
      utils.questionBank.questions.invalidate(),
      utils.questionBank.question.invalidate(),
      utils.questionBank.practiceQuestions.invalidate(),
    ]);
  }

  async function uploadAndProcess() {
    if (!file || busy) return;
    setError("");
    setMessage("");
    try {
      const years = yearsText.split(/[\s,;]+/).filter(Boolean).map(Number);
      const response = await fetch("/api/import/answer-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "x-original-filename": encodeURIComponent(file.name),
          "x-answer-subject": subjectSlug,
          ...(years.length ? { "x-exam-years": years.join(",") } : {}),
        },
        body: file,
      });
      let uploaded: {
        answerKeyFileId?: number;
        duplicate?: boolean;
        processingStatus?: string;
        entryCount?: number;
        error?: string;
      };
      try {
        uploaded = JSON.parse(await response.text()) as typeof uploaded;
      } catch {
        if (response.status === 413) throw new Error("Cavab açarı PDF-i 40 MB limitindən böyükdür.");
        throw new Error("Serverin upload cavabı oxunmadı; fayl və şəbəkəni yoxlayıb yenidən cəhd edin.");
      }
      if (!response.ok) throw new Error(uploaded.error || (response.status === 413 ? "Cavab açarı PDF-i 40 MB limitindən böyükdür." : "Cavab açarı PDF-i yüklənmədi."));
      if (!uploaded.answerKeyFileId) throw new Error("Server cavab açarı PDF-i üçün qeyd identifikatoru qaytarmadı.");

      if (uploaded.duplicate && uploaded.processingStatus !== "uploaded" && uploaded.processingStatus !== "failed") {
        setMessage(`Eyni PDF artıq arxivdədir (${uploaded.entryCount ?? 0} cavab sətri). Mövcud vəziyyət: ${statusLabel(uploaded.processingStatus ?? "unknown")}.`);
      } else {
        const result = uploaded.duplicate
          ? await retryMutation.mutateAsync({ answerKeyFileId: uploaded.answerKeyFileId })
          : await processMutation.mutateAsync({ answerKeyFileId: uploaded.answerKeyFileId });
        setMessage(`${result.applied} cavab avtomatik tətbiq edildi · ${result.alreadySet} eyni cavab əvvəldən vardı · ${result.openCount} sətir yoxlanışdadır. ${result.unmatched ? `${result.unmatched} uyğun sual tapılmadı.` : ""}${result.conflicts ? ` ${result.conflicts} mövcud cavabla ziddiyyətlidir.` : ""}`);
      }
      setFile(null);
      await refreshAnswerKeyData();
      void filesQuery.refetch();
      void queueQuery.refetch();
    } catch (cause) {
      setError(errorMessage(cause, "Cavab açarı PDF-i emal edilmədi."));
      void filesQuery.refetch();
    }
  }

  async function confirmEntry(entry: NonNullable<typeof queueQuery.data>[number], questionId: number, correctOption: string) {
    const question = entry.candidateQuestions.find(candidate => candidate.id === questionId);
    if (!question) return;
    const replace = Boolean(replaceExisting[entry.id]);
    if (question.correctOption && question.correctOption !== correctOption && replace) {
      const confirmed = window.confirm(`Mövcud “${question.correctOption}” cavabı “${correctOption}” ilə əvəz edilsin?`);
      if (!confirmed) return;
    }
    setError("");
    try {
      await approveMutation.mutateAsync({
        entryId: entry.id,
        questionId,
        correctOption,
        expectedCurrentOption: question.correctOption,
        replaceExisting: replace,
      });
      setMessage(`Sual ${entry.examYear ?? "—"} · ${entry.questionNumber ?? "—"} üçün cavab mənbə ilə təsdiqləndi.`);
      await refreshAnswerKeyData();
    } catch (cause) {
      setError(errorMessage(cause, "Cavab açarını təsdiqləmək alınmadı."));
      void queueQuery.refetch();
    }
  }

  async function dismissEntry(entryId: number) {
    setError("");
    try {
      await dismissMutation.mutateAsync({ entryId });
      setMessage("Sətir yoxlanış növbəsindən bağlandı; mənbə qeydi saxlanılıb.");
      await refreshAnswerKeyData();
    } catch (cause) {
      setError(errorMessage(cause, "Sətiri bağlamaq alınmadı."));
    }
  }

  return (
    <section className="card card-pad answer-key-panel" aria-labelledby="answer-key-title">
      <div className="section-title-row">
        <div><h2 id="answer-key-title">Cavab açarı PDF-i</h2><p>İmtahan PDF-indən ayrı yükləyin; AI yalnız çap olunmuş cavabları oxuyur, sualı həll etmir.</p></div>
        <FileKey2 size={18} color="#719284" />
      </div>
      <div className="answer-key-safety"><ShieldCheck size={16} /><span>Cavab açarı PDF-i verilənlər bazasında ayrıca qorunur və yalnız admin girişli marşrutla açılır. Yalnız dəqiq unikal uyğunluq və ən azı 95% əminlik olduqda avtomatik tətbiq edilir.</span></div>

      <div className="answer-key-upload-form">
        <div className="filter-field"><label htmlFor="answer-key-file">Cavab açarı PDF-i</label><input id="answer-key-file" className="field" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={event => { chooseFile(event.target.files?.[0] ?? null); event.target.value = ""; }} /></div>
        <div className="filter-field"><label htmlFor="answer-key-subject">Fənn</label><select id="answer-key-subject" className="select-field" value={subjectSlug} disabled={busy} onChange={event => setSubjectSlug(event.target.value as "informatika" | "mentiq")}><option value="informatika">İnformatika</option><option value="mentiq">Məntiq</option></select></div>
        <div className="filter-field"><label htmlFor="answer-key-years">İmtahan ili (istəyə görə)</label><input id="answer-key-years" className="field" placeholder="2010 və ya 2010, 2011" value={yearsText} disabled={busy} onChange={event => setYearsText(event.target.value)} /></div>
      </div>
      {file && <div className="answer-key-picked-file"><FileText size={15} /><span>{file.name} · {formatBytes(file.size)}</span><button className="icon-button" type="button" aria-label="Seçilmiş faylı sil" disabled={busy} onClick={() => setFile(null)}><X size={14} /></button></div>}
      <p className="caption answer-key-help">İl PDF-də yazılmayıbsa bir il göstəricisi verin. Cavab işarəsi variantlarla uyğun gəlməsə, eyni nömrəli birdən çox sual tapsa və ya AI əminliyi 95%-dən aşağı olsa, sistem onu avtomatik yazmayacaq. Fayl limiti: 40 MB.</p>
      {error && <div className="error-box answer-key-feedback" role="alert">{error}</div>}
      {message && <div className="notice-box answer-key-feedback" role="status">{message}</div>}
      <button className="btn btn-primary" type="button" onClick={() => void uploadAndProcess()} disabled={!file || busy}>
        {busy ? <LoaderCircle size={15} className="animate-spin" /> : <UploadCloud size={15} />}{busy ? "Cavab açarı emal olunur…" : "Yüklə və uyğunlaşdır"}
      </button>

      <div className="answer-key-files">
        <h3>Yüklənmiş cavab açarları</h3>
        {filesQuery.isLoading && <div className="loading-state">Cavab açarı arxivi yüklənir…</div>}
        {filesQuery.isError && <div className="error-box">{errorMessage(filesQuery.error)} <button className="btn btn-secondary" onClick={() => void filesQuery.refetch()}>Yenidən yoxla</button></div>}
        {filesQuery.data?.map(item => <div className="answer-key-file-row" key={item.id}>
          <FileKey2 size={15} />
          <div className="answer-key-file-copy"><strong>{item.filename}</strong><span>{item.subjectName} · {item.years.length ? item.years.join(", ") : "İl PDF-dən müəyyən edilir"} · {item.entryCount} sətir · {formatBytes(item.fileSize)}</span><span className="caption">{item.statusMessage || statusLabel(item.processingStatus)} · {formatDate(item.createdAt)}</span></div>
          <span className={`tag${item.processingStatus === "needs_review" ? " warning" : item.processingStatus === "completed" ? " success" : ""}`}>{statusLabel(item.processingStatus)}</span>
          <a className="btn btn-secondary answer-key-open" href={`/api/admin/answer-keys/${item.id}/pdf`} target="_blank" rel="noreferrer"><FileText size={13} /> PDF-i aç</a>
        </div>)}
        {!filesQuery.isLoading && !filesQuery.isError && filesQuery.data?.length === 0 && <div className="empty-state"><div className="empty-icon"><FileKey2 size={17} /></div><h3>Cavab açarı yüklənməyib</h3><p>Cavab açarı PDF-i yüklənəndə mənbə məlumatı və uyğunlaşdırma nəticələri burada qalacaq.</p></div>}
      </div>

      <div className="answer-key-review">
        <div className="section-title-row"><div><h3>Yoxlanmalı cavab sətrləri</h3><p>Avtomatik tətbiq edilməyən uyğunluqlar burada saxlanır.</p></div><AlertTriangle size={17} color="#9a7b34" /></div>
        {queueQuery.isLoading && <div className="loading-state">Cavab uyğunluqları yüklənir…</div>}
        {queueQuery.isError && <div className="error-box">{errorMessage(queueQuery.error)} <button className="btn btn-secondary" onClick={() => void queueQuery.refetch()}>Yenidən yoxla</button></div>}
        {!queueQuery.isLoading && !queueQuery.isError && queueQuery.data?.length === 0 && <p className="answer-key-empty">Yoxlanmalı cavab açarı sətri yoxdur.</p>}
        <div className="answer-key-review-list">{queueQuery.data?.map(entry => {
          const targetId = selectedQuestions[entry.id] ?? entry.matchedQuestionId ?? entry.candidateQuestionIds[0] ?? 0;
          const question = entry.candidateQuestions.find(candidate => candidate.id === targetId);
          const optionValue = selectedOptions[entry.id] ?? (question?.options.some(option => option.label === entry.suggestedOption) ? entry.suggestedOption ?? "" : "");
          const hasConflict = Boolean(question?.correctOption && question.correctOption !== optionValue);
          const canConfirm = Boolean(question && optionValue && (!hasConflict || replaceExisting[entry.id]));
          return <article className="answer-key-review-card" key={entry.id}>
            <div className="answer-key-entry-head"><strong>{entry.examYear ?? "İl məlum deyil"} · Sual {entry.questionNumber ?? "—"} · çıxarılan cavab “{entry.answerToken || "—"}”</strong><span className={`tag${entry.status === "conflict" || entry.status === "ambiguous" ? " warning" : ""}`}>{statusLabel(entry.status)} · {Math.round(entry.confidence * 100)}%</span></div>
            <p className="caption">{entry.subjectName} · {entry.filename}{entry.sourcePage ? ` · PDF səhifə ${entry.sourcePage}` : " · səhifə müəyyən edilməyib"}</p>
            {entry.reviewNote && <div className="answer-key-note">{entry.reviewNote}</div>}
            <a className="file-row-link answer-key-source-link" href={`/api/admin/answer-keys/${entry.answerKeyFileId}/pdf${entry.sourcePage ? `#page=${entry.sourcePage}` : ""}`} target="_blank" rel="noreferrer"><FileText size={13} /> Cavab mənbəsinin səhifəsini aç</a>
            {entry.candidateQuestions.length > 0 ? <>
              {entry.candidateQuestions.length > 1 && <div className="filter-field answer-key-target"><label htmlFor={`answer-target-${entry.id}`}>Uyğun sualı seçin</label><select id={`answer-target-${entry.id}`} className="select-field" value={question?.id ?? ""} onChange={event => { const id = Number(event.target.value); setSelectedQuestions(previous => ({ ...previous, [entry.id]: id })); setSelectedOptions(previous => ({ ...previous, [entry.id]: "" })); setReplaceExisting(previous => ({ ...previous, [entry.id]: false })); }}><option value="">Sual seçin</option>{entry.candidateQuestions.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.examYear} · Sual {candidate.questionNumber} · #{candidate.id}</option>)}</select></div>}
              {question && <div className="answer-key-match"><strong>Uyğun sual #{question.id}</strong><p>{question.originalText}</p><div className="answer-key-options">{question.options.map(option => <label className="answer-key-option" key={option.label}><input type="radio" name={`answer-option-${entry.id}`} checked={optionValue === option.label} disabled={busy} onChange={() => setSelectedOptions(previous => ({ ...previous, [entry.id]: option.label }))} /><span><b>{option.label}</b> · {option.optionText}</span></label>)}</div>
                {question.correctOption && question.correctOption !== optionValue && <label className="answer-key-replace"><input type="checkbox" checked={Boolean(replaceExisting[entry.id])} disabled={busy} onChange={event => setReplaceExisting(previous => ({ ...previous, [entry.id]: event.target.checked }))} /> Mövcud “{question.correctOption}” cavabını əvəz etməyə icazə verirəm.</label>}
                <div className="answer-key-review-actions"><button className="btn btn-primary" disabled={!canConfirm || busy} onClick={() => void confirmEntry(entry, question.id, optionValue)}>{approveMutation.isPending ? "Təsdiqlənir…" : "Cavabı təsdiqlə"} <Check size={14} /></button><button className="btn btn-quiet" disabled={busy} onClick={() => void dismissEntry(entry.id)}>Yoxlanışı bağla</button></div>
              </div>}
            </> : <div className="answer-key-no-match">Bu il və nömrəyə uyğun sual bazada yoxdur. Avtomatik tətbiq edilmədi; fayl və cavab qeydi saxlanılıb.</div>}
          </article>;
        })}</div>
      </div>
    </section>
  );
}

function statusLabel(status: string) {
  return ({ uploaded: "Yükləndi", processing: "Emal olunur", completed: "Tamamlandı", needs_review: "Yoxlanış lazımdır", failed: "Xəta", applied: "Tətbiq edildi", already_set: "Əvvəldən mövcud idi", unmatched: "Uyğun sual tapılmadı", ambiguous: "Bir neçə uyğunluq", conflict: "Cavab ziddiyyəti", dismissed: "Bağlandı" } as Record<string, string>)[status] ?? status;
}
