import { createHmac, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const position = ALPHABET.indexOf(normalized[index] ?? "");
    if (position < 0) continue;
    buffer = (buffer << 5) | position;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function codeFor(secret: string, counter: number) {
  const key = base32Decode(secret);
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(input).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, token: string, now = Date.now()) {
  const normalized = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(now / 30_000);
  const expected = Buffer.from(codeFor(secret, counter));
  for (const offset of [-1, 0, 1]) {
    const candidate = Buffer.from(codeFor(secret, counter + offset));
    if (candidate.length === expected.length && timingSafeEqual(candidate, Buffer.from(normalized))) return true;
  }
  return false;
}
