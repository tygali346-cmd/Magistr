import { describe, expect, it } from "vitest";
import { seedQuestions } from "../data/seed-2010-11";
import { INFORMATICS_TOPICS, LOGIC_TOPICS, SUBJECT_CATALOG, TOPIC_CATALOG } from "../shared/topicCatalog";
import { redactQuestionForPublic } from "./questionBank";

describe("QəbulFit fixed catalog and reviewed seed", () => {
  it("keeps both requested subjects and their exact main-topic counts", () => {
    expect(SUBJECT_CATALOG.map(subject => subject.name)).toEqual(["İnformatika", "Məntiq"]);
    expect(INFORMATICS_TOPICS).toHaveLength(18);
    expect(LOGIC_TOPICS).toHaveLength(20);
    expect(TOPIC_CATALOG.find(topic => topic.slug === "mentiq-6-1")).toMatchObject({
      numberLabel: "6.1",
      name: "Sıralar",
      parentNumberLabel: "6",
    });
    expect(TOPIC_CATALOG.some(topic => /^(2[1-4])\./.test(topic.numberLabel))).toBe(false);
  });

  it("contains all 50 Informatics source questions and preserves the 25/25 year split", () => {
    expect(seedQuestions).toHaveLength(50);
    expect(seedQuestions.filter(question => question.year === 2010)).toHaveLength(25);
    expect(seedQuestions.filter(question => question.year === 2011)).toHaveLength(25);
    expect(seedQuestions.every(question => INFORMATICS_TOPICS.some(topic => topic.numberLabel === String(question.topicNumber)))).toBe(true);
    expect(seedQuestions.every(question => !Object.hasOwn(question, "correctOption"))).toBe(true);
  });

  it("retains all four uncertain records for review rather than silently normalizing them", () => {
    expect(seedQuestions.filter(question => question.review).map(question => `${question.year}-${question.questionNumber}`)).toEqual([
      "2010-22",
      "2011-1",
      "2011-5",
      "2011-7",
    ]);
  });

  it("redacts answer values and private storage keys from public question records", () => {
    const visible = redactQuestionForPublic({ id: 7, correctOption: "C", correctAnswerSource: "Rəsmi açar, s. 2", sourceStorageKey: "private/source.pdf", updatedAt: new Date("2026-01-01T00:00:00Z") });
    expect(visible).toMatchObject({ id: 7 });
    expect(visible).not.toHaveProperty("correctOption");
    expect(visible).not.toHaveProperty("correctAnswerSource");
    expect(visible).not.toHaveProperty("sourceStorageKey");
    expect(visible).not.toHaveProperty("hasVerifiedAnswer");
    expect(visible).not.toHaveProperty("updatedAt");
  });
});
