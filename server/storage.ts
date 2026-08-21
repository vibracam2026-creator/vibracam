import { randomUUID } from "node:crypto";
import { extname, join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

function getS3Client() {
  if (!ENV.s3Bucket || !ENV.s3AccessKeyId || !ENV.s3SecretAccessKey) return null;
  return new S3Client({
    region: ENV.s3Region,
    endpoint: ENV.s3Endpoint || undefined,
    forcePathStyle: Boolean(ENV.s3Endpoint),
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
  });
}

export function isStorageConfigured() {
  return Boolean(
    process.env.LOCAL_STORAGE_DIR ||
    getS3Client()
  );
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "").replace(/\\/g, "/").replace(/\.\.(?:\/|$)/g, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function localRoot() {
  return resolve(process.env.LOCAL_STORAGE_DIR || "./data/storage");
}

function localUrl(key: string) {
  return `/storage/${encodeURI(key).replace(/#/g, "%23")}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const s3 = getS3Client();

  if (s3) {
    await s3.send(new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: typeof data === "string" ? Buffer.from(data) : Buffer.from(data),
      ContentType: contentType,
    }));
    return {
      key,
      url: ENV.s3PublicBaseUrl
        ? `${ENV.s3PublicBaseUrl.replace(/\/+$/, "")}/${encodeURI(key)}`
        : localUrl(key),
    };
  }

  const root = localRoot();
  const filePath = resolve(root, key);
  if (!filePath.startsWith(`${root}/`) && filePath !== root) throw new Error("Invalid storage path");
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, typeof data === "string" ? data : Buffer.from(data));
  return { key, url: localUrl(key) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: ENV.s3PublicBaseUrl ? `${ENV.s3PublicBaseUrl.replace(/\/+$/, "")}/${encodeURI(key)}` : localUrl(key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  if (ENV.s3PublicBaseUrl) return `${ENV.s3PublicBaseUrl.replace(/\/+$/, "")}/${encodeURI(key)}`;
  const s3 = getS3Client();
  if (s3) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: key }), { expiresIn: 3600 });
  }
  return localUrl(key);
}

export function getStorageContentType(relKey: string) {
  const extension = extname(relKey).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
  };
  return types[extension] || "application/octet-stream";
}

export { getS3Client };
