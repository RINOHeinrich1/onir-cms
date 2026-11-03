import { describe, expect, it, vi } from "vitest";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import {
  listRuntimeConnaissances,
  listRuntimeMedias,
} from "@/application/use-cases/chat/chatbot-data-runtime";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import type { Connaissance } from "@/domain/entities/connaissance";
import type { Media } from "@/domain/entities/media";

const LINK = { id: "chat-1" };

function connaissance(id: string, chatLinkIds: string[] = [], titre = id): Connaissance {
  return {
    id,
    organizationId: "org-1",
    titre,
    contenu: "",
    chatLinkIds,
    origin: "manual",
    actif: true,
    createdBy: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function media(id: string, chatLinkIds: string[] = []): Media {
  return {
    id,
    organizationId: "org-1",
    type: "photo",
    libelle: id,
    description: "",
    chatLinkIds,
    actif: true,
    fichier: `${id}.png`,
    mime: "image/png",
    url: null,
    createdBy: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function config(mode: "all" | "selected", connaissanceIds: string[], mediaIds: string[]) {
  return {
    id: "cfg-1",
    dataSelection: { mode, connaissanceIds, mediaIds },
  } as unknown as ChatbotConfig;
}

describe("runtime des données — connaissances", () => {
  it("refuse une configuration absente", async () => {
    const deps = {
      connaissances: { listActivesForChatLink: vi.fn() } as unknown as ConnaissanceRepository,
    };
    await expect(listRuntimeConnaissances(deps, "org-1", LINK, null)).rejects.toThrow(
      /configuration/i,
    );
  });

  it("mode all : globales + scopées au chatbot", async () => {
    const listActivesForChatLink = vi.fn(async () => [
      connaissance("global"),
      connaissance("mine", ["chat-1"]),
    ]);
    const deps = {
      connaissances: { listActivesForChatLink } as unknown as ConnaissanceRepository,
    };
    const result = await listRuntimeConnaissances(deps, "org-1", LINK, config("all", [], []));
    expect(listActivesForChatLink).toHaveBeenCalledWith("org-1", "chat-1");
    expect(result.map((row) => row.id).sort()).toEqual(["global", "mine"]);
  });

  it("mode selected : filtre par identifiants sélectionnés sans N+1", async () => {
    const listActivesForChatLinkSelection = vi.fn(async () => [connaissance("k2")]);
    const deps = {
      connaissances: { listActivesForChatLinkSelection } as unknown as ConnaissanceRepository,
    };
    const result = await listRuntimeConnaissances(
      deps,
      "org-1",
      LINK,
      config("selected", ["k2"], []),
    );
    expect(listActivesForChatLinkSelection).toHaveBeenCalledWith("org-1", "chat-1", ["k2"]);
    expect(result.map((row) => row.id)).toEqual(["k2"]);
  });

  it("fallback selected : exclut les globales non sélectionnées et les données d'un autre chatbot", async () => {
    const listActivesForChatLink = vi.fn(async () => [
      connaissance("global-selected"),
      connaissance("global-other"),
      connaissance("mine", ["chat-1"]),
      connaissance("other", ["chat-2"]),
    ]);
    const deps = {
      connaissances: { listActivesForChatLink } as unknown as ConnaissanceRepository,
    };
    const result = await listRuntimeConnaissances(
      deps,
      "org-1",
      LINK,
      config("selected", ["global-selected", "other"], []),
    );
    expect(result.map((row) => row.id).sort()).toEqual(["global-selected", "mine"]);
  });
});

describe("runtime des données — médias", () => {
  it("mode selected : utilise la méthode batch par IDs et par type", async () => {
    const listActivesByTypeForChatLinkSelection = vi.fn(async () => [media("m1")]);
    const deps = {
      medias: { listActivesByTypeForChatLinkSelection } as unknown as MediaRepository,
    };
    const result = await listRuntimeMedias(
      deps,
      "org-1",
      LINK,
      "photo",
      config("selected", [], ["m1"]),
    );
    expect(listActivesByTypeForChatLinkSelection).toHaveBeenCalledWith("org-1", "photo", "chat-1", [
      "m1",
    ]);
    expect(result.map((row) => row.id)).toEqual(["m1"]);
  });
});
