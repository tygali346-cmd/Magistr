import {
  boolean,
  float,
  index,
  int,
  json,
  customType,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const longblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "longblob",
});

/** Application identity table retained from the Web starter. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const subjects = mysqlTable("subjects", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  sortOrder: int("sortOrder").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const topics = mysqlTable(
  "topics",
  {
    id: int("id").autoincrement().primaryKey(),
    subjectId: int("subjectId").notNull().references(() => subjects.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 96 }).notNull().unique(),
    numberLabel: varchar("numberLabel", { length: 16 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    parentId: int("parentId"),
    sortOrder: int("sortOrder").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    subjectNumberUnique: uniqueIndex("topics_subject_number_unique").on(table.subjectId, table.numberLabel),
    subjectOrderIdx: index("topics_subject_order_idx").on(table.subjectId, table.sortOrder),
  }),
);

export const examFiles = mysqlTable(
  "examFiles",
  {
    id: int("id").autoincrement().primaryKey(),
    filename: varchar("filename", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 512 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull().unique(),
    fileSize: int("fileSize").notNull(),
    mimeType: varchar("mimeType", { length: 128 }).notNull().default("application/pdf"),
    years: json("years").$type<number[]>().notNull(),
    expectedQuestionCount: int("expectedQuestionCount"),
    questionCount: int("questionCount").default(0).notNull(),
    processingStatus: mysqlEnum("processingStatus", ["uploaded", "processing", "completed", "needs_review", "failed"]).default("uploaded").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    statusIdx: index("exam_files_status_idx").on(table.processingStatus),
  }),
);

export type QuestionMedia = {
  kind: "image" | "table" | "formula" | "diagram" | "note";
  label?: string;
  value: string;
  sourcePage?: number;
  storageKey?: string;
};

export const questions = mysqlTable(
  "questions",
  {
    id: int("id").autoincrement().primaryKey(),
    subjectId: int("subjectId").references(() => subjects.id),
    topicId: int("topicId").references(() => topics.id),
    subtopicId: int("subtopicId").references(() => topics.id),
    examFileId: int("examFileId").notNull().references(() => examFiles.id),
    examYear: int("examYear"),
    questionNumber: int("questionNumber"),
    originalText: text("originalText").notNull(),
    correctionSuggestion: text("correctionSuggestion"),
    correctOption: varchar("correctOption", { length: 8 }),
    correctAnswerSource: text("correctAnswerSource"),
    media: json("media").$type<QuestionMedia[]>(),
    sourcePage: int("sourcePage"),
    classificationConfidence: float("classificationConfidence"),
    classificationReason: text("classificationReason"),
    reviewStatus: mysqlEnum("reviewStatus", ["checked", "needs_review"]).default("needs_review").notNull(),
    reviewNote: text("reviewNote"),
    sourceFingerprint: varchar("sourceFingerprint", { length: 96 }).notNull().unique(),
    contentFingerprint: varchar("contentFingerprint", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    topicYearQuestionIdx: index("questions_topic_year_number_idx").on(table.topicId, table.examYear, table.questionNumber),
    reviewIdx: index("questions_review_status_idx").on(table.reviewStatus),
    contentFingerprintIdx: index("questions_content_fingerprint_idx").on(table.contentFingerprint),
    examYearIdx: index("questions_exam_year_idx").on(table.examYear),
  }),
);

export const questionOptions = mysqlTable(
  "questionOptions",
  {
    id: int("id").autoincrement().primaryKey(),
    questionId: int("questionId").notNull().references(() => questions.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 8 }).notNull(),
    optionText: text("optionText").notNull(),
    sortOrder: int("sortOrder").notNull(),
  },
  table => ({
    questionLabelUnique: uniqueIndex("question_options_question_label_unique").on(table.questionId, table.label),
    questionOrderIdx: index("question_options_order_idx").on(table.questionId, table.sortOrder),
  }),
);

export type AttemptAnswer = {
  questionId: number;
  selectedOption: string | null;
  verifiedCorrectOption: string | null;
  isScored: boolean;
  isCorrect: boolean | null;
};

export const studyAttempts = mysqlTable(
  "studyAttempts",
  {
    id: int("id").autoincrement().primaryKey(),
    learnerKey: varchar("learnerKey", { length: 64 }).notNull(),
    subjectId: int("subjectId").notNull().references(() => subjects.id),
    topicId: int("topicId").references(() => topics.id),
    examYear: int("examYear"),
    totalQuestions: int("totalQuestions").notNull(),
    scoredQuestions: int("scoredQuestions").notNull(),
    correctCount: int("correctCount").notNull(),
    incorrectCount: int("incorrectCount").notNull(),
    unscoredCount: int("unscoredCount").notNull(),
    scorePercent: int("scorePercent"),
    answers: json("answers").$type<AttemptAnswer[]>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    learnerCreatedIdx: index("study_attempts_learner_created_idx").on(table.learnerKey, table.createdAt),
    subjectTopicIdx: index("study_attempts_subject_topic_idx").on(table.subjectId, table.topicId),
  }),
);

export const importJobs = mysqlTable(
  "importJobs",
  {
    id: int("id").autoincrement().primaryKey(),
    examFileId: int("examFileId").references(() => examFiles.id, { onDelete: "set null" }),
    status: mysqlEnum("status", ["queued", "processing", "completed", "needs_review", "failed"]).default("queued").notNull(),
    progress: int("progress").default(0).notNull(),
    message: text("message"),
    detectedQuestionCount: int("detectedQuestionCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    examFileIdx: index("import_jobs_exam_file_idx").on(table.examFileId),
    statusIdx: index("import_jobs_status_idx").on(table.status),
  }),
);

export type Subject = typeof subjects.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type ExamFile = typeof examFiles.$inferSelect;

/** Answer-key PDFs contain correct answers; bytes are served only by an admin-authorized route. */
export const answerKeyFiles = mysqlTable(
  "answerKeyFiles",
  {
    id: int("id").autoincrement().primaryKey(),
    filename: varchar("filename", { length: 255 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    fileSize: int("fileSize").notNull(),
    pdfBytes: longblob("pdfBytes").notNull(),
    subjectId: int("subjectId").notNull().references(() => subjects.id),
    years: json("years").$type<number[]>().notNull(),
    entryCount: int("entryCount").default(0).notNull(),
    processingStatus: mysqlEnum("processingStatus", ["uploaded", "processing", "completed", "needs_review", "failed"]).default("uploaded").notNull(),
    statusMessage: text("statusMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    shaUnique: uniqueIndex("answer_key_files_sha_unique").on(table.sha256),
    statusIdx: index("answer_key_files_status_idx").on(table.processingStatus),
    subjectCreatedIdx: index("answer_key_files_subject_created_idx").on(table.subjectId, table.createdAt),
  }),
);

export const answerKeyEntries = mysqlTable(
  "answerKeyEntries",
  {
    id: int("id").autoincrement().primaryKey(),
    answerKeyFileId: int("answerKeyFileId").notNull().references(() => answerKeyFiles.id, { onDelete: "cascade" }),
    subjectId: int("subjectId").notNull().references(() => subjects.id),
    examYear: int("examYear"),
    questionNumber: int("questionNumber"),
    answerToken: varchar("answerToken", { length: 32 }).notNull(),
    suggestedOption: varchar("suggestedOption", { length: 8 }),
    confidence: float("confidence").notNull(),
    sourcePage: int("sourcePage"),
    status: mysqlEnum("status", ["applied", "already_set", "needs_review", "unmatched", "ambiguous", "conflict", "dismissed"]).default("needs_review").notNull(),
    matchedQuestionId: int("matchedQuestionId").references(() => questions.id, { onDelete: "set null" }),
    candidateQuestionIds: json("candidateQuestionIds").$type<number[]>().notNull(),
    reviewNote: text("reviewNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    fileIdx: index("answer_key_entries_file_idx").on(table.answerKeyFileId),
    statusIdx: index("answer_key_entries_status_idx").on(table.status),
    questionIdx: index("answer_key_entries_question_idx").on(table.matchedQuestionId),
    sourceKeyIdx: index("answer_key_entries_source_key_idx").on(table.subjectId, table.examYear, table.questionNumber),
  }),
);

export type Question = typeof questions.$inferSelect;
export type QuestionOption = typeof questionOptions.$inferSelect;
export type StudyAttempt = typeof studyAttempts.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type AnswerKeyFile = typeof answerKeyFiles.$inferSelect;
export type AnswerKeyEntry = typeof answerKeyEntries.$inferSelect;
