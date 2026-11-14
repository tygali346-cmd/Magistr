import { describe, expect, it } from "vitest";
import { classifyAnswerKeyEntry, normalizeAnswerToken, type AnswerKeyCandidate } from "./answerKeyLogic";

const candidate: AnswerKeyCandidate = {
  id: 17,
  correctOption: null,
  options: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }, { label: "E" }],
};

function classify(overrides: Partial<Parameters<typeof classifyAnswerKeyEntry>[0]> = {}) {
  return classifyAnswerKeyEntry({
    examYear: 2011,
    questionNumber: 8,
    answerToken: "B",
    confidence: 0.97,
    candidates: [candidate],
    ...overrides,
  });
}

describe("answer-key matching policy", () => {
  it("suggests an exact unique 95%+ match but requires admin confirmation before writing", () => {
    expect(classify()).toMatchObject({
      status: "needs_review",
      matchedQuestionId: 17,
      candidateQuestionIds: [17],
      suggestedOption: "B",
      reviewNote: expect.stringContaining("admin təsdiqindən sonra"),
    });
  });

  it("requires admin review when confidence is below 95%", () => {
    expect(classify({ confidence: 0.949 })).toMatchObject({
      status: "needs_review",
      matchedQuestionId: 17,
      suggestedOption: "B",
    });
  });

  it("keeps a year supplied only as an upload hint in manual review", () => {
    expect(classify({ yearWasPrinted: false })).toMatchObject({
      status: "needs_review",
      matchedQuestionId: 17,
      reviewNote: expect.stringContaining("PDF-dən çıxarılmadı"),
    });
  });

  it("never chooses between duplicate question-number matches", () => {
    expect(classify({ candidates: [candidate, { ...candidate, id: 18 }] })).toMatchObject({
      status: "ambiguous",
      matchedQuestionId: null,
      candidateQuestionIds: [17, 18],
    });
  });

  it("does not overwrite a conflicting answer key", () => {
    expect(classify({ candidates: [{ ...candidate, correctOption: "A" }] })).toMatchObject({
      status: "conflict",
      suggestedOption: "B",
    });
  });

  it("keeps unmatched answer tokens in review instead of converting numeric or unknown labels", () => {
    expect(classify({ answerToken: "3" })).toMatchObject({ status: "needs_review", suggestedOption: null });
  });

  it("does not auto-apply when the extraction is incomplete or its year contradicts the upload hint", () => {
    expect(classify({ extractionIncomplete: true })).toMatchObject({ status: "needs_review" });
    expect(classify({ yearOutsideHint: true })).toMatchObject({ status: "needs_review" });
  });

  it("flags duplicate source rows for admin review", () => {
    expect(classify({ duplicateInSource: true })).toMatchObject({ status: "needs_review" });
  });

  it("recognizes harmless answer-marker punctuation without changing the printed token", () => {
    expect(normalizeAnswerToken("  (b). ")).toBe("B");
  });

  it("does not accept an already stored different answer as equivalent", () => {
    expect(classify({ candidates: [{ ...candidate, correctOption: "C" }] }).status).toBe("conflict");
  });

  it("requires admin confirmation before attaching provenance to an existing answer", () => {
    expect(classify({ candidates: [{ ...candidate, correctOption: "B" }] })).toMatchObject({
      status: "needs_review",
      suggestedOption: "B",
    });
    expect(classify({ candidates: [{ ...candidate, correctOption: "B", correctAnswerSource: "Official PDF" }] })).toMatchObject({
      status: "already_set",
      suggestedOption: "B",
    });
  });
});
