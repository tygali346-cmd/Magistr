import { describe, expect, it } from "vitest";
import { hasExactQuestionSet } from "./practiceSessionLogic";

describe("hasExactQuestionSet", () => {
  it("accepts the full offered question set regardless of submission order", () => {
    expect(hasExactQuestionSet([10, 20, 30], [30, 10, 20])).toBe(true);
  });

  it("rejects incomplete submissions", () => {
    expect(hasExactQuestionSet([10, 20, 30], [10, 20])).toBe(false);
  });

  it("rejects a question set that gained an item after the session started", () => {
    expect(hasExactQuestionSet([10, 20], [10, 20, 30])).toBe(false);
  });

  it("rejects repeated question IDs in either set", () => {
    expect(hasExactQuestionSet([10, 10, 20], [10, 20])).toBe(false);
    expect(hasExactQuestionSet([10, 20], [10, 10])).toBe(false);
  });

  it("rejects substituted questions and empty tests", () => {
    expect(hasExactQuestionSet([10, 20], [10, 99])).toBe(false);
    expect(hasExactQuestionSet([], [])).toBe(false);
  });
});
