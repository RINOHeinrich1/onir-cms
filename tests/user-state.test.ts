import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_STATE,
  isUserState,
  NEUTRAL_DETECTION,
  parseUserState,
  USER_STATE_INSTRUCTION,
  USER_STATES,
} from "@/domain/entities/user-state";

describe("user-state — domaine (ADR-0020)", () => {
  it("expose exactement les trois états prévus", () => {
    expect(USER_STATES).toEqual(["neutral", "content", "triste"]);
  });

  it("isUserState ne reconnaît que les états connus", () => {
    expect(isUserState("neutral")).toBe(true);
    expect(isUserState("content")).toBe(true);
    expect(isUserState("triste")).toBe(true);
    expect(isUserState("neutre")).toBe(false);
    expect(isUserState("")).toBe(false);
  });

  it("parseUserState accepte les états valides", () => {
    expect(parseUserState("content")).toBe("content");
    expect(parseUserState("triste")).toBe("triste");
    expect(parseUserState("neutral")).toBe("neutral");
  });

  it("parseUserState retombe sur neutral (défaut sûr, fail-open)", () => {
    expect(parseUserState("neutre")).toBe("neutral");
    expect(parseUserState("")).toBe("neutral");
    expect(parseUserState(null)).toBe("neutral");
    expect(parseUserState(42)).toBe("neutral");
    expect(parseUserState({})).toBe("neutral");
    expect(parseUserState(undefined)).toBe(DEFAULT_USER_STATE);
  });

  it("la détection neutre par défaut a une confiance nulle", () => {
    expect(DEFAULT_USER_STATE).toBe("neutral");
    expect(NEUTRAL_DETECTION).toEqual({ state: "neutral", confidence: 0 });
  });

  it("l'instruction de classification impose une sortie JSON stricte", () => {
    expect(USER_STATE_INSTRUCTION).toContain('"state"');
    expect(USER_STATE_INSTRUCTION).toContain('"confidence"');
    expect(USER_STATE_INSTRUCTION).toMatch(/JSON/);
  });
});
