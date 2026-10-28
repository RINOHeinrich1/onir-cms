import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgActivityRepository } from "@/infrastructure/db/activity-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { makeOrganization, makeUser, setupDb } from "./helpers/db";

let pool: Pool;
let orgA: string;
let orgB: string;
let userA: string;
let userB: string;

function linkInput(tokenHash: string) {
  return {
    tokenHash,
    tokenEnc: "enc",
    label: `Lien ${tokenHash}`,
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
  orgA = await makeOrganization(pool, "Notifications A");
  orgB = await makeOrganization(pool, "Notifications B");
  userA = await makeUser(pool, "notif-a@example.com");
  userB = await makeUser(pool, "notif-b@example.com");
});

afterAll(async () => {
  await pool.end();
});

describe("pgActivityRepository", () => {
  it("scope les dernières conversations par organisation et par liens autorisés", async () => {
    const links = pgChatLinkRepository(pool);
    const conversations = pgConversationRepository(pool);
    const linkA = await links.create(orgA, linkInput("notif-link-a"));
    const linkB = await links.create(orgA, linkInput("notif-link-b"));
    const linkOther = await links.create(orgB, linkInput("notif-link-other"));

    const convA = await conversations.create(orgA, {
      linkId: linkA.id,
      visitorNom: "Jean",
      visitorEmail: "jean@example.com",
      visitorContacts: [],
      prospectId: null,
      consentementAt: null,
      confidentialiteId: null,
    });
    await conversations.create(orgA, {
      linkId: linkB.id,
      visitorNom: "Alice",
      visitorEmail: "alice@example.com",
      visitorContacts: [],
      prospectId: null,
      consentementAt: null,
      confidentialiteId: null,
    });
    await conversations.create(orgB, {
      linkId: linkOther.id,
      visitorNom: "Autre",
      visitorEmail: "autre@example.com",
      visitorContacts: [],
      prospectId: null,
      consentementAt: null,
      confidentialiteId: null,
    });

    const activity = pgActivityRepository(pool);
    const all = await activity.listLatestConversations(orgA, null, 10);
    expect(all.map((row) => row.id)).toHaveLength(2);

    const scoped = await activity.listLatestConversations(orgA, [linkA.id], 10);
    expect(scoped.map((row) => row.id)).toEqual([convA.id]);
    expect(scoped[0]?.linkLabel).toBe("Lien notif-link-a");

    expect(await activity.listLatestConversations(orgA, [], 10)).toEqual([]);
  });

  it("scope les derniers leads et respecte l'organisation", async () => {
    const fiches = pgFicheRepository(pool);
    const own = await fiches.create(orgA, {
      conversationId: null,
      prospectId: null,
      createdBy: userA,
      templateKey: "fiche-projet",
      templateVersion: 1,
      data: { entreprise: "Auto" },
    });
    const other = await fiches.create(orgA, {
      conversationId: null,
      prospectId: null,
      createdBy: userB,
      templateKey: "fiche-projet",
      templateVersion: 1,
      data: { entreprise: "ACME" },
    });
    await fiches.create(orgB, {
      conversationId: null,
      prospectId: null,
      createdBy: userB,
      templateKey: "fiche-projet",
      templateVersion: 1,
      data: { entreprise: "Hors org" },
    });

    const activity = pgActivityRepository(pool);
    const rows = await activity.listLatestLeads(orgA, 10);
    expect(rows.map((row) => row.id)).toEqual([other.id, own.id]);
    expect(rows.map((row) => row.data)).toEqual([{ entreprise: "ACME" }, { entreprise: "Auto" }]);
  });

  it("initialise, avance et applique le filigrane de lecture", async () => {
    const links = pgChatLinkRepository(pool);
    const conversations = pgConversationRepository(pool);
    const fiches = pgFicheRepository(pool);
    const link = await links.create(orgA, linkInput("notif-watermark"));
    const activity = pgActivityRepository(pool);

    const lastReadAt = await activity.ensureLastReadAt(orgA, userA);
    expect(Date.parse(lastReadAt)).not.toBeNaN();
    expect(await activity.countConversationsSince(orgA, lastReadAt, null)).toBe(0);
    expect(await activity.countLeadsSince(orgA, lastReadAt)).toBe(0);

    await conversations.create(orgA, {
      linkId: link.id,
      visitorNom: "Nouveau",
      visitorEmail: "nouveau@example.com",
      visitorContacts: [],
      prospectId: null,
      consentementAt: null,
      confidentialiteId: null,
    });
    await fiches.create(orgA, {
      conversationId: null,
      prospectId: null,
      createdBy: userA,
      templateKey: "fiche-projet",
      templateVersion: 1,
      data: { entreprise: "Nouveau lead" },
    });

    expect(await activity.countConversationsSince(orgA, lastReadAt, null)).toBe(1);
    expect(await activity.countLeadsSince(orgA, lastReadAt)).toBe(1);

    const readAt = await activity.markRead(orgA, userA);
    expect(Date.parse(readAt)).toBeGreaterThanOrEqual(Date.parse(lastReadAt));
    expect(await activity.countConversationsSince(orgA, readAt, null)).toBe(0);
    expect(await activity.countLeadsSince(orgA, readAt)).toBe(0);
  });
});
