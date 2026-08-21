import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export type NotificationPayload = { title: string; content: string };

export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const title = payload.title.trim();
  const content = payload.content.trim();
  if (!title || !content) throw new TRPCError({ code: "BAD_REQUEST", message: "Notification title and content are required." });
  if (!ENV.resendApiKey || !ENV.resendFromEmail || !ENV.ownerEmail) return false;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ENV.resendFromEmail,
        to: [ENV.ownerEmail],
        subject: title.slice(0, 120),
        text: content.slice(0, 20000),
      }),
    });
    if (!response.ok) {
      console.warn("[Notification] Resend failed:", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] failed:", error);
    return false;
  }
}
