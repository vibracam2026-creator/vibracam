import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV, validateRuntimeConfig } from "./env";

/**
 * Local Authentication SDK
 *
 * External OAuth has been removed from the authentication runtime.
 *
 * Authentication flow:
 *
 *   email + password
 *          ↓
 *   localCredentials
 *          ↓
 *       users
 *          ↓
 *   createSessionToken()
 *          ↓
 *     JWT cookie
 *          ↓
 *   authenticateRequest()
 *
 * This file intentionally contains NO requests to external services,
 * OAuth server or external identity provider.
 */

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

export type LocalUserInfo = {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
};

export type LocalTokenResponse = {
  accessToken: string;
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

class SDKServer {
  /**
   * Parse request cookies.
   */
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);

    return new Map(Object.entries(parsed));
  }

  /**
   * Return the secret used to sign local sessions.
   */
  private getSessionSecret(): Uint8Array {
    validateRuntimeConfig();

    const secret = ENV.cookieSecret;

    if (!isNonEmptyString(secret)) {
      throw new Error("JWT_SECRET is required to create sessions.");
    }

    return new TextEncoder().encode(secret);
  }

  /**
   * Create a local JWT session token.
   *
   * openId is intentionally retained as the stable identifier because
   * the existing application uses users.openId throughout the server.
   */
  async createSessionToken(
    openId: string,
    options: {
      expiresInMs?: number;
      name?: string;
    } = {}
  ): Promise<string> {
    if (!isNonEmptyString(openId)) {
      throw new Error("openId is required to create a session.");
    }

    return this.signSession(
      {
        openId,
        appId: "",
        name: options.name ?? "",
      },
      {
        expiresInMs: options.expiresInMs,
      }
    );
  }

  /**
   * Sign a local JWT session.
   */
  async signSession(
    payload: SessionPayload,
    options: {
      expiresInMs?: number;
    } = {}
  ): Promise<string> {
    if (!isNonEmptyString(payload.openId)) {
      throw new Error("openId is required to sign a session.");
    }

    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;

    if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
      throw new Error("expiresInMs must be a positive number.");
    }

    const issuedAtSeconds = Math.floor(issuedAt / 1000);
    const expirationSeconds = Math.floor(
      (issuedAt + expiresInMs) / 1000
    );

    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId ?? "",
      name: payload.name ?? "",
    })
      .setProtectedHeader({
        alg: "HS256",
        typ: "JWT",
      })
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  /**
   * Verify a local JWT session.
   *
   * Returns null instead of throwing for invalid/expired cookies.
   * This allows the authentication middleware/routes to return the
   * normal unauthorized response.
   */
  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<SessionPayload | null> {
    if (!isNonEmptyString(cookieValue)) {
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();

      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });

      const openId =
        typeof payload.openId === "string"
          ? payload.openId
          : "";

      const appId =
        typeof payload.appId === "string"
          ? payload.appId
          : "";

      const name =
        typeof payload.name === "string"
          ? payload.name
          : "";

      if (!isNonEmptyString(openId)) {
        console.warn("[Auth] Session payload missing openId");
        return null;
      }

      return {
        openId,
        appId,
        name,
      };
    } catch (error) {
      console.warn(
        "[Auth] Session verification failed:",
        error instanceof Error ? error.message : String(error)
      );

      return null;
    }
  }

  /**
   * Authenticate an incoming request using the local session cookie.
   *
   * No OAuth.
   * No external OAuth.
   * No external identity provider.
   */
  async authenticateRequest(
    req: Request
  ): Promise<AuthenticatedUser> {
    const cookies = this.parseCookies(req.headers.cookie);

    const sessionToken = cookies.get(COOKIE_NAME);

    const session = await this.verifySession(sessionToken);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const user = await db.getUserByOpenId(session.openId);

    if (!user) {
      throw ForbiddenError("User not found");
    }

    return user;
  }

  /**
   * Compatibility method.
   *
   * Kept temporarily so older files importing this method do not
   * immediately fail at compile time.
   *
   * It NEVER contacts an external identity provider.
   */
  async exchangeCodeForToken(
    _code: string,
    _state: string
  ): Promise<LocalTokenResponse> {
    throw new Error(
      "OAuth authentication is disabled. Use local email/password authentication."
    );
  }

  /**
   * Compatibility method.
   *
   * It NEVER contacts an external identity provider.
   */
  async getUserInfo(
    _accessToken: string
  ): Promise<LocalUserInfo> {
    throw new Error(
      "OAuth authentication is disabled. User information is loaded from the local database."
    );
  }

  /**
   * Compatibility method.
   *
   * It NEVER contacts an external identity provider.
   */
  async getUserInfoWithJwt(
    _jwtToken: string
  ): Promise<never> {
    throw new Error(
      "External OAuth authentication has been removed. JWT user information is resolved locally."
    );
  }
}

export type AuthenticatedUser = User;

export const sdk = new SDKServer();
