import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ensureTopicCatalog, handlePdfUploadRequest } from "../questionBank";

async function startServer() {
  await ensureTopicCatalog();
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/api/import/pdf", express.raw({ type: "application/pdf", limit: "50mb" }), async (req, res) => {
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
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
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
