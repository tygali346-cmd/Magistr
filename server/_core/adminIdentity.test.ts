import { describe, expect, it } from "vitest";
import { isAuthorizedAdmin, isConfiguredAdmin } from "./adminIdentity";

describe("isConfiguredAdmin", () => {
  it("matches the configured Manus account email without case sensitivity", () => {
    expect(isConfiguredAdmin("user-1", "Owner@Example.com", { adminEmail: "owner@example.com" })).toBe(true);
  });

  it("does not grant admin to a different email or when no identity is configured", () => {
    expect(isConfiguredAdmin("user-2", "other@example.com", { adminEmail: "owner@example.com" })).toBe(false);
    expect(isConfiguredAdmin("user-2", "owner@example.com", {})).toBe(false);
  });

  it("supports the exact configured Manus owner OpenID", () => {
    expect(isConfiguredAdmin("owner-open-id", null, { ownerOpenId: "owner-open-id" })).toBe(true);
    expect(isConfiguredAdmin("other-open-id", null, { ownerOpenId: "owner-open-id" })).toBe(false);
  });
});

describe("isAuthorizedAdmin", () => {
  const config = { adminEmail: "owner@example.com" };

  it("requires both the admin role and the configured Manus identity", () => {
    expect(isAuthorizedAdmin({ openId: "owner", email: "OWNER@example.com", role: "admin" }, config)).toBe(true);
    expect(isAuthorizedAdmin({ openId: "other", email: "other@example.com", role: "admin" }, config)).toBe(false);
    expect(isAuthorizedAdmin({ openId: "owner", email: "owner@example.com", role: "user" }, config)).toBe(false);
  });

  it("fails closed when no admin identity is configured", () => {
    expect(isAuthorizedAdmin({ openId: "owner", email: "owner@example.com", role: "admin" }, {})).toBe(false);
  });
});
