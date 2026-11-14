import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const staleAdminContext: TrpcContext = {
  user: {
    id: 1,
    openId: "not-the-configured-owner-id-for-test",
    email: "stale-admin-identity-for-test@example.invalid",
    name: "Stale admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: {
    protocol: "https",
    headers: {},
  } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
};

describe("admin authorization", () => {
  it("denies admin procedures to a stale admin role with a nonmatching identity", async () => {
    const caller = appRouter.createCaller(staleAdminContext);

    await expect(caller.questionBank.reviewQueue()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("protects the high-confidence count and bulk approval endpoints", async () => {
    const caller = appRouter.createCaller(staleAdminContext);

    await expect(caller.questionBank.highConfidenceReviewCount()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.questionBank.approveHighConfidenceReview({ expectedCount: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
