import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import {
  approveAnswerKeyEntry,
  dismissAnswerKeyEntry,
  listAnswerKeyFiles,
  listAnswerKeyReviewQueue,
  runAnswerKeyImport,
} from "./answerKeyImport";

export const answerKeysRouter = router({
  files: adminProcedure.query(() => listAnswerKeyFiles()),
  reviewQueue: adminProcedure.input(z.object({
    limit: z.number().int().min(1).max(100).default(100),
    offset: z.number().int().min(0).max(100000).default(0),
  }).optional()).query(({ input }) => listAnswerKeyReviewQueue(input ?? {})),
  processPdf: adminProcedure.input(z.object({ answerKeyFileId: z.number().int().positive() })).mutation(({ input }) => runAnswerKeyImport(input.answerKeyFileId)),
  retryPdf: adminProcedure.input(z.object({ answerKeyFileId: z.number().int().positive() })).mutation(({ input }) => runAnswerKeyImport(input.answerKeyFileId)),
  approveEntry: adminProcedure.input(z.object({
    entryId: z.number().int().positive(),
    questionId: z.number().int().positive(),
    correctOption: z.string().trim().min(1).max(8),
    expectedCurrentOption: z.string().max(8).nullable(),
    replaceExisting: z.boolean().default(false),
  }).strict()).mutation(({ input }) => approveAnswerKeyEntry(input)),
  dismissEntry: adminProcedure.input(z.object({ entryId: z.number().int().positive() }).strict()).mutation(({ input }) => dismissAnswerKeyEntry(input.entryId)),
});
