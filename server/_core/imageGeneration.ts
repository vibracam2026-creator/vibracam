import { storagePut } from "../storage";
import { ENV } from "./env";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{ url?: string; b64Json?: string; mimeType?: string }>;
  model?: string;
  quality?: string;
};

export type GenerateImageResponse = { url?: string };

export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResponse> {
  if (!ENV.openAiApiKey) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch(`${ENV.openAiBaseUrl}/images/generations`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? ENV.openAiImageModel,
      prompt: options.prompt,
      size: "1024x1024",
      quality: options.quality ?? "medium",
      n: 1,
      ...(options.originalImages?.length ? { image: options.originalImages[0]?.b64Json } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Image generation failed: ${response.status} ${await response.text()}`);
  const result = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
  const image = result.data?.[0];
  if (!image) throw new Error("Image generation returned no image");
  if (image.url) return { url: image.url };
  if (!image.b64_json) throw new Error("Image generation returned no image data");
  const { url } = await storagePut(`generated/${Date.now()}.png`, Buffer.from(image.b64_json, "base64"), "image/png");
  return { url };
}

export type ImageModelInfo = { id?: string; model?: string };
export type ListImageModelsResponse = { models: ImageModelInfo[] };

export async function listImageModels(): Promise<ListImageModelsResponse> {
  if (!ENV.openAiApiKey) throw new Error("OPENAI_API_KEY is not configured");
  const response = await fetch(`${ENV.openAiBaseUrl}/models`, {
    headers: { authorization: `Bearer ${ENV.openAiApiKey}` },
  });
  if (!response.ok) throw new Error(`List image models failed: ${response.status}`);
  const result = await response.json() as { data?: Array<{ id: string }> };
  return { models: (result.data ?? []).filter(item => /image|gpt-image/i.test(item.id)).map(item => ({ id: item.id, model: item.id })) };
}
