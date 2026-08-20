import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import * as db from "./db";
import { assertMinimumAge, PLATFORM_MIN_AGE } from "./profileRules";

const scrypt = promisify(scryptCallback);
const HASH_BYTES = 64;

export type LocalRegistration = { firstName: string; lastName: string; username: string; email: string; password: string; dateOfBirth: string; country: string; city: string; timeZone?: string | null; defaultCurrency?: string | null };

export class LocalAuthError extends Error {
  constructor(public readonly code: "ACCOUNT_EXISTS" | "EMAIL_EXISTS" | "USERNAME_EXISTS" | "INVALID_CREDENTIALS", message: string) {
    super(message);
  }
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scrypt(password, salt, HASH_BYTES)) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, savedHash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !savedHash) return false;
  const expected = Buffer.from(savedHash, "base64url");
  const derived = (await scrypt(password, salt, HASH_BYTES)) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function registerLocalAccount(input: LocalRegistration) {
  const email = normalizeEmail(input.email);
  const username = input.username.trim().toLowerCase();
  assertMinimumAge(input.dateOfBirth, PLATFORM_MIN_AGE, "يجب أن يكون عمرك 18 عامًا على الأقل لإنشاء حساب.");
  const [existingUserByEmail, existingCredential, existingUsername] = await Promise.all([db.getUserByEmail(email), db.getLocalCredentialByEmail(email), db.getUserByUsername(username)]);
  if (existingUserByEmail) throw new LocalAuthError("EMAIL_EXISTS", "هذا البريد الإلكتروني مسجّل بالفعل. انتقل إلى تسجيل الدخول أو استخدم استعادة كلمة المرور.");
  if (existingCredential) {
    const credentialOwner = await db.getUserById(existingCredential.userId);
    if (credentialOwner) throw new LocalAuthError("EMAIL_EXISTS", "هذا البريد الإلكتروني مسجّل بالفعل. انتقل إلى تسجيل الدخول أو استخدم استعادة كلمة المرور.");
    await db.deleteLocalCredentialById(existingCredential.id);
  }
  if (existingUsername) throw new LocalAuthError("USERNAME_EXISTS", "اسم المستخدم مستخدم بالفعل. اختر اسم مستخدم مختلفًا.");
  const passwordHash = await hashPassword(input.password);
  const user = await db.createLocalAccount({
    openId: `local_${randomUUID()}`,
    name: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    username,
    email,
    passwordHash,
    dateOfBirth: input.dateOfBirth,
    country: input.country.trim(),
    city: input.city.trim(),
    timeZone: input.timeZone ?? null,
    defaultCurrency: input.defaultCurrency ?? "SAR",
  });
  if (!user) throw new Error("تعذر إنشاء الحساب.");
  return user;
}

export async function loginLocalAccount(emailInput: string, password: string) {
  const account = await db.getLocalAccountByEmail(normalizeEmail(emailInput));
  if (!account || !(await verifyPassword(password, account.credential.passwordHash))) {
    throw new LocalAuthError("INVALID_CREDENTIALS", "البريد الإلكتروني أو كلمة المرور غير صحيحين.");
  }
  await db.touchLocalUser(account.user.id);
  return account.user;
}
