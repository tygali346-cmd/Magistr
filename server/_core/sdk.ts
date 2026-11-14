import { createHash, timingSafeEqual } from "node:crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { verifyFirebaseIdToken } from "./firebaseAdmin";
import { checkFirestoreAdminDoc } from "../firestoreRest";

export const ADMIN_OPEN_ID = "qebulfit-admin";
export const BOOTSTRAPPED_ADMIN_EMAIL = "tygali346@gmail.com";

export type AuthenticatedUser = User;

function sha256Digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(ENV.adminPasscode.trim() && ENV.sessionSecret.trim());
}

export function verifyAdminPasscode(supplied: unknown): boolean {
  const expected = ENV.adminPasscode.trim();
  if (typeof supplied !== "string" || !expected) return false;
  return timingSafeEqual(sha256Digest(supplied), sha256Digest(expected));
}

export function isAuthorizedAdminUser(
  user: Pick<User, "openId" | "role" | "loginMethod"> | null | undefined,
): boolean {
  if (!user || user.role !== "admin") return false;
  if (user.openId === ADMIN_OPEN_ID && user.loginMethod === "passcode") return true;
  if (user.loginMethod === "firebase") return true;
  return false;
}

export function extractBearerToken(req: Request): string {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice("Bearer ".length).trim();
}

class SessionAuthServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  private getSessionSecret(): Uint8Array {
    const secret = ENV.sessionSecret.trim();
    if (!secret) {
      throw new Error("SESSION_SECRET təyin edilməyib.");
    }
    return new TextEncoder().encode(secret);
  }

  async createAdminSessionToken(
    options: { expiresInMs?: number } = {},
  ): Promise<string> {
    if (!ENV.adminPasscode.trim()) {
      throw new Error("QEBULFIT_ADMIN_PASSCODE təyin edilməyib.");
    }
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      sub: ADMIN_OPEN_ID,
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(Math.floor(issuedAt / 1000))
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null,
  ): Promise<{ openId: string; role: "admin" } | null> {
    if (!cookieValue || !ENV.sessionSecret.trim() || !ENV.adminPasscode.trim()) {
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      if (payload.sub !== ADMIN_OPEN_ID || payload.role !== "admin") {
        return null;
      }
      return { openId: ADMIN_OPEN_ID, role: "admin" };
    } catch {
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const bearer = extractBearerToken(req);
    if (bearer) {
      const decoded = await verifyFirebaseIdToken(bearer);
      if (decoded) {
        const emailVerified = decoded.email_verified === true;
        const email = typeof decoded.email === "string" ? decoded.email : null;
        let isAdmin = false;
        if (emailVerified) {
          if (email === BOOTSTRAPPED_ADMIN_EMAIL) {
            isAdmin = true;
          } else {
            isAdmin = await checkFirestoreAdminDoc(decoded.uid, bearer);
          }
        }
        const now = new Date();
        return {
          id: 0,
          openId: decoded.uid,
          name: typeof decoded.name === "string" && decoded.name ? decoded.name : email ?? "İstifadəçi",
          email,
          loginMethod: "firebase",
          role: isAdmin ? "admin" : "user",
          createdAt: now,
          updatedAt: now,
          lastSignedIn: now,
        };
      }
    }

    const cookies = this.parseCookies(req.headers.cookie);
    const sessionToken = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionToken);

    if (!session) {
      throw ForbiddenError("Sessiya tapılmadı və ya etibarsızdır.");
    }

    const now = new Date();
    return {
      id: 0,
      openId: session.openId,
      name: "QəbulFit Admin",
      email: null,
      loginMethod: "passcode",
      role: "admin",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    };
  }
}

export const sdk = new SessionAuthServer();
