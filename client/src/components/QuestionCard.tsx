import { ExternalLink, FileText, PencilLine } from "lucide-react";
import { Link } from "wouter";
import ExpandableText from "@/components/ExpandableText";
import QuestionMediaBlock from "@/components/QuestionMediaBlock";
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
          {question.hasVerifiedAnswer ? <span className="tag success">Mənbəli cavab mövcuddur</span> : <span className="tag">Cavab açarı yoxdur</span>}
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
      {question.options.length > 0 && (
        <div className="question-options">
          {question.options.map(option => (
            <div className="option-line" key={option.id}>
              <span className="option-line-label">{option.label}</span><span>{option.optionText}</span>
            </div>
          ))}
        </div>
      )}
      {question.media?.map((media, index) => <QuestionMediaBlock media={media} key={`${media.kind}-${index}`} />)}
      {!compact && question.reviewNote && <p className="review-status-note">{question.reviewNote}</p>}
      <div className="question-source">
        <span>{question.sourceTitle || question.sourceFilename || "Mənbə göstərilməyib"}</span>
        {question.sourcePage && <span>Səhifə {question.sourcePage}</span>}
        {!question.hasVerifiedAnswer && <span>Cavab yoxlanışı deaktivdir</span>}
        {question.sourceUrl?.startsWith("manual://") && <span>Əl ilə əlavə olunub</span>}
      </div>
    </article>
  );
}
