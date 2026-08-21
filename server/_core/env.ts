export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerEmail: (process.env.OWNER_EMAIL ?? "").trim().toLowerCase(),
  isProduction: process.env.NODE_ENV === "production",

  // S3-compatible object storage (AWS S3, Cloudflare R2, Backblaze B2, MinIO, etc.)
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? "",

  // Optional OpenAI-compatible services. These keep AI features independent
  // from any platform-specific gateway.
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiBaseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  openAiImageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
  openAiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1",

  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "",
};

export function validateRuntimeConfig() {
  if (ENV.isProduction && !ENV.cookieSecret) {
    throw new Error("JWT_SECRET is required in production.");
  }
  if (!ENV.databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
}
