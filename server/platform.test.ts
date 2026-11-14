import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";
import { isAdminAuthConfigured, sdk, verifyAdminPasscode } from "./_core/sdk";
import { listLLMModels } from "./_core/llm";
import { COOKIE_NAME } from "../shared/const";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("QəbulFit session & Gemini platform integration", () => {
  it("requires GEMINI_API_KEY for Gemini calls", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(listLLMModels()).rejects.toThrow("GEMINI_API_KEY");
    expect(request).not.toHaveBeenCalled();
  });

  it("uses a distinct HttpOnly secure session cookie", () => {
    expect(COOKIE_NAME).toBe("qebulfit_admin_session");
    expect(getSessionCookieOptions({ protocol: "http", headers: {} } as never)).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: "none",
    });
  });

  it("verifies QEBULFIT_ADMIN_PASSCODE and binds signed HttpOnly sessions to SESSION_SECRET", async () => {
    vi.stubEnv("QEBULFIT_ADMIN_PASSCODE", "");
    vi.stubEnv("SESSION_SECRET", "");
    expect(isAdminAuthConfigured()).toBe(false);

    vi.stubEnv("QEBULFIT_ADMIN_PASSCODE", "super-secret-passcode");
    vi.stubEnv("SESSION_SECRET", "unit-test-session-secret-key-32-chars");
    expect(isAdminAuthConfigured()).toBe(true);
    expect(verifyAdminPasscode("super-secret-passcode")).toBe(true);
    expect(verifyAdminPasscode("wrong-passcode")).toBe(false);

    const token = await sdk.createAdminSessionToken();
    expect(await sdk.verifySession(token)).toMatchObject({
      openId: "qebulfit-admin",
      role: "admin",
    });

    vi.stubEnv("SESSION_SECRET", "different-session-secret-key-32-chars");
    expect(await sdk.verifySession(token)).toBeNull();
  });
});
