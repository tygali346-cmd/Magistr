import { and, asc, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { SUBJECT_CATALOG, TOPIC_CATALOG, type SubjectSlug } from "@shared/topicCatalog";
import { examFiles, importJobs, questionOptions, questions, studyAttempts, subjects, topics } from "../drizzle/schema";
import { getDb, markDatabaseUnavailable } from "./db";
import { memoryStore } from "./memoryStore";
import { hydrateFromFirestore } from "./firestoreSync";

export type QuestionFilters = {
  subjectSlug?: SubjectSlug;
  topicSlug?: string;
  subtopicSlug?: string;
  questionId?: number;
  examYear?: number;
  questionNumber?: number;
  needsReview?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: "recent" | "exam";
};

export function requireDatabase() {
  return getDb().then(db => {
    if (!db) throw new Error("Məlumat bazası hazır deyil.");
    return db;
  });
}

/** Inserts missing fixed catalog rows and hydrates cache from Firestore when populated. */
export async function ensureTopicCatalog() {
  const db = await getDb();
  if (!db) {
    memoryStore.ensureInitialized();
    const hydrated = await hydrateFromFirestore().catch(() => false);
    if (hydrated) {
      console.log("[Firestore] Question bank cache hydrated from Firestore");
    } else {
      console.warn("[Firestore] Firestore catalog is currently empty — using local seed/cache until an admin signs in to sync");
    }
    return;
  }

  try {
    for (const subject of SUBJECT_CATALOG) {
      await db.insert(subjects).values(subject).onDuplicateKeyUpdate({
        set: { slug: sql`${subjects.slug}` },
      });
    }

    const subjectRows = await db.select().from(subjects);
    const subjectIds = new Map(subjectRows.map(subject => [subject.slug, subject.id]));
    const topicRows = await db.select().from(topics);
    const topicSlugs = new Set(topicRows.map(topic => topic.slug));

    for (const topic of TOPIC_CATALOG) {
      if (topicSlugs.has(topic.slug)) continue;
      const subjectId = subjectIds.get(topic.subjectSlug);
      if (!subjectId) throw new Error(`Fənn tapılmadı: ${topic.subjectSlug}`);
      const parent = topic.parentNumberLabel
        ? topicRows.find(row => row.subjectId === subjectId && row.numberLabel === topic.parentNumberLabel)
        : undefined;
      await db.insert(topics).values({
        subjectId,
        slug: topic.slug,
        numberLabel: topic.numberLabel,
        name: topic.name,
        parentId: parent?.id ?? null,
        sortOrder: topic.sortOrder,
        isActive: true,
      }).onDuplicateKeyUpdate({
        set: { slug: sql`${topics.slug}` },
      });
    }
    const seededTopics = await db.select().from(topics);
    for (const topic of TOPIC_CATALOG) {
      if (!topic.parentNumberLabel) continue;
      const subjectId = subjectIds.get(topic.subjectSlug);
      const parent = seededTopics.find(row => row.subjectId === subjectId && row.numberLabel === topic.parentNumberLabel);
      const child = seededTopics.find(row => row.slug === topic.slug);
      if (parent && child && child.parentId !== parent.id) {
        await db.update(topics).set({ parentId: parent.id }).where(eq(topics.id, child.id));
      }
    }
  } catch (error) {
    console.warn("[Database] Connection failed during startup — switching to seeded in-memory store:", error instanceof Error ? error.message : error);
    markDatabaseUnavailable();
    memoryStore.ensureInitialized();
  }
}

export async function listSubjects() {
  const db = await getDb();
  if (!db) return memoryStore.listSubjects();
  const rows = await db.select({
    id: subjects.id,
    slug: subjects.slug,
    name: subjects.name,
    sortOrder: subjects.sortOrder,
    questionCount: count(questions.id),
  }).from(subjects)
    .leftJoin(questions, eq(questions.subjectId, subjects.id))
    .groupBy(subjects.id)
    .orderBy(asc(subjects.sortOrder));
  return rows;
}

export async function listTopics(subjectSlug: SubjectSlug) {
  const db = await getDb();
  if (!db) return memoryStore.listTopics(subjectSlug);
  const subject = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.slug, subjectSlug)).limit(1);
  if (!subject[0]) return [];
  return db.select({
    id: topics.id,
    slug: topics.slug,
    numberLabel: topics.numberLabel,
    name: topics.name,
    parentId: topics.parentId,
    sortOrder: topics.sortOrder,
    questionCount: count(questions.id),
  }).from(topics)
    .leftJoin(questions, or(eq(questions.topicId, topics.id), eq(questions.subtopicId, topics.id)))
    .where(eq(topics.subjectId, subject[0].id))
    .groupBy(topics.id)
    .orderBy(asc(topics.sortOrder));
}

