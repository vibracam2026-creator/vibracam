import { trpc } from "@/lib/trpc";
import { ImagePlus, LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLanguage } from "@/lib/i18n";

export type UploadedMedia = { url: string; key: string; type: "image" | "video" | "audio" };
const DIRECT_LIMIT = 40 * 1024 * 1024;
const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

function fileToBase64(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function MediaUploader({ kind, accept = "image/*", onUploaded, label = "إضافة وسائط" }: { kind: "avatar" | "cover" | "post" | "story" | "reel" | "product" | "message" | "group"; accept?: string; onUploaded: (media: UploadedMedia) => void; label?: ReactNode }) {
  const { t } = useLanguage();
  const ref = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const upload = trpc.media.upload.useMutation();
  const uploadChunk = trpc.media.uploadChunk.useMutation();
  const completeChunked = trpc.media.completeChunked.useMutation();

  const select = async (file?: File) => {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    if (file.size > (isVideo ? MAX_VIDEO_SIZE : DIRECT_LIMIT)) {
      toast.error(isVideo ? "حجم الفيديو يتجاوز 200 ميغابايت." : "حجم الملف يتجاوز 40 ميغابايت.");
      return;
    }
    try {
      setLoading(true);
      setProgress(0);
      let result: { url: string; key: string };
      if (isVideo && file.size > DIRECT_LIMIT && ["post", "story", "reel", "product", "message", "group"].includes(kind)) {
        const uploadId = crypto.randomUUID().replace(/-/g, "");
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const chunkKeys: string[] = [];
        for (let index = 0; index < totalChunks; index += 1) {
          const chunk = file.slice(index * CHUNK_SIZE, Math.min(file.size, (index + 1) * CHUNK_SIZE));
          const uploadedChunk = await uploadChunk.mutateAsync({ uploadId, chunkIndex: index, totalChunks, chunkBase64: await fileToBase64(chunk) });
          chunkKeys.push(uploadedChunk.key);
          setProgress(Math.round(((index + 1) / totalChunks) * 100));
        }
        result = await completeChunked.mutateAsync({ uploadId, totalChunks, chunkKeys, mimeType: file.type, fileName: file.name, kind: kind as "post" | "story" | "reel" | "product" | "message" | "group" });
      } else {
        result = await upload.mutateAsync({ base64: await fileToBase64(file), mimeType: file.type, fileName: file.name, kind });
        setProgress(100);
      }
      onUploaded({ url: result.url, key: result.key, type: isVideo ? "video" : file.type.startsWith("audio/") ? "audio" : "image" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الملف.");
    } finally {
      setLoading(false);
      setProgress(0);
      if (ref.current) ref.current.value = "";
    }
  };

  return <><input ref={ref} type="file" accept={accept} aria-label={t("إضافة وسائط")} className="hidden" onChange={event => void select(event.target.files?.[0])}/><button type="button" onClick={() => ref.current?.click()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm soft-button disabled:opacity-60">{loading ? <><LoaderCircle className="animate-spin" size={17}/>{progress ? `${progress}%` : "جارٍ الرفع"}</> : kind === "post" ? <ImagePlus size={17}/> : <UploadCloud size={17}/>} {!loading && label}</button></>;
}
