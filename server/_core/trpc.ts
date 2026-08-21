import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export function resolveRequestOrigin(req: TrpcContext["req"]) {
  const forwardedHost = typeof req.headers["x-forwarded-host"] === "string"
    ? req.headers["x-forwarded-host"].split(",")[0]?.trim()
    : undefined;
  const host = forwardedHost || (typeof req.get === "function" ? req.get("host") : (typeof req.headers.host === "string" ? req.headers.host : "localhost"));
  const forwardedProto = typeof req.headers["x-forwarded-proto"] === "string"
    ? req.headers["x-forwarded-proto"].split(",")[0]?.trim()
    : undefined;
  const protocol = forwardedProto === "https" ? "https" : (req.protocol || "http");
  return `${protocol}://${host}`;
}

function assertSameOrigin(req: TrpcContext["req"]) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  if (req.headers["sec-fetch-site"] === "cross-site") {
    throw new TRPCError({ code: "FORBIDDEN", message: "تم رفض الطلب العابر للمواقع." });
  }
  const requestOrigin = resolveRequestOrigin(req);
  const configuredOrigins = [process.env.PUBLIC_URL, process.env.CLIENT_URL, requestOrigin]
    .filter(Boolean)
    .map(value => { try { return new URL(value as string).origin; } catch { return ""; } })
    .filter(Boolean);
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (origin && !configuredOrigins.includes(origin)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "نطاق الطلب غير موثوق." });
  }
  const referer = typeof req.headers.referer === "string" ? req.headers.referer : undefined;
  if (!origin && referer) {
    try {
      if (!configuredOrigins.includes(new URL(referer).origin)) throw new Error("untrusted");
    } catch {
      throw new TRPCError({ code: "FORBIDDEN", message: "مرجع الطلب غير موثوق." });
    }
  }
}

const requireUser = t.middleware(async opts => {
  assertSameOrigin(opts.ctx.req);
  if (!opts.ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
});

const requireAdmin = t.middleware(async opts => {
  assertSameOrigin(opts.ctx.req);
  if (!opts.ctx.user || opts.ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);
export const adminProcedure = t.procedure.use(requireAdmin);
