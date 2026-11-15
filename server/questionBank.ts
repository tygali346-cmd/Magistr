import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SUBJECT_CATALOG, TOPIC_CATALOG, type SubjectSlug } from "@shared/topicCatalog";
import { examFiles, importJobs, practiceSessions, questionOptions, questions, studyAttempts, subjects, topics, type AttemptAnswer, type QuestionMedia } from "../drizzle/schema";
import { extractPdfWithGemini, type ExtractPdfProgressCallbacks } from "./gemini";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { storageGetObject, storagePut } from "./storage";
import { hasExactQuestionSet } from "./practiceSessionLogic";
import { getDb } from "./db";
import { memoryStore } from "./memoryStore";
import { commitFirestoreBatch, deleteFirestoreDoc } from "./firestoreRest";
import { cropAndStorePageFigure, createPdfPageRenderer, renderAndCropPdfFigure, renderPdfPagePng, type PdfPageRenderer } from "./pdfProcessor";
import { buildExamFileWrite, buildQuestionWrite, syncAllToFirestore, syncExamFileToFirestore, syncQuestionToFirestore } from "./firestoreSync";
import {
  ensureTopicCatalog,
  getDashboardData,
  getExamFileById,
  getLearnerAttempts,
  getQuestion,
  getSubjectBySlug,
  getTopicBySlug,
  listExamFiles,
  listQuestions,
  listSubjects,
  listTopics,
  saveQuestionReview,
  updateExamFileState,
  updateQuestionMedia,
} from "./questionBankDb";

const REVIEW_THRESHOLD = 0.75;
const HIGH_CONFIDENCE_REVIEW_THRESHOLD = 0.95;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

function highConfidenceReviewCondition() {
  return and(
    eq(questions.reviewStatus, "needs_review"),
    gte(questions.classificationConfidence, HIGH_CONFIDENCE_REVIEW_THRESHOLD),
    isNotNull(questions.subjectId),
    isNotNull(questions.topicId),
    isNotNull(questions.examYear),
    isNotNull(questions.questionNumber),
    or(isNull(questions.reviewNote), sql`trim(${questions.reviewNote}) = ''`)!,
    sql`exists (select 1 from ${questionOptions} where ${questionOptions.questionId} = ${questions.id})`,
  )!;
}

const bboxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
}).strict().nullable();

const figureSchema = z.object({
  page: z.number().int().positive().nullable(),
  bbox: bboxSchema,
  role: z.enum(["question", "option"]),
  optionLabel: z.string().nullable(),
  label: z.string().nullable(),
  kind: z.enum(["image", "table", "formula", "diagram", "note"]),
  value: z.string().optional().default(""),
}).strict();

const importQuestionSchema = z.object({
  examYear: z.number().int().min(1900).max(2100).nullable(),
  questionNumber: z.number().int().positive().nullable(),
  subjectSlug: z.enum(["informatika", "mentiq"]).nullable(),
  topicNumber: z.string().nullable(),
  subtopicNumber: z.string().nullable(),
  questionText: z.string(),
  correctionSuggestion: z.string().nullable(),
  options: z.array(z.object({ label: z.string(), text: z.string() }).strict()).max(10),
  sourcePage: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1),
  classificationReason: z.string(),
  reviewNote: z.string(),
  hasFigure: z.boolean().default(false),
  figures: z.array(figureSchema).max(10).optional().default([]),
  media: z.array(z.object({
    kind: z.enum(["image", "table", "formula", "diagram", "note"]),
    label: z.string().nullable(),
    value: z.string(),
    sourcePage: z.number().int().positive().nullable(),
  }).strict()).max(20).optional().default([]),
}).strict();
const completenessSchema = z.object({
  likelyComplete: z.boolean(),
  note: z.string(),
  suspectedMissingQuestionNumbers: z.array(z.number().int().positive()).max(100),
}).strict();
const extractionResultSchema = z.object({ questions: z.array(importQuestionSchema).max(500), completeness: completenessSchema }).strict();
type ImportQuestion = z.infer<typeof importQuestionSchema>;
type ExtractionResult = z.infer<typeof extractionResultSchema>;

const nullableInteger = { type: ["integer", "null"] };
const nullableString = { type: ["string", "null"] };
const bboxJsonSchema = {
  type: ["object", "null"],
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
  },
  required: ["x", "y", "w", "h"],
  additionalProperties: false,
};
const figureJsonSchema = {
  type: "object",
  properties: {
    page: nullableInteger,
    bbox: bboxJsonSchema,
    role: { type: "string", enum: ["question", "option"] },
    optionLabel: nullableString,
    label: nullableString,
    kind: { type: "string", enum: ["image", "table", "formula", "diagram", "note"] },
    value: { type: "string" },
  },
  required: ["page", "bbox", "role", "optionLabel", "label", "kind", "value"],
  additionalProperties: false,
};
const EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
      questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          examYear: nullableInteger,
          questionNumber: nullableInteger,
          subjectSlug: { type: ["string", "null"], enum: ["informatika", "mentiq", null] },
          topicNumber: nullableString,
          subtopicNumber: nullableString,
          questionText: { type: "string" },
          correctionSuggestion: nullableString,
          options: { type: "array", items: { type: "object", properties: { label: { type: "string" }, text: { type: "string" } }, required: ["label", "text"], additionalProperties: false } },
          sourcePage: nullableInteger,
          confidence: { type: "number" },
          classificationReason: { type: "string" },
          reviewNote: { type: "string" },
          hasFigure: { type: "boolean" },
          figures: { type: "array", items: figureJsonSchema },
          media: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: ["image", "table", "formula", "diagram", "note"] }, label: nullableString, value: { type: "string" }, sourcePage: nullableInteger }, required: ["kind", "label", "value", "sourcePage"], additionalProperties: false } },
        },
        required: ["examYear", "questionNumber", "subjectSlug", "topicNumber", "subtopicNumber", "questionText", "correctionSuggestion", "options", "sourcePage", "confidence", "classificationReason", "reviewNote", "hasFigure", "figures", "media"],
        additionalProperties: false,
      },
    },
    completeness: {
      type: "object",
      properties: {
        likelyComplete: { type: "boolean" },
        note: { type: "string" },
        suspectedMissingQuestionNumbers: { type: "array", items: { type: "integer" } },
      },
      required: ["likelyComplete", "note", "suspectedMissingQuestionNumbers"],
      additionalProperties: false,
    },
  },
  required: ["questions", "completeness"],
  additionalProperties: false,
};

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("az").replace(/\s+/g, " ").trim();
}
export function inferYears(filename: string) {
  const range = filename.match(/(?<!\d)(19|20)(\d{2})[-_](\d{2})(?!\d)/);
  if (range) {
    const first = Number(`${range[1]}${range[2]}`);
    const end = Number(`${range[1]}${range[3]}`);
    if (end >= first && end <= first + 10) return Array.from({ length: end - first + 1 }, (_, index) => first + index);
  }
  return [...new Set([...filename.matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/g)].map(match => Number(match[0])))].filter(year => year >= 1900 && year <= 2100).slice(0, 10);
}

export function planSourceFingerprints(fileSha: string, fileYears: number[], imported: Pick<ImportQuestion, "examYear" | "questionNumber" | "subjectSlug">[]) {
  const occurrences = new Map<string, number>();
  return imported.map((item, index) => {
    const year = fileYears.length === 1 ? fileYears[0] : item.examYear;
    const base = `${fileSha.slice(0, 50)}:${year ?? "na"}:${item.questionNumber ?? `x${index + 1}`}`.slice(0, 96);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    if (occurrence === 0) return { year, sourceFingerprint: base, collision: false };
    const suffix = occurrence === 1 ? item.subjectSlug || "unknown" : `dup${occurrence}`;
    return {
      year,
      sourceFingerprint: `${base.slice(0, 96 - suffix.length - 1)}:${suffix}`,
      collision: true,
    };
  });
}

export function completenessWarnings(completeness: ExtractionResult["completeness"]) {
  const warnings: string[] = [];
  if (!completeness.likelyComplete) {
    warnings.push(completeness.note.trim() || "AI sualların tam çıxarıldığını təsdiqləyə bilmədi.");
  }
  if (completeness.suspectedMissingQuestionNumbers.length) {
    warnings.push(`Buraxılmış ola bilən nömrələr: ${completeness.suspectedMissingQuestionNumbers.join(", ")}.`);
  }
  return warnings;
}

