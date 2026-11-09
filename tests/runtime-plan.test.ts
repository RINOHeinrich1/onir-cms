import { describe, expect, it } from "vitest";
import { buildMissionRuntimePlan } from "@/application/use-cases/chat/runtime-plan";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import {
  type ChatbotInformationSources,
  defaultChatbotInformationSources,
} from "@/domain/entities/chatbot-information";

function config(
  mission: "collect" | "inform" | "hybrid",
  sources: ChatbotInformationSources,
): ChatbotConfig {
  return {
    id: "c",
    organizationId: "o",
    chatLinkId: "l",
    version: 1,
    mission,
    informationSources: sources,
    behaviorMode: "guided",
    collectionMode: "ai",
    systemPrompt: "",
    simple: {
      role: "a",
      objective: "",
      language: { mode: "auto" },
      tone: "",
      guardrails: [],
      extraInstructions: "",
    },
    fiches: [],
    dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
    searchTool: {
      enabled: false,
      ficheTypes: [],
      statusMode: "hidden_fixed",
      fixedStatusKeys: [],
      sortMode: "fair_rotation",
    },
    createdBy: null,
    createdAt: new Date(0).toISOString(),
  };
}

function sources(patch: Partial<ChatbotInformationSources> = {}): ChatbotInformationSources {
  return { ...defaultChatbotInformationSources(), ...patch };
}

describe("plan runtime — spécialisation", () => {
  it("collect ne planifie ni analyseur ni source", () => {
    expect(buildMissionRuntimePlan(config("collect", sources()))).toEqual({ kind: "collect" });
  });

  it("inform mono-source court-circuite l'analyseur", () => {
    const s = sources();
    s.connaissances.enabled = true;
    const plan = buildMissionRuntimePlan(config("inform", s));
    expect(plan).toMatchObject({
      kind: "inform",
      analyzer: false,
      directSource: "connaissances",
    });
  });

  it("inform multi-source active l'analyseur", () => {
    const s = sources();
    s.connaissances.enabled = true;
    s.medias.enabled = true;
    const plan = buildMissionRuntimePlan(config("inform", s));
    expect(plan).toMatchObject({ kind: "inform", analyzer: true, directSource: null });
  });

  it("hybrid analyse toujours l'intention", () => {
    const s = sources();
    s.connaissances.enabled = true;
    expect(buildMissionRuntimePlan(config("hybrid", s))).toEqual({
      kind: "hybrid",
      sources: ["connaissances"],
    });
  });
});
