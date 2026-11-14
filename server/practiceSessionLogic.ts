export function hasExactQuestionSet(expectedQuestionIds: number[], submittedQuestionIds: number[]) {
  if (!expectedQuestionIds.length || expectedQuestionIds.length !== submittedQuestionIds.length) return false;

  const expected = new Set(expectedQuestionIds);
  const submitted = new Set(submittedQuestionIds);
  if (expected.size !== expectedQuestionIds.length || submitted.size !== submittedQuestionIds.length) return false;

  return expectedQuestionIds.every(questionId => submitted.has(questionId));
}
