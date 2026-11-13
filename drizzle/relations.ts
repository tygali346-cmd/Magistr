import { relations } from "drizzle-orm";
import { examFiles, importJobs, questionOptions, questions, studyAttempts, subjects, topics } from "./schema";

export const subjectRelations = relations(subjects, ({ many }) => ({
  topics: many(topics),
  questions: many(questions),
  attempts: many(studyAttempts),
}));

export const topicRelations = relations(topics, ({ one, many }) => ({
  subject: one(subjects, { fields: [topics.subjectId], references: [subjects.id] }),
  questions: many(questions),
}));

export const examFileRelations = relations(examFiles, ({ many }) => ({
  questions: many(questions),
  importJobs: many(importJobs),
}));

export const questionRelations = relations(questions, ({ one, many }) => ({
  subject: one(subjects, { fields: [questions.subjectId], references: [subjects.id] }),
  topic: one(topics, { fields: [questions.topicId], references: [topics.id] }),
  subtopic: one(topics, { fields: [questions.subtopicId], references: [topics.id] }),
  examFile: one(examFiles, { fields: [questions.examFileId], references: [examFiles.id] }),
  options: many(questionOptions),
}));

export const questionOptionRelations = relations(questionOptions, ({ one }) => ({
  question: one(questions, { fields: [questionOptions.questionId], references: [questions.id] }),
}));

export const studyAttemptRelations = relations(studyAttempts, ({ one }) => ({
  subject: one(subjects, { fields: [studyAttempts.subjectId], references: [subjects.id] }),
  topic: one(topics, { fields: [studyAttempts.topicId], references: [topics.id] }),
}));

export const importJobRelations = relations(importJobs, ({ one }) => ({
  examFile: one(examFiles, { fields: [importJobs.examFileId], references: [examFiles.id] }),
}));
