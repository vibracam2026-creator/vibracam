import type { Express, Request } from "express";
import { Readable } from "node:stream";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import { hashSessionToken, readCookie } from "../sessionSecurity";
import { ENV } from "./env";
import { sdk } from "./sdk";

export async function authenticateStorageRequest(req: Request) {
  const token = readCookie(req.headers.cookie, COOKIE_NAME);
  const session = token ? await db.getActiveAuthSession(hashSessionToken(token)) : undefined;
  if (session) {
    const localUser = await db.getUserById(session.userId);
    if (localUser) return localUser;
  }

  try {
    const user = await sdk.authenticateRequest(req);
    if (user.openId.startsWith("cron_")) return null;
    return user;
  } catch {
    return null;
  }
}

export function normalizeStorageKey(rawKey: string | string[] | undefined) {
  return (Array.isArray(rawKey) ? rawKey.join("/") : rawKey || "").replace(/^\/+/, "");
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/{*key}", async (req, res) => {
    const rawKey = (req.params as Record<string, string | string[]>).key;
    const key = normalizeStorageKey(rawKey);
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    const publicBrandingKeys = new Set(["vibracam-official-logo_8af5745c.png", "vibracam-official-logo_2c86ffe7.webp", "vibracam-official-logo_458871da.webp"]);
    const isPublicAsset = publicBrandingKeys.has(key) || /^vibracam\/\d+\/(avatar|cover)\//.test(key);
    
    if (!isPublicAsset) {
      const viewer = await authenticateStorageRequest(req);
      if (!viewer) {
        res.status(401).send("Authentication required");
        return;
      }
      const ownerMatch = /^vibracam\/(\d+)\//.exec(key);
      if (!ownerMatch || (viewer.id !== Number(ownerMatch[1]) && viewer.role !== "admin")) {
        res.status(403).send("Storage access denied");
        return;
      }
    }

    if (process.env.LOCAL_STORAGE_DIR) {
      try {
        const { join } = await import("node:path");
        const { createReadStream } = await import("node:fs");
        const { stat } = await import("node:fs/promises");
        const { getStorageContentType } = await import("../storage");
        
        const filePath = join(process.env.LOCAL_STORAGE_DIR, key);
        // Security check: ensure path is within LOCAL_STORAGE_DIR
        if (!filePath.startsWith(process.env.LOCAL_STORAGE_DIR)) {
          res.status(403).send("Invalid path");
          return;
        }
        
        const fileStat = await stat(filePath).catch(() => null);
        if (!fileStat) {
          res.status(404).send("File not found");
          return;
        }
        
        res.set("Content-Type", getStorageContentType(key));
        res.set("Content-Length", fileStat.size.toString());
        res.set("Cache-Control", "private, max-age=31536000");
        
        const stream = createReadStream(filePath);
        stream.on("error", () => res.destroy());
        stream.pipe(res);
        return;
      } catch (err) {
        console.error("[StorageProxy] local storage error:", err);
        res.status(500).send("Local storage error");
        return;
      }
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(503).send("Managed storage is unavailable");
      return;
    }

    try {
      const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      const shouldStreamToBrowser = isPublicAsset;
      if (shouldStreamToBrowser) {
        const assetResp = await fetch(url);
        if (!assetResp.ok || !assetResp.body) {
          res.status(502).send("Storage asset is unavailable");
          return;
        }
        const contentType = assetResp.headers.get("content-type");
        if (contentType) res.set("Content-Type", contentType);
        const contentLength = assetResp.headers.get("content-length");
        if (contentLength) res.set("Content-Length", contentLength);
        res.set("Cache-Control", "private, no-store");
        Readable.fromWeb(assetResp.body as never).on("error", () => res.destroy()).pipe(res);
        return;
      }
      res.set("Cache-Control", "private, no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
