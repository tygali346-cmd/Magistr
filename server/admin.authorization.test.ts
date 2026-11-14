import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { sdk } from "./_core/sdk";

afterEach(() => {
  vi.unstubAllEnvs();
});

const unauthenticatedContext: TrpcContext = {
  user: null,
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};

const forgedAdminContext: TrpcContext = {
  user: {
    id: 1,
    openId: "forged-admin-id",
    email: "forged@example.invalid",
    name: "Forged admin",
    loginMethod: "other",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};

describe("admin authorization", () => {
  it("denies admin procedures to visitors without a signed admin cookie", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);
    await expect(caller.questionBank.reviewQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.answerKeys.files()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies admin procedures to a non-passcode or forged admin identity", async () => {
    const caller = appRouter.createCaller(forgedAdminContext);
    await expect(caller.questionBank.reviewQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.questionBank.highConfidenceReviewCount()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.questionBank.approveHighConfidenceReview({ expectedCount: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.answerKeys.reviewQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.answerKeys.processPdf({ answerKeyFileId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.answerKeys.approveEntry({ entryId: 1, questionId: 1, correctOption: "A", expectedCurrentOption: null, replaceExisting: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.answerKeys.dismissEntry({ entryId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.questionBank.retryImport({ examFileId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.questionBank.deleteExamFile({ examFileId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows visitors to view public dashboard/questions without logging in", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);
    const dashboard = await caller.questionBank.dashboard();
    expect(dashboard.subjects.length).toBeGreaterThan(0);
    expect(dashboard.totalQuestions).toBeGreaterThan(0);
  });

  it("authorizes admin procedures when a valid SESSION_SECRET-signed HttpOnly cookie is present", async () => {
    vi.stubEnv("QEBULFIT_ADMIN_PASSCODE", "passcode-for-test");
    vi.stubEnv("SESSION_SECRET", "session-secret-for-test-32-characters");

    const token = await sdk.createAdminSessionToken();
    const user = await sdk.authenticateRequest({
      path: "/api/trpc/questionBank.reviewQueue",
      headers: { cookie: `${COOKIE_NAME}=${token}` },
    } as never);

    const caller = appRouter.createCaller({
      user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });

    await expect(caller.questionBank.highConfidenceReviewCount()).resolves.toBeTypeOf("number");
  });

  it("authorizes verified firebase admin and denies non-admin firebase user", async () => {
    const now = new Date();
    const firebaseAdminContext: TrpcContext = {
      user: {
        id: 0,
        openId: "firebase-admin-uid",
        email: "tygali346@gmail.com",
        name: "Admin",
        loginMethod: "firebase",
        role: "admin",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const firebaseUserContext: TrpcContext = {
      user: {
        id: 0,
        openId: "firebase-user-uid",
        email: "student@example.com",
        name: "Student",
        loginMethod: "firebase",
        role: "user",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };

    const adminCaller = appRouter.createCaller(firebaseAdminContext);
    await expect(adminCaller.questionBank.highConfidenceReviewCount()).resolves.toBeTypeOf("number");

    const studentCaller = appRouter.createCaller(firebaseUserContext);
    await expect(studentCaller.questionBank.reviewQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(studentCaller.answerKeys.files()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
