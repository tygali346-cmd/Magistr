import { describe, expect, it } from "vitest";
import { completenessWarnings } from "./questionBank";

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