export async function listExamFiles() {
  const db = await getDb();
  if (!db) return memoryStore.listExamFiles();
  const rows = await db.select().from(examFiles).orderBy(desc(examFiles.createdAt));
  return rows;
}

export async function getDashboardData() {
  const db = await getDb();
  if (!db) return memoryStore.getDashboardData();
  const [questionTotal] = await db.select({ value: count() }).from(questions);
  const [examTotal] = await db.select({ value: count() }).from(examFiles);
  const [reviewTotal] = await db.select({ value: count() }).from(questions).where(eq(questions.reviewStatus, "needs_review"));
  const subjectList = await listSubjects();
  const topicRows = await db.select({
    id: topics.id,
    slug: topics.slug,
    numberLabel: topics.numberLabel,
    name: topics.name,
    subjectId: topics.subjectId,
    parentId: topics.parentId,
    count: count(questions.id),
  }).from(topics)
    .leftJoin(questions, or(eq(questions.topicId, topics.id), eq(questions.subtopicId, topics.id)))
    .groupBy(topics.id)
    .orderBy(asc(topics.sortOrder));
  const recent = await listQuestions({ limit: 8, sort: "recent" });
  const latestImports = await db.select().from(importJobs).orderBy(desc(importJobs.createdAt)).limit(5);
  return {
    totalQuestions: questionTotal?.value ?? 0,
    totalExams: examTotal?.value ?? 0,
    needsReview: reviewTotal?.value ?? 0,
    subjects: subjectList,
    topics: topicRows,
    recent,
    latestImports,
  };
}

