import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConversationFicheInstanceRepository } from "@/application/ports/conversation-fiche-instance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import {
  applyFicheDetection,
  detectFicheInstances,
} from "@/application/use-cases/chat/fiche-instances";
import { finishConversation } from "@/application/use-cases/chat/finish-conversation";
import type { ChatLink, Conversation } from "@/domain/entities/chat";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import type {
  ConversationFicheInstance,
  FicheInstanceStatus,
} from "@/domain/entities/conversation-fiche-instance";
import type { Fiche } from "@/domain/entities/fiche";

const CONFIG: ChatbotConfig = {
  id: "cfg-1",
  organizationId: "org-1",
  chatLinkId: "link-1",
  version: 1,
  systemPrompt: "Tu collectes les demandes.",
  simple: {
    role: "assistant",
    objective: "collecter",
    language: { mode: "auto" },
    tone: "",
    guardrails: [],
    extraInstructions: "",
  },
  fiches: [
    {
      key: "hotel",
      label: "Hôtel",
      description: "Recherche d'hébergement",
      intent: "Le visiteur cherche un hôtel",
      fields: [
        { name: "ville", label: "Ville", type: "text", required: true },
        { name: "contact", label: "Contact", type: "text", required: true },
      ],
      renderTemplate: "# Hôtel\n\nVille : {{ville}}\n\nContact : {{contact}}\n",
      instructions: "",
    },
  ],
  createdBy: null,
  createdAt: new Date(0).toISOString(),
};

const CAR_FICHE = {
  key: "voiture",
  label: "Voiture",
  description: "Location de voiture",
  intent: "Le visiteur cherche une voiture",
  fields: [
    { name: "modele", label: "Modèle", type: "text" as const, required: true },
    { name: "contact", label: "Contact", type: "text" as const, required: true },
  ],
  renderTemplate: "# Voiture\n\nModèle : {{modele}}\n\nContact : {{contact}}\n",
  instructions: "",
};

const MULTI_CONFIG: ChatbotConfig = { ...CONFIG, fiches: [...CONFIG.fiches, CAR_FICHE] };

const LINK: ChatLink = {
  id: "link-1",
  organizationId: "org-1",
  label: "Chatbot test",
  type: "standard",
  surface: "page",
  identificationMode: "contact",
  prospectId: null,
  createdBy: null,
  actif: true,
  expiresAt: null,
  templateKey: "",
  templateVersion: 0,
  currentConfigId: "cfg-1",
  sources: { connaissances: true, phototheque: true, lien: true },
  confidentialiteId: null,
  userStateEnabled: false,
  visualTemplateId: null,
  visualTemplateVersion: null,
  visualTemplateConfig: {},
  visualTemplateParams: {},
  widgetConfig: {},
  aiProviderId: null,
  aiModel: null,
  visitCount: 0,
  lastVisitAt: null,
  createdAt: new Date(0).toISOString(),
};

const CONVERSATION: Conversation = {
  id: "conv-1",
  organizationId: "org-1",
  linkId: "link-1",
  visitorNom: "Jean",
  visitorEmail: "jean@exemple.mg",
  visitorContacts: [],
  prospectId: "prospect-1",
  statut: "en_cours",
  lastMessageAt: null,
  consentementAt: null,
  confidentialiteId: null,
  channel: "page",
  interventionMode: "ai",
  assignedUserId: null,
  assignedOperatorName: null,
  lastOperatorUserId: null,
  lastOperatorName: null,
  humanTakeoverAt: null,
  lastVisitorMessageAt: null,
  lastOperatorMessageAt: null,
  configId: "cfg-1",
  createdAt: new Date(0).toISOString(),
};