export async function storeUploadedPdf(bytes: Buffer, filenameInput: string, requestedYears: number[], expectedQuestionCountInput: number | null = null) {
  if (bytes.byteLength < 8 || bytes.byteLength > MAX_PDF_BYTES) throw new Error("PDF ölçüsü 8 bayt ilə 50 MB arasında olmalıdır.");
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("Yüklənmiş fayl etibarlı PDF kimi tanınmadı.");
  const filename = path.basename(filenameInput).slice(0, 255) || "imtahan.pdf";
  if (!filename.toLowerCase().endsWith(".pdf")) throw new Error("Yalnız PDF faylı yükləmək olar.");
  if (expectedQuestionCountInput !== null && (!Number.isInteger(expectedQuestionCountInput) || expectedQuestionCountInput < 1 || expectedQuestionCountInput > 500)) throw new Error("Gözlənilən sual sayı 1 ilə 500 arasında olmalıdır.");
  const expectedQuestionCount = expectedQuestionCountInput ?? null;
  const providedYears = [...new Set(requestedYears.filter(year => Number.isInteger(year) && year >= 1900 && year <= 2100))];
  const years = providedYears.length ? providedYears : inferYears(filename);
  const fingerprint = sha256(bytes);
  const db = await getDb();
  if (!db) {
    memoryStore.ensureInitialized();
    const existing = memoryStore.examFiles.find(f => f.sha256 === fingerprint);
    if (existing) return { examFileId: existing.id, duplicate: true, filename: existing.filename, processingStatus: existing.processingStatus, expectedQuestionCount: existing.expectedQuestionCount };
    const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, "_");
    const stored = await storagePut(`qebulfit/exams/${fingerprint.slice(0, 16)}-${safeFilename}`, bytes, "application/pdf");
    const now = new Date();
    const created = {
      id: memoryStore.nextIds.examFile++,
      filename,
      title: filename.replace(/\.pdf$/i, ""),
      storageKey: stored.key,
      sourceUrl: stored.url,
      sha256: fingerprint,
      fileSize: bytes.byteLength,
      mimeType: "application/pdf",
      years,
      expectedQuestionCount,
      questionCount: 0,
      processingStatus: "uploaded" as const,
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.examFiles.push(created);
    memoryStore.importJobs.push({
      id: memoryStore.nextIds.importJob++,
      examFileId: created.id,
      status: "queued",
      progress: 0,
      message: "PDF yükləndi; AI emalı hələ başlamayıb.",
      detectedQuestionCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    memoryStore.saveSnapshot();
    return { examFileId: created.id, duplicate: false, filename: created.filename, processingStatus: created.processingStatus, expectedQuestionCount: created.expectedQuestionCount };
  }
  const [existing] = await db.select().from(examFiles).where(eq(examFiles.sha256, fingerprint)).limit(1);
  if (existing) return { examFileId: existing.id, duplicate: true, filename: existing.filename, processingStatus: existing.processingStatus, expectedQuestionCount: existing.expectedQuestionCount };
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const stored = await storagePut(`qebulfit/exams/${fingerprint.slice(0, 16)}-${safeFilename}`, bytes, "application/pdf");
  await db.insert(examFiles).values({ filename, title: filename.replace(/\.pdf$/i, ""), storageKey: stored.key, sourceUrl: stored.url, sha256: fingerprint, fileSize: bytes.byteLength, mimeType: "application/pdf", years, expectedQuestionCount, questionCount: 0, processingStatus: "uploaded" });
  const [created] = await db.select().from(examFiles).where(eq(examFiles.sha256, fingerprint)).limit(1);
  if (!created) throw new Error("PDF saxlanıldı, lakin mənbə qeydi yaradıla bilmədi.");
  await db.insert(importJobs).values({ examFileId: created.id, status: "queued", progress: 0, message: "PDF yükləndi; AI emalı hələ başlamayıb.", detectedQuestionCount: 0 });
  return { examFileId: created.id, duplicate: false, filename: created.filename, processingStatus: created.processingStatus, expectedQuestionCount: created.expectedQuestionCount };
}

function parseModelJson(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("AI cavabı JSON formatında oxunmadı.");
  }
}

async function extractQuestionsFromPdf(
  pdfBytes: Buffer,
  filename: string,
  years: number[],
  expectedQuestionCount: number | null,
  callbacks?: ExtractPdfProgressCallbacks,
) {
  const catalog = TOPIC_CATALOG.map(topic => ({ subject: topic.subjectSlug, number: topic.numberLabel, name: topic.name, parentNumber: topic.parentNumberLabel ?? null }));
  const system = [
    "Extract every multiple-choice entrance exam question from the attached PDF and classify it using only the fixed topic catalog.",
    "Preserve question and answer-choice wording exactly as printed. Never paraphrase, solve, or invent an answer key.",
    "Put any suspected OCR correction separately in correctionSuggestion; do not replace original questionText.",
    "For any question with a figure, graph, diagram, table, or option image, set hasFigure to true and populate figures with page, bbox (normalized x, y, w, h between 0 and 1 relative to the page), role ('question' | 'option'), optionLabel (if role=option), kind ('image', 'table', 'formula', 'diagram', 'note'), and label. Gemini does not solve the image, only locates its bounding box.",
    "Choose one primary subject/topic based on the knowledge being tested, not keywords alone. Use null if uncertain. Never invent topics or subtopics.",
    "Read every page. After drafting the questions, audit page coverage and question numbering. If any page, question, numbering range, or complete set is uncertain, set completeness.likelyComplete to false and explain it; report suspected omitted question numbers when possible.",
    "If year or number cannot be read, use null. Keep all real questions in source order, and do not return instructions, model-exam sections, or answer keys as questions.",
  ].join(" ");
  const user = [`Source filename: ${filename}`, `Year hints: ${years.length ? years.join(", ") : "none"}`, `Expected total question count: ${expectedQuestionCount ?? "not supplied"}`, `Exact allowed topic catalog: ${JSON.stringify(catalog)}`, "Pages may be selectable-text or scanned. Return every question plus the required completeness assessment in strict JSON."].join("\n");
  const output = await extractPdfWithGemini(pdfBytes, filename, `${system}\n\n${user}`, EXTRACTION_JSON_SCHEMA, callbacks);
  if (!output) throw new Error("AI xidməti emal üçün cavab qaytarmadı.");
  const parsed = extractionResultSchema.safeParse(parseModelJson(output));
  if (!parsed.success) throw new Error("AI cavabı tələb olunan sual quruluşuna uyğun deyil.");
  return parsed.data;
}

function resolveModelTopic(item: ImportQuestion) {
  const definition = TOPIC_CATALOG.find(topic => topic.subjectSlug === item.subjectSlug && topic.numberLabel === item.topicNumber);
  if (!definition) return { primarySlug: null as string | null, subtopicSlug: null as string | null };
  if (definition.parentNumberLabel) {
    const parent = TOPIC_CATALOG.find(topic => topic.subjectSlug === item.subjectSlug && topic.numberLabel === definition.parentNumberLabel);
    return { primarySlug: parent?.slug ?? null, subtopicSlug: definition.slug };
  }
  const child = item.subtopicNumber ? TOPIC_CATALOG.find(topic => topic.subjectSlug === item.subjectSlug && topic.numberLabel === item.subtopicNumber && topic.parentNumberLabel === definition.numberLabel) : undefined;
  return { primarySlug: definition.slug, subtopicSlug: child?.slug ?? null };
}

function questionSequenceWarnings(imported: ImportQuestion[], fileYears: number[]) {
  const byYear = new Map<number, number[]>();
  for (const item of imported) {
    const year = item.examYear ?? (fileYears.length === 1 ? fileYears[0] : null);
    if (year === null || item.questionNumber === null) continue;
    byYear.set(year, [...(byYear.get(year) ?? []), item.questionNumber]);
  }
  const warnings: string[] = [];
  for (const [year, rawNumbers] of byYear) {
    const numbers = [...new Set(rawNumbers)].sort((a, b) => a - b);
    const missing: number[] = [];
    if (numbers[0] > 1) missing.push(...Array.from({ length: Math.min(numbers[0] - 1, 20) }, (_, index) => index + 1));
    for (let index = 1; index < numbers.length && missing.length < 20; index += 1) {
      for (let expected = numbers[index - 1] + 1; expected < numbers[index] && missing.length < 20; expected += 1) missing.push(expected);
    }
    if (missing.length) warnings.push(`${year} sual ardıcıllığında boşluq ola bilər (məs: ${missing.join(", ")}).`);
  }
  return warnings;
}

export function redactQuestionForPublic<T extends { correctOption: string | null; correctAnswerSource: string | null; sourceStorageKey?: string | null; updatedAt?: unknown }>(row: T) {
  const { correctOption: _correctOption, correctAnswerSource: _correctAnswerSource, sourceStorageKey: _storageKey, updatedAt: _updatedAt, ...visible } = row;
  return visible;
}

type PersistProgressStats = {
  processed: number;
  total: number;
  inserted: number;
  skippedDuplicates: number;
  needsReview: number;
};

async function buildQuestionMediaEntries(
  item: ImportQuestion,
  sourceFingerprint: string,
  rendererRef: { current: PdfPageRenderer | null },
  pdfBytes?: Buffer,
): Promise<{ media: QuestionMedia[]; warnings: string[] }> {
  const figList: Array<{
    kind: QuestionMedia["kind"];
    label: string | null;
    value: string;
    page: number | null;
    bbox: { x: number; y: number; w: number; h: number } | null;
    role: "question" | "option";
    optionLabel: string | null;
    fromFigures: boolean;
  }> = [
    ...(item.figures || []).map(f => ({
      kind: f.kind,
      label: f.label,
      value: f.value || "",
      page: f.page,
      bbox: f.bbox,
      role: f.role,
      optionLabel: f.optionLabel,
      fromFigures: true,
    })),
    ...(item.media || []).map(m => ({
      kind: m.kind,
      label: m.label,
      value: m.value,
      page: m.sourcePage,
      bbox: null,
      role: "question" as const,
      optionLabel: null,
      fromFigures: false,
    })),
  ];

  const hasAnyVisualCandidate = figList.some(
    entry => entry.fromFigures || entry.kind === "image" || entry.kind === "diagram",
  );
  if (item.hasFigure && !hasAnyVisualCandidate) {
    figList.unshift({
      kind: "image",
      label: "Sual şəkli",
      value: "",
      page: item.sourcePage ?? 1,
      bbox: null,
      role: "question",
      optionLabel: null,
      fromFigures: true,
    });
  }

  const mediaEntries: QuestionMedia[] = [];
  const warnings: string[] = [];
  const storageKeyPrefix = sha256(sourceFingerprint).slice(0, 20);

  for (const [figIndex, entry] of figList.entries()) {
    const shouldCropFromPdf =
      Boolean(pdfBytes) &&
      (entry.fromFigures || entry.kind === "image" || entry.kind === "diagram" || (!entry.value.trim() && entry.kind === "table"));

    let mediaVal = entry.value || "";
    let storageKey: string | undefined;
    const pageNum = entry.page ?? item.sourcePage ?? 1;

    if (shouldCropFromPdf && pdfBytes) {
      try {
        if (!rendererRef.current) {
          rendererRef.current = await createPdfPageRenderer(pdfBytes);
        }
        const { canvas, pageNumber: targetPageNum } = await rendererRef.current.renderPage(pageNum);
        const cropped = await cropAndStorePageFigure(
          canvas,
          targetPageNum,
          entry.bbox,
          storageKeyPrefix,
          figIndex,
          storagePut,
        );
        mediaVal = cropped.url;
        storageKey = cropped.storageKey;
        if (cropped.needsReview) {
          warnings.push(cropped.reviewNote ?? "şəkil kəsimi yoxlanmalıdır");
        }
      } catch {
        warnings.push("şəkil kəsimi yoxlanmalıdır");
      }
    } else if (entry.fromFigures && !mediaVal) {
      warnings.push("şəkil kəsimi yoxlanmalıdır");
    }

    if (entry.role === "option" && !entry.optionLabel?.trim()) {
      warnings.push("şəkil kəsimi yoxlanmalıdır");
    }

    mediaEntries.push({
      kind: entry.kind,
      ...(entry.label ? { label: entry.label } : {}),
      value: mediaVal,
      ...(storageKey ? { storageKey } : {}),
      ...(pageNum ? { sourcePage: pageNum } : {}),
      ...(entry.bbox ? { bbox: entry.bbox } : {}),
      ...(entry.role ? { role: entry.role } : {}),
      ...(entry.optionLabel ? { optionLabel: entry.optionLabel } : {}),
    });
  }

  return { media: mediaEntries, warnings: [...new Set(warnings)] };
}

async function persistExtractedQuestions(
  examFileId: number,
  fileSha: string,
  fileYears: number[],
  imported: ImportQuestion[],
  extractionWarnings: string[],
  onItemProcessed?: (stats: PersistProgressStats) => void | Promise<void>,
  pdfBytes?: Buffer,
) {
  const db = await getDb();
  let inserted = 0;
  let skippedDuplicates = 0;
  let needsReview = 0;
  const total = imported.length;
  const fingerprints = planSourceFingerprints(fileSha, fileYears, imported);
  const rendererRef: { current: PdfPageRenderer | null } = { current: null };

  try {
    for (const [index, item] of imported.entries()) {
      const subjectSlug = item.subjectSlug as SubjectSlug | null;
      const subject = subjectSlug ? await getSubjectBySlug(subjectSlug) : null;
      const resolvedTopic = resolveModelTopic(item);
      const mainTopic = resolvedTopic.primarySlug ? await getTopicBySlug(resolvedTopic.primarySlug) : null;
      const subtopic = resolvedTopic.subtopicSlug ? await getTopicBySlug(resolvedTopic.subtopicSlug) : null;
      const yearMismatch = item.examYear !== null && fileYears.length > 0 && !fileYears.includes(item.examYear);
      const { year, sourceFingerprint, collision } = fingerprints[index];
      const itemWarnings = [...extractionWarnings, ...(yearMismatch ? [`AI tərəfindən təyin edilən ${item.examYear} ili PDF üçün verilmiş il göstəricisinə (${fileYears.join(", ")}) uyğun gəlmir.`] : [])];
      const questionText = item.questionText.trim();
      const rawOptions = item.options.map(option => ({ label: option.label.trim(), text: option.text.trim() })).filter(option => option.label && option.text);
      const options = rawOptions.length > 0 ? rawOptions : [
        { label: "A", text: "Variant A (şəkildədir)" },
        { label: "B", text: "Variant B (şəkildədir)" },
        { label: "C", text: "Variant C (şəkildədir)" },
        { label: "D", text: "Variant D (şəkildədir)" },
        { label: "E", text: "Variant E (şəkildədir)" },
      ];
      const contentFingerprint = sha256([questionText, ...options.map(option => `${option.label}:${option.text}`)].map(normalize).join("\n") || `empty-${fileSha}-${index}`);

      if (!db) {
        if (memoryStore.questions.some(q => q.sourceFingerprint === sourceFingerprint)) {
          skippedDuplicates += 1;
          await onItemProcessed?.({ processed: index + 1, total, inserted, skippedDuplicates, needsReview });
          continue;
        }
        const builtMedia = await buildQuestionMediaEntries(item, sourceFingerprint, rendererRef, pdfBytes);
        itemWarnings.push(...builtMedia.warnings);
        const sameContent = memoryStore.questions.find(q => q.contentFingerprint === contentFingerprint);
        const reviewReasons = [
          item.reviewNote.trim(),
          ...itemWarnings,
          !questionText ? "Sual mətni boşdur." : "",
          !subject ? "Fənn müəyyən edilməyib." : "",
          !mainTopic ? "Əsas mövzu müəyyən edilməyib." : "",
          item.confidence < REVIEW_THRESHOLD ? "Təsnifat əminliyi aşağıdır." : "",
          !year ? "İmtahan ili müəyyən edilməyib." : "",
          !item.questionNumber ? "Sual nömrəsi müəyyən edilməyib." : "",
          !options.length ? "Cavab variantı yoxdur." : "",
          sameContent ? `Mümkün təkrar: ${sameContent.id}` : "",
          item.subtopicNumber && !subtopic ? "Alt mövzu kataloqda tapılmadı." : "",
          collision ? "il/nömrə toqquşması" : "",
        ].filter(Boolean);
        const uncertain = reviewReasons.length > 0;
        const reviewNote = reviewReasons.join(" · ").slice(0, 2000) || null;
        const media = builtMedia.media;
        const labels = new Set<string>();
        const finalOptions = options.map((option, optionIndex) => {
          let label = option.label;
          if (labels.has(label)) label = `${label}_${optionIndex + 1}`;
          labels.add(label);
          return { label, optionText: option.text, sortOrder: optionIndex + 1 };
        });
        const now = new Date();
        const questionId = memoryStore.nextIds.question++;
        memoryStore.questions.push({
          id: questionId,
          subjectId: subject?.id ?? null,
          topicId: mainTopic?.id ?? null,
          subtopicId: subtopic?.id ?? null,
          examFileId,
          examYear: year,
          questionNumber: item.questionNumber,
          originalText: questionText || "Mətn oxunmayıb — mənbə PDF səhifəsinə baxın.",
          correctionSuggestion: item.correctionSuggestion?.trim() || null,
          correctOption: null,
          correctAnswerSource: null,
          media: media.length ? media : null,
          sourcePage: item.sourcePage,
          classificationConfidence: item.confidence,
          classificationReason: item.classificationReason.trim() || null,
          reviewStatus: uncertain ? "needs_review" : "checked",
          reviewNote,
          sourceFingerprint,
          contentFingerprint,
          createdAt: now,
          updatedAt: now,
        });
        for (const option of finalOptions) {
          memoryStore.questionOptions.push({ id: memoryStore.nextIds.option++, questionId, ...option });
        }
        inserted += 1;
        if (uncertain) needsReview += 1;
        memoryStore.saveSnapshot();
        await onItemProcessed?.({ processed: index + 1, total, inserted, skippedDuplicates, needsReview });
        continue;
      }

      const [sameSource] = await db.select({ id: questions.id }).from(questions).where(eq(questions.sourceFingerprint, sourceFingerprint)).limit(1);
      if (sameSource) {
        skippedDuplicates += 1;
        await onItemProcessed?.({ processed: index + 1, total, inserted, skippedDuplicates, needsReview });
        continue;
      }
      const builtMedia = await buildQuestionMediaEntries(item, sourceFingerprint, rendererRef, pdfBytes);
      itemWarnings.push(...builtMedia.warnings);
      const [sameContent] = await db.select({ id: questions.id }).from(questions).where(eq(questions.contentFingerprint, contentFingerprint)).limit(1);
      const reviewReasons = [
        item.reviewNote.trim(),
        ...itemWarnings,
        !questionText ? "Sual mətni boşdur." : "",
        !subject ? "Fənn müəyyən edilməyib." : "",
        !mainTopic ? "Əsas mövzu müəyyən edilməyib." : "",
        item.confidence < REVIEW_THRESHOLD ? "Təsnifat əminliyi aşağıdır." : "",
        !year ? "İmtahan ili müəyyən edilməyib." : "",
        !item.questionNumber ? "Sual nömrəsi müəyyən edilməyib." : "",
        !options.length ? "Cavab variantı yoxdur." : "",
        sameContent ? `Mümkün təkrar: ${sameContent.id}` : "",
        item.subtopicNumber && !subtopic ? "Alt mövzu kataloqda tapılmadı." : "",
        collision ? "il/nömrə toqquşması" : "",
      ].filter(Boolean);
      const uncertain = reviewReasons.length > 0;
      const reviewNote = reviewReasons.join(" · ").slice(0, 2000) || null;
      const media = builtMedia.media;
      const labels = new Set<string>();
      const finalOptions = options.map((option, optionIndex) => {
        let label = option.label;
        if (labels.has(label)) label = `${label}_${optionIndex + 1}`;
        labels.add(label);
        return { label, optionText: option.text, sortOrder: optionIndex + 1 };
      });
      await db.transaction(async tx => {
        await tx.insert(questions).values({
          subjectId: subject?.id ?? null,
          topicId: mainTopic?.id ?? null,
          subtopicId: subtopic?.id ?? null,
          examFileId,
          examYear: year,
          questionNumber: item.questionNumber,
          originalText: questionText || "Mətn oxunmayıb — mənbə PDF səhifəsinə baxın.",
          correctionSuggestion: item.correctionSuggestion?.trim() || null,
          correctOption: null,
          correctAnswerSource: null,
          media: media.length ? media : null,
          sourcePage: item.sourcePage,
          classificationConfidence: item.confidence,
          classificationReason: item.classificationReason.trim() || null,
          reviewStatus: uncertain ? "needs_review" : "checked",
          reviewNote,
          sourceFingerprint,
          contentFingerprint,
        });
        const [created] = await tx.select({ id: questions.id }).from(questions).where(eq(questions.sourceFingerprint, sourceFingerprint)).limit(1);
        if (!created) throw new Error("Sual qeydi bazada tapılmadı.");
        if (finalOptions.length) await tx.insert(questionOptions).values(finalOptions.map(option => ({ ...option, questionId: created.id })));
      });
      inserted += 1;
      if (uncertain) needsReview += 1;
      await onItemProcessed?.({ processed: index + 1, total, inserted, skippedDuplicates, needsReview });
    }
    return { inserted, skippedDuplicates, needsReview };
  } finally {
    await rendererRef.current?.destroy().catch(() => {});
  }
}

export type LiveImportStage =
  | "queued"
  | "preparing_pdf"
  | "uploading_to_ai"
  | "extracting"
  | "saving"
  | "syncing_cloud"
  | "completed"
  | "needs_review"
  | "failed";

export type LiveImportProgress = {
  examFileId: number;
  jobId: number | null;
  stage: LiveImportStage;
  status: "queued" | "processing" | "completed" | "needs_review" | "failed";
  progress: number;
  message: string;
  expectedQuestionCount: number | null;
  detectedQuestionCount: number;
  processedQuestionCount: number;
  insertedCount: number;
  skippedDuplicateCount: number;
  needsReviewCount: number;
  startedAt: string | null;
  updatedAt: string;
};

const liveImportProgressMap = new Map<number, LiveImportProgress>();

export function computeStreamProgress(
  detectedQuestions: number,
  expectedQuestionCount: number | null,
  charsReceived: number,
): number {
  if (expectedQuestionCount && expectedQuestionCount > 0) {
    return Math.min(72, 20 + Math.round((detectedQuestions / expectedQuestionCount) * 52));
  }
  if (detectedQuestions > 0) {
    return Math.min(72, 22 + Math.round(50 * (1 - Math.exp(-detectedQuestions / 20))));
  }
  return Math.min(28, 18 + Math.floor(charsReceived / 2000));
}

function setLiveImportProgress(examFileId: number, patch: Partial<LiveImportProgress> & Pick<LiveImportProgress, "stage" | "status" | "progress" | "message">): LiveImportProgress {
  const prev = liveImportProgressMap.get(examFileId);
  const nowIso = new Date().toISOString();
  const next: LiveImportProgress = {
    examFileId,
    jobId: patch.jobId ?? prev?.jobId ?? null,
    stage: patch.stage,
    status: patch.status,
    progress: Math.max(0, Math.min(100, patch.progress)),
    message: patch.message,
    expectedQuestionCount: patch.expectedQuestionCount !== undefined ? patch.expectedQuestionCount : (prev?.expectedQuestionCount ?? null),
    detectedQuestionCount: patch.detectedQuestionCount ?? prev?.detectedQuestionCount ?? 0,
    processedQuestionCount: patch.processedQuestionCount ?? prev?.processedQuestionCount ?? 0,
    insertedCount: patch.insertedCount ?? prev?.insertedCount ?? 0,
    skippedDuplicateCount: patch.skippedDuplicateCount ?? prev?.skippedDuplicateCount ?? 0,
    needsReviewCount: patch.needsReviewCount ?? prev?.needsReviewCount ?? 0,
    startedAt: patch.startedAt !== undefined ? patch.startedAt : (prev?.startedAt ?? nowIso),
    updatedAt: nowIso,
  };
  liveImportProgressMap.set(examFileId, next);
  return next;
}

async function runImport(
  examFileId: number,
  cloudSyncContext?: { firebaseIdToken: string; userOpenId: string },
) {
  const file = await getExamFileById(examFileId);
  if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "PDF mənbəyi tapılmadı." });
  const db = await getDb();
  let jobId = 0;
  const startedAtIso = new Date().toISOString();
  if (!db) {
    const now = new Date();
    jobId = memoryStore.nextIds.importJob++;
    memoryStore.importJobs.push({ examFileId, id: jobId, status: "processing", progress: 5, message: "PDF AI üçün hazırlanır.", detectedQuestionCount: 0, createdAt: now, updatedAt: now });
  } else {
    const insertResult = await db.insert(importJobs).values({ examFileId, status: "processing", progress: 5, message: "PDF AI üçün hazırlanır.", detectedQuestionCount: 0 });
    jobId = Number((insertResult as unknown as [{ insertId: number }])[0]?.insertId);
  }
  if (!jobId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "İdxal işi yaradıla bilmədi." });

  setLiveImportProgress(examFileId, {
    jobId,
    stage: "preparing_pdf",
    status: "processing",
    progress: 5,
    message: "PDF mənbədən oxunur və emal üçün hazırlanır…",
    expectedQuestionCount: file.expectedQuestionCount ?? null,
    detectedQuestionCount: 0,
    processedQuestionCount: 0,
    insertedCount: 0,
    skippedDuplicateCount: 0,
    needsReviewCount: 0,
    startedAt: startedAtIso,
  });

  let lastDbSyncMs = 0;
  let lastDbQuestionCount = -1;
  const syncJobProgress = async (
    progress: number,
    message: string,
    detectedQuestionCount: number,
    forceDbWrite = false,
  ) => {
    if (!db) {
      const job = memoryStore.importJobs.find(j => j.id === jobId);
      if (job) {
        job.progress = progress;
        job.message = message;
        job.detectedQuestionCount = detectedQuestionCount;
        job.updatedAt = new Date();
      }
      return;
    }
    const now = Date.now();
    if (!forceDbWrite && now - lastDbSyncMs < 1200 && detectedQuestionCount === lastDbQuestionCount) {
      return;
    }
    lastDbSyncMs = now;
    lastDbQuestionCount = detectedQuestionCount;
    await db.update(importJobs).set({ progress, message, detectedQuestionCount }).where(eq(importJobs.id, jobId));
  };

  try {
    await updateExamFileState(examFileId, "processing");
    const storedObject = await storageGetObject(file.storageKey);
    if (!storedObject) {
      throw new Error("Orijinal PDF saxlamada tapılmadı.");
    }
    const pdfBytes = storedObject.bytes;
    if (pdfBytes.byteLength < 8 || pdfBytes.byteLength > MAX_PDF_BYTES || pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("Saxlanmış mənbə etibarlı PDF deyil və ya 50 MB limitini keçir.");
    }

    const extraction = await extractQuestionsFromPdf(
      pdfBytes,
      file.filename,
      file.years ?? [],
      file.expectedQuestionCount,
      {
        onStage: stage => {
          if (stage === "uploading_to_gemini") {
            const msg = "PDF faylı Gemini təhlil xidmətinə göndərilir…";
            setLiveImportProgress(examFileId, { stage: "uploading_to_ai", status: "processing", progress: 12, message: msg });
            void syncJobProgress(12, msg, 0, true);
          } else if (stage === "waiting_file_active") {
            const msg = "Gemini yüklənmiş PDF-i səhifə-səhifə hazırlayır…";
            setLiveImportProgress(examFileId, { stage: "extracting", status: "processing", progress: 16, message: msg });
            void syncJobProgress(16, msg, 0, true);
          } else if (stage === "analyzing_stream") {
            const msg = "AI səhifələri oxuyur və sualları çıxarır…";
            setLiveImportProgress(examFileId, { stage: "extracting", status: "processing", progress: 20, message: msg });
            void syncJobProgress(20, msg, 0, true);
          }
        },
        onProgress: ({ detectedQuestions, charsReceived }) => {
          const pct = computeStreamProgress(detectedQuestions, file.expectedQuestionCount ?? null, charsReceived);
          const msg = detectedQuestions > 0
            ? (file.expectedQuestionCount
              ? `AI təhlili: ${detectedQuestions} / ${file.expectedQuestionCount} sual oxundu…`
              : `AI təhlili: indiyə qədər ${detectedQuestions} sual oxundu…`)
            : "AI səhifələri oxuyur və sual quruluşunu hazırlayır…";
          setLiveImportProgress(examFileId, {
            stage: "extracting",
            status: "processing",
            progress: pct,
            message: msg,
            detectedQuestionCount: detectedQuestions,
          });
          void syncJobProgress(pct, msg, detectedQuestions);
        },
      },
    );

    const extracted = extraction.questions;
    if (!extracted.length) throw new Error("PDF-dən heç bir sual çıxarılmadı; fayl uğursuz kimi saxlanıldı və yenidən emal edilə bilər.");
    const extractionWarnings = completenessWarnings(extraction.completeness);
    if (file.expectedQuestionCount !== null && file.expectedQuestionCount !== extracted.length) {
      extractionWarnings.push(`Gözlənilən ${file.expectedQuestionCount} sualdan ${extracted.length} sual çıxarıldı.`);
    }
    extractionWarnings.push(...questionSequenceWarnings(extracted, file.years ?? []));

    const savingStartMsg = `${extracted.length} sual tanındı; mənbə, təkrarlar və mövzular yoxlanır…`;
    setLiveImportProgress(examFileId, {
      stage: "saving",
      status: "processing",
      progress: 74,
      message: savingStartMsg,
      detectedQuestionCount: extracted.length,
    });
    await syncJobProgress(74, savingStartMsg, extracted.length, true);

    const result = await persistExtractedQuestions(
      examFileId,
      file.sha256,
      file.years ?? [],
      extracted,
      extractionWarnings,
      async stats => {
        const pct = 74 + Math.round((stats.processed / Math.max(1, stats.total)) * 20);
        const dupText = stats.skippedDuplicates > 0 ? `, ${stats.skippedDuplicates} təkrar` : "";
        const msg = `Bazaya yazılır: ${stats.processed} / ${stats.total} sual emal olundu (${stats.inserted} yeni${dupText})…`;
        setLiveImportProgress(examFileId, {
          stage: "saving",
          status: "processing",
          progress: pct,
          message: msg,
          detectedQuestionCount: stats.total,
          processedQuestionCount: stats.processed,
          insertedCount: stats.inserted,
          skippedDuplicateCount: stats.skippedDuplicates,
          needsReviewCount: stats.needsReview,
        });
        await syncJobProgress(pct, msg, stats.total, stats.processed === stats.total);
      },
      pdfBytes,
    );

    let totalQuestions = 0;
    let needsReview = 0;
    if (!db) {
      const fileQuestions = memoryStore.questions.filter(q => q.examFileId === examFileId);
      totalQuestions = fileQuestions.length;
      needsReview = fileQuestions.filter(q => q.reviewStatus === "needs_review").length;
    } else {
      const [totalResult] = await db.select({ value: count() }).from(questions).where(eq(questions.examFileId, examFileId));
      const [reviewResult] = await db.select({ value: count() }).from(questions).where(and(eq(questions.examFileId, examFileId), eq(questions.reviewStatus, "needs_review")));
      totalQuestions = totalResult?.value ?? 0;
      needsReview = reviewResult?.value ?? 0;
    }

    if (cloudSyncContext) {
      const fileQuestions = memoryStore.questions.filter(item => item.examFileId === examFileId);
      setLiveImportProgress(examFileId, {
        stage: "syncing_cloud",
        status: "processing",
        progress: 96,
        message: `Firestore bulud bazasına yazılır (${fileQuestions.length} sual)…`,
        detectedQuestionCount: extracted.length,
        processedQuestionCount: extracted.length,
        insertedCount: result.inserted,
        skippedDuplicateCount: result.skippedDuplicates,
        needsReviewCount: needsReview,
      });
      const batchWrites: Array<{ docPath: string; fields: Record<string, unknown> }> = [];
      const examFileWrite = buildExamFileWrite(examFileId);
      if (examFileWrite) batchWrites.push(examFileWrite);

      for (const q of fileQuestions) {
        const qw = buildQuestionWrite(q.id);
        if (qw) batchWrites.push(qw);
        if (q.correctOption && q.correctAnswerSource) {
          batchWrites.push({
            docPath: `questionAnswers/${q.id}`,
            fields: {
              questionId: q.id,
              correctOption: q.correctOption.slice(0, 8),
              correctAnswerSource: q.correctAnswerSource.slice(0, 1000),
              updatedBy: cloudSyncContext.userOpenId,
            },
          });
        }
      }

      if (batchWrites.length > 0) {
        await commitFirestoreBatch(batchWrites, cloudSyncContext.firebaseIdToken);
      }

      setLiveImportProgress(examFileId, {
        stage: "syncing_cloud",
        status: "processing",
        progress: 99,
        message: "Firestore bulud sinxronizasiyası tamamlandı.",
        detectedQuestionCount: extracted.length,
        processedQuestionCount: extracted.length,
        insertedCount: result.inserted,
        skippedDuplicateCount: result.skippedDuplicates,
        needsReviewCount: needsReview,
      });
    }

    const state = needsReview ? "needs_review" : "completed";
    const warningText = extractionWarnings.length ? ` Tamlıq yoxlanışı: ${extractionWarnings.join(" ")}` : "";
    const doneMsg = `${result.inserted} yeni sual saxlanıldı; ${needsReview} sual yoxlanış tələb edir.${warningText}`;
    if (!db) {
      const job = memoryStore.importJobs.find(j => j.id === jobId);
      if (job) { job.status = state; job.progress = 100; job.detectedQuestionCount = extracted.length; job.message = doneMsg; job.updatedAt = new Date(); }
    } else {
      await db.update(importJobs).set({ status: state, progress: 100, detectedQuestionCount: extracted.length, message: doneMsg }).where(eq(importJobs.id, jobId));
    }
    await updateExamFileState(examFileId, state, totalQuestions);
    memoryStore.saveSnapshot();
    setLiveImportProgress(examFileId, {
      stage: state,
      status: state,
      progress: 100,
      message: doneMsg,
      detectedQuestionCount: extracted.length,
      processedQuestionCount: extracted.length,
      insertedCount: result.inserted,
      skippedDuplicateCount: result.skippedDuplicates,
      needsReviewCount: needsReview,
    });
    return { jobId, detected: extracted.length, inserted: result.inserted, needsReview, status: state };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "PDF emalı alınmadı.";
    if (!db) {
      const job = memoryStore.importJobs.find(j => j.id === jobId);
      if (job) { job.status = "failed"; job.progress = 100; job.message = message; job.updatedAt = new Date(); }
    } else {
      await db.update(importJobs).set({ status: "failed", progress: 100, message }).where(eq(importJobs.id, jobId));
    }
    await updateExamFileState(examFileId, "failed");
    memoryStore.saveSnapshot();
    setLiveImportProgress(examFileId, {
      stage: "failed",
      status: "failed",
      progress: 100,
      message,
    });
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
  }
}

