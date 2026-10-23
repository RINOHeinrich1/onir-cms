import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  conversationFindById: vi.fn(),
  listMessages: vi.fn(),
  linkFindById: vi.fn(),
}));

vi.mock("@/infrastructure/db/pool", () => ({
  getPool: () => ({}),
}));

vi.mock("@/infrastructure/db/conversation-repository", () => ({
  pgConversationRepository: () => ({
    findById: mocks.conversationFindById,
    findByIdPublic: mocks.conversationFindById,
    listMessages: mocks.listMessages,
  }),
}));

vi.mock("@/infrastructure/db/organization-repository", () => ({
  pgOrganizationRepository: () => ({
    findById: async (id: string) => ({
      id,
      name: "Onirtech",
      suspendedAt: null,
      createdBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }),
  }),
}));

vi.mock("@/infrastructure/db/chat-link-repository", () => ({
  pgChatLinkRepository: () => ({
    findById: mocks.linkFindById,
  }),
}));

vi.mock("@/infrastructure/ai/ai-client-factory", () => ({
  pgAiClientFactory: () => ({
    resolve: async () => ({
      providerId: null,
      providerLabel: "test",
      model: "test",
      source: "legacy",
    }),
    forTarget: async () => ({ complete: mocks.complete }),
    optionalTarget: async () => ({ complete: mocks.complete }),
  }),
}));

import { POST } from "@/app/api/chat/state/route";

let ip = 0;
function post(body: unknown): Promise<Response> {
  ip += 1;
  return POST(
    new Request("http://localhost/api/chat/state", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${ip}` },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mocks.complete.mockReset();
  mocks.conversationFindById.mockReset();
  mocks.listMessages.mockReset();
  mocks.linkFindById.mockReset();
});

describe("POST /api/chat/state", () => {
  it("rejette un corps invalide (400)", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat/state", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.1" },
        body: "not json",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rejette un message vide (400)", async () => {
    const response = await post({ content: "   " });
    expect(response.status).toBe(400);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("détecte l'état sans conversation (contenu seul)", async () => {
    mocks.complete.mockResolvedValue('{"state":"content","confidence":0.9}');
    const response = await post({ content: "Merci !" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: "content", confidence: 0.9 });
    expect(mocks.conversationFindById).not.toHaveBeenCalled();
  });

  it("renvoie 404 si la conversation est introuvable", async () => {
    mocks.conversationFindById.mockResolvedValue(null);
    const response = await post({ conversationId: "missing", content: "Bonjour" });
    expect(response.status).toBe(404);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("renvoie 404 si le lien est révoqué", async () => {
    mocks.conversationFindById.mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      linkId: "l1",
    });
    mocks.linkFindById.mockResolvedValue({ id: "l1", actif: false });
    const response = await post({ conversationId: "c1", content: "Bonjour" });
    expect(response.status).toBe(404);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("enrichit la détection de l'historique du lien actif", async () => {
    mocks.conversationFindById.mockResolvedValue({
      id: "c1",
      organizationId: "org-1",
      linkId: "l1",
    });
    mocks.linkFindById.mockResolvedValue({ id: "l1", actif: true });
    mocks.listMessages.mockResolvedValue([
      { role: "user", content: "Bonjour" },
      { role: "assistant", content: "Bonjour, comment puis-je aider ?" },
    ]);
    mocks.complete.mockResolvedValue('{"state":"triste","confidence":0.6}');
    const response = await post({ conversationId: "c1", content: "Toujours pas de réponse…" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: "triste", confidence: 0.6 });
    const call = mocks.complete.mock.calls[0]?.[0] as { messages: unknown[] };
    expect(call.messages).toHaveLength(3);
  });

  it("fail-open : renvoie neutral si l'IA échoue (200)", async () => {
    mocks.complete.mockRejectedValue(new Error("down"));
    const response = await post({ content: "Bonjour" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: "neutral", confidence: 0 });
  });
});
