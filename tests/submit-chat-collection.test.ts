import { describe, expect, it, vi } from "vitest";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConversationFicheInstanceRepository } from "@/application/ports/conversation-fiche-instance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import { submitChatCollection } from "@/application/use-cases/chat/submit-chat-collection";
import type { ChatLink, Conversation } from "@/domain/entities/chat";
import type { ChatbotConfig, FicheDefinition } from "@/domain/entities/chatbot-config";
import type { ConversationFicheInstance } from "@/domain/entities/conversation-fiche-instance";

const FICHE_A: FicheDefinition = {
  key: "hotel",
  label: "Hôtel",
  description: "",
  intent: "",
  fields: [{ name: "ville", label: "Ville", type: "text", required: true }],
  renderTemplate: "# Hôtel",
  instructions: "",
};
const FICHE_B: FicheDefinition = {
  key: "voiture",
  label: "Voiture",
  description: "",
  intent: "",
  fields: [{ name: "modele", label: "Modèle", type: "text", required: true }],
  renderTemplate: "# Voiture",
  instructions: "",
};

const CONFIG: ChatbotConfig = {
  id: "cfg",
  organizationId: "org",
  chatLinkId: "link",
  version: 1,
  mission: "collect",
  behaviorMode: "guided",
  collectionMode: "semi_heuristic",
  systemPrompt: "",
  simple: {
    role: "assistant",
    objective: "",
    language: { mode: "auto" },
    tone: "",
    guardrails: [],
    extraInstructions: "",
  },
  fiches: [FICHE_A, FICHE_B],
  dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
  createdBy: null,
  createdAt: new Date(0).toISOString(),
};

const CONVERSATION: Conversation = {
  id: "conv",
  organizationId: "org",
  linkId: "link",
  statut: "en_cours",
} as Conversation;

function instance(overrides: Partial<ConversationFicheInstance>): ConversationFicheInstance {
  return {
    id: "i1",
    organizationId: "org",
    conversationId: "conv",
    configId: "cfg",
    ficheKey: "hotel",
    instanceKey: "default",
    status: "active",
    data: {},
    missingFields: ["ville"],
    abandonReason: null,
    detectedAt: new Date(0).toISOString(),
    completedAt: null,
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function deps(instances: ConversationFicheInstance[]) {
  const update = vi.fn(
    async (_org: string, id: string, patch: { data?: Record<string, unknown> }) => {
      const current = instances.find((entry) => entry.id === id);
      return current === undefined
        ? null
        : Object.assign(current, patch, {
            missingFields: patch.data !== undefined && "ville" in patch.data ? [] : ["ville"],
          });
    },
  );
  const activate = vi.fn(async () => instances.find((entry) => entry.status === "active") ?? null);
  const repository: ConversationFicheInstanceRepository = {
    listByConversation: async () => instances,
    findById: async (_org, id) => instances.find((entry) => entry.id === id) ?? null,
    upsert: async (input) => {
      const created = instance({ id: `i-${input.ficheKey}`, ficheKey: input.ficheKey, data: {} });
      instances.push(created);
      return created;
    },
    update,
    activate,
  };
  return {
    update,
    activate,
    dependencies: {
      conversations: {
        findByIdPublic: async () => CONVERSATION,
      } as unknown as ConversationRepository,
      links: {
        findById: async () => ({ id: "link", actif: true, currentConfigId: "cfg" }) as ChatLink,
      } as unknown as ChatLinkRepository,
      configs: { findById: async () => CONFIG } as unknown as ChatbotConfigRepository,
      ficheInstances: repository,
      attachments: { listByConversation: async () => [] } as unknown as AttachmentRepository,
    },
  };
}

describe("submitChatCollection", () => {
  it("écrit les valeurs dans l'instance active et recalcule les champs manquants", async () => {
    const active = instance({});
    const { dependencies, update, activate } = deps([active]);
    const result = await submitChatCollection(dependencies, {
      organizationId: "org",
      conversationId: "conv",
      values: { ville: "Antananarivo" },
    });
    expect(update).toHaveBeenCalledWith(
      "org",
      "i1",
      expect.objectContaining({
        data: { ville: "Antananarivo" },
      }),
    );
    expect(activate).not.toHaveBeenCalled();
    expect(result.ficheKey).toBe("hotel");
  });

  it("cible une fiche multi-fiches et l'active", async () => {
    const active = instance({});
    const { dependencies, update, activate } = deps([active]);
    const result = await submitChatCollection(dependencies, {
      organizationId: "org",
      conversationId: "conv",
      ficheKey: "voiture",
      values: { modele: "Clio" },
    });
    expect(result.ficheKey).toBe("voiture");
    expect(update).toHaveBeenCalledWith(
      "org",
      "i-voiture",
      expect.objectContaining({ data: { modele: "Clio" } }),
    );
    expect(activate).toHaveBeenCalled();
  });

  it("refuse une instance inconnue", async () => {
    const { dependencies } = deps([instance({})]);
    await expect(
      submitChatCollection(dependencies, {
        organizationId: "org",
        conversationId: "conv",
        ficheInstanceId: "inconnue",
        values: { ville: "X" },
      }),
    ).rejects.toThrow("Instance de fiche introuvable");
  });
});
