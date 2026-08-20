import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("validateRuntimeConfig", () => {
  it("accepts a non-empty system-managed session secret in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "managed-secret");
    const { validateRuntimeConfig } = await import("./env");

    expect(() => validateRuntimeConfig()).not.toThrow();
  });

  it("rejects a missing session secret in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "");
    const { validateRuntimeConfig } = await import("./env");

    expect(() => validateRuntimeConfig()).toThrow("JWT_SECRET is required in production.");
  });
});

