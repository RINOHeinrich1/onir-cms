import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreateChatLinkInput } from "@/application/ports/chat-link-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { makeOrganization, setupDb } from "./helpers/db";

let pool: Pool;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  pool = await setupDb();
  orgA = await makeOrganization(pool, "Org visites A");
  orgB = await makeOrganization(pool, "Org visites B");
});

beforeEach(async () => {
  await pool.query("DELETE FROM chat_links");
});

afterAll(async () => {
  await pool.end();
});

function linkInput(overrides: Partial<CreateChatLinkInput> = {}): CreateChatLinkInput {
  return {
    tokenHash: `visit-${Math.random().toString(16).slice(2)}`,
    tokenEnc: "enc",
    label: "Lien visites",
    type: "standard",
    surface: "page" as const,
    identificationMode: "contact",
    prospectId: null,
    createdBy: null,
    expiresAt: null,
    templateKey: "fiche-projet",
    templateVersion: 1,
    sources: { connaissances: true, phototheque: true, lien: true },
    confidentialiteId: null,
    userStateEnabled: false,
    visualTemplateId: null,
    visualTemplateVersion: null,
    visualTemplateConfig: {},
    visualTemplateParams: {},
    widgetConfig: {},
    ...overrides,
  };
}

describe("chat_links — compteur de visites", () => {
  it("incrémente le total et la dernière visite", async () => {
    const repo = pgChatLinkRepository(pool);
    const created = await repo.create(orgA, linkInput());
    expect(created.visitCount).toBe(0);
    expect(created.lastVisitAt).toBeNull();

    await repo.recordVisit(orgA, created.id);
    const first = await repo.findById(orgA, created.id);
    expect(first?.visitCount).toBe(1);
    expect(first?.lastVisitAt).not.toBeNull();

    await repo.recordVisit(orgA, created.id);
    const second = await repo.findById(orgA, created.id);
    expect(second?.visitCount).toBe(2);
  });

  it("ne touche pas un lien d'une autre organisation", async () => {
    const repo = pgChatLinkRepository(pool);
    const created = await repo.create(orgA, linkInput());

    await repo.recordVisit(orgB, created.id);
    const stored = await repo.findById(orgA, created.id);
    expect(stored?.visitCount).toBe(0);
    expect(stored?.lastVisitAt).toBeNull();
  });
});
