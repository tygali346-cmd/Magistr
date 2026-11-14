import { describe, expect, it } from "vitest";
import { completenessWarnings, inferYears, planSourceFingerprints } from "./questionBank";

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
