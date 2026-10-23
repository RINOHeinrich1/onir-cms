import { describe, expect, it } from "vitest";
import { isPlausibleTiming, MIN_HUMAN_DELAY_MS } from "@/lib/antispam";

describe("isPlausibleTiming — time-trap anti-spam", () => {
  it("accepte un humain (chargé il y a 10 s)", () => {
    expect(isPlausibleTiming(Date.now() - 10_000, Date.now())).toBe(true);
  });

  it("rejette une soumission instantanée (bot)", () => {
    const now = Date.now();
    expect(isPlausibleTiming(now, now)).toBe(false);
    expect(isPlausibleTiming(now - (MIN_HUMAN_DELAY_MS - 1), now)).toBe(false);
  });

  it("accepte pile au seuil", () => {
    const now = Date.now();
    expect(isPlausibleTiming(now - MIN_HUMAN_DELAY_MS, now)).toBe(true);
  });

  it("rejette les valeurs absurdes", () => {
    const now = Date.now();
    expect(isPlausibleTiming(undefined, now)).toBe(false);
    expect(isPlausibleTiming("hier", now)).toBe(false);
    expect(isPlausibleTiming(Number.NaN, now)).toBe(false);
    expect(isPlausibleTiming(now + 120_000, now)).toBe(false);
  });
});
