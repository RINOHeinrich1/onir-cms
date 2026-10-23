import { describe, expect, it } from "vitest";
import { generateLinkToken, hashLinkToken } from "@/domain/link-token";

describe("link-token — jetons partageables (US-LIENS-001)", () => {
  it("génère des jetons uniques au format base64url", () => {
    const first = generateLinkToken();
    const second = generateLinkToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("hache en SHA-256 hex déterministe, sans exposer le clair", () => {
    const token = generateLinkToken();
    const first = hashLinkToken(token);
    const second = hashLinkToken(token);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain(token);
  });
});
