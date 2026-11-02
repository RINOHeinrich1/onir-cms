import { describe, expect, it, vi } from "vitest";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import { deleteChatLinks } from "@/application/use-cases/links/manage-chat-links";

const ACTOR = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

describe("deleteChatLinks", () => {
  it("supprime une sélection en dédupliquant les identifiants", async () => {
    const deleteMany = vi.fn(async () => 2);
    const links = { deleteMany } as unknown as ChatLinkRepository;
    const result = await deleteChatLinks({ links }, ACTOR, ["a", " a ", "b"]);
    expect(deleteMany).toHaveBeenCalledWith("org-1", ["a", "b"]);
    expect(result).toEqual({ deleted: 2, requested: 2, missing: 0 });
  });

  it("retombe sur les suppressions unitaires si le port ne fournit pas deleteMany", async () => {
    const remove = vi.fn(async (_organizationId: string, id: string) => id === "a");
    const links = { delete: remove } as unknown as ChatLinkRepository;
    const result = await deleteChatLinks({ links }, ACTOR, ["a", "b"]);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ deleted: 1, requested: 2, missing: 1 });
  });

  it("refuse une sélection vide ou invalide", async () => {
    const links = { deleteMany: vi.fn(async () => 0) } as unknown as ChatLinkRepository;
    await expect(deleteChatLinks({ links }, ACTOR, [])).rejects.toThrow(/Aucun chatbot/);
    await expect(deleteChatLinks({ links }, ACTOR, ["ok", 3])).rejects.toThrow(
      /Identifiants invalides/,
    );
  });
});
