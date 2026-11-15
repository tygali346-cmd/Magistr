import { ExternalLink, FileText, PencilLine } from "lucide-react";
import { Link } from "wouter";
import ExpandableText from "@/components/ExpandableText";
import QuestionMediaBlock, { ZoomableMediaImage, isMediaImage } from "@/components/QuestionMediaBlock";
import type { QuestionRecord } from "@/lib/study";

type Props = { question: QuestionRecord; compact?: boolean };

export default function QuestionCard({ question, compact = false }: Props) {
  return (
    <article className="question-card">
      {question.sourceUrl && !question.sourceUrl.startsWith("manual://") && <div className="question-pdf-sticky"><a className="btn btn-secondary question-pdf-button" href={question.sourcePage ? `${question.sourceUrl}#page=${question.sourcePage}` : question.sourceUrl} target="_blank" rel="noreferrer"><FileText size={14} /> PDF yüklə</a></div>}
      <div className="question-card-head">
        <div className="question-tags">
          <span className="question-number">{question.examYear ?? "İl məlum deyil"} · Sual {question.questionNumber ?? "—"}</span>
          {question.topicName && <span className="tag">{question.topicNumber}. {question.topicName}</span>}
          {question.reviewStatus === "needs_review" && <span className="tag warning">Yoxlanış tələb edir</span>}
        </div>
        <div className="question-actions">
          {!compact && <Link href={`/questions/${question.id}`} className="icon-button" aria-label="Sualı aç"><ExternalLink size={15} /></Link>}
          <Link href={`/review?question=${question.id}`} className="icon-button" aria-label="Sualı yoxla"><PencilLine size={15} /></Link>
        </div>
      </div>
      <ExpandableText text={question.originalText} />
      {question.correctionSuggestion && (
        <div className="review-status-note"><strong>OCR düzəliş təklifi:</strong> {question.correctionSuggestion}</div>
      )}
      {question.media?.map((media, index) => <QuestionMediaBlock media={media} questionNumber={question.questionNumber} key={`${media.kind}-${index}`} />)}
      {question.options.length > 0 && (
        <div className="question-options">
          {question.options.map(option => {
            const optionMedias = (question.media ?? []).filter(
              m => m.role === "option" && m.optionLabel?.toLowerCase() === option.label.toLowerCase(),
            );
            return (
              <div className="option-line" key={option.id}>
                <span className="option-line-label">{option.label}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {option.optionText && <span>{option.optionText}</span>}
                  {optionMedias.map((optionMedia, idx) =>
                    isMediaImage(optionMedia) ? (
                      <ZoomableMediaImage
                        key={idx}
                        src={optionMedia.value}
                        alt={`Sual ${question.questionNumber ?? ""} şəkli`}
                        compact
                      />
                    ) : (
                      <pre key={idx} className="caption">{optionMedia.value}</pre>
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!compact && question.reviewNote && <p className="review-status-note">{question.reviewNote}</p>}
      <div className="question-source">
        <span>{question.sourceTitle || question.sourceFilename || "Mənbə göstərilməyib"}</span>
        {question.sourcePage && <span>Səhifə {question.sourcePage}</span>}
        {question.sourceUrl?.startsWith("manual://") && <span>Əl ilə əlavə olunub</span>}
      </div>
    </article>
  );
}
