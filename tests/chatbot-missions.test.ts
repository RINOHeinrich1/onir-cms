import { describe, expect, it } from "vitest";
import { parseChatbotConfig } from "@/domain/entities/chatbot-config";
import {
  type ChatbotInformationSources,
  defaultChatbotInformationSources,
} from "@/domain/entities/chatbot-information";

const FICHE = {
  key: "hotel",
  label: "Hôtel",
  description: "",
  intent: "",
  instructions: "",
  renderTemplate: "# Hôtel\n",
  fields: [{ name: "nom", label: "Nom", type: "text", required: true }],
};

const SIMPLE = {
  role: "assistant",
  objective: "aider",
  language: { mode: "auto" },
  tone: "",
  guardrails: [],
  extraInstructions: "",
};

function sources(patch: Partial<ChatbotInformationSources> = {}): ChatbotInformationSources {
  return { ...defaultChatbotInformationSources(), ...patch };
}

function input(
  mission: "collect" | "inform" | "hybrid",
  informationSources: ChatbotInformationSources,
  fiches = [FICHE],
) {
  return {
    mission,
    informationSources,
    behaviorMode: "guided",
    systemPrompt: "",
    simple: SIMPLE,
    fiches,
    dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
    searchTool: {
      enabled: false,
      ficheTypes: [],
      statusMode: "hidden_fixed",
      fixedStatusKeys: [],
      sortMode: "fair_rotation",
    },
  };
}

describe("missions chatbot — validation", () => {
  it("accepte collect avec une fiche et aucune source", () => {
    const parsed = parseChatbotConfig(input("collect", sources()));
    expect(parsed.ok).toBe(true);
  });

  it("refuse collect avec une source active", () => {
    const s = sources();
    s.connaissances.enabled = true;
    const parsed = parseChatbotConfig(input("collect", s));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(" ")).toContain("aucune source");
  });

  it("refuse inform avec une fiche de collecte", () => {
    const s = sources();
    s.connaissances.enabled = true;
    const parsed = parseChatbotConfig(input("inform", s));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(" ")).toContain("aucune fiche");
  });

  it("accepte inform avec une source connaissances", () => {
    const s = sources();
    s.connaissances.enabled = true;
    const parsed = parseChatbotConfig(input("inform", s, []));
    expect(parsed.ok).toBe(true);
  });

  it("refuse hybrid sans source", () => {
    const parsed = parseChatbotConfig(input("hybrid", sources()));
    expect(parsed.ok).toBe(false);
  });

  it("refuse une source A sans ficheTypes", () => {
    const s = sources();
    s.fiches.enabled = true;
    const parsed = parseChatbotConfig(input("hybrid", s));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(" ")).toContain("au moins une fiche");
  });

  it("accepte hybrid avec collecte et source B", () => {
    const s = sources();
    s.connaissances.enabled = true;
    const parsed = parseChatbotConfig(input("hybrid", s));
    expect(parsed.ok).toBe(true);
  });

  it("conserve le chemin legacy sans mission", () => {
    const parsed = parseChatbotConfig({
      behaviorMode: "guided",
      systemPrompt: "",
      simple: SIMPLE,
      fiches: [FICHE],
      dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.mission).toBeUndefined();
      expect(parsed.value.informationSources).toBeUndefined();
    }
  });
});
