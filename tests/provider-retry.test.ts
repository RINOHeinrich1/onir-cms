import { describe, expect, it } from "vitest";
import { AiRateLimitError, BadGatewayError } from "@/application/errors";
import { ProviderHttpError } from "@/infrastructure/ai/provider-http-error";
import { runWithProviderRetry } from "@/infrastructure/ai/provider-retry";

describe("retry amont fournisseur IA", () => {
  it("retente un 429 puis réussit", async () => {
    let calls = 0;
    const delays: number[] = [];
    const value = await runWithProviderRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new ProviderHttpError(429, "rate limit", 2);
        return "ok";
      },
      { sleep: async (ms) => void delays.push(ms), random: () => 0 },
    );
    expect(value).toBe("ok");
    expect(calls).toBe(2);
    expect(delays).toEqual([2_000]);
  });

  it("retente les 5xx avec backoff", async () => {
    let calls = 0;
    const delays: number[] = [];
    const value = await runWithProviderRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new ProviderHttpError(503, "unavailable");
        return "ok";
      },
      { baseDelayMs: 10, sleep: async (ms) => void delays.push(ms), random: () => 0 },
    );
    expect(value).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([10, 20]);
  });

  it("ne retente pas un 400/401", async () => {
    let calls = 0;
    await expect(
      runWithProviderRetry(async () => {
        calls += 1;
        throw new ProviderHttpError(400, "bad request");
      }),
    ).rejects.toBeInstanceOf(BadGatewayError);
    expect(calls).toBe(1);
  });

  it("ne retente pas une erreur applicative", async () => {
    let calls = 0;
    await expect(
      runWithProviderRetry(async () => {
        calls += 1;
        throw new AiRateLimitError("local queue");
      }),
    ).rejects.toBeInstanceOf(AiRateLimitError);
    expect(calls).toBe(1);
  });

  it("traduit un 429 final en AiRateLimitError", async () => {
    await expect(
      runWithProviderRetry(
        async () => {
          throw new ProviderHttpError(429, "rate limit", 7);
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toMatchObject({ retryAfterSeconds: 7 });
  });
});
