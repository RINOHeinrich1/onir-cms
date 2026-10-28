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
  orgA = await makeOrganization(pool, "Org quotas A");
  orgB = await makeOrganization(pool, "Org quotas B");
});

beforeEach(async () => {
  await pool.query("DELETE FROM chat_links");
});

afterAll(async () => {
  await pool.end();
});

function linkInput(overrides: Partial<CreateChatLinkInput> = {}): CreateChatLinkInput {
  return {
    tokenHash: `quota-${Math.random().toString(16).slice(2)}`,
    tokenEnc: "enc",
    label: "Lien quotas",
    type: "standard",
    surface: "page",
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

describe("quotas chatbot — persistance atomique", () => {
  it("réserve les fiches sans dépasser la limite à vie", async () => {
    const repo = pgChatLinkRepository(pool);
    const link = await repo.create(orgA, linkInput({ maxFiches: 2 }));

    expect(await repo.reserveFiche?.(orgA, link.id)).toBe(true);
    expect(await repo.reserveFiche?.(orgA, link.id)).toBe(true);
    expect(await repo.reserveFiche?.(orgA, link.id)).toBe(false);
    expect((await repo.findById(orgA, link.id))?.quotas?.fichesGenerated).toBe(2);

    await repo.releaseFiche?.(orgA, link.id);
    expect((await repo.findById(orgA, link.id))?.quotas?.fichesGenerated).toBe(1);
    expect(await repo.reserveFiche?.(orgA, link.id)).toBe(true);
  });

  it("compte les tokens, réinitialise la période échue et permet le reset manuel", async () => {
    const repo = pgChatLinkRepository(pool);
    const link = await repo.create(
      orgA,
      linkInput({
        maxTokens: 100,
        tokenResetMode: "duration",
        tokenResetDays: 1,
      }),
    );

    await repo.recordAiUsage?.(orgA, link.id, {
      conversationId: null,
      operation: "chat_reply",
      promptTokens: 60,
      completionTokens: 20,
      totalTokens: 80,
    });
    await repo.recordAiUsage?.(orgA, link.id, {
      conversationId: null,
      operation: "knowledge_selection",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });

    const after = await repo.findById(orgA, link.id);
    expect(after?.quotas?.tokensUsed).toBe(95);
    expect(after?.quotas?.maxTokens).toBe(100);

    await pool.query(
      "UPDATE chat_links SET token_period_started_at = now() - interval '2 days' WHERE id = $1",
      [link.id],
    );
    const reset = await repo.findById(orgA, link.id);
    expect(reset?.quotas?.tokensUsed).toBe(0);
    expect(reset?.quotas?.tokenPeriodStartedAt).toBeTruthy();

    await repo.recordAiUsage?.(orgA, link.id, {
      conversationId: null,
      operation: "chat_reply",
      promptTokens: 3,
      completionTokens: 2,
      totalTokens: 5,
    });
    expect((await repo.findById(orgA, link.id))?.quotas?.tokensUsed).toBe(5);
    expect((await repo.resetTokenUsage?.(orgA, link.id))?.quotas?.tokensUsed).toBe(0);

    const { rows } = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM chat_link_ai_usage WHERE link_id = $1",
      [link.id],
    );
    expect(rows[0]?.count).toBe(3);
  });

  it("met à jour les quotas et conserve le reset manuel", async () => {
    const repo = pgChatLinkRepository(pool);
    const link = await repo.create(orgA, linkInput());
    const updated = await repo.updateDetails(orgA, link.id, {
      label: link.label,
      surface: link.surface,
      identificationMode: link.identificationMode,
      expiresAt: link.expiresAt,
      sources: link.sources,
      userStateEnabled: link.userStateEnabled,
      ...(link.channels === undefined ? {} : { channels: link.channels }),
      aiProviderId: link.aiProviderId,
      aiModel: link.aiModel,
      maxFiches: 5,
      maxTokens: 1000,
      tokenResetMode: "duration",
      tokenResetDays: 30,
    });
    expect(updated?.quotas).toMatchObject({
      maxFiches: 5,
      maxTokens: 1000,
      tokenResetMode: "duration",
      tokenResetDays: 30,
    });
  });

  it("isole les réservations par organisation", async () => {
    const repo = pgChatLinkRepository(pool);
    const link = await repo.create(orgA, linkInput({ maxFiches: 1 }));
    expect(await repo.reserveFiche?.(orgB, link.id)).toBe(false);
    expect(await repo.reserveFiche?.(orgA, link.id)).toBe(true);
  });
});
