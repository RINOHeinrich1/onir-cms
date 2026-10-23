import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openAiKey, sealAiKey } from "@/lib/ai-crypto";

const ORIGINAL = process.env.AI_PROVIDER_KEY;

beforeEach(() => {
  process.env.AI_PROVIDER_KEY = "a".repeat(64);
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AI_PROVIDER_KEY;
  else process.env.AI_PROVIDER_KEY = ORIGINAL;
});

describe("ai-crypto — clés fournisseurs", () => {
  it("chiffre et déchiffre une clé sans la stocker en clair", () => {
    const sealed = sealAiKey("sk-proj-1234567890");
    expect(sealed.ciphertext).not.toContain("sk-proj");
    expect(sealed.hint).toBe("••••7890");
    expect(openAiKey(sealed)).toBe("sk-proj-1234567890");
  });

  it("produit un IV différent à chaque chiffrement", () => {
    expect(sealAiKey("sk-test-1234").iv).not.toBe(sealAiKey("sk-test-1234").iv);
  });

  it("échoue si la clé maîtresse change", () => {
    const sealed = sealAiKey("sk-test-1234");
    process.env.AI_PROVIDER_KEY = "b".repeat(64);
    expect(() => openAiKey(sealed)).toThrow();
  });

  it("échoue si le chiffré est altéré", () => {
    const sealed = sealAiKey("sk-test-1234");
    expect(() => openAiKey({ ...sealed, tag: "AAAA" })).toThrow();
  });

  it("refuse une clé vide", () => {
    expect(() => sealAiKey("   ")).toThrow();
  });
});
