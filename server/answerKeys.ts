import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import {
  approveAnswerKeyEntry,
  dismissAnswerKeyEntry,
  listAnswerKeyFiles,
  listAnswerKeyReviewQueue,
  runAnswerKeyImport,
} from "./answerKeyImport";
import { requireDatabase } from "./questionBankDb";
import { answerKeyFiles } from "../drizzle/schema";

export const answerKeysRouter = router({
  files: adminProcedure.query(() => listAnswerKeyFiles()),
  reviewQueue: adminProcedure.query(() => listAnswerKeyReviewQueue()),
  processPdf: adminProcedure.input(z.object({ answerKeyFileId: z.number().int().positive() })).mutation(({ input }) => runAnswerKeyImport(input.answerKeyFileId)),
  retryPdf: adminProcedure.input(z.object({ answerKeyFileId: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await requireDatabase();
    const [file] = await db.select({ id: answerKeyFiles.id, processingStatus: answerKeyFiles.processingStatus }).from(answerKeyFiles).where(eq(answerKeyFiles.id, input.answerKeyFileId)).limit(1);
    if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "Cavab açarı PDF-i tapılmadı." });
    if (file.processingStatus !== "uploaded" && file.processingStatus !== "failed") {
      throw new TRPCError({ code: "CONFLICT", message: "Yalnız hələ işlənməmiş və ya uğursuz cavab açarı PDF-i yenidən emal edilə bilər." });
    }
    return runAnswerKeyImport(file.id);
  }),
  approveEntry: adminProcedure.input(z.object({
    entryId: z.number().int().positive(),
    questionId: z.number().int().positive(),
    correctOption: z.string().trim().min(1).max(8),
    expectedCurrentOption: z.string().max(8).nullable(),
    replaceExisting: z.boolean().default(false),
  }).strict()).mutation(({ input }) => approveAnswerKeyEntry(input)),
  dismissEntry: adminProcedure.input(z.object({ entryId: z.number().int().positive() }).strict()).mutation(({ input }) => dismissAnswerKeyEntry(input.entryId)),
});
