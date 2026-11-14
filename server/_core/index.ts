import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { getSessionCookieOptions } from "./cookies";
import { serveStatic, setupVite } from "./vite";
import {
  extractBearerToken,
  isAdminAuthConfigured,
  isAuthorizedAdminUser,
  sdk,
  verifyAdminPasscode,
} from "./sdk";
import { ensureTopicCatalog, handlePdfUploadRequest } from "../questionBank";
import { getAnswerKeyPdfForAdmin, storeUploadedAnswerKeyPdf } from "../answerKeyImport";
import { syncAnswerKeyFileToFirestore, syncExamFileToFirestore } from "../firestoreSync";
import { storageGetObject } from "../storage";
import { TRPCError } from "@trpc/server";

async function startServer() {
  await ensureTopicCatalog();
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.get("/api/admin/status", async (req, res) => {
    const configured = isAdminAuthConfigured();
    let authenticated = false;
    if (configured) {
      try {
        const user = await sdk.authenticateRequest(req);
        authenticated = isAuthorizedAdminUser(user);
      } catch {
        authenticated = false;
      }
    }
    res.json({ configured, authenticated });
  });

  app.post("/api/admin/login", async (req, res) => {
    if (!isAdminAuthConfigured()) {
      res.status(503).json({
        error: "Serverdə QEBULFIT_ADMIN_PASSCODE və SESSION_SECRET dəyişənləri təyin edilməyib.",
      });
      return;
    }

    const passcode = (req.body as { passcode?: unknown } | undefined)?.passcode;
    if (!verifyAdminPasscode(passcode)) {
      res.status(401).json({ error: "Admin şifrəsi yanlışdır." });
      return;
    }

    try {
      const token = await sdk.createAdminSessionToken({ expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Admin sessiyası yaradılmadı." });
    }
  });

  app.post("/api/admin/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ ok: true });
  });

  app.get("/api/storage/*", async (req, res) => {
    const key = decodeURIComponent(req.path.replace(/^\/api\/storage\//, ""));
    try {
      const obj = await storageGetObject(key);
      if (!obj) {
        res.status(404).json({ error: "Fayl tapılmadı." });
        return;
      }
      res.set({
        "Content-Type": obj.contentType,
        "X-Content-Type-Options": "nosniff",
      }).send(obj.bytes);
    } catch {
      res.status(400).json({ error: "Fayl yolu etibarsızdır." });
    }
  });

  const requireAdminPdfUpload: express.RequestHandler = async (req, res, next) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!isAuthorizedAdminUser(user)) {
        res.status(403).json({ error: "PDF yükləmək üçün admin icazəsi tələb olunur." });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: "PDF yükləmək üçün admin kimi daxil olun." });
    }
  };

  app.post("/api/import/pdf", requireAdminPdfUpload, express.raw({ type: "application/pdf", limit: "50mb" }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "PDF məzmunu tapılmadı." });
      return;
    }
    const rawFilename = req.header("x-original-filename") || "imtahan.pdf";
    let filename = rawFilename;
    try { filename = decodeURIComponent(rawFilename); } catch { /* retain the supplied name */ }
    try {
      const result = await handlePdfUploadRequest(req.body, filename, req.header("x-exam-years"), req.header("x-expected-question-count"));
      const token = extractBearerToken(req);
      if (token && result.examFileId) {
        void syncExamFileToFirestore(result.examFileId, token);
      }
      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF yüklənmədi.";
      res.status(/PDF|ölçüsü|yükləmək olar|Gözlənilən sual sayı/i.test(message) ? 400 : 500).json({ error: message });
    }
  });

  app.post("/api/import/answer-key", requireAdminPdfUpload, express.raw({ type: "application/pdf", limit: "40mb" }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Cavab açarı PDF məzmunu tapılmadı." });
      return;
    }
    const rawFilename = req.header("x-original-filename") || "cavab-acari.pdf";
    let filename = rawFilename;
    try { filename = decodeURIComponent(rawFilename); } catch { /* retain the supplied name */ }
    try {
      const result = await storeUploadedAnswerKeyPdf(req.body, filename, req.header("x-answer-subject"), req.header("x-exam-years"));
      const token = extractBearerToken(req);
      if (token && result.answerKeyFileId) {
        void syncAnswerKeyFileToFirestore(result.answerKeyFileId, token);
      }
      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cavab açarı PDF-i yüklənmədi.";
      const status = error instanceof TRPCError ? (error.code === "CONFLICT" ? 409 : 400) : (/PDF|fənn|imtahan ili|40 MB|yükləmək/i.test(message) ? 400 : 500);
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/admin/answer-keys/:fileId/pdf", requireAdminPdfUpload, async (req, res) => {
    const fileId = Number(req.params.fileId);
    if (!Number.isSafeInteger(fileId) || fileId < 1) {
      res.status(400).json({ error: "PDF identifikatorı etibarsızdır." });
      return;
    }
    try {
      const file = await getAnswerKeyPdfForAdmin(fileId);
      if (!file) {
        res.status(404).json({ error: "Cavab açarı PDF-i tapılmadı." });
        return;
      }
      res.set({
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="answer-key.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(file.pdfBytes.byteLength),
      }).type("application/pdf").send(file.pdfBytes);
    } catch {
      res.status(500).json({ error: "Cavab açarı PDF-i oxunmadı." });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
