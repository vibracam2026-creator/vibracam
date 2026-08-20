import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initializeSocket } from "../socket";
import { registerStorageProxy } from "./storageProxy";
import { getDb } from "../db";
import { validateRuntimeConfig } from "./env";
import { recordServerError } from "../observability";
import { sql } from "drizzle-orm";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => server.close(() => resolve(true)));
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port += 1) if (await isPortAvailable(port)) return port;
  throw new Error("تعذر العثور على منفذ متاح.");
}

async function startServer() {
  validateRuntimeConfig();
  const app = express();
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy === "1" || trustProxy === "true") app.set("trust proxy", 1);
  else if (trustProxy && /^\d+$/.test(trustProxy)) app.set("trust proxy", Number(trustProxy));
  app.disable("x-powered-by");
  const server = createServer(app);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self)");
    if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/health", async (_req, res) => {
    const database = await getDb();
    let databaseStatus: "ok" | "not_configured" | "error" = database ? "ok" : "not_configured";
    if (database) {
      try { await database.execute(sql`SELECT 1`); } catch (error) { databaseStatus = "error"; recordServerError("health.database", error); }
    }
    const healthy = databaseStatus !== "error";
    res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "degraded", database: databaseStatus, uptimeSeconds: Math.round(process.uptime()) });
  });
  initializeSocket(server);
  registerOAuthRoutes(app);
  registerStorageProxy(app);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    recordServerError("express", error);
    if (res.headersSent) return next(error);
    res.status(500).json({ message: "حدث خطأ داخلي غير متوقع." });
  });
  const port = await findAvailablePort(Number(process.env.PORT ?? 3000));
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(error => console.error(error));
