export type AnswerKeyStatus =
  | "applied"
  | "already_set"
  | "needs_review"
  | "unmatched"
  | "ambiguous"
  | "conflict"
  | "dismissed";

export const ANSWER_KEY_SUGGESTION_THRESHOLD = 0.95;

export type AnswerKeyCandidate = {
  id: number;
  correctOption: string | null;
  correctAnswerSource?: string | null;
  options: { label: string }[];
};

export type AnswerKeyClassification = {
  status: Exclude<AnswerKeyStatus, "applied" | "dismissed">;
  matchedQuestionId: number | null;
  candidateQuestionIds: number[];
  suggestedOption: string | null;
  reviewNote: string | null;
};

export function normalizeAnswerToken(value: string): string {
  return value.trim().replace(/^[\s([{]+|[\s)\]}.:;,]+$/g, "").toUpperCase();
}

export function classifyAnswerKeyEntry(input: {
  examYear: number | null;
  questionNumber: number | null;
  answerToken: string;
  confidence: number;
  candidates: AnswerKeyCandidate[];
  yearWasPrinted?: boolean;
  duplicateInSource?: boolean;
  yearOutsideHint?: boolean;
  extractionIncomplete?: boolean;
  rowWarning?: string | null;
}): AnswerKeyClassification {
  const candidateQuestionIds = input.candidates.map(candidate => candidate.id);
  const base = {
    matchedQuestionId: input.candidates.length === 1 ? input.candidates[0]!.id : null,
    candidateQuestionIds,
    suggestedOption: null as string | null,
  };

  if (input.examYear === null || input.questionNumber === null) {
    return { ...base, status: "unmatched", reviewNote: "İl və ya sual nömrəsi dəqiq çıxarılmayıb." };
  }
  if (input.candidates.length === 0) {
    return { ...base, status: "unmatched", reviewNote: "Bu fənn, il və sual nömrəsi üçün bazada dəqiq uyğun sual tapılmadı." };
  }
  if (input.candidates.length > 1) {
    return { ...base, status: "ambiguous", reviewNote: "Eyni fənn, il və sual nömrəsi ilə birdən çox sual tapıldı." };
  }

  const candidate = input.candidates[0]!;
  const token = normalizeAnswerToken(input.answerToken);
  const option = candidate.options.find(item => normalizeAnswerToken(item.label) === token);
  if (option) base.suggestedOption = option.label;

  if (input.duplicateInSource) {
    return { ...base, status: "needs_review", reviewNote: "Cavab açarı PDF-ində bu sual üçün bir neçə sətir var." };
  }
  if (input.yearOutsideHint) {
    return { ...base, status: "needs_review", reviewNote: "Çıxarılan il yükləmə zamanı verilən il göstəricisi ilə uyğun gəlmir." };
  }
  if (input.extractionIncomplete) {
    return { ...base, status: "needs_review", reviewNote: "AI PDF-dən bütün cavab sətirlərini oxuduğunu təsdiqləmədi." };
  }
  if (input.rowWarning?.trim()) {
    return { ...base, status: "needs_review", reviewNote: input.rowWarning.trim().slice(0, 500) };
  }
  if (!option) {
    return { ...base, status: "needs_review", reviewNote: "Çıxarılan cavab işarəsi sualın variant etiketləri ilə dəqiq uyğun gəlmir." };
  }
  if (input.yearWasPrinted === false) {
    return { ...base, status: "needs_review", reviewNote: "İmtahan ili PDF-dən çıxarılmadı; yükləmə göstəricisi ilə tapılan uyğunluq admin tərəfindən yoxlanmalıdır." };
  }
  if (!Number.isFinite(input.confidence) || input.confidence < ANSWER_KEY_SUGGESTION_THRESHOLD) {
    return { ...base, status: "needs_review", reviewNote: "AI əminliyi 95%-dən aşağıdır; admin yoxlaması tələb olunur." };
  }
  if (candidate.correctOption && candidate.correctOption !== option.label) {
    return { ...base, status: "conflict", reviewNote: `Sualda artıq “${candidate.correctOption}” cavabı saxlanıb; avtomatik əvəz edilmədi.` };
  }
  if (candidate.correctOption === option.label) {
    if (!candidate.correctAnswerSource) {
      return { ...base, status: "needs_review", reviewNote: "Eyni cavab bazada var; PDF mənbəyini əlavə etmək üçün admin təsdiqi tələb olunur." };
    }
    return { ...base, status: "already_set", reviewNote: "Eyni cavab və mənbə əvvəldən saxlanmışdır; dəyişiklik edilmədi." };
  }
  return { ...base, status: "needs_review", reviewNote: "Dəqiq uyğunluq tapıldı; cavab yalnız admin təsdiqindən sonra saxlanacaq." };
}
