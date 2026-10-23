import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptLinkToken, encryptLinkToken } from "@/lib/link-crypto";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("LINK_TOKEN_KEY", KEY_A);
});

describe("link-crypto — jetons stables chiffrés", () => {
  it("chiffre puis déchiffre à l'identique", () => {
    const token = "token-partage-123";
    const enc = encryptLinkToken(token);
    expect(enc).not.toContain(token);
    expect(decryptLinkToken(enc)).toBe(token);
  });

  it("chiffre deux fois différemment (IV aléatoire)", () => {
    expect(encryptLinkToken("x")).not.toBe(encryptLinkToken("x"));
  });

  it("refuse un chiffré altéré", () => {
    const enc = encryptLinkToken("x");
    expect(() => decryptLinkToken(`${enc}00`)).toThrow(/illisible/);
    expect(() => decryptLinkToken("nimporte-quoi")).toThrow(/illisible/);
  });

  it("refuse avec une autre clé", () => {
    const enc = encryptLinkToken("x");
    vi.stubEnv("LINK_TOKEN_KEY", KEY_B);
    expect(() => decryptLinkToken(enc)).toThrow(/illisible/);
  });

  it("refuse une clé mal formée", () => {
    vi.stubEnv("LINK_TOKEN_KEY", "trop-court");
    expect(() => encryptLinkToken("x")).toThrow(/LINK_TOKEN_KEY/);
  });
});
