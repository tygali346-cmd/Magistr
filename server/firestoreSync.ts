import { createHash } from "node:crypto";
import { commitFirestoreBatch, commitFirestoreUpsert, deleteFirestoreDoc, queryPublicCollection } from "./firestoreRest";
import { memoryStore } from "./memoryStore";
import type { QuestionMedia } from "../drizzle/schema";

function buildCatalogWrites() {
  const subjectById = new Map(memoryStore.subjects.map(s => [s.id, s]));
  const topicById = new Map(memoryStore.topics.map(t => [t.id, t]));
  const writes: Array<{ docPath: string; fields: Record<string, unknown> }> = [];

  for (const subject of memoryStore.subjects) {
    writes.push({
      docPath: `subjects/${subject.slug}`,
      fields: {
        slug: subject.slug,
        name: subject.name.slice(0, 128),
        sortOrder: subject.sortOrder,
        visibility: "public",
      },
    });
  }

  for (const topic of memoryStore.topics) {
    const subject = subjectById.get(topic.subjectId);
    if (!subject) continue;
    const parent = topic.parentId ? topicById.get(topic.parentId) : undefined;
    writes.push({
      docPath: `topics/${topic.slug}`,
      fields: {
        subjectSlug: subject.slug,
        slug: topic.slug.slice(0, 96),
        numberLabel: topic.numberLabel.slice(0, 16),
        name: topic.name.slice(0, 255),
        ...(parent ? { parentSlug: parent.slug.slice(0, 96) } : {}),
        sortOrder: topic.sortOrder,
        isActive: topic.isActive,
        visibility: "public",
      },
    });
  }

  return writes;
}

export function buildExamFileWrite(examFileId: number) {
  const file = memoryStore.getExamFileById(examFileId);
  if (!file) return null;
  return {
    docPath: `examFiles/${file.id}`,
    fields: {
      filename: file.filename.slice(0, 255),
      title: file.title.slice(0, 255),
      sourceUrl: (file.sourceUrl || `manual://qebulfit/${file.id}`).slice(0, 512),
      sha256: file.sha256,
      fileSize: Math.max(0, file.fileSize),
      mimeType: file.mimeType.slice(0, 128),
      years: (file.years ?? []).slice(0, 10),
      questionCount: Math.max(0, file.questionCount),
      processingStatus: file.processingStatus,
      visibility: "public",
    },
  };
}

export function buildQuestionWrite(questionId: number) {
  const q = memoryStore.questions.find(item => item.id === questionId);
  if (!q) return null;
  const subject = q.subjectId ? memoryStore.subjects.find(s => s.id === q.subjectId) : undefined;
  const topic = q.topicId ? memoryStore.getTopicById(q.topicId) : undefined;
  const subtopic = q.subtopicId ? memoryStore.getTopicById(q.subtopicId) : undefined;
  const options = memoryStore.questionOptions
    .filter(o => o.questionId === q.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 10)
    .map(o => ({ label: o.label, optionText: o.optionText, sortOrder: o.sortOrder }));

  return {
    docPath: `questions/${q.id}`,
    fields: {
      questionId: q.id,
      ...(subject ? { subjectSlug: subject.slug } : {}),
      ...(topic ? { topicSlug: topic.slug.slice(0, 96) } : {}),
      ...(subtopic ? { subtopicSlug: subtopic.slug.slice(0, 96) } : {}),
      examFileId: q.examFileId,
      ...(q.examYear !== null ? { examYear: q.examYear } : {}),
      ...(q.questionNumber !== null ? { questionNumber: q.questionNumber } : {}),
      originalText: (q.originalText || "—").slice(0, 12000),
      ...(q.correctionSuggestion ? { correctionSuggestion: q.correctionSuggestion.slice(0, 12000) } : {}),
      options,
      ...(q.media && q.media.length ? { media: q.media.slice(0, 20) } : {}),
      ...(q.sourcePage !== null && q.sourcePage > 0 ? { sourcePage: q.sourcePage } : {}),
      ...(q.classificationConfidence !== null ? { classificationConfidence: q.classificationConfidence } : {}),
      ...(q.classificationReason ? { classificationReason: q.classificationReason.slice(0, 2000) } : {}),
      reviewStatus: q.reviewStatus,
      ...(q.reviewNote ? { reviewNote: q.reviewNote.slice(0, 2000) } : {}),
      sourceFingerprint: q.sourceFingerprint.slice(0, 96),
      contentFingerprint: q.contentFingerprint.slice(0, 64),
      visibility: "public",
    },
  };
}

