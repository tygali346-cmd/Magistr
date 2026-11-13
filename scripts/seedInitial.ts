import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, count, eq } from "drizzle-orm";
import { seedQuestions } from "../data/seed-2010-11";
import { examFiles, importJobs, questionOptions, questions, subjects, topics, type QuestionMedia } from "../drizzle/schema";
import { requireDatabase } from "../server/questionBankDb";
import { ensureTopicCatalog, storeUploadedPdf } from "../server/questionBank";

const sourcePath = process.argv[2] ?? "/home/ubuntu/upload/2010-11.pdf";
const sourceFilename = "2010-11.pdf";

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("az").replace(/\s+/g, " ").trim();
}

function sourcePage(year: number, questionNumber: number) {
  if (year === 2010) return questionNumber <= 10 ? 1 : questionNumber <= 21 ? 2 : 3;
  return questionNumber <= 10 ? 4 : questionNumber <= 20 ? 5 : 6;
}

function questionMedia(year: number, questionNumber: number): QuestionMedia[] | null {
  if (year === 2010 && questionNumber === 3) {
    return [{ kind: "formula", label: "Alqoritm ifadəsi", sourcePage: 1, value: "Y = { sin x, x < 1; x² + 5, 1 ≤ x ≤ 3; e^(x+2), x > 3 }" }];
  }
  if (year === 2011 && questionNumber === 12) {
    return [{ kind: "table", label: "Abiturient cədvəli", sourcePage: 5, value: "№ | S.A.A | Cins | Doğum ili | Fakültə\n1 | Vəliyeva.N.P | 2 | 23.04.83 | Kimya\n2 | Əliyeva S.L | 2 | 10.01.80 | Biologiya\n3 | Məmmədova A.İ | 2 | 30.03.82 | Tarix\n4 | Muxtarova A.M | 2 | 15.06.82 | Kimya\n5 | Həsənov Z.K | 1 | 13.03.82 | Kimya\n6 | Rzayeva U.T | 2 | 17.08.81 | Kimya\n7 | Rəhimli G.K | 1 | 19.06.81 | biologiya" }];
  }
  if (year === 2011 && questionNumber === 15) {
    return [{ kind: "formula", label: "Excel düsturu", sourcePage: 5, value: "=ROWS(B2:B6)" }];
  }
  if (year === 2011 && questionNumber === 21) {
    return [{ kind: "table", label: "Excel xanaları", sourcePage: 6, value: "Sütunlar A, B, C\n1-ci sətir: A=4, B=24, C=$A$1*B1\n2-ci sətir: A=5, B=15, C boşdur" }];
  }
  return null;
}

async function main() {
  await ensureTopicCatalog();
  const bytes = await readFile(sourcePath);
  const upload = await storeUploadedPdf(bytes, sourceFilename, [2010, 2011], 50);
  const db = await requireDatabase();
  const [file] = await db.select().from(examFiles).where(eq(examFiles.id, upload.examFileId)).limit(1);
  if (!file) throw new Error("Mənbə PDF bazada tapılmadı.");
  await db.update(examFiles).set({ expectedQuestionCount: 50 }).where(eq(examFiles.id, file.id));
  const [subject] = await db.select().from(subjects).where(eq(subjects.slug, "informatika")).limit(1);
  if (!subject) throw new Error("İnformatika fənni bazada tapılmadı.");
  const topicRows = await db.select().from(topics).where(eq(topics.subjectId, subject.id));
  const byNumber = new Map(topicRows.map(topic => [topic.numberLabel, topic]));
  let inserted = 0;
  let skipped = 0;
  let reviewCount = 0;

  for (const item of seedQuestions) {
    const topic = byNumber.get(String(item.topicNumber));
    if (!topic) throw new Error(`Mövzu tapılmadı: ${item.topicNumber}`);
    const fingerprintText = [item.questionText, ...item.options.map(normalize)].map(normalize).join("\n");
    const contentFingerprint = sha256(fingerprintText);
    const sourceFingerprint = `${file.sha256.slice(0, 50)}:${item.year}:${item.questionNumber}`.slice(0, 96);
    const [existing] = await db.select({ id: questions.id }).from(questions).where(eq(questions.sourceFingerprint, sourceFingerprint)).limit(1);
    if (existing) {
      skipped += 1;
      if (item.review) reviewCount += 1;
      continue;
    }
    const optionRows = item.options.map((raw, index) => {
      const match = raw.match(/^([A-E](?:[.)])?)\s*(.*)$/i);
      if (!match || !match[2]) throw new Error(`Cavab variantı oxunmadı: ${item.year} / ${item.questionNumber} / ${raw}`);
      return { label: match[1], optionText: match[2], sortOrder: index + 1 };
    });
    await db.transaction(async tx => {
      await tx.insert(questions).values({
        subjectId: subject.id,
        topicId: topic.id,
        subtopicId: null,
        examFileId: file.id,
        examYear: item.year,
        questionNumber: item.questionNumber,
        originalText: item.questionText,
        correctionSuggestion: null,
        correctOption: null,
        correctAnswerSource: null,
        media: questionMedia(item.year, item.questionNumber),
        sourcePage: sourcePage(item.year, item.questionNumber),
        classificationConfidence: item.confidence,
        classificationReason: item.reason,
        reviewStatus: item.review ? "needs_review" : "checked",
        reviewNote: item.reviewNote,
        sourceFingerprint,
        contentFingerprint,
      });
      const [created] = await tx.select({ id: questions.id }).from(questions).where(eq(questions.sourceFingerprint, sourceFingerprint)).limit(1);
      if (!created) throw new Error(`Sual qeydi yaradıla bilmədi: ${item.year}/${item.questionNumber}`);
      await tx.insert(questionOptions).values(optionRows.map(option => ({ ...option, questionId: created.id })));
    });
    inserted += 1;
    if (item.review) reviewCount += 1;
  }

  await db.update(examFiles).set({
    questionCount: seedQuestions.length,
    processingStatus: reviewCount ? "needs_review" : "completed",
  }).where(eq(examFiles.id, file.id));
  await db.update(importJobs).set({
    status: reviewCount ? "needs_review" : "completed",
    progress: 100,
    detectedQuestionCount: seedQuestions.length,
    message: `${seedQuestions.length} sual ayrıca nəzərdən keçirilib və İnformatika mövzularına yerləşdirilib; ${reviewCount} qeyd yoxlanış üçün işarələnib. Təsdiqlənmiş cavab açarı olmadığı üçün düzgün cavablar boş saxlanılıb.`,
  }).where(and(eq(importJobs.examFileId, file.id), eq(importJobs.status, "queued")));

  const [total] = await db.select({ count: count() }).from(questions).where(eq(questions.examFileId, file.id));
  console.log(JSON.stringify({ examFileId: file.id, filename: file.filename, inserted, skipped, total: total?.count ?? 0, expectedTotal: seedQuestions.length, reviewCount, years: file.years }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
