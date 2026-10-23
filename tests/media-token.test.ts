import { beforeEach, describe, expect, it, vi } from "vitest";
import { signedMediaUrl, signMediaAccess, verifyMediaAccess } from "@/lib/media-token";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "media-token-test-secret");
});

describe("jetons d'accès média (ADR-0025, H8)", () => {
  it("accepte un jeton valide pour le bon média et la bonne organisation", () => {
    const token = signMediaAccess("media-1", "org-a");
    expect(verifyMediaAccess(token, "media-1", "org-a")).toBe(true);
  });

  it("refuse un autre média ou une autre organisation", () => {
    const token = signMediaAccess("media-1", "org-a");
    expect(verifyMediaAccess(token, "media-1", "org-b")).toBe(false);
    expect(verifyMediaAccess(token, "media-2", "org-a")).toBe(false);
  });

  it("refuse un jeton expiré", () => {
    const token = signMediaAccess("media-1", "org-a", -1);
    expect(verifyMediaAccess(token, "media-1", "org-a")).toBe(false);
  });

  it("refuse un jeton falsifié", () => {
    const token = signMediaAccess("media-1", "org-a");
    expect(verifyMediaAccess(`${token}x`, "media-1", "org-a")).toBe(false);
    expect(verifyMediaAccess("n-importe-quoi", "media-1", "org-a")).toBe(false);
  });

  it("construit une URL signée sans organizationId client", () => {
    const url = signedMediaUrl("media-1", "org-a");
    expect(url.startsWith("/api/medias/media-1/file?t=")).toBe(true);
    expect(url).not.toContain("org-a");
  });
});
