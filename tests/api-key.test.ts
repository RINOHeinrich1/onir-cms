import { describe, expect, it } from "vitest";
import { type ApiKey, apiKeyStatus } from "@/domain/entities/api-key";
import {
  API_KEY_PREFIX,
  generateApiKey,
  hashApiKeySecret,
  parseApiKey,
  verifyApiKeySecret,
} from "@/lib/api-key-token";

function key(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    name: "Test",
    keyPrefix: "onir_live_abcd1234",
    scopes: ["fiches:read"],
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    lastUsedIp: null,
    ...overrides,
  };
}

describe("api key status", () => {
  it("active by default", () => {
    expect(apiKeyStatus(key(), Date.parse("2026-06-01T00:00:00.000Z"))).toBe("active");
  });

  it("expired when expiry is past", () => {
    expect(
      apiKeyStatus(
        key({ expiresAt: "2026-01-02T00:00:00.000Z" }),
        Date.parse("2026-01-03T00:00:00.000Z"),
      ),
    ).toBe("expired");
  });

  it("revoked wins over expiry", () => {
    expect(
      apiKeyStatus(
        key({ expiresAt: "2026-01-02T00:00:00.000Z", revokedAt: "2026-01-02T12:00:00.000Z" }),
        Date.parse("2026-01-03T00:00:00.000Z"),
      ),
    ).toBe("revoked");
  });
});

describe("api key token", () => {
  it("generates a prefixed high-entropy key", () => {
    const first = generateApiKey();
    const second = generateApiKey();
    expect(first.token.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(first.token).not.toBe(second.token);
    expect(first.token.length).toBeGreaterThan(40);
    expect(parseApiKey(first.token)?.prefix).toBe(first.prefix);
  });

  it("stores only a scrypt hash and verifies the secret", async () => {
    const generated = generateApiKey();
    const hash = await hashApiKeySecret(generated.secret);
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyApiKeySecret(generated.secret, hash)).toBe(true);
    expect(await verifyApiKeySecret(`${generated.secret}x`, hash)).toBe(false);
  });
});
