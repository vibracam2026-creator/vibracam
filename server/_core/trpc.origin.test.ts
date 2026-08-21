import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./context";
import { resolveRequestOrigin } from "./trpc";

describe("resolveRequestOrigin", () => {
  it("uses the forwarded HTTPS protocol", () => {
    const req = {
      protocol: "http",
      headers: { host: "vibracam.com", "x-forwarded-proto": "https" },
      get: (name: string) => name === "host" ? "vibracam.com" : undefined,
    } as TrpcContext["req"];
    expect(resolveRequestOrigin(req)).toBe("https://vibracam.com");
  });

  it("prefers the forwarded public host", () => {
    const req = {
      protocol: "http",
      headers: {
        host: "127.0.0.1:3000",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "vibracam.com",
      },
      get: (name: string) => name === "host" ? "127.0.0.1:3000" : undefined,
    } as TrpcContext["req"];
    expect(resolveRequestOrigin(req)).toBe("https://vibracam.com");
  });
});
