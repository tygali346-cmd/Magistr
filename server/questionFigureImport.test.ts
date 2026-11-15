import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memoryStore } from "./memoryStore";
import { cropAndStorePageFigure, isValidBbox, renderPdfPageCanvas, renderPdfPagePng } from "./pdfProcessor";
import { importQuestionSchema, persistExtractedQuestions, redactQuestionForPublic } from "./questionBank";
import { storagePut } from "./storage";

function buildMinimalPdfBuffer(): Buffer {
  const streamContent = "q 0.2 0.4 0.7 rg 50 500 200 120 re f Q\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents 4 0 R /Resources << >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(streamContent, "ascii")} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}

function readPngDimensions(png: Buffer): { width: number; height: number } {
  // PNG signature (8 bytes) + IHDR chunk length (4) + "IHDR" (4) + width (4 BE) + height (4 BE)
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

let tempStorageDir = "";
let prevStorageDir: string | undefined;

beforeAll(() => {
  prevStorageDir = process.env.STORAGE_DIR;
  tempStorageDir = mkdtempSync(path.join(os.tmpdir(), "qebulfit-fig-test-"));
  process.env.STORAGE_DIR = tempStorageDir;
});

afterAll(() => {
  if (prevStorageDir === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = prevStorageDir;
  if (tempStorageDir) rmSync(tempStorageDir, { recursive: true, force: true });
});

describe("figure bbox schema and PDF cropping", () => {
  it("validates hasFigure and figures via importQuestionSchema", () => {
    const valid = importQuestionSchema.safeParse({
      examYear: 2015,
      questionNumber: 7,
      subjectSlug: "mentiq",
      topicNumber: "1",
      subtopicNumber: null,
      questionText: "Şəkildəki fiquru müəyyən edin.",
      correctionSuggestion: null,
      options: [
        { label: "A", text: "Variant A" },
        { label: "B", text: "Variant B" },
      ],
      sourcePage: 1,
      confidence: 0.96,
      classificationReason: "Şəkilli məntiq sualı",
      reviewNote: "",
      hasFigure: true,
      figures: [
        {
          page: 1,
          bbox: { x: 0.1, y: 0.2, w: 0.4, h: 0.25 },
          role: "question",
          optionLabel: null,
          label: "Fiqur",
          kind: "diagram",
          value: "",
        },
        {
          page: 1,
          bbox: { x: 0.1, y: 0.5, w: 0.15, h: 0.1 },
          role: "option",
          optionLabel: "A",
          label: "Variant A şəkli",
          kind: "image",
          value: "",
        },
      ],
      media: [],
    });
    expect(valid.success).toBe(true);

    const invalidBbox = importQuestionSchema.safeParse({
      examYear: 2015,
      questionNumber: 7,
      subjectSlug: "mentiq",
      topicNumber: "1",
      subtopicNumber: null,
      questionText: "Sual",
      correctionSuggestion: null,
      options: [],
      sourcePage: 1,
      confidence: 0.9,
      classificationReason: "Test",
      reviewNote: "",
      hasFigure: true,
      figures: [
        {
          page: 1,
          bbox: { x: -0.1, y: 0.2, w: 0.5, h: 0.2 },
          role: "question",
          optionLabel: null,
          label: null,
          kind: "image",
          value: "",
        },
      ],
    });
    expect(invalidBbox.success).toBe(false);
  });

  it("checks normalized bbox boundaries and minimum sizes", () => {
    expect(isValidBbox({ x: 0.1, y: 0.1, w: 0.3, h: 0.2 })).toBe(true);
    expect(isValidBbox({ x: 0.9, y: 0.1, w: 0.2, h: 0.2 })).toBe(false);
    expect(isValidBbox({ x: 0.1, y: 0.1, w: 0.01, h: 0.2 })).toBe(false);
    expect(isValidBbox(null)).toBe(false);
  });

  it("renders PDF page to PNG at 180 DPI and crops valid bbox vs full-page fallback", async () => {
    const pdfBytes = buildMinimalPdfBuffer();
    const fullPage = await renderPdfPagePng(pdfBytes, 1);
    const fullDims = readPngDimensions(fullPage.png);
    expect(fullPage.pageCount).toBe(1);
    expect(fullDims.width).toBe(1500); // 600 * 2.5
    expect(fullDims.height).toBe(2000); // 800 * 2.5

    const { canvas } = await renderPdfPageCanvas(pdfBytes, 1);
    const validCrop = await cropAndStorePageFigure(
      canvas,
      1,
      { x: 0.1, y: 0.1, w: 0.4, h: 0.2 },
      "testcrop1",
      0,
      storagePut,
    );
    expect(validCrop.needsReview).toBe(false);
    expect(validCrop.url).toBe("/api/storage/qebulfit/media/testcrop1-p1-f0.png");
    const croppedBlob = memoryStore.storageBlobs.get(validCrop.storageKey);
    expect(croppedBlob).toBeTruthy();
    const cropDims = readPngDimensions(croppedBlob!.bytes);
    expect(cropDims.width).toBe(600);
    expect(cropDims.height).toBe(400);

    const fallbackCrop = await cropAndStorePageFigure(
      canvas,
      1,
      { x: 0.01, y: 0.01, w: 0.005, h: 0.005 },
      "testcrop1",
      1,
      storagePut,
    );
    expect(fallbackCrop.needsReview).toBe(true);
    expect(fallbackCrop.reviewNote).toBe("şəkil kəsimi yoxlanmalıdır");
    const fallbackBlob = memoryStore.storageBlobs.get(fallbackCrop.storageKey);
    expect(readPngDimensions(fallbackBlob!.bytes)).toEqual(fullDims);
  });

  it("persists figures, falls back safely when bbox is missing, is idempotent on re-import, and redacts answer keys", async () => {
    memoryStore.ensureInitialized();
    const initialBlobKeys = new Set(memoryStore.storageBlobs.keys());
    const imagelessSeed = memoryStore.questions.find(q => q.media === null);
    expect(imagelessSeed).toBeDefined();
    const imagelessSeedId = imagelessSeed!.id;

    const pdfBytes = buildMinimalPdfBuffer();
    const fileSha = "f".repeat(64);
    const extracted = [
      importQuestionSchema.parse({
        examYear: 2020,
        questionNumber: 1,
        subjectSlug: "informatika",
        topicNumber: "1",
        subtopicNumber: null,
        questionText: "Sxemə əsasən nəticəni tapın.",
        correctionSuggestion: null,
        options: [
          { label: "A", text: "10" },
          { label: "B", text: "20" },
        ],
        sourcePage: 1,
        confidence: 0.97,
        classificationReason: "İnformatika sxem sualı",
        reviewNote: "",
        hasFigure: true,
        figures: [
          {
            page: 1,
            bbox: { x: 0.08, y: 0.15, w: 0.35, h: 0.2 },
            role: "question",
            optionLabel: null,
            label: "Sxem",
            kind: "diagram",
            value: "",
          },
          {
            page: 1,
            bbox: { x: 0.1, y: 0.45, w: 0.15, h: 0.1 },
            role: "option",
            optionLabel: "A",
            label: "Variant A",
            kind: "image",
            value: "",
          },
        ],
        media: [],
      }),
      importQuestionSchema.parse({
        examYear: 2020,
        questionNumber: 2,
        subjectSlug: "mentiq",
        topicNumber: "1",
        subtopicNumber: null,
        questionText: "Şəkildəki cədvəl sualı (bbox yoxdur).",
        correctionSuggestion: null,
        options: [
          { label: "A", text: "Birinci" },
          { label: "B", text: "İkinci" },
        ],
        sourcePage: 1,
        confidence: 0.96,
        classificationReason: "Məntiq fiqur sualı",
        reviewNote: "",
        hasFigure: true,
        figures: [],
        media: [],
      }),
    ];

    const firstPass = await persistExtractedQuestions(999, fileSha, [2020], extracted, [], undefined, pdfBytes);
    expect(firstPass.inserted).toBe(2);
    expect(firstPass.skippedDuplicates).toBe(0);

    const q1 = memoryStore.questions.find(q => q.examFileId === 999 && q.questionNumber === 1)!;
    expect(q1.media).toHaveLength(2);
    expect(q1.media?.[0]?.role).toBe("question");
    expect(q1.media?.[0]?.value).toMatch(/^\/api\/storage\/qebulfit\/media\//);
    expect(q1.media?.[1]?.role).toBe("option");
    expect(q1.media?.[1]?.optionLabel).toBe("A");

    const q2 = memoryStore.questions.find(q => q.examFileId === 999 && q.questionNumber === 2)!;
    expect(q2.media).toHaveLength(1);
    expect(q2.media?.[0]?.value).toMatch(/^\/api\/storage\/qebulfit\/media\//);
    expect(q2.reviewStatus).toBe("needs_review");
    expect(q2.reviewNote).toContain("şəkil kəsimi yoxlanmalıdır");

    // Existing image-less questions remain untouched
    const seedAfter = memoryStore.questions.find(q => q.id === imagelessSeedId);
    expect(seedAfter?.media).toBeNull();

    // Public redaction strips answer key & storage keys while keeping question media
    const redacted = redactQuestionForPublic({
      ...q1,
      correctOption: "A",
      correctAnswerSource: "Rəsmi açar",
      sourceStorageKey: "qebulfit/exams/secret.pdf",
    });
    expect("correctOption" in redacted).toBe(false);
    expect("correctAnswerSource" in redacted).toBe(false);
    expect("sourceStorageKey" in redacted).toBe(false);
    expect(redacted.media).toEqual(q1.media);

    // Re-importing the exact same PDF/questions is idempotent with zero duplicate media blobs
    const mediaKeysBeforeReimport = [...memoryStore.storageBlobs.keys()].filter(k => !initialBlobKeys.has(k));
    const secondPass = await persistExtractedQuestions(999, fileSha, [2020], extracted, [], undefined, pdfBytes);
    expect(secondPass.inserted).toBe(0);
    expect(secondPass.skippedDuplicates).toBe(2);
    const mediaKeysAfterReimport = [...memoryStore.storageBlobs.keys()].filter(k => !initialBlobKeys.has(k));
    expect(mediaKeysAfterReimport).toEqual(mediaKeysBeforeReimport);

    // Clean up in-memory test rows so other tests aren't affected if sharing module instance
    memoryStore.questions = memoryStore.questions.filter(q => q.examFileId !== 999);
    memoryStore.questionOptions = memoryStore.questionOptions.filter(o => o.questionId !== q1.id && o.questionId !== q2.id);
    for (const key of mediaKeysAfterReimport) {
      memoryStore.storageBlobs.delete(key);
    }
  });

  it("persists uploaded files and storage blobs across memoryStore snapshot save and load", async () => {
    process.env.FORCE_DISK_PERSISTENCE = "true";
    memoryStore.ensureInitialized();
    const testKey = "qebulfit/exams/test-persistent-upload.pdf";
    const testContent = Buffer.from("%PDF-1.4 persistent test pdf bytes", "ascii");
    await storagePut(testKey, testContent, "application/pdf", { deterministic: true });

    expect(memoryStore.storageBlobs.has(testKey)).toBe(true);

    // Simulate server restart by creating a new MemoryStore instance or calling loadSnapshot logic
    memoryStore.storageBlobs.clear();
    expect(memoryStore.storageBlobs.has(testKey)).toBe(false);

    // Trigger snapshot load (or private loadSnapshot via ensureInitialized or direct inspection)
    // saveSnapshot was called by storagePut, so snapshot file exists on disk.
    // Calling loadSnapshot() internally re-populates storageBlobs.
    // Let's call loadSnapshot via a private helper or test memoryStore state reload.
    (memoryStore as unknown as { loadSnapshot(): boolean }).loadSnapshot();
    expect(memoryStore.storageBlobs.has(testKey)).toBe(true);
    expect(memoryStore.storageBlobs.get(testKey)?.bytes.toString("ascii")).toContain("persistent test pdf bytes");

    memoryStore.storageBlobs.delete(testKey);
    delete process.env.FORCE_DISK_PERSISTENCE;
  });
});