const PROSPECT = {
  id: "prospect-1",
  organizationId: "org-1",
  nom: "Jean",
  prenom: "Rakoto",
  nature: "physique" as const,
  email: "jean@exemple.mg",
  activite: "",
  fonction: "",
  detail: "",
  origine: "libre" as const,
  lienId: null,
  lienLabel: null,
  contactMissing: false,
  createdBy: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function seededInstance(
  ficheKey: string,
  status: FicheInstanceStatus,
  data: Record<string, unknown>,
): ConversationFicheInstance {
  const now = new Date(0).toISOString();
  return {
    id: `inst-${ficheKey}`,
    organizationId: "org-1",
    conversationId: "conv-1",
    configId: "cfg-1",
    ficheKey,
    instanceKey: "default",
    status,
    data,
    missingFields: [],
    abandonReason: null,
    detectedAt: now,
    completedAt: status === "complete" ? now : null,
    updatedAt: now,
  };
}

function memoryInstances(seed: ConversationFicheInstance[]) {
  const items = new Map(seed.map((item) => [item.id, { ...item, data: { ...item.data } }]));
  let counter = 0;
  const repo: ConversationFicheInstanceRepository = {
    listByConversation: async () => [...items.values()].map((item) => ({ ...item })),
    findById: async (_org, id) => {
      const found = items.get(id);
      return found === undefined ? null : { ...found };
    },
    upsert: async (input) => {
      const existing = [...items.values()].find(
        (item) =>
          item.ficheKey === input.ficheKey && item.instanceKey === (input.instanceKey ?? "default"),
      );
      const id = existing?.id ?? `inst-new-${counter++}`;
      const item: ConversationFicheInstance = {
        id,
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        configId: input.configId,
        ficheKey: input.ficheKey,
        instanceKey: input.instanceKey ?? "default",
        status: input.status,
        data: { ...(existing?.data ?? {}), ...(input.data ?? {}) },
        missingFields: input.missingFields ?? [],
        abandonReason: input.abandonReason ?? null,
        detectedAt: existing?.detectedAt ?? new Date(0).toISOString(),
        completedAt: input.completed === true ? new Date(0).toISOString() : null,
        updatedAt: new Date(0).toISOString(),
      };
      items.set(id, item);
      return { ...item };
    },
    update: async (_org, id, patch) => {
      const existing = items.get(id);
      if (existing === undefined) return null;
      const updated: ConversationFicheInstance = {
        ...existing,
        ...(patch.status === undefined ? {} : { status: patch.status }),
        data: { ...existing.data, ...(patch.data ?? {}) },
        ...(patch.missingFields === undefined ? {} : { missingFields: patch.missingFields }),
        ...(patch.abandonReason === undefined ? {} : { abandonReason: patch.abandonReason }),
        completedAt:
          patch.completed === true
            ? new Date(0).toISOString()
            : patch.status !== undefined && patch.status !== "complete"
              ? null
              : existing.completedAt,
      };
      items.set(id, updated);
      return { ...updated };
    },
    activate: async (_org, _conversationId, instanceId) => {
      for (const [id, item] of items) {
        if (item.status === "active" && id !== instanceId) {
          items.set(id, { ...item, status: "paused" });
        }
      }
      const target = items.get(instanceId);
      if (target === undefined) return null;
      const active = { ...target, status: "active" as const };
      items.set(instanceId, active);
      return { ...active };
    },
  };
  return { repo, items };
}

function makeDeps(input: {
  config?: ChatbotConfig;
  instances?: ConversationFicheInstance[];
  aiAnswer?: string;
  maxFiches?: number | null;
}) {
  const config = input.config ?? CONFIG;
  const instances = memoryInstances(input.instances ?? []);
  const createdFiches: Fiche[] = [];
  let fichesGenerated = 0;
  let outcome: string | null = null;
  let finalisee = false;
  const prospects: ProspectRepository = {
    findById: async () => ({ ...PROSPECT }),
    findByEmail: async () => ({ ...PROSPECT }),
    list: async () => [],
    listLinkLabels: async () => [],
    create: vi.fn(async () => ({ ...PROSPECT })),
    update: async () => null,
    delete: async () => false,
  };
  const links: ChatLinkRepository = {
    findById: async () => ({ ...LINK }),
    findByTokenHash: async () => null,
    list: async () => [],
    recordVisit: async () => undefined,
    create: async () => ({ ...LINK }),
    getTokenEnc: async () => null,
    setLinkToken: async () => null,
    updateDetails: async () => null,
    delete: async () => false,
    reserveFiches: async (_org, _id, count) => {
      if (input.maxFiches !== undefined && input.maxFiches !== null) {
        if (fichesGenerated + count > input.maxFiches) return false;
      }
      fichesGenerated += count;
      return true;
    },
    releaseFiches: async (_org, _id, count) => {
      fichesGenerated = Math.max(0, fichesGenerated - count);
    },
  };
  const conversations: ConversationRepository = {
    findById: async () => ({ ...CONVERSATION }),
    findByIdPublic: async () => ({ ...CONVERSATION }),
    create: async () => ({ ...CONVERSATION }),
    appendOperatorMessage: async () => null,
    takeOverConversation: async () => null,
    releaseConversation: async () => null,
    listMessagesAfter: async () => [],
    appendMessage: async (_organizationId, _id, role, content) => ({
      id: "msg",
      conversationId: "conv-1",
      role,
      content,
      medias: [],
      mediasComputed: false,
      authorUserId: null,
      authorName: null,
      attachments: [],
      createdAt: new Date(0).toISOString(),
    }),
    findMessage: async () => null,
    setMessageMedias: async () => null,
    findOpenByLinkAndProspect: async () => null,
    listWithDetails: async () => [],
    countByStatut: async () => ({ enCours: 0, finalisees: 0 }),
    markFinalisee: async () => {
      finalisee = true;
    },
    setArchivee: async () => true,
    setConfig: async () => undefined,
    setOutcome: async (_org, _id, value) => {
      outcome = value;
    },
    listMessages: async () => [
      {
        id: "m1",
        conversationId: "conv-1",
        role: "user" as const,
        content: "Bonjour, je cherche un hôtel",
        medias: [],
        mediasComputed: false,
        authorUserId: null,
        authorName: null,
        attachments: [],
        createdAt: new Date(0).toISOString(),
      },
    ],
    listByLink: async () => [],
  };
  const fiches: FicheRepository = {
    findById: async () => null,
    listByConversation: async () => [],
    setArchivee: async () => null,
    list: async () => [],
    findByInstance: async (_org, instanceId) =>
      createdFiches.find((fiche) => fiche.conversationFicheInstanceId === instanceId) ?? null,
    create: async (organizationId, entry) => {
      const fiche: Fiche = {
        id: `fiche-${createdFiches.length + 1}`,
        organizationId,
        conversationId: entry.conversationId,
        prospectId: entry.prospectId,
        createdBy: entry.createdBy,
        templateKey: entry.templateKey,
        templateVersion: entry.templateVersion,
        data: entry.data,
        plateformes: [],
        description: "",
        budget: "",
        duree: "",
        contact: "",
        statut: null,
        contraintesTechno: "",
        lienDocSpec: "",
        archivee: false,
        configId: entry.configId ?? null,
        ficheKey: entry.ficheKey ?? null,
        ficheInstanceKey: entry.ficheInstanceKey ?? null,
        conversationFicheInstanceId: entry.conversationFicheInstanceId ?? null,
        createdAt: new Date("2026-01-02T00:00:00.000Z").toISOString(),
      };
      createdFiches.push(fiche);
      return fiche;
    },
  };
  const ai: AiClient = { complete: async () => input.aiAnswer ?? "{}" };
  return {
    deps: {
      organizations: {
        findById: async () => ({
          id: "org-1",
          name: "Onirtech",
          suspendedAt: null,
          createdBy: null,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        }),
      } as unknown as OrganizationRepository,
      links,
      conversations,
      prospects,
      fiches,
      templates: {} as unknown as ChatTemplateRepository,
      attachments: {
        listByConversation: async () => [],
        attachToFiche: async () => undefined,
      } as unknown as AttachmentRepository,
      ai: fixedAiClientFactory(ai),
      configs: {
        currentForLink: async () => config,
        findById: async () => config,
        listVersions: async () => [config],
        createVersion: async () => config,
      } as ChatbotConfigRepository,
      ficheInstances: instances.repo,
    },
    createdFiches,
    instances,
    getQuota: () => fichesGenerated,
    getOutcome: () => outcome,
    isFinalisee: () => finalisee,
  };
}

describe("finishConversation — mode configuration autonome", () => {
  it("mono-fiche : génère une fiche depuis l'instance active", async () => {
    const base = makeDeps({
      instances: [seededInstance("hotel", "active", { ville: "Antananarivo" })],
    });
    const result = await finishConversation(base.deps, "conv-1");
    expect(result.outcome).toBe("fiches_creees");
    expect(result.fiches).toHaveLength(1);
    expect(result.fiches[0]?.fiche.ficheKey).toBe("hotel");
    expect(result.fiches[0]?.markdown).toContain("Antananarivo");
    expect(result.fiches[0]?.markdown).toContain("Jean");
    expect(base.getQuota()).toBe(1);
    expect(base.getOutcome()).toBe("fiches_creees");
    expect(base.isFinalisee()).toBe(true);
  });

  it("multi-fiches hôtel + voiture : génère N fiches (N=2)", async () => {
    const base = makeDeps({
      config: MULTI_CONFIG,
      instances: [
        seededInstance("hotel", "complete", { ville: "Antananarivo" }),
        seededInstance("voiture", "complete", { modele: "SUV" }),
      ],
    });
    const result = await finishConversation(base.deps, "conv-1");
    expect(result.outcome).toBe("fiches_creees");
    expect(result.fiches).toHaveLength(2);
    expect(result.fiches.map((entry) => entry.fiche.ficheKey)).toEqual(["hotel", "voiture"]);
    expect(base.getQuota()).toBe(2);
  });

  it("refuse la clôture si une instance est encore active sans abandon explicite", async () => {
    const base = makeDeps({
      config: MULTI_CONFIG,
      instances: [
        seededInstance("hotel", "complete", { ville: "Antananarivo" }),
        seededInstance("voiture", "active", { modele: "SUV" }),
      ],
    });
    await expect(finishConversation(base.deps, "conv-1")).rejects.toThrow(/Abandonnez/i);
    expect(base.createdFiches).toHaveLength(0);
    expect(base.getQuota()).toBe(0);
  });

  it("accepte l'abandon explicite puis génère uniquement les fiches complètes", async () => {
    const base = makeDeps({
      config: MULTI_CONFIG,
      instances: [
        seededInstance("hotel", "complete", { ville: "Antananarivo" }),
        seededInstance("voiture", "active", { modele: "SUV" }),
      ],
    });
    const result = await finishConversation(base.deps, "conv-1", { abandonPending: true });
    expect(result.fiches).toHaveLength(1);
    expect(result.fiches[0]?.fiche.ficheKey).toBe("hotel");
    expect(base.instances.items.get("inst-voiture")?.status).toBe("abandoned");
  });

  it("enregistre l'outcome abandonnee quand toutes les instances sont abandonnées", async () => {
    const base = makeDeps({
      config: MULTI_CONFIG,
      instances: [seededInstance("voiture", "active", { modele: "SUV" })],
    });
    const result = await finishConversation(base.deps, "conv-1", { abandonPending: true });
    expect(result.fiches).toHaveLength(0);
    expect(result.outcome).toBe("abandonnee");
    expect(base.getOutcome()).toBe("abandonnee");
  });

  it("peut produire 0 fiche", async () => {
    const base = makeDeps({ config: MULTI_CONFIG, instances: [] });
    const result = await finishConversation(base.deps, "conv-1");
    expect(result.fiches).toHaveLength(0);
    expect(result.outcome).toBe("sans_fiche");
    expect(base.getQuota()).toBe(0);
    expect(base.isFinalisee()).toBe(true);
  });

  it("quota N : refuse N fiches si la limite est inférieure", async () => {
    const base = makeDeps({
      config: MULTI_CONFIG,
      instances: [
        seededInstance("hotel", "complete", { ville: "Antananarivo" }),
        seededInstance("voiture", "complete", { modele: "SUV" }),
      ],
      maxFiches: 1,
    });
    await expect(finishConversation(base.deps, "conv-1")).rejects.toThrow(/limite de fiches/i);
    expect(base.createdFiches).toHaveLength(0);
    expect(base.getQuota()).toBe(0);
  });

  it("quota N : réserve exactement N fiches", async () => {
    const base = makeDeps({
      config: MULTI_CONFIG,
      instances: [
        seededInstance("hotel", "complete", { ville: "Antananarivo" }),
        seededInstance("voiture", "complete", { modele: "SUV" }),
      ],
      maxFiches: 2,
    });
    const result = await finishConversation(base.deps, "conv-1");
    expect(result.fiches).toHaveLength(2);
    expect(base.getQuota()).toBe(2);
  });
});

describe("détection multi-fiches (hôtel + voiture)", () => {
  it("applique l'analyse IA structurée et garantit une seule active", async () => {
    const base = makeDeps({ config: MULTI_CONFIG });
    const ai: AiClient = {
      complete: async () =>
        JSON.stringify({
          instances: [
            {
              ficheKey: "hotel",
              status: "active",
              data: { ville: "Antananarivo" },
              missingFields: ["contact"],
            },
            {
              ficheKey: "voiture",
              status: "paused",
              data: { modele: "SUV" },
              missingFields: ["contact"],
            },
          ],
        }),
    };
    const detected = await detectFicheInstances({
      ai,
      config: MULTI_CONFIG,
      messages: [{ role: "user", content: "Je cherche un hôtel et une voiture" }],
    });
    expect(detected).not.toBeNull();
    const active = await applyFicheDetection({
      repo: base.instances.repo,
      config: MULTI_CONFIG,
      conversationId: "conv-1",
      organizationId: "org-1",
      detected: detected ?? [],
    });
    expect(active?.ficheKey).toBe("hotel");
    const items = [...base.instances.items.values()];
    expect(items.filter((item) => item.status === "active")).toHaveLength(1);
    expect(items.find((item) => item.ficheKey === "voiture")?.status).toBe("paused");
    expect(items.find((item) => item.ficheKey === "hotel")?.data.ville).toBe("Antananarivo");
  });

  it("retombe sur la fiche principale si l'analyse IA échoue", async () => {
    const detected = await detectFicheInstances({
      ai: { complete: async () => "pas du json" },
      config: MULTI_CONFIG,
      messages: [{ role: "user", content: "Bonjour" }],
    });
    expect(detected).toBeNull();
  });
});
