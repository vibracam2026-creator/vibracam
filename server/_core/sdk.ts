import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { hashSessionToken } from "../sessionSecurity";
import { ENV, validateRuntimeConfig } from "./env";

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  private getSessionSecret() {
    validateRuntimeConfig();
    if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required to create sessions.");
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {},
  ): Promise<string> {
    if (!isNonEmptyString(openId)) throw new Error("openId is required to create a session.");
    return this.signSession({ openId, appId: "local", name: options.name || "" }, options);
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {},
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    return new SignJWT({
      openId: payload.openId,
      appId: "local",
      name: payload.name || "",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(Math.floor(issuedAt / 1000))
      .setExpirationTime(Math.floor((issuedAt + expiresInMs) / 1000))
      .sign(this.getSessionSecret());
  }

  async verifySession(cookieValue: string | undefined | null) {
    if (!cookieValue) return null;
    try {
      const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), {
        algorithms: ["HS256"],
      });
      const openId = payload.openId;
      if (!isNonEmptyString(openId)) return null;
      return {
        openId,
        appId: typeof payload.appId === "string" ? payload.appId : "local",
        name: typeof payload.name === "string" ? payload.name : "",
      };
    } catch {
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionToken = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionToken);
    if (!session) throw ForbiddenError("Invalid session cookie");

    const user = await db.getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("User not found");

    // JWT verification and database session verification are both required.
    // Revoked sessions therefore stop working immediately.
    const activeAuthSession = await db.getActiveAuthSession(
      hashSessionToken(sessionToken!),
    );
    if (!activeAuthSession || activeAuthSession.userId !== user.id) {
      throw ForbiddenError("Session has been revoked");
    }

    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    return user;
  }
}

export type AuthenticatedUser = User;
export const sdk = new SDKServer();