const filterSchema = z.object({
  subjectSlug: z.enum(["informatika", "mentiq"]).optional(),
  topicSlug: z.string().max(96).optional(),
  subtopicSlug: z.string().max(96).optional(),
  examYear: z.number().int().min(1900).max(2100).optional(),
  questionNumber: z.number().int().positive().optional(),
  needsReview: z.boolean().optional(),
  search: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(100000).optional(),
  sort: z.enum(["recent", "exam"]).optional(),
});

export const questionBankRouter = router({
  dashboard: publicProcedure.query(async () => {
    const data = await getDashboardData();
    return { ...data, recent: data.recent.map(redactQuestionForPublic) };
  }),
  subjects: publicProcedure.query(() => listSubjects()),
  topics: publicProcedure.input(z.object({ subjectSlug: z.enum(["informatika", "mentiq"]) })).query(({ input }) => listTopics(input.subjectSlug)),
  exams: publicProcedure.query(async () => (await listExamFiles()).map(({ storageKey: _storageKey, ...file }) => file)),
  questions: publicProcedure.input(filterSchema.optional()).query(async ({ input }) => (await listQuestions(input ?? {})).map(redactQuestionForPublic)),
  practiceQuestions: publicProcedure.input(z.object({ subjectSlug: z.enum(["informatika", "mentiq"]), topicSlug: z.string().max(96), examYear: z.number().int().min(1900).max(2100).optional(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).max(100000).optional() })).query(async ({ input }) => {
    const rows = await listQuestions({ ...input, sort: "exam" });
    return rows.map(redactQuestionForPublic);
  }),
  question: publicProcedure.input(z.object({ questionId: z.number().int().positive() })).query(async ({ input }) => {
    const question = await getQuestion(input.questionId);
    if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Sual tapılmadı." });
    return redactQuestionForPublic(question);
  }),
  reviewQueue: adminProcedure.query(async () => (await listQuestions({ needsReview: true, limit: 200, sort: "recent" })).map(({ sourceStorageKey: _storageKey, ...question }) => ({
    ...question,
    hasVerifiedAnswer: Boolean(question.correctOption && question.correctAnswerSource),
  }))),
  highConfidenceReviewCount: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      memoryStore.ensureInitialized();
      return memoryStore.questions.filter(q =>
        q.reviewStatus === "needs_review" &&
        (q.classificationConfidence ?? 0) >= HIGH_CONFIDENCE_REVIEW_THRESHOLD &&
        q.subjectId !== null &&
        q.topicId !== null &&
        q.examYear !== null &&
        q.questionNumber !== null &&
        (!q.reviewNote || !q.reviewNote.trim()) &&
        memoryStore.questionOptions.some(o => o.questionId === q.id),
      ).length;
    }
    const [result] = await db.select({ value: count() }).from(questions).where(highConfidenceReviewCondition());
    return result?.value ?? 0;
  }),
  approveHighConfidenceReview: adminProcedure.input(z.object({ expectedCount: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) {
      memoryStore.ensureInitialized();
      const matching = memoryStore.questions.filter(q =>
        q.reviewStatus === "needs_review" &&
        (q.classificationConfidence ?? 0) >= HIGH_CONFIDENCE_REVIEW_THRESHOLD &&
        q.subjectId !== null &&
        q.topicId !== null &&
        q.examYear !== null &&
        q.questionNumber !== null &&
        (!q.reviewNote || !q.reviewNote.trim()) &&
        memoryStore.questionOptions.some(o => o.questionId === q.id),
      );
      if (matching.length !== input.expectedCount) {
        throw new TRPCError({ code: "CONFLICT", message: "Yoxlanış siyahısı dəyişib. Sayı yeniləyib əməliyyatı təkrar başladın." });
      }
      for (const q of matching) q.reviewStatus = "checked";
      memoryStore.saveSnapshot();
      if (ctx.firebaseIdToken && ctx.user) {
        await Promise.all(matching.map(q => syncQuestionToFirestore(q.id, ctx.firebaseIdToken!, ctx.user!.openId)));
      }
      return { approved: matching.length };
    }
    return db.transaction(async tx => {
      const predicate = highConfidenceReviewCondition();
      const [result] = await tx.select({ value: count() }).from(questions).where(predicate);
      const currentCount = result?.value ?? 0;
      if (currentCount !== input.expectedCount) {
        throw new TRPCError({ code: "CONFLICT", message: "Yoxlanış siyahısı dəyişib. Sayı yeniləyib əməliyyatı təkrar başladın." });
      }
      await tx.update(questions).set({ reviewStatus: "checked" }).where(predicate);
      return { approved: currentCount };
    });
  }),
  saveReview: adminProcedure.input(z.object({
    questionId: z.number().int().positive(), subjectId: z.number().int().positive().nullable(), topicId: z.number().int().positive().nullable(), subtopicId: z.number().int().positive().nullable(),
    correctedText: z.string().max(12000).nullable(), correctOption: z.string().max(8).nullable(), correctAnswerSource: z.string().max(1000).nullable(),
    answerKeyAction: z.enum(["unchanged", "set", "clear"]).default("unchanged"),
    reviewStatus: z.enum(["checked", "needs_review"]), reviewNote: z.string().max(2000).nullable(),
  })).mutation(async ({ input, ctx }) => {
    const current = await getQuestion(input.questionId);
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Sual tapılmadı." });
    if (input.reviewStatus === "checked" && (!input.subjectId || !input.topicId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Yoxlanmış sual üçün fənn və əsas mövzu seçilməlidir." });
    if ((input.topicId || input.subtopicId) && !input.subjectId) throw new TRPCError({ code: "BAD_REQUEST", message: "Mövzu seçmək üçün əvvəlcə fənn seçilməlidir." });
    const db = await getDb();
    if (!db) {
      if (input.topicId) {
        const topic = memoryStore.getTopicById(input.topicId);
        if (!topic || topic.subjectId !== input.subjectId) throw new TRPCError({ code: "BAD_REQUEST", message: "Mövzu seçilmiş fənnə uyğun deyil." });
      }
      if (input.subtopicId) {
        const subtopic = memoryStore.getTopicById(input.subtopicId);
        if (!subtopic || subtopic.parentId !== input.topicId || subtopic.subjectId !== input.subjectId) throw new TRPCError({ code: "BAD_REQUEST", message: "Alt mövzu seçilmiş əsas mövzuya uyğun deyil." });
      }
    } else {
      if (input.topicId) {
        const [topic] = await db.select().from(topics).where(eq(topics.id, input.topicId)).limit(1);
        if (!topic || topic.subjectId !== input.subjectId) throw new TRPCError({ code: "BAD_REQUEST", message: "Mövzu seçilmiş fənnə uyğun deyil." });
      }
      if (input.subtopicId) {
        const [subtopic] = await db.select().from(topics).where(eq(topics.id, input.subtopicId)).limit(1);
        if (!subtopic || subtopic.parentId !== input.topicId || subtopic.subjectId !== input.subjectId) throw new TRPCError({ code: "BAD_REQUEST", message: "Alt mövzu seçilmiş əsas mövzuya uyğun deyil." });
      }
    }
    if (input.answerKeyAction === "set") {
      if (!input.correctOption) throw new TRPCError({ code: "BAD_REQUEST", message: "Düzgün variant seçilməlidir." });
      if (!current.options.some(option => option.label === input.correctOption)) throw new TRPCError({ code: "BAD_REQUEST", message: "Düzgün cavab mövcud variantlardan biri olmalıdır." });
      if (!input.correctAnswerSource?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Düzgün cavab üçün etibarlı mənbə qeyd edilməlidir." });
    }
    const success = await saveQuestionReview({ ...input, correctAnswerSource: input.answerKeyAction === "set" ? input.correctAnswerSource?.trim() ?? null : null, correctedText: input.correctedText?.trim() || null, reviewNote: input.reviewNote?.trim() || null });
    if (success && ctx.firebaseIdToken && ctx.user) {
      await syncQuestionToFirestore(input.questionId, ctx.firebaseIdToken, ctx.user.openId);
    }
    return { success };
  }),
  recropQuestionMedia: adminProcedure.input(z.object({
    questionId: z.number().int().positive(),
    mediaIndex: z.number().int().min(-1).max(19),
    pageNumber: z.number().int().positive().max(1000),
    bbox: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0.021).max(1),
      h: z.number().min(0.021).max(1),
    }).strict(),
    role: z.enum(["question", "option"]).optional(),
    optionLabel: z.string().max(8).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const current = await getQuestion(input.questionId);
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Sual tapılmadı." });
    const file = await getExamFileById(current.examFileId);
    if (!file || file.mimeType !== "application/pdf") throw new TRPCError({ code: "BAD_REQUEST", message: "Bu sual üçün PDF mənbəyi tapılmadı." });
    const storedPdf = await storageGetObject(file.storageKey);
    if (!storedPdf) throw new TRPCError({ code: "NOT_FOUND", message: "Orijinal PDF faylı saxlamada tapılmadı." });
    const existingMedia = [...(current.media ?? [])];
    const targetIdx = input.mediaIndex >= 0 && input.mediaIndex < existingMedia.length ? input.mediaIndex : existingMedia.length;
    const prefix = sha256(current.sourceFingerprint).slice(0, 20);
    const cropped = await renderAndCropPdfFigure(storedPdf.bytes, input.pageNumber, input.bbox, prefix, targetIdx, storagePut);
    if (cropped.needsReview) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Seçilmiş kəsim qutusu etibarsızdır və ya çox kiçikdir." });
    }
    const prev = existingMedia[targetIdx];
    const nextEntry: QuestionMedia = {
      kind: prev?.kind ?? "image",
      label: prev?.label ?? (input.role === "option" && input.optionLabel ? `Variant ${input.optionLabel}` : "Sual şəkli"),
      value: `${cropped.url}?v=${Date.now()}`,
      storageKey: cropped.storageKey,
      sourcePage: input.pageNumber,
      bbox: input.bbox,
      role: input.role ?? prev?.role ?? "question",
      ...(input.optionLabel !== undefined ? (input.optionLabel ? { optionLabel: input.optionLabel } : {}) : (prev?.optionLabel ? { optionLabel: prev.optionLabel } : {})),
    };
    if (targetIdx < existingMedia.length) existingMedia[targetIdx] = nextEntry;
    else existingMedia.push(nextEntry);
    await updateQuestionMedia(current.id, existingMedia);
    if (ctx.firebaseIdToken && ctx.user) {
      await syncQuestionToFirestore(current.id, ctx.firebaseIdToken, ctx.user.openId);
    }
    return { media: existingMedia };
  }),
  replaceQuestionMedia: adminProcedure.input(z.object({
    questionId: z.number().int().positive(),
    mediaIndex: z.number().int().min(-1).max(19),
    dataUrl: z.string().max(8 * 1024 * 1024),
    role: z.enum(["question", "option"]).default("question"),
    optionLabel: z.string().max(8).nullable().optional(),
    label: z.string().max(120).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const current = await getQuestion(input.questionId);
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Sual tapılmadı." });
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl.trim());
    if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Yalnız PNG, JPEG və ya WebP şəkli yükləmək olar." });
    const mimeType = match[1];
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.byteLength < 16 || bytes.byteLength > 5 * 1024 * 1024) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Şəkil ölçüsü 5 MB-dan çox ola bilməz." });
    }
    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const existingMedia = [...(current.media ?? [])];
    const targetIdx = input.mediaIndex >= 0 && input.mediaIndex < existingMedia.length ? input.mediaIndex : existingMedia.length;
    const prefix = sha256(current.sourceFingerprint).slice(0, 20);
    const stored = await storagePut(`qebulfit/media/${prefix}-custom-${targetIdx}.${ext}`, bytes, mimeType);
    const prev = existingMedia[targetIdx];
    const nextEntry: QuestionMedia = {
      kind: "image",
      label: input.label?.trim() || prev?.label || (input.role === "option" && input.optionLabel ? `Variant ${input.optionLabel}` : "Sual şəkli"),
      value: stored.url,
      storageKey: stored.key,
      ...(current.sourcePage ? { sourcePage: current.sourcePage } : {}),
      role: input.role,
      ...(input.role === "option" && input.optionLabel ? { optionLabel: input.optionLabel } : {}),
    };
    if (targetIdx < existingMedia.length) existingMedia[targetIdx] = nextEntry;
    else existingMedia.push(nextEntry);
    await updateQuestionMedia(current.id, existingMedia);
    if (ctx.firebaseIdToken && ctx.user) {
      await syncQuestionToFirestore(current.id, ctx.firebaseIdToken, ctx.user.openId);
    }
    return { media: existingMedia };
  }),
  recreateAllMedia: adminProcedure.mutation(async () => {
    const db = await getDb();
    const questionsList = db ? await db.select().from(questions) : memoryStore.questions;
    let totalFigureQuestions = 0;
    let successfullyRendered = 0;

    for (const q of questionsList) {
      if (!q.media || !q.media.length) continue;
      const hasImg = q.media.some(m => m.kind === "image" || m.kind === "diagram" || m.value.startsWith("/api/storage/"));
      if (!hasImg) continue;
      totalFigureQuestions += 1;
      const firstImg = q.media.find(m => m.value.startsWith("/api/storage/"));
      if (firstImg) {
        const storageKey = firstImg.value.replace(/^\/api\/storage\//, "").split("?")[0];
        const obj = await storageGetObject(storageKey);
        if (obj) {
          successfullyRendered += 1;
        } else {
          const file = await getExamFileById(q.examFileId);
          if (file && file.mimeType === "application/pdf") {
            const storedPdf = await storageGetObject(file.storageKey);
            if (storedPdf && q.sourcePage && q.sourcePage > 0) {
              try {
                const prefix = sha256(q.sourceFingerprint).slice(0, 20);
                const cropped = await renderAndCropPdfFigure(storedPdf.bytes, q.sourcePage, null, prefix, 0, storagePut);
                const updatedMedia = [...q.media];
                updatedMedia[0] = {
                  ...updatedMedia[0],
                  value: cropped.url,
                  storageKey: cropped.storageKey,
                };
                await updateQuestionMedia(q.id, updatedMedia);
                successfullyRendered += 1;
              } catch {}
            }
          }
        }
      }
    }
    return { totalFigureQuestions, successfullyRendered };
  }),
  deleteQuestionMedia: adminProcedure.input(z.object({
    questionId: z.number().int().positive(),
    mediaIndex: z.number().int().min(0).max(19),
  })).mutation(async ({ input, ctx }) => {
    const current = await getQuestion(input.questionId);
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Sual tapılmadı." });
    const existingMedia = [...(current.media ?? [])];
    if (input.mediaIndex >= existingMedia.length) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Şəkil qeydi tapılmadı." });
    }
    existingMedia.splice(input.mediaIndex, 1);
    await updateQuestionMedia(current.id, existingMedia.length ? existingMedia : null);
    if (ctx.firebaseIdToken && ctx.user) {
      await syncQuestionToFirestore(current.id, ctx.firebaseIdToken, ctx.user.openId);
    }
    return { media: existingMedia };
  }),
  importProgress: adminProcedure
    .input(z.object({ examFileIds: z.array(z.number().int().positive()).max(50).optional() }).optional())
    .query(async ({ input }) => {
      const requestedIds = input?.examFileIds?.length
        ? [...new Set(input.examFileIds)]
        : [...liveImportProgressMap.keys()];
      if (!requestedIds.length) return [];

      const db = await getDb();
      const results: LiveImportProgress[] = [];
      for (const examFileId of requestedIds) {
        const live = liveImportProgressMap.get(examFileId);
        if (live) {
          results.push(live);
          continue;
        }
        const file = await getExamFileById(examFileId);
        if (!db) {
          const jobs = memoryStore.importJobs
            .filter(j => j.examFileId === examFileId)
            .sort((a, b) => b.id - a.id);
          const latest = jobs[0];
          if (!latest && !file) continue;
          const status = (latest?.status ?? (file?.processingStatus === "uploaded" ? "queued" : file?.processingStatus) ?? "queued") as LiveImportProgress["status"];
          const stage: LiveImportStage = status === "processing" ? "extracting" : status;
          results.push({
            examFileId,
            jobId: latest?.id ?? null,
            stage,
            status,
            progress: latest?.progress ?? 0,
            message: latest?.message ?? "PDF emal gözləyir.",
            expectedQuestionCount: file?.expectedQuestionCount ?? null,
            detectedQuestionCount: latest?.detectedQuestionCount ?? file?.questionCount ?? 0,
            processedQuestionCount: status === "completed" || status === "needs_review" ? (latest?.detectedQuestionCount ?? file?.questionCount ?? 0) : 0,
            insertedCount: file?.questionCount ?? 0,
            skippedDuplicateCount: 0,
            needsReviewCount: 0,
            startedAt: latest?.createdAt ? latest.createdAt.toISOString() : null,
            updatedAt: (latest?.updatedAt ?? file?.updatedAt ?? new Date()).toISOString(),
          });
        } else {
          const [latest] = await db
            .select()
            .from(importJobs)
            .where(eq(importJobs.examFileId, examFileId))
            .orderBy(desc(importJobs.id))
            .limit(1);
          if (!latest && !file) continue;
          const status = (latest?.status ?? (file?.processingStatus === "uploaded" ? "queued" : file?.processingStatus) ?? "queued") as LiveImportProgress["status"];
          const stage: LiveImportStage = status === "processing" ? "extracting" : status;
          results.push({
            examFileId,
            jobId: latest?.id ?? null,
            stage,
            status,
            progress: latest?.progress ?? 0,
            message: latest?.message ?? "PDF emal gözləyir.",
            expectedQuestionCount: file?.expectedQuestionCount ?? null,
            detectedQuestionCount: latest?.detectedQuestionCount ?? file?.questionCount ?? 0,
            processedQuestionCount: status === "completed" || status === "needs_review" ? (latest?.detectedQuestionCount ?? file?.questionCount ?? 0) : 0,
            insertedCount: file?.questionCount ?? 0,
            skippedDuplicateCount: 0,
            needsReviewCount: 0,
            startedAt: latest?.createdAt ? latest.createdAt.toISOString() : null,
            updatedAt: (latest?.updatedAt ?? file?.updatedAt ?? new Date()).toISOString(),
          });
        }
      }
      return results;
    }),
  importPdf: adminProcedure.input(z.object({ examFileId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const cloudSyncContext = ctx.firebaseIdToken && ctx.user
      ? { firebaseIdToken: ctx.firebaseIdToken, userOpenId: ctx.user.openId }
      : undefined;
    return runImport(input.examFileId, cloudSyncContext);
  }),
  retryImport: adminProcedure.input(z.object({ examFileId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const file = await getExamFileById(input.examFileId);
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "PDF mənbəyi tapılmadı." });
    if (!["failed", "uploaded", "completed", "needs_review"].includes(file.processingStatus)) throw new TRPCError({ code: "CONFLICT", message: "Bu PDF hazırda emal olunur və yenidən başladılmış hesab edilmir." });
    const cloudSyncContext = ctx.firebaseIdToken && ctx.user
      ? { firebaseIdToken: ctx.firebaseIdToken, userOpenId: ctx.user.openId }
      : undefined;
    return runImport(file.id, cloudSyncContext);
  }),
  syncFirestore: adminProcedure.mutation(async ({ ctx }) => {
    if (!ctx.firebaseIdToken || !ctx.user || ctx.user.loginMethod !== "firebase") {
      return { synced: 0 };
    }
    return syncAllToFirestore(ctx.firebaseIdToken, ctx.user.openId);
  }),
  deleteExamFile: adminProcedure.input(z.object({ examFileId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) {
      memoryStore.ensureInitialized();
      const file = memoryStore.examFiles.find(f => f.id === input.examFileId);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "PDF mənbəyi tapılmadı." });
      if (file.mimeType !== "application/pdf" || file.sourceUrl.startsWith("manual://")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Əl ilə əlavə edilmiş sualların mənbəyi silinə bilməz." });
      }
      const deletedIds = new Set(memoryStore.questions.filter(q => q.examFileId === file.id).map(q => q.id));
      memoryStore.questions = memoryStore.questions.filter(q => q.examFileId !== file.id);
      memoryStore.questionOptions = memoryStore.questionOptions.filter(o => !deletedIds.has(o.questionId));
      memoryStore.importJobs = memoryStore.importJobs.filter(j => j.examFileId !== file.id);
      memoryStore.examFiles = memoryStore.examFiles.filter(f => f.id !== file.id);
      memoryStore.saveSnapshot();
      if (ctx.firebaseIdToken) {
        await deleteFirestoreDoc(`examFiles/${file.id}`, ctx.firebaseIdToken);
        for (const qId of deletedIds) {
          await deleteFirestoreDoc(`questions/${qId}`, ctx.firebaseIdToken);
          await deleteFirestoreDoc(`questionAnswers/${qId}`, ctx.firebaseIdToken);
        }
      }
      return { deletedQuestionCount: deletedIds.size };
    }
    return db.transaction(async tx => {
      const [file] = await tx.select({ id: examFiles.id, mimeType: examFiles.mimeType, sourceUrl: examFiles.sourceUrl }).from(examFiles).where(eq(examFiles.id, input.examFileId)).limit(1);
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "PDF mənbəyi tapılmadı." });
      if (file.mimeType !== "application/pdf" || file.sourceUrl.startsWith("manual://")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Əl ilə əlavə edilmiş sualların mənbəyi silinə bilməz." });
      }
      const matchingQuestions = await tx.select({ id: questions.id }).from(questions).where(eq(questions.examFileId, file.id));
      const deletedIds = matchingQuestions.map(q => q.id);
      const deletedQuestionCount = deletedIds.length;

      if (deletedIds.length > 0) {
        await tx.delete(questionOptions).where(inArray(questionOptions.questionId, deletedIds));
      }
      await tx.delete(questions).where(eq(questions.examFileId, file.id));
      await tx.delete(importJobs).where(eq(importJobs.examFileId, file.id));
      await tx.delete(examFiles).where(eq(examFiles.id, file.id));

      if (ctx.firebaseIdToken) {
        await deleteFirestoreDoc(`examFiles/${file.id}`, ctx.firebaseIdToken);
        for (const qId of deletedIds) {
          await deleteFirestoreDoc(`questions/${qId}`, ctx.firebaseIdToken);
          await deleteFirestoreDoc(`questionAnswers/${qId}`, ctx.firebaseIdToken);
        }
      }

      return { deletedQuestionCount };
    });
  }),
  attempts: publicProcedure.input(z.object({ learnerKey: z.string().min(16).max(64), limit: z.number().int().min(1).max(100).optional() })).query(({ input }) => getLearnerAttempts(input.learnerKey, input.limit)),
  startAttempt: publicProcedure.input(z.object({
    learnerKey: z.string().min(16).max(64),
    subjectSlug: z.enum(["informatika", "mentiq"]),
    topicSlug: z.string().max(96),
    examYear: z.number().int().min(1900).max(2100).nullable(),
    questionIds: z.array(z.number().int().positive()).min(1).max(200),
  }).strict()).mutation(async ({ input }) => {
    const subject = await getSubjectBySlug(input.subjectSlug);
    if (!subject) throw new TRPCError({ code: "BAD_REQUEST", message: "Fənn tapılmadı." });
    const topic = await getTopicBySlug(input.topicSlug);
    if (!topic || topic.subjectId !== subject.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Mövzu seçilmiş fənnə uyğun deyil." });
    const offeredQuestions = await listQuestions({
      subjectSlug: input.subjectSlug,
      topicSlug: input.topicSlug,
      examYear: input.examYear ?? undefined,
      limit: 200,
      sort: "exam",
    });
    const questionIds = offeredQuestions.map(question => question.id);
    if (!hasExactQuestionSet(questionIds, input.questionIds)) {
      throw new TRPCError({ code: "CONFLICT", message: "Test sualları yenilənib. Siyahını yeniləyib testi yenidən başladın." });
    }

    const db = await getDb();
    if (!db) {
      return memoryStore.startPracticeSession({
        learnerKey: input.learnerKey,
        subjectId: subject.id,
        topicId: topic.id,
        examYear: input.examYear,
        questionIds,
      });
    }
    const now = new Date();
    await db.delete(practiceSessions).where(lte(practiceSessions.expiresAt, now));
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    await db.insert(practiceSessions).values({
      tokenHash: sha256(sessionToken),
      learnerKey: input.learnerKey,
      subjectId: subject.id,
      topicId: topic.id,
      examYear: input.examYear,
      questionIds,
      expiresAt,
    });
    return { sessionToken, expiresAt: expiresAt.toISOString(), questionCount: questionIds.length };
  }),
  saveAttempt: publicProcedure.input(z.object({
    learnerKey: z.string().min(16).max(64), sessionToken: z.string().length(64),
    answers: z.array(z.object({ questionId: z.number().int().positive(), selectedOption: z.string().max(8).nullable() }).strict()).min(1).max(200),
  }).strict()).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) {
      memoryStore.ensureInitialized();
      const tokenHash = sha256(input.sessionToken);
      const session = memoryStore.practiceSessions.find(s => s.tokenHash === tokenHash && s.learnerKey === input.learnerKey);
      if (!session || session.expiresAt.getTime() <= Date.now()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Test sessiyası tapılmadı və ya vaxtı bitib. Testi yenidən başladın." });
      }
      const answers = input.answers;
      const ids = session.questionIds;
      if (session.topicId === null) throw new TRPCError({ code: "CONFLICT", message: "Test mövzusu tapılmadı. Testi yenidən başladın." });
      const currentOfferedIds = memoryStore.questions
        .filter(q => q.subjectId === session.subjectId && q.topicId === session.topicId && (session.examYear === null || q.examYear === session.examYear))
        .sort((a, b) => ((a.examYear ?? 0) - (b.examYear ?? 0)) || ((a.questionNumber ?? 0) - (b.questionNumber ?? 0)))
        .slice(0, 200)
        .map(q => q.id);
      if (!hasExactQuestionSet(ids, currentOfferedIds)) {
        throw new TRPCError({ code: "CONFLICT", message: "Mövzunun sual siyahısı test başlayandan sonra dəyişib. Siyahını yeniləyib testi yenidən başladın." });
      }
      if (!hasExactQuestionSet(ids, answers.map(answer => answer.questionId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nəticə yalnız sessiyadakı bütün suallar üçün göndərilə bilər." });
      }
      const questionRows = memoryStore.questions.filter(q => ids.includes(q.id));
      if (questionRows.length !== ids.length) throw new TRPCError({ code: "CONFLICT", message: "Test suallarından biri dəyişib və ya silinib. Testi yenidən başladın." });
      let correctCount = 0;
      let incorrectCount = 0;
      let unscoredCount = 0;
      const scoredAnswers: AttemptAnswer[] = answers.map(answer => {
        const question = questionRows.find(row => row.id === answer.questionId)!;
        if (question.subjectId !== session.subjectId || (session.topicId && question.topicId !== session.topicId) || (session.examYear !== null && question.examYear !== session.examYear)) {
          throw new TRPCError({ code: "CONFLICT", message: "Test suallarının fənni, mövzusu və ya ili dəyişib. Testi yenidən başladın." });
        }
        const selectedExists = answer.selectedOption !== null && memoryStore.questionOptions.some(o => o.questionId === question.id && o.label === answer.selectedOption);
        const isScored = !!question.correctOption && selectedExists;
        const isCorrect = isScored ? answer.selectedOption === question.correctOption : null;
        if (!isScored) unscoredCount += 1;
        else if (isCorrect) correctCount += 1;
        else incorrectCount += 1;
        return { questionId: question.id, selectedOption: selectedExists ? answer.selectedOption : null, verifiedCorrectOption: isScored && !isCorrect ? question.correctOption : null, isScored, isCorrect };
      });
      const scoredQuestions = correctCount + incorrectCount;
      const scorePercent = scoredQuestions ? Math.round(correctCount / scoredQuestions * 100) : null;
      const attemptId = memoryStore.nextIds.attempt++;
      memoryStore.studyAttempts.push({
        id: attemptId,
        learnerKey: session.learnerKey,
        subjectId: session.subjectId,
        topicId: session.topicId,
        examYear: session.examYear,
        totalQuestions: scoredAnswers.length,
        scoredQuestions,
        correctCount,
        incorrectCount,
        unscoredCount,
        scorePercent,
        answers: scoredAnswers,
        createdAt: new Date(),
      });
      memoryStore.practiceSessions = memoryStore.practiceSessions.filter(s => s.id !== session.id);
      memoryStore.saveSnapshot();
      return { attemptId, totalQuestions: scoredAnswers.length, scoredQuestions, correctCount, incorrectCount, unscoredCount, scorePercent, answers: scoredAnswers };
    }
    return db.transaction(async tx => {
      const [session] = await tx.select().from(practiceSessions).where(and(
        eq(practiceSessions.tokenHash, sha256(input.sessionToken)),
        eq(practiceSessions.learnerKey, input.learnerKey),
      )).for("update");
      if (!session || session.expiresAt.getTime() <= Date.now()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Test sessiyası tapılmadı və ya vaxtı bitib. Testi yenidən başladın." });
      }

      const answers = input.answers;
      const ids = session.questionIds;
      if (session.topicId === null) throw new TRPCError({ code: "CONFLICT", message: "Test mövzusu tapılmadı. Testi yenidən başladın." });
      const currentQuestionPredicate = session.examYear === null
        ? and(eq(questions.subjectId, session.subjectId), eq(questions.topicId, session.topicId))!
        : and(eq(questions.subjectId, session.subjectId), eq(questions.topicId, session.topicId), eq(questions.examYear, session.examYear))!;
      const currentOfferedQuestions = await tx.select({ id: questions.id }).from(questions)
        .where(currentQuestionPredicate)
        .orderBy(asc(questions.examYear), asc(questions.questionNumber))
        .limit(200)
        .for("update");
      if (!hasExactQuestionSet(ids, currentOfferedQuestions.map(question => question.id))) {
        throw new TRPCError({ code: "CONFLICT", message: "Mövzunun sual siyahısı test başlayandan sonra dəyişib. Siyahını yeniləyib testi yenidən başladın." });
      }
      if (!hasExactQuestionSet(ids, answers.map(answer => answer.questionId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nəticə yalnız sessiyadakı bütün suallar üçün göndərilə bilər." });
      }
      const questionRows = await tx.select().from(questions).where(inArray(questions.id, ids));
      if (questionRows.length !== ids.length) throw new TRPCError({ code: "CONFLICT", message: "Test suallarından biri dəyişib və ya silinib. Testi yenidən başladın." });
      const optionRows = await tx.select().from(questionOptions).where(inArray(questionOptions.questionId, ids));
      const optionsByQuestion = new Map<number, typeof optionRows>();
      for (const option of optionRows) optionsByQuestion.set(option.questionId, [...(optionsByQuestion.get(option.questionId) ?? []), option]);
      let correctCount = 0;
      let incorrectCount = 0;
      let unscoredCount = 0;
      const scoredAnswers: AttemptAnswer[] = answers.map(answer => {
        const question = questionRows.find(row => row.id === answer.questionId)!;
        if (question.subjectId !== session.subjectId || (session.topicId && question.topicId !== session.topicId) || (session.examYear !== null && question.examYear !== session.examYear)) {
          throw new TRPCError({ code: "CONFLICT", message: "Test suallarının fənni, mövzusu və ya ili dəyişib. Testi yenidən başladın." });
        }
        const selectedExists = answer.selectedOption !== null && (optionsByQuestion.get(question.id) ?? []).some(option => option.label === answer.selectedOption);
        const isScored = !!question.correctOption && selectedExists;
        const isCorrect = isScored ? answer.selectedOption === question.correctOption : null;
        if (!isScored) unscoredCount += 1;
        else if (isCorrect) correctCount += 1;
        else incorrectCount += 1;
        return { questionId: question.id, selectedOption: selectedExists ? answer.selectedOption : null, verifiedCorrectOption: isScored && !isCorrect ? question.correctOption : null, isScored, isCorrect };
      });
      const scoredQuestions = correctCount + incorrectCount;
      const scorePercent = scoredQuestions ? Math.round(correctCount / scoredQuestions * 100) : null;
      const result = await tx.insert(studyAttempts).values({
        learnerKey: session.learnerKey,
        subjectId: session.subjectId,
        topicId: session.topicId,
        examYear: session.examYear,
        totalQuestions: scoredAnswers.length,
        scoredQuestions,
        correctCount,
        incorrectCount,
        unscoredCount,
        scorePercent,
        answers: scoredAnswers,
      });
      const attemptId = Number((result as unknown as [{ insertId: number }])[0]?.insertId);
      await tx.delete(practiceSessions).where(eq(practiceSessions.id, session.id));
      return { attemptId: Number.isFinite(attemptId) ? attemptId : null, totalQuestions: scoredAnswers.length, scoredQuestions, correctCount, incorrectCount, unscoredCount, scorePercent, answers: scoredAnswers };
    });
  }),
  exportBackup: adminProcedure.query(async () => {
    const subjectsData = await listSubjects();
    const examsData = await listExamFiles();
    const topicsData = (await Promise.all(SUBJECT_CATALOG.map(subject => listTopics(subject.slug)))).flat();
    type PublicQuestion = Omit<Awaited<ReturnType<typeof listQuestions>>[number], "correctOption" | "correctAnswerSource" | "sourceStorageKey" | "updatedAt">;
    const allQuestions: PublicQuestion[] = [];
    for (let offset = 0; offset < 100000; offset += 200) {
      const batch = await listQuestions({ limit: 200, offset, sort: "exam" });
      allQuestions.push(...batch.map(redactQuestionForPublic));
      if (batch.length < 200) break;
    }
    if (allQuestions.length >= 100000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Ehtiyat nüsxəsi 100 000 sual limitini keçdi." });
    return { exportedAt: new Date().toISOString(), subjects: subjectsData, topics: topicsData, examFiles: examsData, questions: allQuestions };
  }),
  manualQuestion: adminProcedure.input(z.object({
    subjectSlug: z.enum(["informatika", "mentiq"]), topicSlug: z.string().max(96), subtopicSlug: z.string().max(96).nullable(), examYear: z.number().int().min(1900).max(2100).nullable(), questionNumber: z.number().int().positive().nullable(),
    questionText: z.string().trim().min(3).max(12000), options: z.array(z.object({ label: z.string().trim().min(1).max(8), text: z.string().trim().min(1).max(2000) }).strict()).min(2).max(10),
  })).mutation(async ({ input, ctx }) => {
    const subject = await getSubjectBySlug(input.subjectSlug);
    const topic = await getTopicBySlug(input.topicSlug);
    const subtopic = input.subtopicSlug ? await getTopicBySlug(input.subtopicSlug) : null;
    if (!subject || !topic || topic.subjectId !== subject.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Fənn və mövzu uyğun deyil." });
    if (input.subtopicSlug && (!subtopic || subtopic.parentId !== topic.id || subtopic.subjectId !== subject.id)) throw new TRPCError({ code: "BAD_REQUEST", message: "Alt mövzu əsas mövzuya uyğun deyil." });
    const manualHash = sha256("qebulfit-manual-question-source-v1");
    const contentFingerprint = sha256([input.questionText, ...input.options.map(option => `${option.label}:${option.text}`)].map(normalize).join("\n"));
    const sourceFingerprint = `manual:${contentFingerprint}`.slice(0, 96);
    const db = await getDb();
    if (!db) {
      memoryStore.ensureInitialized();
      let manualFile = memoryStore.examFiles.find(f => f.sha256 === manualHash);
      const now = new Date();
      if (!manualFile) {
        manualFile = { id: memoryStore.nextIds.examFile++, filename: "Əl ilə əlavə edilmiş suallar", title: "İstifadəçi tərəfindən əlavə olunub", storageKey: "manual/qebulfit/questions", sourceUrl: "manual://qebulfit/manual-entry", sha256: manualHash, fileSize: 0, mimeType: "application/x-qebulfit-manual", years: [], expectedQuestionCount: null, questionCount: 0, processingStatus: "completed", createdAt: now, updatedAt: now };
        memoryStore.examFiles.push(manualFile);
      }
      const duplicate = memoryStore.questions.find(q => q.contentFingerprint === contentFingerprint);
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: `Eyni məzmuna bənzər sual artıq mövcuddur (#${duplicate.id}).` });
      const questionId = memoryStore.nextIds.question++;
      memoryStore.questions.push({ id: questionId, subjectId: subject.id, topicId: topic.id, subtopicId: subtopic?.id ?? null, examFileId: manualFile.id, examYear: input.examYear, questionNumber: input.questionNumber, originalText: input.questionText, correctionSuggestion: null, correctOption: null, correctAnswerSource: null, media: null, sourcePage: null, classificationConfidence: 1, classificationReason: "İstifadəçi fənn və mövzunu əl ilə seçib.", reviewStatus: "checked", reviewNote: null, sourceFingerprint, contentFingerprint, createdAt: now, updatedAt: now });
      input.options.forEach((option, index) => {
        memoryStore.questionOptions.push({ id: memoryStore.nextIds.option++, questionId, label: option.label, optionText: option.text, sortOrder: index + 1 });
      });
      manualFile.questionCount += 1;
      memoryStore.saveSnapshot();
      if (ctx.firebaseIdToken && ctx.user) {
        await syncExamFileToFirestore(manualFile.id, ctx.firebaseIdToken);
        await syncQuestionToFirestore(questionId, ctx.firebaseIdToken, ctx.user.openId);
      }
      return { success: true, questionId };
    }
    let [manualFile] = await db.select().from(examFiles).where(eq(examFiles.sha256, manualHash)).limit(1);
    if (!manualFile) {
      await db.insert(examFiles).values({ filename: "Əl ilə əlavə edilmiş suallar", title: "İstifadəçi tərəfindən əlavə olunub", storageKey: "manual/qebulfit/questions", sourceUrl: "manual://qebulfit/manual-entry", sha256: manualHash, fileSize: 0, mimeType: "application/x-qebulfit-manual", years: [], questionCount: 0, processingStatus: "completed" }).onDuplicateKeyUpdate({ set: { sha256: sql`${examFiles.sha256}` } });
      [manualFile] = await db.select().from(examFiles).where(eq(examFiles.sha256, manualHash)).limit(1);
    }
    if (!manualFile) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Əl ilə əlavə olunan sual üçün mənbə qeydi yaradıla bilmədi." });
    const [duplicate] = await db.select({ id: questions.id }).from(questions).where(eq(questions.contentFingerprint, contentFingerprint)).limit(1);
    if (duplicate) throw new TRPCError({ code: "CONFLICT", message: `Eyni məzmuna bənzər sual artıq mövcuddur (#${duplicate.id}).` });
    let questionId = 0;
    await db.transaction(async tx => {
      const result = await tx.insert(questions).values({ subjectId: subject.id, topicId: topic.id, subtopicId: subtopic?.id ?? null, examFileId: manualFile.id, examYear: input.examYear, questionNumber: input.questionNumber, originalText: input.questionText, correctionSuggestion: null, correctOption: null, correctAnswerSource: null, media: null, sourcePage: null, classificationConfidence: 1, classificationReason: "İstifadəçi fənn və mövzunu əl ilə seçib.", reviewStatus: "checked", reviewNote: null, sourceFingerprint, contentFingerprint });
      questionId = Number((result as unknown as [{ insertId: number }])[0]?.insertId);
      await tx.insert(questionOptions).values(input.options.map((option, index) => ({ questionId, label: option.label, optionText: option.text, sortOrder: index + 1 })));
    });
    await db.update(examFiles).set({ questionCount: sql`${examFiles.questionCount} + 1` }).where(eq(examFiles.id, manualFile.id));
    return { success: true, questionId };
  }),
});

export async function handlePdfUploadRequest(fileBytes: Buffer, filename: string, yearHeader: string | undefined, expectedQuestionCountHeader?: string) {
  const requestedYears = yearHeader?.split(",").map(value => Number(value.trim())).filter(Number.isInteger) ?? [];
  const expectedQuestionCount = expectedQuestionCountHeader?.trim() ? Number(expectedQuestionCountHeader.trim()) : null;
  if (expectedQuestionCount !== null && (!Number.isInteger(expectedQuestionCount) || expectedQuestionCount < 1 || expectedQuestionCount > 500)) throw new Error("Gözlənilən sual sayı 1 ilə 500 arasında olmalıdır.");
  return storeUploadedPdf(fileBytes, filename, requestedYears, expectedQuestionCount);
}

export async function renderExamFilePagePng(examFileId: number, pageNumber: number) {
  const file = await getExamFileById(examFileId);
  if (!file || file.mimeType !== "application/pdf") return null;
  const stored = await storageGetObject(file.storageKey);
  if (!stored) return null;
  return renderPdfPagePng(stored.bytes, pageNumber);
}

export { ensureTopicCatalog, importQuestionSchema, persistExtractedQuestions };
