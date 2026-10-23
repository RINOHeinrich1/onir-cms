import { describe, expect, it } from "vitest";
import {
  apiKeyHint,
  infomaniakBaseUrl,
  normalizeAiModel,
  parseAiDialect,
  parseAiProviderPreset,
  presetBaseUrl,
  presetDialect,
} from "@/domain/entities/ai-provider";

describe("ai-provider — presets et normalisation", () => {
  it("expose les presets supportés", () => {
    expect(parseAiProviderPreset("infomaniak")).toBe("infomaniak");
    expect(parseAiProviderPreset("openrouter")).toBe("openrouter");
    expect(parseAiProviderPreset("inconnu")).toBeNull();
  });

  it("construit l'URL Infomaniak avec le product id", () => {
    expect(presetBaseUrl("infomaniak", "12345")).toBe(infomaniakBaseUrl("12345"));
    expect(infomaniakBaseUrl("12345")).toContain("/2/ai/12345/openai/v1");
  });

  it("propose les URL des presets standards", () => {
    expect(presetBaseUrl("openai")).toBe("https://api.openai.com/v1");
    expect(presetBaseUrl("openrouter")).toBe("https://openrouter.ai/api/v1");
  });

  it("attribue le dialecte Infomaniak uniquement à Infomaniak", () => {
    expect(presetDialect("infomaniak")).toBe("infomaniak");
    expect(presetDialect("openai")).toBe("openai");
    expect(parseAiDialect("openai")).toBe("openai");
    expect(parseAiDialect("autre")).toBeNull();
  });

  it("masque la clé API", () => {
    expect(apiKeyHint("sk-proj-1234567890")).toBe("••••7890");
    expect(apiKeyHint("abc")).toBe("••••");
  });

  it("normalise un identifiant de modèle", () => {
    expect(normalizeAiModel("  model/x  ")).toBe("model/x");
    expect(normalizeAiModel("   ")).toBeNull();
  });
});
