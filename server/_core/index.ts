import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { isAuthorizedAdmin } from "./adminIdentity";
import { ENV } from "./env";
import { ensureTopicCatalog, handlePdfUploadRequest } from "../questionBank";
import { getAnswerKeyPdfForAdmin, storeUploadedAnswerKeyPdf } from "../answerKeyImport";
import { TRPCError } from "@trpc/server";

async function startServer() {
  await ensureTopicCatalog();
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const requireAdminPdfUpload: express.RequestHandler = async (req, res, next) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!isAuthorizedAdmin(user, {
        ownerOpenId: ENV.ownerOpenId,
        adminEmail: ENV.qebulfitAdminEmail,
      })) {
        res.status(403).json({ error: "PDF yükləmək üçün admin icazəsi tələb olunur." });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: "PDF yükləmək üçün Manus hesabı ilə admin kimi daxil olun." });
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
  app.get("/api/platform/config.js", (_req, res) => res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript()));
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
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
