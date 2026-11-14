import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { seedQuestions } from "../data/seed-2010-11";
import { SUBJECT_CATALOG, TOPIC_CATALOG, type SubjectSlug } from "@shared/topicCatalog";
import type {
  AnswerKeyEntry,
  AnswerKeyFile,
  ExamFile,
  ImportJob,
  InsertUser,
  PracticeSession,
  Question,
  QuestionMedia,
  QuestionOption,
  StudyAttempt,
  Subject,
  Topic,
  User,
} from "../drizzle/schema";
import type { QuestionFilters } from "./questionBankDb";

const STORE_SNAPSHOT_PATH = path.resolve(process.cwd(), ".data", "qebulfit-store.json");

function isDiskPersistenceEnabled() {
  return !process.env.VITEST && process.env.NODE_ENV !== "test";
}

function reviveDates<T extends Record<string, unknown>>(row: T, dateFields: string[]): T {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of dateFields) {
    if (typeof copy[key] === "string") {
      copy[key] = new Date(copy[key] as string);
    }
  }
  return copy as T;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("az").replace(/\s+/g, " ").trim();
}

function seedSourcePage(year: number, questionNumber: number) {
  if (year === 2010) return questionNumber <= 10 ? 1 : questionNumber <= 21 ? 2 : 3;
  return questionNumber <= 10 ? 4 : questionNumber <= 20 ? 5 : 6;
}

