import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgConversationFieldRepository } from "@/infrastructure/db/conversation-field-repository";
import { pgConversationIncidentRepository } from "@/infrastructure/db/conversation-incident-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { makeOrganization, makeUser, setupDb } from "./helpers/db";

let pool: Pool;
let orgId: string;
let userId: string;
let conversationId: string;

function linkInput() {
  return {
    tokenHash: "fields-link",
    tokenEnc: "enc",
    label: "Campagne",
    type: "standard" as const,
    surface: "page" as const,
    identificationMode: "contact" as const,
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
    aiProviderId: null,
    aiModel: null,
  };
}

beforeAll(async () => {
  pool = await setupDb();
  orgId = await makeOrganization(pool, "Fields Org");
  userId = await makeUser(pool, "fields@example.com");
  const link = await pgChatLinkRepository(pool).create(orgId, linkInput());
  const conversation = await pgConversationRepository(pool).create(orgId, {
    linkId: link.id,
    visitorNom: "Jean",
    visitorEmail: "jean@example.com",
    visitorContacts: [],
    prospectId: null,
    consentementAt: null,
    confidentialiteId: null,
  });
  conversationId = conversation.id;
});

afterAll(async () => {
  await pool.end();
});

describe("conversation fields & incidents repositories", () => {
  it("protège les valeurs manuelles et conserve l'état d'analyse", async () => {
    const fields = pgConversationFieldRepository(pool);
    await fields.upsertManual(orgId, conversationId, [
      { fieldName: "nom", value: "Alice", source: "manual", updatedBy: userId },
    ]);
    await fields.upsertAi(orgId, conversationId, [
      { fieldName: "nom", value: "Bob", source: "ai", updatedBy: null },
      { fieldName: "email", value: "bob@example.com", source: "ai", updatedBy: null },
    ]);
    const values = await fields.list(orgId, conversationId);
    expect(values.find((entry) => entry.fieldName === "nom")).toMatchObject({
      value: "Alice",
      source: "manual",
    });
    expect(values.find((entry) => entry.fieldName === "email")).toMatchObject({
      value: "bob@example.com",
      source: "ai",
    });

    await fields.saveAnalysis(orgId, conversationId, {
      lastAnalyzedMessageAt: "2026-10-28T09:00:00.000Z",
      lastAnalyzedAt: "2026-10-28T09:01:00.000Z",
      status: "ok",
      error: null,
    });
    expect(await fields.getAnalysis(orgId, conversationId)).toMatchObject({
      lastAnalyzedMessageAt: "2026-10-28T09:00:00.000Z",
      status: "ok",
      error: null,
    });
  });

  it("déduplique les incidents ouverts et permet leur résolution", async () => {
    const incidents = pgConversationIncidentRepository(pool);
    const input = {
      organizationId: orgId,
      conversationId,
      kind: "ai_reply_failed" as const,
      severity: "high" as const,
      title: "Réponse IA impossible",
      detail: "Jean — erreur",
    };
    await incidents.record(input);
    await incidents.record({ ...input, detail: "Jean — erreur 2" });
    const open = await incidents.listOpen(orgId, null);
    expect(open).toHaveLength(1);
    expect(open[0]?.occurrences).toBe(2);
    expect(open[0]?.detail).toBe("Jean — erreur 2");
    expect(await incidents.countOpen(orgId, null)).toBe(1);

    const incidentId = open[0]?.id;
    if (incidentId === undefined) throw new Error("Incident attendu");
    const resolved = await incidents.resolve(orgId, incidentId, userId, null);
    expect(resolved?.status).toBe("resolved");
    expect(await incidents.countOpen(orgId, null)).toBe(0);
  });
});