export async function listQuestions(filters: QuestionFilters = {}) {
  const db = await getDb();
  if (!db) return memoryStore.listQuestions(filters);
  const predicates = [];
  if (filters.subjectSlug) predicates.push(eq(subjects.slug, filters.subjectSlug));
  if (filters.topicSlug) predicates.push(eq(topics.slug, filters.topicSlug));
  if (filters.questionId !== undefined) predicates.push(eq(questions.id, filters.questionId));
  if (filters.examYear !== undefined) predicates.push(eq(questions.examYear, filters.examYear));
  if (filters.questionNumber !== undefined) predicates.push(eq(questions.questionNumber, filters.questionNumber));
  if (filters.subtopicSlug) {
    const [subtopic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.slug, filters.subtopicSlug)).limit(1);
    if (!subtopic) return [];
    predicates.push(eq(questions.subtopicId, subtopic.id));
  }
  if (filters.needsReview) predicates.push(eq(questions.reviewStatus, "needs_review"));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().slice(0, 120)}%`;
    predicates.push(or(like(questions.originalText, term), like(questions.correctionSuggestion, term))!);
  }

  const baseQuery = db.select({
    id: questions.id,
    subjectId: questions.subjectId,
    subjectSlug: subjects.slug,
    subjectName: subjects.name,
    topicId: questions.topicId,
    topicSlug: topics.slug,
    topicNumber: topics.numberLabel,
    topicName: topics.name,
    subtopicId: questions.subtopicId,
    examFileId: questions.examFileId,
    examYear: questions.examYear,
    questionNumber: questions.questionNumber,
    originalText: questions.originalText,
    correctionSuggestion: questions.correctionSuggestion,
    correctOption: questions.correctOption,
    correctAnswerSource: questions.correctAnswerSource,
    media: questions.media,
    sourcePage: questions.sourcePage,
    classificationConfidence: questions.classificationConfidence,
    classificationReason: questions.classificationReason,
    reviewStatus: questions.reviewStatus,
    reviewNote: questions.reviewNote,
    sourceFingerprint: questions.sourceFingerprint,
    contentFingerprint: questions.contentFingerprint,
    createdAt: questions.createdAt,
    updatedAt: questions.updatedAt,
    sourceFilename: examFiles.filename,
    sourceTitle: examFiles.title,
    sourceUrl: examFiles.sourceUrl,
    sourceStorageKey: examFiles.storageKey,
  }).from(questions)
    .leftJoin(subjects, eq(questions.subjectId, subjects.id))
    .leftJoin(topics, eq(questions.topicId, topics.id))
    .leftJoin(examFiles, eq(questions.examFileId, examFiles.id));

  const rows = await baseQuery.where(predicates.length ? and(...predicates) : undefined)
    .orderBy(filters.sort === "recent" ? desc(questions.createdAt) : asc(questions.examYear), asc(questions.questionNumber))
    .limit(Math.max(1, Math.min(filters.limit ?? 100, 200)))
    .offset(Math.max(0, filters.offset ?? 0));

  const ids = rows.map(row => row.id);
  const optionRows = ids.length
    ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, ids)).orderBy(asc(questionOptions.sortOrder))
    : [];
  const optionsByQuestion = new Map<number, typeof optionRows>();
  for (const option of optionRows) {
    const list = optionsByQuestion.get(option.questionId) ?? [];
    list.push(option);
    optionsByQuestion.set(option.questionId, list);
  }
  return rows.map(row => ({ ...row, options: optionsByQuestion.get(row.id) ?? [] }));
}

export async function getQuestion(questionId: number) {
  const rows = await listQuestions({ questionId, limit: 1 });
  return rows[0] ?? null;
}

export async function saveQuestionReview(input: {
  questionId: number;
  subjectId: number | null;
  topicId: number | null;
  subtopicId: number | null;
  correctedText: string | null;
  correctOption: string | null;
  correctAnswerSource: string | null;
  answerKeyAction: "unchanged" | "set" | "clear";
  reviewStatus: "checked" | "needs_review";
  reviewNote: string | null;
}) {
  const db = await getDb();
  if (!db) return memoryStore.saveQuestionReview(input);
  const [current] = await db.select().from(questions).where(eq(questions.id, input.questionId)).limit(1);
  if (!current) return false;
  await db.update(questions).set({
    subjectId: input.subjectId,
    topicId: input.topicId,
    subtopicId: input.subtopicId,
    correctionSuggestion: input.correctedText,
    ...(input.answerKeyAction === "unchanged" ? {} : {
      correctOption: input.answerKeyAction === "set" ? input.correctOption : null,
      correctAnswerSource: input.answerKeyAction === "set" ? input.correctAnswerSource : null,
    }),
    reviewStatus: input.reviewStatus,
    reviewNote: input.reviewNote,
  }).where(eq(questions.id, input.questionId));
  return true;
}

export async function getLearnerAttempts(learnerKey: string, limit = 50) {
  const db = await getDb();
  if (!db) return memoryStore.getLearnerAttempts(learnerKey, limit);
  return db.select().from(studyAttempts)
    .where(eq(studyAttempts.learnerKey, learnerKey))
    .orderBy(desc(studyAttempts.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));
}

export async function getSubjectBySlug(subjectSlug: SubjectSlug) {
  const db = await getDb();
  if (!db) return memoryStore.getSubjectBySlug(subjectSlug);
  const rows = await db.select().from(subjects).where(eq(subjects.slug, subjectSlug)).limit(1);
  return rows[0] ?? null;
}

export async function getTopicBySlug(topicSlug: string) {
  const db = await getDb();
  if (!db) return memoryStore.getTopicBySlug(topicSlug);
  const rows = await db.select().from(topics).where(eq(topics.slug, topicSlug)).limit(1);
  return rows[0] ?? null;
}

export async function getExamFileById(examFileId: number) {
  const db = await getDb();
  if (!db) return memoryStore.getExamFileById(examFileId);
  const rows = await db.select().from(examFiles).where(eq(examFiles.id, examFileId)).limit(1);
  return rows[0] ?? null;
}

export async function updateExamFileState(examFileId: number, state: "uploaded" | "processing" | "completed" | "needs_review" | "failed", countValue?: number) {
  const db = await getDb();
  if (!db) {
    memoryStore.updateExamFileState(examFileId, state, countValue);
    return;
  }
  await db.update(examFiles).set({
    processingStatus: state,
    ...(countValue !== undefined ? { questionCount: countValue } : {}),
  }).where(eq(examFiles.id, examFileId));
}