function seedQuestionMedia(year: number, questionNumber: number): QuestionMedia[] | null {
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

class MemoryStore {
  initialized = false;
  nextIds = {
    user: 1,
    subject: 1,
    topic: 1,
    examFile: 1,
    question: 1,
    option: 1,
    attempt: 1,
    session: 1,
    importJob: 1,
    answerKeyFile: 1,
    answerKeyEntry: 1,
  };

  users: User[] = [];
  subjects: Subject[] = [];
  topics: Topic[] = [];
  examFiles: ExamFile[] = [];
  questions: Question[] = [];
  questionOptions: QuestionOption[] = [];
  studyAttempts: StudyAttempt[] = [];
  practiceSessions: PracticeSession[] = [];
  importJobs: ImportJob[] = [];
  answerKeyFiles: AnswerKeyFile[] = [];
  answerKeyEntries: AnswerKeyEntry[] = [];
  storageBlobs = new Map<string, { bytes: Buffer; contentType: string }>();

  ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;
    if (this.loadSnapshot()) return;
    const now = new Date();

    // Seed subjects
    for (const def of SUBJECT_CATALOG) {
      this.subjects.push({
        id: this.nextIds.subject++,
        slug: def.slug,
        name: def.name,
        sortOrder: def.sortOrder,
        createdAt: now,
      });
    }

    const subjectBySlug = new Map(this.subjects.map(s => [s.slug, s]));

    // Seed topics (parents first)
    for (const def of TOPIC_CATALOG) {
      if (def.parentNumberLabel) continue;
      const subject = subjectBySlug.get(def.subjectSlug)!;
      this.topics.push({
        id: this.nextIds.topic++,
        subjectId: subject.id,
        slug: def.slug,
        numberLabel: def.numberLabel,
        name: def.name,
        parentId: null,
        sortOrder: def.sortOrder,
        isActive: true,
        createdAt: now,
      });
    }

    // Seed child topics
    for (const def of TOPIC_CATALOG) {
      if (!def.parentNumberLabel) continue;
      const subject = subjectBySlug.get(def.subjectSlug)!;
      const parent = this.topics.find(t => t.subjectId === subject.id && t.numberLabel === def.parentNumberLabel);
      this.topics.push({
        id: this.nextIds.topic++,
        subjectId: subject.id,
        slug: def.slug,
        numberLabel: def.numberLabel,
        name: def.name,
        parentId: parent?.id ?? null,
        sortOrder: def.sortOrder,
        isActive: true,
        createdAt: now,
      });
    }

    // Seed 2010-11 Informatics archive
    const informatika = subjectBySlug.get("informatika")!;
    const topicByNum = new Map(
      this.topics.filter(t => t.subjectId === informatika.id).map(t => [t.numberLabel, t]),
    );
    const seedSha = sha256("qebulfit-seed-2010-11.pdf");
    const reviewCount = seedQuestions.filter(q => q.review).length;

    const seedFile: ExamFile = {
      id: this.nextIds.examFile++,
      filename: "2010-11.pdf",
      title: "2010–2011 İnformatika qəbul sualları",
      storageKey: "seed/2010-11.pdf",
      sourceUrl: "manual://qebulfit/seed-2010-11",
      sha256: seedSha,
      fileSize: 23450,
      mimeType: "application/pdf",
      years: [2010, 2011],
      expectedQuestionCount: seedQuestions.length,
      questionCount: seedQuestions.length,
      processingStatus: reviewCount ? "needs_review" : "completed",
      createdAt: now,
      updatedAt: now,
    };
    this.examFiles.push(seedFile);

    this.importJobs.push({
      id: this.nextIds.importJob++,
      examFileId: seedFile.id,
      status: reviewCount ? "needs_review" : "completed",
      progress: 100,
      message: `${seedQuestions.length} sual ayrıca nəzərdən keçirilib və İnformatika mövzularına yerləşdirilib; ${reviewCount} qeyd yoxlanış üçün işarələnib.`,
      detectedQuestionCount: seedQuestions.length,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of seedQuestions) {
      const topic = topicByNum.get(String(item.topicNumber)) ?? null;
      const fingerprintText = [item.questionText, ...item.options.map(normalize)].map(normalize).join("\n");
      const contentFingerprint = sha256(fingerprintText);
      const sourceFingerprint = `${seedSha.slice(0, 50)}:${item.year}:${item.questionNumber}`.slice(0, 96);
      const questionId = this.nextIds.question++;
      this.questions.push({
        id: questionId,
        subjectId: informatika.id,
        topicId: topic?.id ?? null,
        subtopicId: null,
        examFileId: seedFile.id,
        examYear: item.year,
        questionNumber: item.questionNumber,
        originalText: item.questionText,
        correctionSuggestion: null,
        correctOption: null,
        correctAnswerSource: null,
        media: seedQuestionMedia(item.year, item.questionNumber),
        sourcePage: seedSourcePage(item.year, item.questionNumber),
        classificationConfidence: item.confidence,
        classificationReason: item.reason,
        reviewStatus: item.review ? "needs_review" : "checked",
        reviewNote: item.reviewNote,
        sourceFingerprint,
        contentFingerprint,
        createdAt: now,
        updatedAt: now,
      });

      item.options.forEach((raw, idx) => {
        const match = raw.match(/^([A-E])(?:[.)])?\s*(.*)$/i);
        const label = match ? match[1].toUpperCase() : String.fromCharCode(65 + idx);
        const optionText = match && match[2] ? match[2] : raw;
        this.questionOptions.push({
          id: this.nextIds.option++,
          questionId,
          label,
          optionText,
          sortOrder: idx + 1,
        });
      });
    }
  }

  upsertUser(user: InsertUser): void {
    this.ensureInitialized();
    const existing = this.users.find(u => u.openId === user.openId);
    const now = new Date();
    if (existing) {
      if (user.name !== undefined) existing.name = user.name ?? null;
      if (user.email !== undefined) existing.email = user.email ?? null;
      if (user.loginMethod !== undefined) existing.loginMethod = user.loginMethod ?? null;
      if (user.role !== undefined) existing.role = user.role;
      existing.lastSignedIn = user.lastSignedIn ?? now;
      existing.updatedAt = now;
    } else {
      this.users.push({
        id: this.nextIds.user++,
        openId: user.openId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        role: user.role ?? "user",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: user.lastSignedIn ?? now,
      });
    }
  }

  getUserByOpenId(openId: string): User | undefined {
    this.ensureInitialized();
    return this.users.find(u => u.openId === openId);
  }

  listSubjects() {
    this.ensureInitialized();
    return [...this.subjects]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(subject => ({
        id: subject.id,
        slug: subject.slug,
        name: subject.name,
        sortOrder: subject.sortOrder,
        questionCount: this.questions.filter(q => q.subjectId === subject.id).length,
      }));
  }

  listTopics(subjectSlug: SubjectSlug) {
    this.ensureInitialized();
    const subject = this.subjects.find(s => s.slug === subjectSlug);
    if (!subject) return [];
    return this.topics
      .filter(t => t.subjectId === subject.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(topic => ({
        id: topic.id,
        slug: topic.slug,
        numberLabel: topic.numberLabel,
        name: topic.name,
        parentId: topic.parentId,
        sortOrder: topic.sortOrder,
        questionCount: this.questions.filter(q => q.topicId === topic.id || q.subtopicId === topic.id).length,
      }));
  }

  listExamFiles() {
    this.ensureInitialized();
    return [...this.examFiles].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getDashboardData() {
    this.ensureInitialized();
    const subjectList = this.listSubjects();
    const topicRows = [...this.topics]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(topic => ({
        id: topic.id,
        slug: topic.slug,
        numberLabel: topic.numberLabel,
        name: topic.name,
        subjectId: topic.subjectId,
        parentId: topic.parentId,
        count: this.questions.filter(q => q.topicId === topic.id || q.subtopicId === topic.id).length,
      }));
    const recent = this.listQuestions({ limit: 8, sort: "recent" });
    const latestImports = [...this.importJobs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);
    return {
      totalQuestions: this.questions.length,
      totalExams: this.examFiles.length,
      needsReview: this.questions.filter(q => q.reviewStatus === "needs_review").length,
      subjects: subjectList,
      topics: topicRows,
      recent,
      latestImports,
    };
  }

  listQuestions(filters: QuestionFilters = {}) {
    this.ensureInitialized();
    const subjectById = new Map(this.subjects.map(s => [s.id, s]));
    const topicById = new Map(this.topics.map(t => [t.id, t]));
    const fileById = new Map(this.examFiles.map(f => [f.id, f]));

    let subtopicIdFilter: number | null = null;
    if (filters.subtopicSlug) {
      const subtopic = this.topics.find(t => t.slug === filters.subtopicSlug);
      if (!subtopic) return [];
      subtopicIdFilter = subtopic.id;
    }

    const searchLower = filters.search?.trim().slice(0, 120).toLowerCase() ?? "";

    const matched = this.questions.filter(q => {
      const subject = q.subjectId ? subjectById.get(q.subjectId) : undefined;
      const topic = q.topicId ? topicById.get(q.topicId) : undefined;
      if (filters.subjectSlug && subject?.slug !== filters.subjectSlug) return false;
      if (filters.topicSlug && topic?.slug !== filters.topicSlug) return false;
      if (filters.questionId !== undefined && q.id !== filters.questionId) return false;
      if (filters.examYear !== undefined && q.examYear !== filters.examYear) return false;
      if (filters.questionNumber !== undefined && q.questionNumber !== filters.questionNumber) return false;
      if (subtopicIdFilter !== null && q.subtopicId !== subtopicIdFilter) return false;
      if (filters.needsReview && q.reviewStatus !== "needs_review") return false;
      if (searchLower) {
        const hay = `${q.originalText} ${q.correctionSuggestion ?? ""}`.toLowerCase();
        if (!hay.includes(searchLower)) return false;
      }
      return true;
    });

    matched.sort((a, b) => {
      if (filters.sort === "recent") {
        const dt = b.createdAt.getTime() - a.createdAt.getTime();
        if (dt !== 0) return dt;
        return (a.questionNumber ?? 0) - (b.questionNumber ?? 0);
      }
      const yr = (a.examYear ?? 0) - (b.examYear ?? 0);
      if (yr !== 0) return yr;
      return (a.questionNumber ?? 0) - (b.questionNumber ?? 0);
    });

    const offset = Math.max(0, filters.offset ?? 0);
    const limit = Math.max(1, Math.min(filters.limit ?? 100, 200));
    const sliced = matched.slice(offset, offset + limit);

    return sliced.map(q => {
      const subject = q.subjectId ? subjectById.get(q.subjectId) : undefined;
      const topic = q.topicId ? topicById.get(q.topicId) : undefined;
      const file = fileById.get(q.examFileId);
      const options = this.questionOptions
        .filter(o => o.questionId === q.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return {
        id: q.id,
        subjectId: q.subjectId,
        subjectSlug: subject?.slug ?? null,
        subjectName: subject?.name ?? null,
        topicId: q.topicId,
        topicSlug: topic?.slug ?? null,
        topicNumber: topic?.numberLabel ?? null,
        topicName: topic?.name ?? null,
        subtopicId: q.subtopicId,
        examFileId: q.examFileId,
        examYear: q.examYear,
        questionNumber: q.questionNumber,
        originalText: q.originalText,
        correctionSuggestion: q.correctionSuggestion,
        correctOption: q.correctOption,
        correctAnswerSource: q.correctAnswerSource,
        media: q.media,
        sourcePage: q.sourcePage,
        classificationConfidence: q.classificationConfidence,
        classificationReason: q.classificationReason,
        reviewStatus: q.reviewStatus,
        reviewNote: q.reviewNote,
        sourceFingerprint: q.sourceFingerprint,
        contentFingerprint: q.contentFingerprint,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        sourceFilename: file?.filename ?? null,
        sourceTitle: file?.title ?? null,
        sourceUrl: file?.sourceUrl ?? null,
        sourceStorageKey: file?.storageKey ?? null,
        options,
      };
    });
  }

  getQuestion(questionId: number) {
    return this.listQuestions({ questionId, limit: 1 })[0] ?? null;
  }

  saveQuestionReview(input: {
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
    this.ensureInitialized();
    const q = this.questions.find(item => item.id === input.questionId);
    if (!q) return false;
    q.subjectId = input.subjectId;
    q.topicId = input.topicId;
    q.subtopicId = input.subtopicId;
    q.correctionSuggestion = input.correctedText;
    if (input.answerKeyAction === "set") {
      q.correctOption = input.correctOption;
      q.correctAnswerSource = input.correctAnswerSource;
    } else if (input.answerKeyAction === "clear") {
      q.correctOption = null;
      q.correctAnswerSource = null;
    }
    q.reviewStatus = input.reviewStatus;
    q.reviewNote = input.reviewNote;
    q.updatedAt = new Date();
    this.saveSnapshot();
    return true;
  }

  getLearnerAttempts(learnerKey: string, limit = 50) {
    this.ensureInitialized();
    const cap = Math.max(1, Math.min(limit, 100));
    return this.studyAttempts
      .filter(a => a.learnerKey === learnerKey)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, cap);
  }

  getSubjectBySlug(subjectSlug: SubjectSlug) {
    this.ensureInitialized();
    return this.subjects.find(s => s.slug === subjectSlug) ?? null;
  }

  getTopicBySlug(topicSlug: string) {
    this.ensureInitialized();
    return this.topics.find(t => t.slug === topicSlug) ?? null;
  }

  getTopicById(topicId: number) {
    this.ensureInitialized();
    return this.topics.find(t => t.id === topicId) ?? null;
  }

  getExamFileById(examFileId: number) {
    this.ensureInitialized();
    return this.examFiles.find(f => f.id === examFileId) ?? null;
  }

  updateExamFileState(examFileId: number, state: ExamFile["processingStatus"], countValue?: number) {
    this.ensureInitialized();
    const file = this.examFiles.find(f => f.id === examFileId);
    if (!file) return;
    file.processingStatus = state;
    if (countValue !== undefined) file.questionCount = countValue;
    file.updatedAt = new Date();
    this.saveSnapshot();
  }

  startPracticeSession(input: {
    learnerKey: string;
    subjectId: number;
    topicId: number;
    examYear: number | null;
    questionIds: number[];
  }) {
    this.ensureInitialized();
    const now = new Date();
    this.practiceSessions = this.practiceSessions.filter(s => s.expiresAt.getTime() > now.getTime());
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    this.practiceSessions.push({
      id: this.nextIds.session++,
      tokenHash: sha256(sessionToken),
      learnerKey: input.learnerKey,
      subjectId: input.subjectId,
      topicId: input.topicId,
      examYear: input.examYear,
      questionIds: input.questionIds,
      expiresAt,
      createdAt: now,
    });
    this.saveSnapshot();
    return { sessionToken, expiresAt: expiresAt.toISOString(), questionCount: input.questionIds.length };
  }

  private loadSnapshot(): boolean {
    if (!isDiskPersistenceEnabled() || !existsSync(STORE_SNAPSHOT_PATH)) return false;
    try {
      const raw = JSON.parse(readFileSync(STORE_SNAPSHOT_PATH, "utf8")) as {
        nextIds?: MemoryStore["nextIds"];
        users?: Record<string, unknown>[];
        subjects?: Record<string, unknown>[];
        topics?: Record<string, unknown>[];
        examFiles?: Record<string, unknown>[];
        questions?: Record<string, unknown>[];
        questionOptions?: QuestionOption[];
        studyAttempts?: Record<string, unknown>[];
        practiceSessions?: Record<string, unknown>[];
        importJobs?: Record<string, unknown>[];
        answerKeyFiles?: Array<Record<string, unknown> & { pdfBase64?: string }>;
        answerKeyEntries?: Record<string, unknown>[];
      };
      if (!raw.subjects?.length || !raw.topics?.length) return false;
      if (raw.nextIds) this.nextIds = { ...this.nextIds, ...raw.nextIds };
      this.users = (raw.users ?? []).map(u => reviveDates(u, ["createdAt", "updatedAt", "lastSignedIn"])) as User[];
      this.subjects = (raw.subjects ?? []).map(s => reviveDates(s, ["createdAt"])) as Subject[];
      this.topics = (raw.topics ?? []).map(t => reviveDates(t, ["createdAt"])) as Topic[];
      this.examFiles = (raw.examFiles ?? []).map(f => reviveDates(f, ["createdAt", "updatedAt"])) as ExamFile[];
      this.questions = (raw.questions ?? []).map(q => reviveDates(q, ["createdAt", "updatedAt"])) as Question[];
      this.questionOptions = raw.questionOptions ?? [];
      this.studyAttempts = (raw.studyAttempts ?? []).map(a => reviveDates(a, ["createdAt"])) as StudyAttempt[];
      this.practiceSessions = (raw.practiceSessions ?? []).map(s => reviveDates(s, ["expiresAt", "createdAt"])) as PracticeSession[];
      this.importJobs = (raw.importJobs ?? []).map(j => reviveDates(j, ["createdAt", "updatedAt"])) as ImportJob[];
      this.answerKeyFiles = (raw.answerKeyFiles ?? []).map(f => {
        const { pdfBase64, ...rest } = f;
        return {
          ...reviveDates(rest, ["createdAt", "updatedAt"]),
          pdfBytes: Buffer.from(pdfBase64 ?? "", "base64"),
        } as AnswerKeyFile;
      });
      this.answerKeyEntries = (raw.answerKeyEntries ?? []).map(e => reviveDates(e, ["createdAt", "updatedAt"])) as AnswerKeyEntry[];
      return true;
    } catch {
      return false;
    }
  }

  saveSnapshot() {
    if (!isDiskPersistenceEnabled()) return;
    try {
      mkdirSync(path.dirname(STORE_SNAPSHOT_PATH), { recursive: true });
      const payload = {
        nextIds: this.nextIds,
        users: this.users,
        subjects: this.subjects,
        topics: this.topics,
        examFiles: this.examFiles,
        questions: this.questions,
        questionOptions: this.questionOptions,
        studyAttempts: this.studyAttempts,
        practiceSessions: this.practiceSessions,
        importJobs: this.importJobs,
        answerKeyFiles: this.answerKeyFiles.map(({ pdfBytes, ...rest }) => ({
          ...rest,
          pdfBase64: Buffer.from(pdfBytes).toString("base64"),
        })),
        answerKeyEntries: this.answerKeyEntries,
      };
      writeFileSync(STORE_SNAPSHOT_PATH, JSON.stringify(payload), "utf8");
    } catch {
      // Non-fatal fallback
    }
  }
  hydratePublicCatalogFromFirestore(input: {
    subjects: Array<Record<string, unknown>>;
    topics: Array<Record<string, unknown>>;
    examFiles: Array<Record<string, unknown>>;
    questions: Array<Record<string, unknown> & { media?: QuestionMedia[] }>;
  }) {
    const existingByFingerprint = new Map(
      this.questions.map(q => [q.sourceFingerprint, q]),
    );
    const existingById = new Map(this.questions.map(q => [q.id, q]));

    if (input.subjects.length) {
      const sorted = [...input.subjects].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
      this.subjects = sorted.map((s, idx) => ({
        id: idx + 1,
        slug: String(s.slug),
        name: String(s.name),
        sortOrder: Number(s.sortOrder ?? idx + 1),
        createdAt: s.createdAt instanceof Date ? s.createdAt : new Date(),
      }));
      this.nextIds.subject = this.subjects.length + 1;
    }

    const subjectIdBySlug = new Map(this.subjects.map(s => [s.slug, s.id]));

    if (input.topics.length) {
      const sorted = [...input.topics].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
      this.topics = sorted.map((t, idx) => ({
        id: idx + 1,
        subjectId: subjectIdBySlug.get(String(t.subjectSlug)) ?? 1,
        slug: String(t.slug),
        numberLabel: String(t.numberLabel ?? ""),
        name: String(t.name ?? ""),
        parentId: null,
        sortOrder: Number(t.sortOrder ?? idx + 1),
        isActive: typeof t.isActive === "boolean" ? t.isActive : true,
        createdAt: t.createdAt instanceof Date ? t.createdAt : new Date(),
      }));
      const topicIdBySlug = new Map(this.topics.map(t => [t.slug, t.id]));
      for (let i = 0; i < sorted.length; i += 1) {
        const parentSlug = sorted[i].parentSlug;
        if (typeof parentSlug === "string" && topicIdBySlug.has(parentSlug)) {
          this.topics[i].parentId = topicIdBySlug.get(parentSlug) ?? null;
        }
      }
      this.nextIds.topic = this.topics.length + 1;
    }

    const topicIdBySlug = new Map(this.topics.map(t => [t.slug, t.id]));

    if (input.examFiles.length) {
      this.examFiles = input.examFiles.map((f, idx) => {
        const docId = Number(f._docId);
        const id = Number.isSafeInteger(docId) && docId > 0 ? docId : idx + 1;
        return {
          id,
          filename: String(f.filename ?? "imtahan.pdf"),
          title: String(f.title ?? f.filename ?? "İmtahan"),
          storageKey: typeof f.sourceUrl === "string" ? f.sourceUrl : `firestore/examFiles/${id}`,
          sourceUrl: String(f.sourceUrl ?? `manual://qebulfit/${id}`),
          sha256: String(f.sha256 ?? sha256(`exam-${id}`)),
          fileSize: Number(f.fileSize ?? 0),
          mimeType: String(f.mimeType ?? "application/pdf"),
          years: Array.isArray(f.years) ? f.years.map(Number).filter(Number.isInteger) : [],
          expectedQuestionCount: null,
          questionCount: Number(f.questionCount ?? 0),
          processingStatus: (String(f.processingStatus ?? "completed") as ExamFile["processingStatus"]),
          createdAt: f.createdAt instanceof Date ? f.createdAt : new Date(),
          updatedAt: f.updatedAt instanceof Date ? f.updatedAt : new Date(),
        };
      });
      const maxFileId = this.examFiles.reduce((m, f) => Math.max(m, f.id), 0);
      this.nextIds.examFile = Math.max(this.nextIds.examFile, maxFileId + 1);
    }

    if (input.questions.length) {
      const rebuiltQuestions: Question[] = [];
      const rebuiltOptions: QuestionOption[] = [];
      let nextOptId = 1;

      for (const item of input.questions) {
        const qId = Number(item.questionId ?? item._docId);
        if (!Number.isSafeInteger(qId) || qId <= 0) continue;
        const sourceFingerprint = String(item.sourceFingerprint ?? "");
        const cached = existingByFingerprint.get(sourceFingerprint) ?? existingById.get(qId);

        rebuiltQuestions.push({
          id: qId,
          subjectId: typeof item.subjectSlug === "string" ? (subjectIdBySlug.get(item.subjectSlug) ?? null) : null,
          topicId: typeof item.topicSlug === "string" ? (topicIdBySlug.get(item.topicSlug) ?? null) : null,
          subtopicId: typeof item.subtopicSlug === "string" ? (topicIdBySlug.get(item.subtopicSlug) ?? null) : null,
          examFileId: Number(item.examFileId ?? 1),
          examYear: typeof item.examYear === "number" ? item.examYear : null,
          questionNumber: typeof item.questionNumber === "number" ? item.questionNumber : null,
          originalText: String(item.originalText ?? ""),
          correctionSuggestion: typeof item.correctionSuggestion === "string" ? item.correctionSuggestion : null,
          correctOption: cached?.correctOption ?? null,
          correctAnswerSource: cached?.correctAnswerSource ?? null,
          media: Array.isArray(item.media) ? item.media : null,
          sourcePage: typeof item.sourcePage === "number" ? item.sourcePage : null,
          classificationConfidence: typeof item.classificationConfidence === "number" ? item.classificationConfidence : null,
          classificationReason: typeof item.classificationReason === "string" ? item.classificationReason : null,
          reviewStatus: item.reviewStatus === "checked" ? "checked" : "needs_review",
          reviewNote: typeof item.reviewNote === "string" ? item.reviewNote : null,
          sourceFingerprint,
          contentFingerprint: String(item.contentFingerprint ?? ""),
          createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(),
          updatedAt: item.updatedAt instanceof Date ? item.updatedAt : new Date(),
        });

        const rawOpts = Array.isArray(item.options) ? (item.options as Array<Record<string, unknown>>) : [];
        for (let idx = 0; idx < rawOpts.length; idx += 1) {
          const opt = rawOpts[idx];
          rebuiltOptions.push({
            id: nextOptId++,
            questionId: qId,
            label: String(opt.label ?? String.fromCharCode(65 + idx)),
            optionText: String(opt.optionText ?? ""),
            sortOrder: Number(opt.sortOrder ?? idx + 1),
          });
        }
      }

      if (rebuiltQuestions.length) {
        this.questions = rebuiltQuestions;
        this.questionOptions = rebuiltOptions;
        const maxQId = this.questions.reduce((m, q) => Math.max(m, q.id), 0);
        this.nextIds.question = Math.max(this.nextIds.question, maxQId + 1);
        this.nextIds.option = Math.max(this.nextIds.option, nextOptId);
      }
    }

    this.saveSnapshot();
  }
}

export const memoryStore = new MemoryStore();
