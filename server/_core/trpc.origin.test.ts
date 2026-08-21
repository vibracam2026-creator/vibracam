import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./context";
import { isTrustedWebDevOrigin, resolveRequestOrigin } from "./trpc";

describe("resolveRequestOrigin", () => {
  it("uses the trusted HTTPS protocol forwarded by the WebDev gateway", () => {
    const req = {
      protocol: "http",
      headers: {
        host: "example.com",
        "x-forwarded-proto": "https",
      },
      get: (name: string) => name === "host" ? "example.com" : undefined,
    } as TrpcContext["req"];

    expect(resolveRequestOrigin(req)).toBe("https://example.com");
  });

  it("prefers the external host forwarded by the WebDev gateway over the internal service host", () => {
    const req = {
      protocol: "http",
      headers: {
        host: "127.0.0.1:3000",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "example.com",
      },
      get: (name: string) => name === "host" ? "127.0.0.1:3000" : undefined,
    } as TrpcContext["req"];

    expect(resolveRequestOrigin(req)).toBe("https://example.com");
  });

  it("trusts only HTTPS origins on managed WebDev domains", () => {
    expect(isTrustedWebDevOrigin("https://example.com")).toBe(true);
    expect(isTrustedWebDevOrigin("https://untrusted.example.com")).toBe(false);
    expect(isTrustedWebDevOrigin("http://example.com")).toBe(false);
    expect(isTrustedWebDevOrigin("https://example.com")).toBe(false);
  });
});
