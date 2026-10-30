import { describe, expect, it } from "vitest";
import {
  conversationOnlyDefinition,
  ficheToDefinition,
} from "@/application/use-cases/chat/chatbot-config-runtime";
import {
  buildGuidedChatbotPrompt,
  type ChatbotConfig,
  type FicheDefinition,
  parseChatbotConfig,
} from "@/domain/entities/chatbot-config";

const FICHE: FicheDefinition = {
  key: "hotel",
  label: "Hôtel",
  description: "Hébergement",
  intent: "Le visiteur cherche un hôtel",
  fields: [{ name: "ville", label: "Ville", type: "text", required: true }],
  renderTemplate: "# Hôtel\n\n{{ville}}\n",
  instructions: "INSTRUCTION-FICHE",
};

const BASE_CONFIG: ChatbotConfig = {
  id: "cfg-1",
  organizationId: "org-1",
  chatLinkId: "link-1",
  version: 1,
  behaviorMode: "guided",
  systemPrompt: "ANCIEN SNAPSHOT",
  simple: {
    role: "assistant commercial",
    objective: "collecter le besoin",
    language: { mode: "auto" },
    tone: "professionnel",
    guardrails: ["Ne pas promettre de prix."],
    extraInstructions: "Toujours proposer un rendez-vous.",
  },
  fiches: [FICHE],
  dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
  createdBy: null,
  createdAt: new Date(0).toISOString(),
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    systemPrompt: "PROMPT FOURNI",
    simple: {
      role: "assistant",
      objective: "collecter",
      language: { mode: "auto" },
      tone: "",
      guardrails: [],
      extraInstructions: "",
    },
    fiches: [FICHE],
    ...overrides,
  };
}

describe("modes de comportement du chatbot", () => {
  it("utilise le mode guidé par défaut et génère le prompt depuis les réglages", () => {
    const parsed = parseChatbotConfig(payload());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.behaviorMode).toBe("guided");
    expect(parsed.value.systemPrompt).toBe(buildGuidedChatbotPrompt(parsed.value.simple));
    expect(parsed.value.systemPrompt).not.toBe("PROMPT FOURNI");
  });

  it("accepte une configuration sans fiche de collecte", () => {
    const parsed = parseChatbotConfig(payload({ fiches: [] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fiches).toEqual([]);
  });

  it("exige un prompt non vide en mode expert", () => {
    const parsed = parseChatbotConfig(payload({ behaviorMode: "expert", systemPrompt: "   " }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join(" ")).toContain("Prompt système obligatoire en mode expert");
  });

  it("construit une définition de présentation sans fiche de collecte", () => {
    const definition = conversationOnlyDefinition(BASE_CONFIG);
    expect(definition.fields).toEqual([]);
    expect(definition.renderTemplate).toBe("");
    expect(definition.systemPrompt).toContain("Tu es assistant commercial.");
  });

  it("en mode guidé, génère le prompt au runtime et ignore l'ancien snapshot", () => {
    const definition = ficheToDefinition(BASE_CONFIG, FICHE);
    expect(definition.systemPrompt).toContain("Tu es assistant commercial.");
    expect(definition.systemPrompt).toContain("Ton objectif :");
    expect(definition.systemPrompt).toContain("Ne pas promettre de prix.");
    expect(definition.systemPrompt).not.toContain("ANCIEN SNAPSHOT");
    expect(definition.systemPrompt).toContain("INSTRUCTION-FICHE");
  });

  it("en mode expert, n'ajoute pas les réglages simples au prompt final", () => {
    const definition = ficheToDefinition(
      { ...BASE_CONFIG, behaviorMode: "expert", systemPrompt: "PROMPT EXPERT" },
      FICHE,
    );
    expect(definition.systemPrompt).toContain("PROMPT EXPERT");
    expect(definition.systemPrompt).not.toContain("assistant commercial");
    expect(definition.systemPrompt).not.toContain("Ne pas promettre de prix.");
    expect(definition.systemPrompt).toContain("INSTRUCTION-FICHE");
  });

  it("normalise la sélection de données et refuse un mode inconnu", () => {
    const parsed = parseChatbotConfig(
      payload({
        dataSelection: { mode: "selected", connaissanceIds: ["a", "a", " b "], mediaIds: ["m"] },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.dataSelection).toEqual({
      mode: "selected",
      connaissanceIds: ["a", "b"],
      mediaIds: ["m"],
    });

    const invalid = parseChatbotConfig(payload({ dataSelection: { mode: "autre" } }));
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.errors.join(" ")).toContain("Mode de sélection invalide");
  });

  it("refuse un mode de comportement inconnu", () => {
    const parsed = parseChatbotConfig(payload({ behaviorMode: "autre" }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.join(" ")).toContain("Mode de comportement invalide");
  });
});
