import type { Express, Request } from "express";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import { hashSessionToken, readCookie } from "../sessionSecurity";
import {
  getStorageContentType,
  isStorageConfigured,
  storageGetSignedUrl,
} from "../storage";

export async function authenticateStorageRequest(req: Request) {
  const token = readCookie(req.headers.cookie, COOKIE_NAME);
  const session = token
    ? await db.getActiveAuthSession(hashSessionToken(token))
    : undefined;

  if (!session) return null;

  return (await db.getUserById(session.userId)) ?? null;
}

export function normalizeStorageKey(
  rawKey: string | string[] | undefined,
) {
  return (Array.isArray(rawKey) ? rawKey.join("/") : rawKey || "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
}

/**
 * Public media is deliberately limited to content that can appear in public
 * feeds/profiles. Messages and private group files still require a session.
 */
function isPublicStorageKey(key: string) {
  return (
    key === "branding/vibracam-logo.svg" ||
    /^vibracam\/\d+\/(avatar|cover|post|story|reel|product)\//.test(key) ||
    /^generated\//.test(key)
  );
}

export function registerStorageProxy(app: Express) {
  app.get("/storage/{*key}", async (req, res) => {
    const key = normalizeStorageKey(
      (req.params as Record<string, string | string[]>).key,
    );

    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!isStorageConfigured()) {
      res.status(503).send("Storage is not configured");
      return;
    }

    const isPublicAsset = isPublicStorageKey(key);

    if (!isPublicAsset) {
      const viewer = await authenticateStorageRequest(req);

      if (!viewer) {
        res.status(401).send("Authentication required");
        return;
      }

      const ownerMatch = /^vibracam\/(\d+)\//.exec(key);
      if (
        !ownerMatch ||
        (viewer.id !== Number(ownerMatch[1]) && viewer.role !== "admin")
      ) {
        res.status(403).send("Storage access denied");
        return;
      }
    }

    try {
      const signedUrl = await storageGetSignedUrl(key);
      const contentType = getStorageContentType(key);

      res.set(
        "Cache-Control",
        isPublicAsset ? "public, max-age=3600" : "private, no-store",
      );

      if (contentType) res.set("Content-Type", contentType);
      res.redirect(307, signedUrl);
    } catch (error) {
      console.error("[StorageProxy] failed:", error);
      res.status(502).send("Storage backend error");
    }
  });
}