export async function syncCatalogToFirestore(idToken: string) {
  if (!idToken) return;
  memoryStore.ensureInitialized();
  await commitFirestoreBatch(buildCatalogWrites(), idToken);
}

export async function syncExamFileToFirestore(examFileId: number, idToken: string) {
  if (!idToken) return;
  const write = buildExamFileWrite(examFileId);
  if (!write) return;
  await commitFirestoreUpsert(write.docPath, write.fields, { idToken });
}

export async function syncQuestionToFirestore(questionId: number, idToken: string, adminUid: string) {
  if (!idToken) return;
  const write = buildQuestionWrite(questionId);
  if (!write) return;
  await commitFirestoreUpsert(write.docPath, write.fields, { idToken });

  const q = memoryStore.questions.find(item => item.id === questionId);
  if (q && q.correctOption && q.correctAnswerSource && adminUid) {
    await commitFirestoreUpsert(
      `questionAnswers/${q.id}`,
      {
        questionId: q.id,
        correctOption: q.correctOption.slice(0, 8),
        correctAnswerSource: q.correctAnswerSource.slice(0, 1000),
        updatedBy: adminUid,
      },
      { idToken },
    );
  } else if (q) {
    await deleteFirestoreDoc(`questionAnswers/${q.id}`, idToken);
  }
}

export async function syncAnswerKeyFileToFirestore(fileId: number, idToken: string) {
  if (!idToken) return;
  const file = memoryStore.answerKeyFiles.find(f => f.id === fileId);
  if (!file) return;
  const subject = memoryStore.subjects.find(s => s.id === file.subjectId);
  if (!subject) return;

  await commitFirestoreUpsert(
    `answerKeyFiles/${file.id}`,
    {
      filename: file.filename.slice(0, 255),
      sha256: file.sha256,
      fileSize: Math.max(1, file.fileSize),
      subjectSlug: subject.slug,
      years: (file.years ?? []).slice(0, 10),
      entryCount: Math.max(0, file.entryCount),
      processingStatus: file.processingStatus,
      ...(file.statusMessage ? { statusMessage: file.statusMessage.slice(0, 1000) } : {}),
    },
    { idToken },
  );

  const entries = memoryStore.answerKeyEntries.filter(e => e.answerKeyFileId === file.id);
  const entryWrites = entries.map(entry => ({
    docPath: `answerKeyFiles/${file.id}/entries/${entry.id}`,
    fields: {
      answerKeyFileId: String(file.id),
      subjectSlug: subject.slug,
      ...(entry.examYear !== null ? { examYear: entry.examYear } : {}),
      ...(entry.questionNumber !== null && entry.questionNumber > 0 ? { questionNumber: entry.questionNumber } : {}),
      answerToken: (entry.answerToken || "—").slice(0, 32),
      ...(entry.suggestedOption ? { suggestedOption: entry.suggestedOption.slice(0, 8) } : {}),
      confidence: entry.confidence,
      ...(entry.sourcePage !== null && entry.sourcePage > 0 ? { sourcePage: entry.sourcePage } : {}),
      status: entry.status,
      ...(entry.matchedQuestionId !== null && entry.matchedQuestionId > 0 ? { matchedQuestionId: entry.matchedQuestionId } : {}),
      ...(entry.reviewNote ? { reviewNote: entry.reviewNote.slice(0, 2000) } : {}),
    },
  }));
  await commitFirestoreBatch(entryWrites, idToken);
}

