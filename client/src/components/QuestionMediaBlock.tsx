import { useState } from "react";
import type { QuestionRecord } from "@/lib/study";

type QuestionMedia = NonNullable<QuestionRecord["media"]>[number];

export default function QuestionMediaBlock({ media, questionNumber }: { media: QuestionMedia; questionNumber?: number | null }) {
  const [zoomed, setZoomed] = useState(false);
  const label = media.label || (media.kind === "table" ? "Cədvəl" : media.kind === "formula" ? "Düstur" : "Şəkil");
  const isTable = media.kind === "table";
  const isImage = media.kind === "image" || media.kind === "diagram" || media.value?.startsWith("http") || media.value?.startsWith("/") || media.value?.includes("qebulfit/media");

  if (media.role === "option") {
    return null;
  }

  return (
    <>
      <div className={`question-media${isTable ? " question-media-table" : ""}`}>
        <strong>{label}</strong>
        {isTable ? (
          <div className="question-table-scroll" role="region" aria-label={`${label} — üfüqi sürüşdürün`} tabIndex={0}>
            <pre>{media.value}</pre>
          </div>
        ) : isImage ? (
          <div className="question-media-image-wrap">
            <img
              src={media.value}
              alt={media.label || `Sual ${questionNumber ?? ""} şəkli`}
              loading="lazy"
              className="question-media-img"
              onClick={() => setZoomed(true)}
            />
            <span className="caption" style={{ display: "block", marginTop: 4 }}>Böyütmək üçün toxun</span>
          </div>
        ) : (
          <pre>{media.value}</pre>
        )}
      </div>

      {zoomed && isImage && (
        <div className="media-lightbox" onClick={() => setZoomed(false)}>
          <div className="media-lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="media-lightbox-close" onClick={() => setZoomed(false)}>×</button>
            <img src={media.value} alt={media.label || `Sual ${questionNumber ?? ""} şəkli`} />
          </div>
        </div>
      )}
    </>
  );
}
