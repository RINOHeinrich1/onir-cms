import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("rate-limit — fenêtre glissante", () => {
  it("autorise jusqu'à la limite puis bloque", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    expect(limiter("a").limited).toBe(false);
    expect(limiter("a").limited).toBe(false);

    const blocked = limiter("a");
    expect(blocked.limited).toBe(true);
    if (blocked.limited) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("réouvre après expiration de la fenêtre", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(limiter("a").limited).toBe(false);
    expect(limiter("a").limited).toBe(true);

    now = 1500;
    expect(limiter("a").limited).toBe(false);
  });

  it("isole les clés entre elles", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(limiter("a").limited).toBe(false);
    expect(limiter("b").limited).toBe(false);
  });
});