export async function syncAllToFirestore(idToken: string, adminUid: string) {
  if (!idToken || !adminUid) return { synced: 0 };
  memoryStore.ensureInitialized();

  const writes: Array<{ docPath: string; fields: Record<string, unknown> }> = [
    ...buildCatalogWrites(),
  ];

  for (const file of memoryStore.examFiles) {
    const w = buildExamFileWrite(file.id);
    if (w) writes.push(w);
  }

  for (const q of memoryStore.questions) {
    const w = buildQuestionWrite(q.id);
    if (w) writes.push(w);
    if (q.correctOption && q.correctAnswerSource) {
      writes.push({
        docPath: `questionAnswers/${q.id}`,
        fields: {
          questionId: q.id,
          correctOption: q.correctOption.slice(0, 8),
          correctAnswerSource: q.correctAnswerSource.slice(0, 1000),
          updatedBy: adminUid,
        },
      });
    }
  }

  for (const [key, blob] of memoryStore.storageBlobs.entries()) {
    if (key.startsWith("qebulfit/media/")) {
      const mediaId = createHash("sha256").update(key).digest("hex").slice(0, 64);
      writes.push({
        docPath: `media/${mediaId}`,
        fields: {
          mediaId,
          storageKey: key,
          contentType: blob.contentType,
          base64Data: Buffer.from(blob.bytes).toString("base64"),
          visibility: "public",
        },
      });
    }
  }

  await commitFirestoreBatch(writes, idToken);

  for (const ak of memoryStore.answerKeyFiles) {
    await syncAnswerKeyFileToFirestore(ak.id, idToken);
  }

  return { synced: memoryStore.questions.length };
}

export async function hydrateFromFirestore(): Promise<boolean> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return false;
  const [fsSubjects, fsTopics, fsExamFiles, fsQuestions] = await Promise.all([
    queryPublicCollection("subjects"),
    queryPublicCollection("topics"),
    queryPublicCollection("examFiles"),
    queryPublicCollection("questions"),
  ]);

  if (!fsSubjects.length && !fsTopics.length && !fsQuestions.length) {
    return false;
  }

  memoryStore.ensureInitialized();
  memoryStore.hydratePublicCatalogFromFirestore({
    subjects: fsSubjects as Array<Record<string, unknown>>,
    topics: fsTopics as Array<Record<string, unknown>>,
    examFiles: fsExamFiles as Array<Record<string, unknown>>,
    questions: fsQuestions as Array<Record<string, unknown> & { media?: QuestionMedia[] }>,
  });
  return true;
}

export async function migrateMediaToFirestore(idToken: string): Promise<{ migrated: number; skipped: number; failed: number }> {
  if (!idToken) return { migrated: 0, skipped: 0, failed: 0 };
  memoryStore.ensureInitialized();

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  const writes: Array<{ docPath: string; fields: Record<string, unknown> }> = [];
  for (const [key, blob] of memoryStore.storageBlobs.entries()) {
    if (blob.bytes.byteLength > 900 * 1024) {
      skipped += 1;
      continue;
    }
    const mediaId = createHash("sha256").update(blob.bytes).digest("hex");
    writes.push({
      docPath: `media/${mediaId}`,
      fields: {
        mediaId,
        storageKey: key,
        contentType: blob.contentType,
        base64Data: Buffer.from(blob.bytes).toString("base64"),
        visibility: "public",
      },
    });
  }

  const CHUNK_SIZE = 400;
  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const chunk = writes.slice(i, i + CHUNK_SIZE);
    try {
      const result = await commitFirestoreBatch(chunk, idToken);
      migrated += result.committed;
      failed += result.failed;
    } catch {
      failed += chunk.length;
    }
  }

  return { migrated, skipped, failed };
}

