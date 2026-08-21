export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerEmail: (process.env.OWNER_EMAIL ?? "vibracam.2026@gmail.com").trim().toLowerCase(),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // Independent S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2, etc.)
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? "",
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? "",

  // Optional direct provider integrations.
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiBaseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "VibraCam <noreply@vibracam.com>",
};

export function validateRuntimeConfig() {
  if (ENV.isProduction && !ENV.cookieSecret) {
    throw new Error("JWT_SECRET is required in production.");
  }
  if (ENV.isProduction && !ENV.databaseUrl) {
    throw new Error("DATABASE_URL is required in production.");
  }
}
