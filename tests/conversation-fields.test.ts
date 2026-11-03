import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConversationFicheInstanceRepository } from "@/application/ports/conversation-fiche-instance-repository";
import type { ConversationFieldRepository } from "@/application/ports/conversation-field-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import {
  type ConversationFieldsDependencies,
  getConversationFields,
  updateConversationFields,
} from "@/application/use-cases/conversations/conversation-fields";

const ACTOR: Actor = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

const CONVERSATION_LAST_MESSAGE = "2026-10-28T09:01:00.000Z";

const MULTI_CONFIG = {
  id: "cfg-1",
  organizationId: "org-1",
  chatLinkId: "link-1",
  version: 3,
  systemPrompt: "Collecte.",
  simple: {
    role: "assistant",
    objective: "",
    language: { mode: "auto" as const },
    tone: "",
    guardrails: [],
    extraInstructions: "",
  },
  fiches: [
    {
      key: "hotel",
      label: "Hôtel",
      description: "",
      intent: "",
      fields: [
        { name: "ville", label: "Ville", type: "text" as const, required: true },
        { name: "contact", label: "Contact", type: "text" as const, required: true },
      ],
      renderTemplate: "# Hôtel {{ville}} {{contact}}",
      instructions: "",
    },
    {
      key: "voiture",
      label: "Voiture",
      description: "",
      intent: "",
      fields: [{ name: "modele", label: "Modèle", type: "text" as const, required: true }],
      renderTemplate: "# Voiture {{modele}}",
      instructions: "",
    },
  ],
  createdBy: null,
  createdAt: "2026-10-28T08:00:00.000Z",
};

function configDeps() {
  const hotel = {
    id: "inst-hotel",
    organizationId: "org-1",
    conversationId: "c1",
    configId: "cfg-1",
    ficheKey: "hotel",
    instanceKey: "default",
    status: "active" as const,
    data: { ville: "Paris" },
    missingFields: ["contact"],
    abandonReason: null,
    detectedAt: "2026-10-28T08:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-10-28T08:00:00.000Z",
  };
  const voiture = {
    ...hotel,
    id: "inst-voiture",
    ficheKey: "voiture",
    status: "detected" as const,
    data: {},
    missingFields: ["modele"],
  };
  const instances = [hotel, voiture];
  const update = vi.fn(
    async (
      _org: string,
      id: string,
      patch: { data?: Record<string, unknown>; missingFields?: string[] },
    ) => {
      const instance = instances.find((entry) => entry.id === id);
      if (instance === undefined) return null;
      instance.data = { ...instance.data, ...(patch.data ?? {}) };
      if (patch.missingFields !== undefined) instance.missingFields = patch.missingFields;
      return instance;
    },
  );
  const deps: ConversationFieldsDependencies = {
    conversations: {
      findById: vi.fn(async () => ({
        id: "c1",
        organizationId: "org-1",
        linkId: "link-1",
        lastMessageAt: CONVERSATION_LAST_MESSAGE,
      })),
      listMessages: vi.fn(async () => []),
    } as unknown as ConversationRepository,
    operatorScopes: {} as ChatOperatorScopeRepository,
    links: {
      findById: vi.fn(async () => ({
        id: "link-1",
        currentConfigId: "cfg-1",
        aiProviderId: null,
        aiModel: null,
      })),
    } as unknown as ChatLinkRepository,
    configs: {
      findById: vi.fn(async () => MULTI_CONFIG),
    } as unknown as ChatbotConfigRepository,
    ficheInstances: {
      listByConversation: vi.fn(async () => instances),
      findById: vi.fn(async () => null),
      upsert: vi.fn(async () => {
        throw new Error("aucune instance ne doit être créée");
      }),
      update,
      activate: vi.fn(async () => null),
    } as unknown as ConversationFicheInstanceRepository,
    attachments: {
      listByConversation: vi.fn(async () => []),
    } as unknown as AttachmentRepository,
    fields: {
      list: vi.fn(async () => []),
      getAnalysis: vi.fn(async () => null),
      upsertManual: vi.fn(async () => undefined),
      upsertAi: vi.fn(async () => undefined),
      saveAnalysis: vi.fn(async () => undefined),
    } as unknown as ConversationFieldRepository,
    ai: {} as AiClientFactory,
  };
  return { deps, update };
}

describe("conversation fields — configuration multi-fiches", () => {
  it("ne renvoie jamais 404 « modèle introuvable » pour une conversation config-only", async () => {
    const { deps } = configDeps();
    const snapshot = await getConversationFields(deps, ACTOR, "c1");
    expect(snapshot.configId).toBe("cfg-1");
    expect(snapshot.fiches).toHaveLength(2);
    expect(snapshot.fiches?.map((fiche) => fiche.ficheKey)).toEqual(["hotel", "voiture"]);
    expect(snapshot.ficheKey).toBe("hotel");
  });

  it("expose chaque instance avec ses champs et compteurs, sans mélange", async () => {
    const { deps } = configDeps();
    const snapshot = await getConversationFields(deps, ACTOR, "c1");
    const hotel = snapshot.fiches?.find((fiche) => fiche.ficheKey === "hotel");
    const voiture = snapshot.fiches?.find((fiche) => fiche.ficheKey === "voiture");
    expect(hotel).toMatchObject({
      instanceId: "inst-hotel",
      status: "active",
      requiredTotal: 2,
      requiredCollected: 1,
      requiredMissing: 1,
    });
    expect(hotel?.fields.find((field) => field.name === "ville")?.value).toBe("Paris");
    expect(voiture).toMatchObject({
      instanceId: "inst-voiture",
      status: "detected",
      requiredMissing: 1,
    });
    expect(voiture?.fields.find((field) => field.name === "modele")?.missing).toBe(true);
  });

  it("écrit dans l'instance ciblée par ficheInstanceId", async () => {
    const { deps, update } = configDeps();
    const snapshot = await updateConversationFields(deps, ACTOR, "c1", {
      values: { modele: "Berline" },
      ficheInstanceId: "inst-voiture",
    });
    expect(update).toHaveBeenCalledWith(
      "org-1",
      "inst-voiture",
      expect.objectContaining({ data: { modele: "Berline" }, missingFields: [] }),
    );
    const hotel = snapshot.fiches?.find((fiche) => fiche.ficheKey === "hotel");
    const voiture = snapshot.fiches?.find((fiche) => fiche.ficheKey === "voiture");
    expect(hotel?.fields.find((field) => field.name === "ville")?.value).toBe("Paris");
    expect(voiture?.fields.find((field) => field.name === "modele")?.value).toBe("Berline");
  });

  it("ignore un champ d'une autre fiche", async () => {
    const { deps, update } = configDeps();
    await updateConversationFields(deps, ACTOR, "c1", {
      values: { contact: "Alice", modele: "Citadine" },
      ficheInstanceId: "inst-voiture",
    });
    expect(update).toHaveBeenCalledWith(
      "org-1",
      "inst-voiture",
      expect.objectContaining({ data: { modele: "Citadine" } }),
    );
  });
});
