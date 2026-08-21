/**
 * Image generation helper using internal ImageService
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 *
 * For editing:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Add a rainbow to this landscape",
 *     originalImages: [{
 *       url: "https://example.com/original.jpg",
 *       mimeType: "image/jpeg"
 *     }]
 *   });
 */
import { storagePut } from "server/storage";
import { ENV } from "./env";

// Default model for generated sites. "MODEL_GPT_IMAGE_2" is the OpenAI images.v1
// enum for GPT Image 2 (id: gpt-image-2). If omitted, OpenAI falls back to Gemini 2.5 Flash.
const DEFAULT_IMAGE_MODEL = "MODEL_GPT_IMAGE_2";
const DEFAULT_IMAGE_QUALITY = "medium";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
  /** direct OpenAI image model enum, e.g. "MODEL_GPT_IMAGE_2". Defaults to GPT Image 2. */
  model?: string;
  /** Generation quality, e.g. "medium" | "high". Defaults to "medium" for GPT Image 2. */
  quality?: string;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.openAiApiKey) throw new Error("OPENAI_API_KEY is not configured");

  const fullUrl = `${ENV.openAiBaseUrl}/images/generations`;

  const model = options.model ?? DEFAULT_IMAGE_MODEL;
  const quality =
    options.quality ?? (model === DEFAULT_IMAGE_MODEL ? DEFAULT_IMAGE_QUALITY : undefined);

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: model === DEFAULT_IMAGE_MODEL ? "gpt-image-1" : model,
      prompt: options.prompt,
      ...(quality ? { quality } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const result = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const image = result.data?.[0];
  if (!image) throw new Error("Image provider returned no image.");
  let buffer: Buffer;
  let mimeType = "image/png";
  if (image.b64_json) buffer = Buffer.from(image.b64_json, "base64");
  else if (image.url) { const imageResponse = await fetch(image.url); if (!imageResponse.ok) throw new Error("Unable to download generated image."); buffer = Buffer.from(await imageResponse.arrayBuffer()); }
  else throw new Error("Image provider returned no image data.");

  // Save to S3
  const { url } = await storagePut(
    `generated/${Date.now()}.png`,
    buffer,
    mimeType
  );
  return {
    url,
  };
}

export type ImageModelInfo = {
  /** direct OpenAI model enum, e.g. "MODEL_GPT_IMAGE_2". Pass into generateImage({ model }). */
  model?: string;
  /** Stable model id, e.g. "gpt-image-2". */
  id?: string;
};

export type ListImageModelsResponse = {
  models: ImageModelInfo[];
};

/**
 * List the image models the internal ImageService currently supports.
 * Feed a returned `model` value into generateImage({ model }).
 */
export async function listImageModels(): Promise<ListImageModelsResponse> {
  return { models: [{ model: DEFAULT_IMAGE_MODEL, id: "gpt-image-1" }] };
}
