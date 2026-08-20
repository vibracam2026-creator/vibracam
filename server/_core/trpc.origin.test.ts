import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./context";
import { isTrustedWebDevOrigin, resolveRequestOrigin } from "./trpc";

describe("resolveRequestOrigin", () => {
  it("uses the trusted HTTPS protocol forwarded by the WebDev gateway", () => {
    const req = {
      protocol: "http",
      headers: {
        host: "vibracam-5ujb5uxx.manus.space",
        "x-forwarded-proto": "https",
      },
      get: (name: string) => name === "host" ? "vibracam-5ujb5uxx.manus.space" : undefined,
    } as TrpcContext["req"];

    expect(resolveRequestOrigin(req)).toBe("https://vibracam-5ujb5uxx.manus.space");
  });

  it("prefers the external host forwarded by the WebDev gateway over the internal service host", () => {
    const req = {
      protocol: "http",
      headers: {
        host: "127.0.0.1:3000",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "vibracam-5ujb5uxx.manus.space",
      },
      get: (name: string) => name === "host" ? "127.0.0.1:3000" : undefined,
    } as TrpcContext["req"];

    expect(resolveRequestOrigin(req)).toBe("https://vibracam-5ujb5uxx.manus.space");
  });

  it("trusts only HTTPS origins on managed WebDev domains", () => {
    expect(isTrustedWebDevOrigin("https://vibracam-5ujb5uxx.manus.space")).toBe(true);
    expect(isTrustedWebDevOrigin("https://3000-example.manus.computer")).toBe(true);
    expect(isTrustedWebDevOrigin("http://vibracam-5ujb5uxx.manus.space")).toBe(false);
    expect(isTrustedWebDevOrigin("https://example.com")).toBe(false);
  });
});
