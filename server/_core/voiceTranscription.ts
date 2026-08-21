import { ENV } from "./env";

export type TranscribeOptions = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens?: number[];
  temperature?: number;
  avg_logprob?: number;
  compression_ratio?: number;
  no_speech_prob?: number;
};

export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse;

export type TranscriptionError = {
  error: string;
  code:
    | "FILE_TOO_LARGE"
    | "INVALID_FORMAT"
    | "TRANSCRIPTION_FAILED"
    | "UPLOAD_FAILED"
    | "SERVICE_ERROR";
  details?: string;
};

/**
 * Independent OpenAI-compatible transcription helper.
 * The audio URL may be a signed S3 URL or another HTTPS URL reachable by the server.
 */
export async function transcribeAudio(
  options: TranscribeOptions,
): Promise<TranscriptionResponse | TranscriptionError> {
  if (!ENV.openAiApiKey) {
    return {
      error: "Voice transcription service is not configured",
      code: "SERVICE_ERROR",
      details: "OPENAI_API_KEY is not set",
    };
  }

  try {
    const response = await fetch(options.audioUrl);
    if (!response.ok) {
      return {
        error: "Failed to download audio file",
        code: "INVALID_FORMAT",
        details: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    if (audioBuffer.length > 16 * 1024 * 1024) {
      return {
        error: "Audio file exceeds maximum size limit",
        code: "FILE_TOO_LARGE",
      };
    }

    const mimeType =
      response.headers.get("content-type")?.split(";")[0] || "audio/mpeg";
    const extension = mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("webm")
          ? "webm"
          : "mp3";

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
      `audio.${extension}`,
    );
    formData.append("model", ENV.openAiTranscriptionModel);
    formData.append("response_format", "verbose_json");

    if (options.language) formData.append("language", options.language);
    if (options.prompt) formData.append("prompt", options.prompt);

    const transcriptionResponse = await fetch(
      `${ENV.openAiBaseUrl}/audio/transcriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.openAiApiKey}`,
        },
        body: formData,
      },
    );

    if (!transcriptionResponse.ok) {
      return {
        error: "Transcription service failed",
        code: "TRANSCRIPTION_FAILED",
        details: await transcriptionResponse.text().catch(() => ""),
      };
    }

    return (await transcriptionResponse.json()) as TranscriptionResponse;
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
