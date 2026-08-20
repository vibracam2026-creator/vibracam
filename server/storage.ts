// Storage helpers: Manus-managed S3 storage or AWS S3 / Local storage.
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { ENV } from "./_core/env";

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) return null;
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

export function isStorageConfigured() {
  return Boolean(getForgeConfig() || process.env.LOCAL_STORAGE_DIR || (process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID));
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  
  if (process.env.LOCAL_STORAGE_DIR) {
    const filePath = join(process.env.LOCAL_STORAGE_DIR, key);
    const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
    await mkdir(dirPath, { recursive: true });
    await writeFile(filePath, typeof data === "string" ? data : Buffer.from(data as any));
    return { key, url: `/manus-storage/${key}` };
  }
  
  const forge = getForgeConfig();

  if (!forge) throw new Error("Managed storage is unavailable.");

  const presignUrl = new URL("v1/storage/presign/put", forge.forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forge.forgeKey}` },
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as any], { type: contentType });
  const uploadResp = await fetch(s3Url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!uploadResp.ok) throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  
  if (process.env.LOCAL_STORAGE_DIR) {
    // For local storage, the proxy will handle serving the file
    // We return a pseudo-URL that the client can use to fetch via proxy
    return `/manus-storage/${key}`;
  }
  
  const forge = getForgeConfig();
  if (!forge) throw new Error("Managed storage is unavailable.");

  const getUrl = new URL("v1/storage/presign/get", forge.forgeUrl + "/");
  getUrl.searchParams.set("path", key);
  const resp = await fetch(getUrl, { headers: { Authorization: `Bearer ${forge.forgeKey}` } });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = (await resp.json()) as { url: string };
  return url;
}

export function getStorageContentType(relKey: string) {
  const extension = extname(relKey).toLowerCase();
  const types: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".pdf": "application/pdf" };
  return types[extension] || "application/octet-stream";
}
