import { describe, expect, it } from "vitest";
import { completenessWarnings, inferYears } from "./questionBank";

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
