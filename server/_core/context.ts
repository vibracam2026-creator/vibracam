import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import { hashSessionToken, readCookie } from "../sessionSecurity";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
    if (user && !user.openId.startsWith("cron_")) {
      const token = readCookie(opts.req.headers.cookie, COOKIE_NAME);
      const session = token ? await db.getActiveAuthSession(hashSessionToken(token)) : undefined;
      if (!session || session.userId !== user.id) user = null;
      else await db.touchAuthSession(session.sessionHash);
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
