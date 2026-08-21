import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initializeSocket } from "../socket";
import { registerStorageProxy } from "./storageProxy";
import { getDb, ensureOwnerAdmin } from "../db";
import { validateRuntimeConfig } from "./env";
import { recordServerError } from "../observability";
import { sql } from "drizzle-orm";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const testServer = net.createServer();

    testServer.once("error", () => {
      resolve(false);
    });

    testServer.listen(port, "0.0.0.0", () => {
      testServer.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error("تعذر العثور على منفذ متاح.");
}

async function startServer() {
  console.log("[Startup] Starting VibraCam server...");

  validateRuntimeConfig();

  console.log("[Startup] Runtime configuration validated.");
  try {
    await ensureOwnerAdmin();
    console.log("[Startup] Owner admin synchronized.");
  } catch (error) {
    console.error("[Startup] Owner admin synchronization failed:", error);
    throw error;
  }

  const app = express();

  /*
   * Render provides PORT automatically.
   * Do not replace it with a random port in production.
   */
  const configuredPort = Number(process.env.PORT ?? 3000);

  if (!Number.isInteger(configuredPort) || configuredPort <= 0) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }

  /*
   * Proxy configuration
   */
  const trustProxy = process.env.TRUST_PROXY;

  if (trustProxy === "1" || trustProxy === "true") {
    app.set("trust proxy", 1);
  } else if (trustProxy && /^\d+$/.test(trustProxy)) {
    app.set("trust proxy", Number(trustProxy));
  }

  app.disable("x-powered-by");

  const server = createServer(app);

  /*
   * Security headers
   */
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
      "Referrer-Policy",
      "strict-origin-when-cross-origin"
    );

    res.setHeader(
      "Permissions-Policy",
      "camera=(self), microphone=(self), geolocation=(self)"
    );

    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
      );
    }

    next();
  });

  /*
   * Body parsers
   */
  app.use(
    express.json({
      limit: "50mb",
    })
  );

  app.use(
    express.urlencoded({
      limit: "50mb",
      extended: true,
    })
  );

  /*
   * Health check
   */
  app.get("/health", async (_req, res) => {
    try {
      const database = await getDb();

      if (!database) {
        res.status(503).json({
          status: "degraded",
          database: "not_configured",
          uptimeSeconds: Math.round(process.uptime()),
        });

        return;
      }

      try {
        await database.execute(sql`SELECT 1`);

        res.status(200).json({
          status: "ok",
          database: "ok",
          uptimeSeconds: Math.round(process.uptime()),
        });
      } catch (error) {
        recordServerError("health.database", error);

        res.status(503).json({
          status: "degraded",
          database: "error",
          uptimeSeconds: Math.round(process.uptime()),
        });
      }
    } catch (error) {
      recordServerError("health", error);

      res.status(503).json({
        status: "degraded",
        database: "error",
        uptimeSeconds: Math.round(process.uptime()),
      });
    }
  });

  /*
   * Socket server
   *
   * Keep this isolated so a socket initialization problem gives
   * a useful error instead of silently killing the application.
   */
  try {
    initializeSocket(server);
    console.log("[Startup] Socket initialized.");
  } catch (error) {
    console.error("[Startup] Socket initialization failed:", error);
    throw error;
  }

  /*
   * External OAuth has intentionally been removed.
   *
   * DO NOT register:
   *
   * registerOAuthRoutes(app)
   *
   * Local authentication is handled by the local JWT/session system.
   */

  /*
   * Storage proxy
   */
  try {
    registerStorageProxy(app);
    console.log("[Startup] Storage proxy initialized.");
  } catch (error) {
    console.error("[Startup] Storage proxy initialization failed:", error);
    throw error;
  }

  /*
   * tRPC API
   */
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  /*
   * Frontend
   */
  if (process.env.NODE_ENV === "development") {
    console.log("[Startup] Starting Vite development server...");

    await setupVite(app, server);
  } else {
    console.log("[Startup] Serving production frontend...");

    serveStatic(app);
  }

  /*
   * Express error handler
   */
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      recordServerError("express", error);

      console.error("[Express] Unhandled error:", error);

      if (res.headersSent) {
        return next(error);
      }

      res.status(500).json({
        message: "حدث خطأ داخلي غير متوقع.",
      });
    }
  );

  /*
   * Start HTTP server.
   *
   * Render supplies PORT, so use it directly in production.
   */
  const port =
    process.env.NODE_ENV === "production"
      ? configuredPort
      : await findAvailablePort(configuredPort);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);

    server.listen(port, "0.0.0.0", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  console.log(
    `[Startup] VibraCam server running on port ${port}`
  );
}

startServer().catch((error) => {
  console.error("========================================");
  console.error("[FATAL] VibraCam server failed to start.");
  console.error("========================================");
  console.error(error);

  if (error instanceof Error) {
    console.error("Name:", error.name);
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
  }

  process.exit(1);
});
