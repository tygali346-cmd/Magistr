import type { MySql2Database } from "drizzle-orm/mysql2";
import { memoryStore } from "./memoryStore";

export function markDatabaseUnavailable() {
  // Using Firestore + persistent local store fallback; no SQL pool needed.
}

export async function getDb(): Promise<MySql2Database | null> {
  return null;
}

export async function upsertUser(user: { openId: string; name?: string | null; email?: string | null; loginMethod?: string | null; role?: "user" | "admin"; lastSignedIn?: Date }) {
  memoryStore.upsertUser({ ...user, role: user.role ?? "user" });
}

export async function getUserByOpenId(openId: string) {
  return memoryStore.getUserByOpenId(openId);
}
