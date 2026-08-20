import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

const defaultIceServers = [{ urls: "stun:stun.l.google.com:19302" }];

function configuredIceServers() {
  const turnUrls = (process.env.TURN_SERVER_URL || process.env.TURN_URL || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!turnUrls.length) return defaultIceServers;
  const turn: Record<string, unknown> = { urls: turnUrls };
  if (process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    turn.username = process.env.TURN_USERNAME;
    turn.credential = process.env.TURN_PASSWORD;
  }
  return [...defaultIceServers, turn];
}

export const systemRouter = router({
  iceServers: publicProcedure.query(() => ({ iceServers: configuredIceServers() })),

  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
