import { describe, expect, it } from "vitest";
import { ficheToDefinition } from "@/application/use-cases/chat/chatbot-config-runtime";
import { type ChatbotConfig, parseChatbotConfig } from "@/domain/entities/chatbot-config";
import { defaultChatbotInformationSources } from "@/domain/entities/chatbot-information";

const FICHE = {
  key: "principale",
  label: "Fiche principale",
  description: "",
  intent: "",
  fields: [{ name: "nom", label: "Nom", type: "text" as const, required: true }],
  renderTemplate: "# Fiche",
  instructions: "",
};

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    mission: "collect",
    informationSources: defaultChatbotInformationSources(),
    behaviorMode: "guided",
    systemPrompt: "",
    simple: {
      role: "assistant",
      objective: "collecter",
      language: { mode: "auto" },
      tone: "",
      guardrails: [],
      extraInstructions: "",
    },
    fiches: [FICHE],
    dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
    fallback: { enabled: false, intro: "", questions: [], showCollectionForm: true },
    searchTool: { enabled: false },
    ...overrides,
  };
}

function parse(overrides: Record<string, unknown> = {}): ChatbotConfig {
  const result = parseChatbotConfig(baseInput(overrides));
  if (!result.ok) throw new Error(result.errors.join(" ; "));
  return {
    ...result.value,
    collectionMode: result.value.collectionMode,
    id: "cfg",
    organizationId: "org",
    chatLinkId: "link",
    version: 1,
    createdBy: null,
    createdAt: new Date(0).toISOString(),
  } as ChatbotConfig;
}

describe("stratégie de collecte semi-heuristique", () => {
  it("reste en collecte IA par défaut", () => {
    expect(parse().collectionMode).toBe("ai");
  });

  it("accepte la collecte semi-heuristique pour collect/hybrid avec fiche", () => {
    expect(parse({ collectionMode: "semi_heuristic" }).collectionMode).toBe("semi_heuristic");
  });

  it("refuse la collecte semi-heuristique pour inform ou sans fiche", () => {
    expect(
      parseChatbotConfig(baseInput({ mission: "inform", collectionMode: "semi_heuristic" })).ok,
    ).toBe(false);
    expect(parseChatbotConfig(baseInput({ fiches: [], collectionMode: "semi_heuristic" })).ok).toBe(
      false,
    );
  });

  it("ajoute le bloc semi-heuristique au prompt effectif", () => {
    const config = parse({ collectionMode: "semi_heuristic" });
    const fiche = config.fiches[0];
    if (fiche === undefined) throw new Error("fiche absente");
    const definition = ficheToDefinition(config, fiche);
    expect(definition.systemPrompt).toContain("Mode de collecte semi-heuristique");
    expect(definition.systemPrompt).toContain("Remplir le formulaire");
  });

  it("ne modifie pas le prompt effectif en collecte IA", () => {
    const config = parse();
    const fiche = config.fiches[0];
    if (fiche === undefined) throw new Error("fiche absente");
    const definition = ficheToDefinition(config, fiche);
    expect(definition.systemPrompt).not.toContain("Mode de collecte semi-heuristique");
  });
});
