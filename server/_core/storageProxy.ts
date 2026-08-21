import type { Express, Request } from "express";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import { hashSessionToken, readCookie } from "../sessionSecurity";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { getS3Client, getStorageContentType } from "../storage";

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
  const key = Array.isArray(rawKey) ? rawKey.join("/") : rawKey || "";
  return key.replace(/^\/+/, "").replace(/\\/g, "/");
}

function isSafeKey(key: string) {
  return Boolean(key) && !key.split("/").some(part => part === "..");
}

export function registerStorageProxy(app: Express) {
  app.get("/storage/{*key}", async (req, res) => {
    const rawKey = (req.params as Record<string, string | string[]>).key;
    const key = normalizeStorageKey(rawKey);
    if (!isSafeKey(key)) {
      res.status(400).send("Invalid storage key");
      return;
    }

    const isPublicAsset = /^vibracam\/\d+\/(avatar|cover)\//.test(key) || key.startsWith("public/");
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

    const s3 = getS3Client();
    if (s3) {
      try {
        const object = await s3.send(new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }));
        res.set("Content-Type", object.ContentType || getStorageContentType(key));
        if (object.ContentLength != null) res.set("Content-Length", String(object.ContentLength));
        res.set("Cache-Control", isPublicAsset ? "public, max-age=31536000, immutable" : "private, no-store");
        if (!object.Body) return res.status(404).send("File not found");
        const stream = object.Body as NodeJS.ReadableStream;
        stream.on("error", () => res.destroy());
        stream.pipe(res);
        return;
      } catch (error: any) {
        const status = error?.name === "NoSuchKey" ? 404 : 502;
        res.status(status).send(status === 404 ? "File not found" : "Storage backend error");
        return;
      }
    }

    const root = resolve(process.env.LOCAL_STORAGE_DIR || "./data/storage");
    const filePath = resolve(join(root, key));
    if (!filePath.startsWith(`${root}/`) && filePath !== root) {
      res.status(403).send("Invalid path");
      return;
    }
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat) {
      res.status(404).send("File not found");
      return;
    }
    res.set("Content-Type", getStorageContentType(key));
    res.set("Content-Length", String(fileStat.size));
    res.set("Cache-Control", isPublicAsset ? "public, max-age=31536000, immutable" : "private, no-store");
    const stream = createReadStream(filePath);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
}
