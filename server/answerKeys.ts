import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import {
  approveAnswerKeyEntry,
  dismissAnswerKeyEntry,
  listAnswerKeyFiles,
  listAnswerKeyReviewQueue,
  runAnswerKeyImport,
} from "./answerKeyImport";
import { memoryStore } from "./memoryStore";
import { syncAnswerKeyFileToFirestore, syncQuestionToFirestore } from "./firestoreSync";

export const answerKeysRouter = router({
  files: adminProcedure.query(() => listAnswerKeyFiles()),
  reviewQueue: adminProcedure.input(z.object({
    limit: z.number().int().min(1).max(100).default(100),
    offset: z.number().int().min(0).max(100000).default(0),
  }).optional()).query(({ input }) => listAnswerKeyReviewQueue(input ?? {})),
  processPdf: adminProcedure.input(z.object({ answerKeyFileId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const res = await runAnswerKeyImport(input.answerKeyFileId);
    if (ctx.firebaseIdToken) {
      void syncAnswerKeyFileToFirestore(input.answerKeyFileId, ctx.firebaseIdToken);
    }
    return res;
  }),
  retryPdf: adminProcedure.input(z.object({ answerKeyFileId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const res = await runAnswerKeyImport(input.answerKeyFileId);
    if (ctx.firebaseIdToken) {
      void syncAnswerKeyFileToFirestore(input.answerKeyFileId, ctx.firebaseIdToken);
    }
    return res;
  }),
  approveEntry: adminProcedure.input(z.object({
    entryId: z.number().int().positive(),
    questionId: z.number().int().positive(),
    correctOption: z.string().trim().min(1).max(8),
    expectedCurrentOption: z.string().max(8).nullable(),
    replaceExisting: z.boolean().default(false),
  }).strict()).mutation(async ({ input, ctx }) => {
    const res = await approveAnswerKeyEntry(input);
    if (ctx.firebaseIdToken && ctx.user) {
      void syncQuestionToFirestore(res.questionId, ctx.firebaseIdToken, ctx.user.openId);
      const entry = memoryStore.answerKeyEntries.find(e => e.id === input.entryId);
      if (entry) void syncAnswerKeyFileToFirestore(entry.answerKeyFileId, ctx.firebaseIdToken);
    }
    return res;
  }),
  dismissEntry: adminProcedure.input(z.object({ entryId: z.number().int().positive() }).strict()).mutation(async ({ input, ctx }) => {
    const entry = memoryStore.answerKeyEntries.find(e => e.id === input.entryId);
    const res = await dismissAnswerKeyEntry(input.entryId);
    if (ctx.firebaseIdToken && entry) {
      void syncAnswerKeyFileToFirestore(entry.answerKeyFileId, ctx.firebaseIdToken);
    }
    return res;
  }),
});
