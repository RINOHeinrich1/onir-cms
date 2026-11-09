import { afterEach, describe, expect, it, vi } from "vitest";
import { AiRateLimitError } from "@/application/errors";
import { createAiRateLimiter } from "@/infrastructure/ai/ai-rate-limiter";
import { type AiRateLimitConfig, aiRateLimitConfig } from "@/lib/env";

function config(overrides: Partial<AiRateLimitConfig> = {}): AiRateLimitConfig {
  return {
    enabled: true,
    mode: "local",
    degraded: "local_share",
    rpm: 55,
    maxConcurrent: 2,
    queueLimit: 10,
    maxWaitMs: 1_000,
    replicaCount: 1,
    valkeyUrl: undefined,
    id: `test-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuration rate limiting IA", () => {
  it("lit les valeurs et garde les défauts sûrs", () => {
    vi.stubEnv("AI_RATE_LIMIT_ENABLED", "true");
    vi.stubEnv("AI_RATE_LIMIT_MODE", "auto");
    vi.stubEnv("AI_RATE_LIMIT_RPM", "42");
    vi.stubEnv("REPLICA_COUNT", "2");
    const value = aiRateLimitConfig();
    expect(value).toMatchObject({
      enabled: true,
      mode: "auto",
      rpm: 42,
      replicaCount: 2,
      degraded: "local_share",
    });
  });
});

describe("limiteur IA", () => {
  it("laisse passer une tâche en mode local sans Valkey", async () => {
    const limiter = createAiRateLimiter(config());
    await expect(limiter.run("provider", async () => "ok")).resolves.toBe("ok");
  });

  it("utilise le quota local partagé si Valkey est absent", async () => {
    const limiter = createAiRateLimiter(
      config({ mode: "distributed", degraded: "local_share", replicaCount: 2 }),
    );
    await expect(limiter.run("provider", async () => "ok")).resolves.toBe("ok");
  });

  it("refuse proprement en fail_closed sans Valkey", async () => {
    const limiter = createAiRateLimiter(
      config({ mode: "distributed", degraded: "fail_closed", replicaCount: 2 }),
    );
    await expect(limiter.run("provider", async () => "ok")).rejects.toBeInstanceOf(
      AiRateLimitError,
    );
  });

  it("reste disponible en fail_open sans Valkey", async () => {
    const limiter = createAiRateLimiter(
      config({ mode: "distributed", degraded: "fail_open", replicaCount: 2 }),
    );
    await expect(limiter.run("provider", async () => "ok")).resolves.toBe("ok");
  });

  it("ne transforme pas une erreur de tâche en erreur de rate limit", async () => {
    const limiter = createAiRateLimiter(config());
    await expect(
      limiter.run("provider", async () => {
        throw new Error("provider failure");
      }),
    ).rejects.toThrow("provider failure");
  });
});
