import { useState } from "react";
import { ZoomIn } from "lucide-react";
import type { QuestionRecord } from "@/lib/study";

export type QuestionMediaItem = NonNullable<QuestionRecord["media"]>[number];

export function isMediaImage(media: QuestionMediaItem) {
  return (
    media.kind === "image" ||
    media.kind === "diagram" ||
    media.value.startsWith("/api/storage/") ||
    media.value.startsWith("http://") ||
    media.value.startsWith("https://") ||
    media.value.startsWith("data:image/")
  );
}

export function ZoomableMediaImage({
  src,
  alt,
  compact = false,
}: {
  src: string;
  alt: string;
  compact?: boolean;
}) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <div className={compact ? "question-option-image-wrap" : "question-media-image-wrap"}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={compact ? "question-option-img" : "question-media-img"}
          onClick={event => {
            event.stopPropagation();
            setZoomed(true);
          }}
        />
        <button
          type="button"
          className="media-zoom-chip"
          aria-label={`${alt} — böyüt`}
          onClick={event => {
            event.stopPropagation();
            setZoomed(true);
          }}
        >
          <ZoomIn size={12} /> Böyüt
        </button>
      </div>

      {zoomed && (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={event => {
            event.stopPropagation();
            setZoomed(false);
          }}
        >
          <div className="media-lightbox-content" onClick={event => event.stopPropagation()}>
            <button
              type="button"
              className="media-lightbox-close"
              aria-label="Bağla"
              onClick={() => setZoomed(false)}
            >
              ×
            </button>
            <img src={src} alt={alt} />
          </div>
        </div>
      )}
    </>
  );
}

export default function QuestionMediaBlock({
  media,
  questionNumber,
}: {
  media: QuestionMediaItem;
  questionNumber?: number | null;
}) {
  if (media.role === "option") {
    return null;
  }

  const label =
    media.label ||
    (media.kind === "table" ? "Cədvəl" : media.kind === "formula" ? "Düstur" : "Şəkil");
  const isTable = media.kind === "table" && !isMediaImage(media);
  const isImage = isMediaImage(media);
  const altText = questionNumber ? `Sual ${questionNumber} şəkli` : "Sual şəkli";

  return (
    <div className={`question-media${isTable ? " question-media-table" : ""}`}>
      <strong>{label}</strong>
      {isTable ? (
        <div
          className="question-table-scroll"
          role="region"
          aria-label={`${label} — üfüqi sürüşdürün`}
          tabIndex={0}
        >
          <pre>{media.value}</pre>
        </div>
      ) : isImage ? (
        <ZoomableMediaImage src={media.value} alt={altText} />
      ) : (
        <pre>{media.value}</pre>
      )}
    </div>
  );
}
