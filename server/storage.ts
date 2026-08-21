import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let clientCache: S3Client | null | undefined;

function getS3Client() {
  if (clientCache !== undefined) return clientCache;

  if (
    !ENV.s3Bucket ||
    !ENV.s3AccessKeyId ||
    !ENV.s3SecretAccessKey
  ) {
    clientCache = null;
    return clientCache;
  }

  clientCache = new S3Client({
    region: ENV.s3Region || "auto",
    endpoint: ENV.s3Endpoint || undefined,
    forcePathStyle: Boolean(ENV.s3Endpoint),
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
  });

  return clientCache;
}

export function isStorageConfigured() {
  return Boolean(getS3Client() && ENV.s3Bucket);
}

function normalizeKey(relKey: string) {
  const key = relKey.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!key || key.includes("..")) {
    throw new Error("Invalid storage key.");
  }
  return key;
}

function appendHashSuffix(relKey: string) {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  return lastDot === -1
    ? `${relKey}_${hash}`
    : `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function publicUrl(key: string) {
  if (ENV.s3PublicBaseUrl) {
    return `${ENV.s3PublicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }

  return `/storage/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
}

function requireStorage() {
  const client = getS3Client();

  if (!client || !ENV.s3Bucket) {
    throw new Error(
      "S3-compatible storage is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.",
    );
  }

  return client;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const client = requireStorage();

  await client.send(
    new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: typeof data === "string" ? Buffer.from(data) : data,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return { key, url: publicUrl(key) };
}

export async function storageGet(relKey: string) {
  const key = normalizeKey(relKey);
  return { key, url: publicUrl(key) };
}

export async function storageGetSignedUrl(
  relKey: string,
  expiresIn = 900,
) {
  const key = normalizeKey(relKey);
  const client = requireStorage();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
    }),
    { expiresIn },
  );
}

export function getStorageContentType(relKey: string) {
  const extension = extname(relKey).toLowerCase();

  const types: Record<string, string> = {
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
  };

  return types[extension] || "application/octet-stream";
}
