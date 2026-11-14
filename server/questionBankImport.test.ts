import { describe, expect, it } from "vitest";
import { completenessWarnings, computeStreamProgress, inferYears, planSourceFingerprints } from "./questionBank";

describe("completenessWarnings", () => {
  it("does not warn for a likely-complete extraction just because it has a note", () => {
    expect(completenessWarnings({
      likelyComplete: true,
      note: "Bütün suallar tapıldı.",
      suspectedMissingQuestionNumbers: [],
    })).toEqual([]);
  });

  it("warns when the extraction is not likely complete", () => {
    expect(completenessWarnings({
      likelyComplete: false,
      note: "Səhifələrdən biri qeyri-müəyyəndir.",
      suspectedMissingQuestionNumbers: [],
    })).toEqual(["Səhifələrdən biri qeyri-müəyyəndir."]);
  });

  it("warns when question numbers are suspected missing", () => {
    expect(completenessWarnings({
      likelyComplete: true,
      note: "",
      suspectedMissingQuestionNumbers: [4, 9],
    })).toEqual(["Buraxılmış ola bilən nömrələr: 4, 9."]);
  });
});

describe("inferYears", () => {
  it.each([
    ["2010-11.pdf", [2010, 2011]],
    ["imtahan_2012.pdf", [2012]],
    ["qebul_2015_informatika.pdf", [2015]],
    ["2015-18.pdf", [2015, 2016, 2017, 2018]],
    ["Qəbul 2013.pdf", [2013]],
    ["sənəd.pdf", []],
  ])("infers years from %s", (filename, expected) => {
    expect(inferYears(filename)).toEqual(expected);
  });
});

describe("planSourceFingerprints", () => {
  const fileSha = "a".repeat(64);

  it("keeps the original fingerprint and adds a stable subject suffix to an in-import collision", () => {
    const imported = [
      { examYear: 2010, questionNumber: 22, subjectSlug: "informatika" as const },
      { examYear: 2010, questionNumber: 22, subjectSlug: "mentiq" as const },
    ];
    const firstPlan = planSourceFingerprints(fileSha, [], imported);
    const repeatedPlan = planSourceFingerprints(fileSha, [], imported);

    expect(firstPlan[0]).toEqual({ year: 2010, sourceFingerprint: `${fileSha.slice(0, 50)}:2010:22`, collision: false });
    expect(firstPlan[1]).toEqual({ year: 2010, sourceFingerprint: `${fileSha.slice(0, 50)}:2010:22:mentiq`, collision: true });
    expect(repeatedPlan).toEqual(firstPlan);
  });

  it("uses :dup2 and later suffixes for additional collisions", () => {
    const plan = planSourceFingerprints(fileSha, [], [
      { examYear: 2010, questionNumber: 22, subjectSlug: "informatika" },
      { examYear: 2010, questionNumber: 22, subjectSlug: "mentiq" },
      { examYear: 2010, questionNumber: 22, subjectSlug: "informatika" },
      { examYear: 2010, questionNumber: 22, subjectSlug: "mentiq" },
    ]);

    expect(plan.map(item => item.sourceFingerprint)).toEqual([
      `${fileSha.slice(0, 50)}:2010:22`,
      `${fileSha.slice(0, 50)}:2010:22:mentiq`,
      `${fileSha.slice(0, 50)}:2010:22:dup2`,
      `${fileSha.slice(0, 50)}:2010:22:dup3`,
    ]);
    expect(plan.slice(1).every(item => item.collision)).toBe(true);
  });
});

describe("computeStreamProgress", () => {
  it("scales proportionally from 20% to 72% when expected question count is provided", () => {
    expect(computeStreamProgress(0, 25, 0)).toBe(20);
    expect(computeStreamProgress(12, 25, 3000)).toBe(45);
    expect(computeStreamProgress(25, 25, 8000)).toBe(72);
    expect(computeStreamProgress(30, 25, 9000)).toBe(72);
  });

  it("grows smoothly and stays within 18%-72% when expected count is unknown", () => {
    const p0 = computeStreamProgress(0, null, 0);
    const p5 = computeStreamProgress(5, null, 2000);
    const p25 = computeStreamProgress(25, null, 12000);
    const p200 = computeStreamProgress(200, null, 90000);
    expect(p0).toBe(18);
    expect(p5).toBeGreaterThan(p0);
    expect(p25).toBeGreaterThan(p5);
    expect(p200).toBeLessThanOrEqual(72);
  });
});
