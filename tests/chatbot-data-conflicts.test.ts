import { afterEach, describe, expect, it, vi } from "vitest";
import { submitChatbotDataDraft } from "@/components/links/chatbot-data-draft";

const draft = {
  connaissances: [{ id: "d1", titre: "Horaires", contenu: "Nouveau contenu" }],
  liens: [],
  photos: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("résolution des conflits de connaissances", () => {
  it("ignore les doublons quand l'utilisateur garde les anciennes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitChatbotDataDraft(draft, "link-1", [
      {
        titre: "Horaires",
        existingId: "k1",
        existingChatLinkIds: [],
        action: "keep",
      },
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.skipped).toEqual(["Horaires"]);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });

  it("met à jour le contenu et rattache le chatbot à une connaissance scopée", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitChatbotDataDraft(draft, "link-1", [
      {
        titre: "Horaires",
        existingId: "k1",
        existingChatLinkIds: ["other-link"],
        action: "update",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/connaissances/k1",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as { contenu: string; chatLinkIds: string[] };
    expect(body.contenu).toBe("Nouveau contenu");
    expect(body.chatLinkIds).toEqual(["other-link", "link-1"]);
    expect(result.updated).toBe(1);
  });

  it("ne rétrécit pas la portée d'une connaissance globale", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await submitChatbotDataDraft(draft, "link-1", [
      {
        titre: "Horaires",
        existingId: "k1",
        existingChatLinkIds: [],
        action: "update",
      },
    ]);

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as { contenu: string; chatLinkIds?: string[] };
    expect(body.contenu).toBe("Nouveau contenu");
    expect(body.chatLinkIds).toBeUndefined();
  });
});
