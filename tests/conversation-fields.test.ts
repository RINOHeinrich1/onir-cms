import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConversationFicheInstanceRepository } from "@/application/ports/conversation-fiche-instance-repository";
import type { ConversationFieldRepository } from "@/application/ports/conversation-field-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import {
  type ConversationFieldsDependencies,
  getConversationFields,
  refreshConversationFields,
  updateConversationFields,
} from "@/application/use-cases/conversations/conversation-fields";

const ACTOR: Actor = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

const CONVERSATION_LAST_MESSAGE = "2026-10-28T09:01:00.000Z";

const DEFINITION = {
  key: "fiche-projet",
  label: "Fiche de prospection",
  description: "",
  systemPrompt: "x",
  renderTemplate: "{{nom}}",
  fields: [
    { name: "nom", label: "Nom", type: "text" as const, required: true },
    { name: "email", label: "Email", type: "email" as const, required: false },
    {
      name: "statut",
      label: "Statut",
      type: "select" as const,
      required: true,
      options: ["brouillon", "reprendre"],
    },
    {
      name: "reprise",
      label: "Reprise",
      type: "text" as const,
      required: false,
      requiredIf: { field: "statut", equals: "reprendre" },
    },
  ],
};

function baseDeps() {
  const upsertManual = vi.fn(async () => undefined);
  const fields = {
    list: vi.fn(async () => [
      {
        fieldName: "nom",
        value: "Alice",
        source: "manual" as const,
        updatedBy: "admin-1",
        updatedAt: "2026-10-28T09:00:00.000Z",
      },
      {
        fieldName: "statut",
        value: "reprendre",
        source: "ai" as const,
        updatedBy: null,
        updatedAt: "2026-10-28T09:00:00.000Z",
      },
    ]),
    getAnalysis: vi.fn(async () => ({
      lastAnalyzedMessageAt: "2026-10-28T08:59:00.000Z",
      lastAnalyzedAt: "2026-10-28T09:00:00.000Z",
      status: "ok" as const,
      error: null,
    })),
    upsertManual,
    upsertAi: vi.fn(async () => undefined),
    saveAnalysis: vi.fn(async () => undefined),
  };
  const conversation = {
    id: "c1",
    organizationId: "org-1",
    linkId: "link-1",
    lastMessageAt: CONVERSATION_LAST_MESSAGE,
  };
  const deps: ConversationFieldsDependencies = {
    conversations: {
      findById: vi.fn(async () => conversation),
      listMessages: vi.fn(async () => [
        {
          role: "user",
          content: "Mon projet est une refonte.",
          createdAt: "2026-10-28T09:00:00.000Z",
        },
      ]),
    } as unknown as ConversationRepository,
    operatorScopes: {} as ChatOperatorScopeRepository,
    links: {
      findById: vi.fn(async () => ({
        id: "link-1",
        templateKey: "fiche-projet",
        templateVersion: 1,
        aiProviderId: null,
        aiModel: null,
      })),
    } as unknown as ChatLinkRepository,
    templates: {
      findVersion: vi.fn(async () => ({ definition: DEFINITION })),
    } as unknown as ChatTemplateRepository,
    configs: {
      findById: vi.fn(async () => null),
    } as unknown as ChatbotConfigRepository,
    ficheInstances: {
      listByConversation: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      upsert: vi.fn(async () => {
        throw new Error("non utilisé");
      }),
      update: vi.fn(async () => null),
      activate: vi.fn(async () => null),
    } as unknown as ConversationFicheInstanceRepository,
    attachments: {
      listByConversation: vi.fn(async () => []),
    } as unknown as AttachmentRepository,
    fields: fields as unknown as ConversationFieldRepository,
    ai: {
      forTarget: vi.fn(async () => ({
        complete: vi.fn(async () =>
          JSON.stringify({ nom: "Bob", email: "bob@example.com", statut: "brouillon" }),
        ),
      })),
    } as unknown as AiClientFactory,
  };
  return { deps, fields };
}

describe("conversation fields", () => {
  it("calcule les obligatoires manquants et le caractère conditionnel", async () => {
    const base = baseDeps();
    const snapshot = await getConversationFields(base.deps, ACTOR, "c1");
    expect(snapshot.requiredTotal).toBe(3);
    expect(snapshot.requiredCollected).toBe(2);
    expect(snapshot.requiredMissing).toBe(1);
    expect(snapshot.fields.find((field) => field.name === "reprise")?.missing).toBe(true);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.canEdit).toBe(true);
  });

  it("fusionne une analyse IA sans écraser les champs manuels", async () => {
    const base = baseDeps();
    await refreshConversationFields(base.deps, ACTOR, "c1");
    expect(base.fields.upsertAi).toHaveBeenCalledWith(
      "org-1",
      "c1",
      expect.arrayContaining([
        expect.objectContaining({ fieldName: "email", value: "bob@example.com", source: "ai" }),
        expect.objectContaining({ fieldName: "statut", value: "brouillon", source: "ai" }),
      ]),
    );
    expect(base.fields.saveAnalysis).toHaveBeenCalledWith(
      "org-1",
      "c1",
      expect.objectContaining({ status: "ok", lastAnalyzedMessageAt: CONVERSATION_LAST_MESSAGE }),
    );
  });

  it("enregistre une modification manuelle et renvoie le nouvel état", async () => {
    const base = baseDeps();
    const snapshot = await updateConversationFields(base.deps, ACTOR, "c1", {
      nom: "Alice Martin",
    });
    expect(base.fields.upsertManual).toHaveBeenCalledWith("org-1", "c1", [
      {
        fieldName: "nom",
        value: "Alice Martin",
        source: "manual",
        updatedBy: "admin-1",
      },
    ]);
    expect(snapshot.fields.find((field) => field.name === "nom")?.source).toBe("manual");
  });
});

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
        templateKey: "",
        templateVersion: 0,
        currentConfigId: "cfg-1",
        aiProviderId: null,
        aiModel: null,
      })),
    } as unknown as ChatLinkRepository,
    templates: {
      findVersion: vi.fn(async () => {
        throw new Error("le mode legacy ne doit pas être requis");
      }),
    } as unknown as ChatTemplateRepository,
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
    expect(snapshot.templateKey).toBe("hotel");
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
