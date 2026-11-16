import { useRef, useState } from "react";
import { Crop, ImagePlus, Trash2, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { errorMessage, type QuestionRecord } from "@/lib/study";
import { type QuestionMediaItem } from "./QuestionMediaBlock";

type ReviewMediaManagerProps = {
  question: {
    id: number;
    examFileId: number;
    sourceUrl: string | null;
    sourcePage: number | null;
    sourceFingerprint: string;
    questionNumber: number | null;
    media: QuestionRecord["media"];
  };
  onMediaChanged: () => Promise<unknown> | void;
};

export default function ReviewMediaManager({ question, onMediaChanged }: ReviewMediaManagerProps) {
  const mediaList = (question.media ?? []) as QuestionMediaItem[];
  const hasPdf = Boolean(question.sourceUrl && !question.sourceUrl.startsWith("manual://"));
  const [cropTargetIdx, setCropTargetIdx] = useState<number | null>(null);
  const [cropPage, setCropPage] = useState<number>(question.sourcePage ?? 1);
  const [bbox, setBbox] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0.1, y: 0.1, w: 0.8, h: 0.35 });
  const [mediaMessage, setMediaMessage] = useState("");
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const recropMutation = trpc.questionBank.recropQuestionMedia.useMutation({
    onSuccess: async () => {
      setCropTargetIdx(null);
      setMediaMessage("Kəsim yeniləndi.");
      await onMediaChanged();
    },
    onError: err => setMediaMessage(errorMessage(err)),
  });
  const replaceMutation = trpc.questionBank.replaceQuestionMedia.useMutation({
    onSuccess: async () => {
      setMediaMessage("Şəkil əvəz olundu.");
      await onMediaChanged();
    },
    onError: err => setMediaMessage(errorMessage(err)),
  });
  const deleteMutation = trpc.questionBank.deleteQuestionMedia.useMutation({
    onSuccess: async () => {
      setCropTargetIdx(null);
      setMediaMessage("Şəkil silindi.");
      await onMediaChanged();
    },
    onError: err => setMediaMessage(errorMessage(err)),
  });

  function openCropEditor(idx: number) {
    const item = idx >= 0 ? mediaList[idx] : undefined;
    setCropPage(item?.sourcePage ?? question.sourcePage ?? 1);
    setBbox(item?.bbox ?? { x: 0.1, y: 0.15, w: 0.8, h: 0.3 });
    setCropTargetIdx(idx);
    setMediaMessage("");
  }

  function handleFilePick(idx: number, file: File | undefined) {
    if (!file) return;
    setMediaMessage("");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;
      const item = idx >= 0 ? mediaList[idx] : undefined;
      replaceMutation.mutate({
        questionId: question.id,
        mediaIndex: idx,
        dataUrl,
        role: item?.role ?? "question",
        optionLabel: item?.optionLabel ?? null,
        label: item?.label ?? null,
      });
    };
    reader.readAsDataURL(file);
  }

  function relativeCoords(clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const pt = relativeCoords(event.clientX, event.clientY);
    dragStartRef.current = pt;
    setBbox({ x: pt.x, y: pt.y, w: 0.03, h: 0.03 });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start) return;
    const pt = relativeCoords(event.clientX, event.clientY);
    const x = Math.min(start.x, pt.x);
    const y = Math.min(start.y, pt.y);
    const w = Math.max(0.025, Math.abs(pt.x - start.x));
    const h = Math.max(0.025, Math.abs(pt.y - start.y));
    setBbox({ x, y, w: Math.min(1 - x, w), h: Math.min(1 - y, h) });
  }

  function onPointerUp() {
    dragStartRef.current = null;
  }

  const busy = recropMutation.isPending || replaceMutation.isPending || deleteMutation.isPending;

  return (
    <div className="review-media-panel">
      <div className="review-media-head">
        <strong>Şəkillər və kəsim</strong>
        <div className="review-media-actions">
          {hasPdf && (
            <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => openCropEditor(-1)}>
              <Crop size={12} /> PDF-dən yeni kəs
            </button>
          )}
          <label className="btn btn-secondary btn-xs" style={{ cursor: "pointer" }}>
            <ImagePlus size={12} /> Yeni şəkil yüklə
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              disabled={busy}
              onChange={event => {
                handleFilePick(-1, event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {mediaList.length > 0 && (
        <div className="review-media-list">
          {mediaList.map((item, idx) => (
            <div className="review-media-row" key={idx}>
              <span className="caption">
                #{idx + 1} · {item.role === "option" && item.optionLabel ? `Variant ${item.optionLabel}` : (item.label || item.kind)}
                {item.sourcePage ? ` · səh. ${item.sourcePage}` : ""}
              </span>
              <div className="review-media-actions">
                {hasPdf && (
                  <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => openCropEditor(idx)}>
                    <Crop size={12} /> Kəsimi düzəlt
                  </button>
                )}
                <label className="btn btn-secondary btn-xs" style={{ cursor: "pointer" }}>
                  <Upload size={12} /> Əvəz et
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    disabled={busy}
                    onChange={event => {
                      handleFilePick(idx, event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  disabled={busy}
                  onClick={() => deleteMutation.mutate({ questionId: question.id, mediaIndex: idx })}
                >
                  <Trash2 size={12} /> Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {cropTargetIdx !== null && hasPdf && (
        <div className="media-crop-editor">
          <div className="media-crop-toolbar">
            <label className="caption">
              Səhifə:
              <input
                type="number"
                min={1}
                max={500}
                value={cropPage}
                onChange={event => setCropPage(Math.max(1, Number(event.target.value) || 1))}
                className="field"
                style={{ width: 72, marginLeft: 6, padding: "4px 8px" }}
              />
            </label>
            <span className="caption">PDF səhifəsi üzərində kəsim qutusunu sürükləyin</span>
            <div className="review-media-actions">
              <button
                type="button"
                className="btn btn-primary btn-xs"
                disabled={busy}
                onClick={() => recropMutation.mutate({ questionId: question.id, mediaIndex: cropTargetIdx, pageNumber: cropPage, bbox })}
              >
                {recropMutation.isPending ? "Kəsilir…" : "Kəsimi tətbiq et"}
              </button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => setCropTargetIdx(null)}>
                Bağla
              </button>
            </div>
          </div>
          <div
            ref={stageRef}
            className="media-crop-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <img
              src={`/api/admin/exam-files/${question.examFileId}/pages/${cropPage}`}
              alt={`Sual ${question.questionNumber ?? ""} səhifə ${cropPage}`}
              draggable={false}
            />
            <div
              className="media-crop-box"
              style={{
                left: `${bbox.x * 100}%`,
                top: `${bbox.y * 100}%`,
                width: `${bbox.w * 100}%`,
                height: `${bbox.h * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {mediaMessage && <p className="caption" style={{ marginTop: 6 }}>{mediaMessage}</p>}
    </div>
  );
}
