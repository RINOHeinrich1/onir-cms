import { describe, expect, it } from "vitest";
import {
  aiCapabilitiesFor,
  parseReasoningMode,
  supportsStructuredExtraction,
} from "@/domain/ai-capabilities";

describe("aiCapabilitiesFor", () => {
  it("Infomaniak expose le contrôle du raisonnement", () => {
    expect(aiCapabilitiesFor("infomaniak", "google/gemma-4-31B-it")).toMatchObject({
      reasoningControl: "infomaniak_chat_template",
      supportsReasoningToggle: true,
    });
  });

  it("OpenAI n'expose le raisonnement que sur les modèles reasoning", () => {
    expect(aiCapabilitiesFor("openai", "gpt-4o-mini").supportsReasoningToggle).toBe(false);
    expect(aiCapabilitiesFor("openai", "o3-mini").supportsReasoningToggle).toBe(true);
  });

  it("un fournisseur sans contrôle est marqué none", () => {
    expect(aiCapabilitiesFor("custom", "mon-modele").reasoningControl).toBe("none");
  });
});

describe("supportsStructuredExtraction", () => {
  it("reconnaît les familles utilisables en extraction", () => {
    expect(supportsStructuredExtraction("infomaniak", "google/gemma-4-31B-it")).toBe(true);
    expect(supportsStructuredExtraction("openai", "gpt-4o-mini")).toBe(true);
    expect(supportsStructuredExtraction("custom", "inconnu")).toBe(false);
  });
});

describe("parseReasoningMode", () => {
  it("accepte les trois modes et rejette le reste", () => {
    expect(parseReasoningMode("auto")).toBe("auto");
    expect(parseReasoningMode("disabled")).toBe("disabled");
    expect(parseReasoningMode("autre")).toBeNull();
  });
});
