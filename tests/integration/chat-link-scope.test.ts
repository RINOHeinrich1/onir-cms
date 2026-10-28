import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { makeOrganization, setupDb } from "./helpers/db";

let pool: Pool;
let orgId: string;

const CHAT_A = "11111111-1111-4111-8111-111111111111";
const CHAT_B = "22222222-2222-4222-8222-222222222222";
const CHAT_C = "33333333-3333-4333-8333-333333333333";

beforeAll(async () => {
  pool = await setupDb();
  orgId = await makeOrganization(pool, "ScopeChatbot");
});

afterAll(async () => {
  await pool.end();
});

describe("portée par chatbot — connaissances", () => {
  it("ne retient que les entrées globales et celles du chatbot demandé", async () => {
    const repo = pgConnaissanceRepository(pool);
    await repo.create(orgId, { titre: "Globale", contenu: "A", chatLinkIds: [], createdBy: null });
    await repo.create(orgId, {
      titre: "Chat A",
      contenu: "B",
      chatLinkIds: [CHAT_A],
      createdBy: null,
    });
    await repo.create(orgId, {
      titre: "Chat A et B",
      contenu: "C",
      chatLinkIds: [CHAT_A, CHAT_B],
      createdBy: null,
    });

    const pourA = (await repo.listActivesForChatLink?.(orgId, CHAT_A))?.map((row) => row.titre);
    const pourB = (await repo.listActivesForChatLink?.(orgId, CHAT_B))?.map((row) => row.titre);
    const pourC = (await repo.listActivesForChatLink?.(orgId, CHAT_C))?.map((row) => row.titre);

    expect(pourA?.sort()).toEqual(["Chat A", "Chat A et B", "Globale"]);
    expect(pourB?.sort()).toEqual(["Chat A et B", "Globale"]);
    expect(pourC).toEqual(["Globale"]);
  });

  it("persiste chatLinkIds à la création et à la mise à jour", async () => {
    const repo = pgConnaissanceRepository(pool);
    const created = await repo.create(orgId, {
      titre: "Portée modifiable",
      contenu: "D",
      chatLinkIds: [CHAT_A],
      createdBy: null,
    });
    expect(created.chatLinkIds).toEqual([CHAT_A]);
    const updated = await repo.update(orgId, created.id, { chatLinkIds: [CHAT_B, CHAT_C] });
    expect(updated?.chatLinkIds.sort()).toEqual([CHAT_B, CHAT_C].sort());
    const global = await repo.update(orgId, created.id, { chatLinkIds: [] });
    expect(global?.chatLinkIds).toEqual([]);
  });
});

describe("portée par chatbot — médias", () => {
  it("applique la même visibilité aux photos et aux liens", async () => {
    const repo = pgMediaRepository(pool);
    for (const type of ["photo", "lien"] as const) {
      await repo.create(orgId, {
        type,
        libelle: `${type} globale`,
        description: "",
        chatLinkIds: [],
        actif: true,
        fichier: type === "photo" ? `${type}.png` : null,
        mime: type === "photo" ? "image/png" : null,
        url: type === "lien" ? "https://onirtech.com/global" : null,
        createdBy: null,
      });
      await repo.create(orgId, {
        type,
        libelle: `${type} chat-a`,
        description: "",
        chatLinkIds: [CHAT_A],
        actif: true,
        fichier: type === "photo" ? `${type}-a.png` : null,
        mime: type === "photo" ? "image/png" : null,
        url: type === "lien" ? "https://onirtech.com/a" : null,
        createdBy: null,
      });
    }

    const photosA = (await repo.listActivesByTypeForChatLink?.(orgId, "photo", CHAT_A))?.map(
      (row) => row.libelle,
    );
    const photosB = (await repo.listActivesByTypeForChatLink?.(orgId, "photo", CHAT_B))?.map(
      (row) => row.libelle,
    );
    const liensA = (await repo.listActivesByTypeForChatLink?.(orgId, "lien", CHAT_A))?.map(
      (row) => row.libelle,
    );
    const liensB = (await repo.listActivesByTypeForChatLink?.(orgId, "lien", CHAT_B))?.map(
      (row) => row.libelle,
    );

    expect(photosA?.sort()).toEqual(["photo chat-a", "photo globale"]);
    expect(photosB).toEqual(["photo globale"]);
    expect(liensA?.sort()).toEqual(["lien chat-a", "lien globale"]);
    expect(liensB).toEqual(["lien globale"]);
  });
});
