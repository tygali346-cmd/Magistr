import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type RouterOutput = inferRouterOutputs<AppRouter>;
export type QuestionRecord = RouterOutput["questionBank"]["questions"][number];
export type SubjectRecord = RouterOutput["questionBank"]["subjects"][number];
export type TopicRecord = RouterOutput["questionBank"]["topics"][number];

const LEARNER_KEY = "qebulfit-learner-v1";
export function getLearnerKey() {
  try {
    const existing = localStorage.getItem(LEARNER_KEY);
    if (existing) return existing;
    const created = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(LEARNER_KEY, created);
    return created;
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function subjectLabel(slug: string | null | undefined) {
  return slug === "mentiq" ? "Məntiq" : slug === "informatika" ? "İnformatika" : "Fənn yoxlanmalıdır";
}

export function errorMessage(error: unknown, fallback = "Xəta baş verdi. Yenidən cəhd edin.") {
  return error instanceof Error && error.message ? error.message : fallback;
}
