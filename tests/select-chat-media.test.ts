import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import { selectChatMedia } from "@/application/use-cases/medias/select-chat-media";
import type {
  ChatLink,
  ChatLinkSources,
  ChatMessage,
  ChatMessageMedia,
} from "@/domain/entities/chat";
import type { Media, TypeMedia } from "@/domain/entities/media";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
});

function link(sources: Partial<ChatLinkSources> = {}): ChatLink {
  return {
    id: "l1",
    organizationId: "org-1",
    label: "",
    type: "standard",
    prospectId: null,
    createdBy: null,
    actif: true,
    expiresAt: null,
    templateKey: "fiche-projet",
    templateVersion: 1,
    sources: { connaissances: true, phototheque: true, lien: true, ...sources },
    confidentialiteId: null,
    userStateEnabled: false,
    visualTemplateId: null,
    visualTemplateVersion: null,
    visualTemplateConfig: {},
    visualTemplateParams: {},
    aiProviderId: null,
    aiModel: null,
    visitCount: 0,
    lastVisitAt: null,
    createdAt: new Date(0).toISOString(),
  };
}

function media(id: string, type: TypeMedia, libelle: string): Media {
  return {
    id,
    organizationId: "org-1",
    type,
    libelle,
    description: "",
    templateKeys: [],
    actif: true,
    fichier: type === "photo" ? `${id}.png` : null,
    mime: type === "photo" ? "image/png" : null,
    url: type === "lien" ? `https://onirtech.com/${id}` : null,
    createdBy: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

const USER: ChatMessage = {
  id: "m1",
  conversationId: "c1",
  role: "user",
  content: "Montrez-moi des exemples de réalisations.",
  medias: [],
  mediasComputed: false,
  createdAt: new Date(0).toISOString(),
};

const assistant = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m2",
  conversationId: "c1",
  role: "assistant",
  content: "Voici deux exemples concrets.",
  medias: [],
  mediasComputed: false,
  createdAt: new Date(1).toISOString(),
  ...overrides,
});

function build(options: {
  message?: ChatMessage;
  linkSources?: Partial<ChatLinkSources>;
  photos?: Media[];
  liens?: Media[];
  aiAnswer?: string;
  aiThrows?: boolean;
}) {
  const message = options.message ?? assistant();
  const photos = options.photos ?? [media("p1", "photo", "Réalisation e-commerce")];
  const liens = options.liens ?? [media("d1", "lien", "Documentation technique")];
  const setMessageMedias = vi.fn(
    async (
      _organizationId: string,
      _id: string,
      medias: ChatMessageMedia[],
    ): Promise<ChatMessage> => assistant({ medias, mediasComputed: true }),
  );
  const listActivesByType = vi.fn(async (_organizationId: string, type: TypeMedia) =>
    type === "photo" ? photos : liens,
  );

  const links = {
    findById: async () => link(options.linkSources),
  } as unknown as ChatLinkRepository;
  const conversations = {
    findByIdPublic: async () => ({
      id: "c1",
      organizationId: "org-1",
      linkId: "l1",
      visitorNom: "",
      visitorEmail: "",
      visitorContacts: [],
      createdAt: new Date(0).toISOString(),
    }),
    findMessage: async (_organizationId: string, id: string) =>
      id === message.id ? message : null,
    listMessages: async () => [USER, message],
    setMessageMedias,
  } as unknown as ConversationRepository;
  const mediasRepo = { listActivesByType } as unknown as MediaRepository;
  const organizations = {
    findById: async () => ({
      id: "org-1",
      name: "Onirtech",
      suspendedAt: null,
      createdBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }),
  } as unknown as OrganizationRepository;
  const ai: AiClient = {
    complete: async () => {
      if (options.aiThrows) throw new Error("panne");
      return options.aiAnswer ?? JSON.stringify({ photos: ["Réalisation e-commerce"], liens: [] });
    },
  };
  return {
    deps: {
      organizations,
      links,
      conversations,
      medias: mediasRepo,
      ai: fixedAiClientFactory(ai),
    },
    setMessageMedias,
    listActivesByType,
  };
}

describe("selectChatMedia — mini-RAG médias asynchrone", () => {
  it("résout les libellés retenus et construit les URLs", async () => {
    const { deps } = build({
      aiAnswer: JSON.stringify({
        photos: ["Réalisation e-commerce"],
        liens: ["Documentation technique"],
      }),
    });
    const result = await selectChatMedia(deps, { conversationId: "c1", messageId: "m2" });
    expect(result.computed).toBe(true);
    expect(result.medias[0]).toMatchObject({
      id: "p1",
      type: "photo",
      libelle: "Réalisation e-commerce",
      mime: "image/png",
    });
    expect(result.medias[0]?.url).toMatch(/^\/api\/medias\/p1\/file\?t=/);
    expect(result.medias.slice(1)).toEqual([
      {
        id: "d1",
        type: "lien",
        libelle: "Documentation technique",
        url: "https://onirtech.com/d1",
        mime: null,
      },
    ]);
  });

  it("idempotent : renvoie le cache sans appel IA quand déjà calculé", async () => {
    const cached = [
      {
        id: "p1",
        type: "photo" as const,
        libelle: "X",
        url: "/api/medias/p1/file",
        mime: "image/png",
      },
    ];
    const { deps, setMessageMedias } = build({
      message: assistant({ medias: cached, mediasComputed: true }),
    });
    const result = await selectChatMedia(deps, { conversationId: "c1", messageId: "m2" });
    expect(result).toEqual({ computed: false, medias: cached });
    expect(setMessageMedias).not.toHaveBeenCalled();
  });

  it("respecte les sources du lien (photothèque décochée)", async () => {
    const { deps, listActivesByType } = build({ linkSources: { phototheque: false } });
    await selectChatMedia(deps, { conversationId: "c1", messageId: "m2" });
    expect(listActivesByType).toHaveBeenCalledTimes(1);
    expect(listActivesByType).toHaveBeenCalledWith("org-1", "lien", "fiche-projet");
  });

  it("échec silencieux : panne IA => aucun média, mais résultat mémorisé", async () => {
    const { deps, setMessageMedias } = build({ aiThrows: true });
    const result = await selectChatMedia(deps, { conversationId: "c1", messageId: "m2" });
    expect(result).toEqual({ computed: true, medias: [] });
    expect(setMessageMedias).toHaveBeenCalledWith("org-1", "m2", []);
  });

  it("aucun média actif => [] sans appel IA", async () => {
    const { deps, setMessageMedias } = build({ photos: [], liens: [] });
    const result = await selectChatMedia(deps, { conversationId: "c1", messageId: "m2" });
    expect(result).toEqual({ computed: true, medias: [] });
    expect(setMessageMedias).toHaveBeenCalledWith("org-1", "m2", []);
  });

  it("refuse un message qui n'appartient pas à la conversation", async () => {
    const { deps } = build({ message: assistant({ id: "autre" }) });
    await expect(selectChatMedia(deps, { conversationId: "c1", messageId: "m2" })).rejects.toThrow(
      /introuvable/i,
    );
  });
});
