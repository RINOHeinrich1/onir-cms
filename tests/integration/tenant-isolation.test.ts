import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { addMembership, makeOrganization, makeUser, setupDb } from "./helpers/db";

let pool: Pool;
let orgA: string;
let orgB: string;

function definition(key: string): TemplateDefinition {
  return {
    key,
    label: key,
    description: "",
    systemPrompt: "x",
    fields: [],
    renderTemplate: "x",
  };
}

function linkInput(tokenHash: string) {
  return {
    tokenHash,
    tokenEnc: "enc",
    label: tokenHash,
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
  orgA = await makeOrganization(pool, "Org A");
  orgB = await makeOrganization(pool, "Org B");
  const userA = await makeUser(pool, "a@example.com");
  const userB = await makeUser(pool, "b@example.com");
  await addMembership(pool, orgA, userA);
  await addMembership(pool, orgB, userB);
});

afterAll(async () => {
  await pool.end();
});

describe("isolation croisée SQL — prospects", () => {
  it("findById / list / update / delete scopés", async () => {
    const repo = pgProspectRepository(pool);
    const base = {
      nom: "Nom",
      prenom: "Prénom",
      nature: "physique" as const,
      email: "",
      activite: "",
      fonction: "",
      detail: "",
      createdBy: null,
    };
    const a = await repo.create(orgA, { ...base, email: "a@p.com" });
    const b = await repo.create(orgB, { ...base, email: "b@p.com" });

    expect(await repo.findById(orgA, b.id)).toBeNull();
    expect((await repo.list(orgA)).map((row) => row.id)).toEqual([a.id]);
    expect(await repo.update(orgA, b.id, { nom: "piraté" })).toBeNull();
    expect((await repo.findById(orgB, b.id))?.nom).toBe("Nom");
    expect(await repo.delete(orgA, b.id)).toBe(false);
    expect(await repo.findById(orgB, b.id)).not.toBeNull();
    // Unicité par organisation : même email autorisé dans deux organisations.
    const aBis = await repo.create(orgB, { ...base, email: "a@p.com" });
    expect(aBis.organizationId).toBe(orgB);
  });
});

describe("filtre d'origine SQL — prospects", () => {
  it("sépare les manuels des prospects issus d'un libellé de lien", async () => {
    const links = pgChatLinkRepository(pool);
    const prospects = pgProspectRepository(pool);
    const link = await links.create(orgA, linkInput("hash-origine"));
    const linkB = await links.create(orgB, linkInput("hash-origine-b"));
    const base = {
      nom: "Filtre",
      prenom: "Origine",
      nature: "physique" as const,
      activite: "",
      fonction: "",
      detail: "",
      createdBy: null,
    };
    const manual = await prospects.create(orgA, {
      ...base,
      email: "manuel-filtre@example.com",
    });
    const viaLink = await prospects.create(orgA, {
      ...base,
      email: "lien-filtre@example.com",
      origine: "libre",
      lienId: link.id,
    });
    await prospects.create(orgB, {
      ...base,
      email: "lien-filtre-b@example.com",
      origine: "libre",
      lienId: linkB.id,
    });

    const manuels = await prospects.list(orgA, { kind: "manuel" });
    expect(manuels.map((row) => row.id)).toContain(manual.id);
    expect(manuels.map((row) => row.id)).not.toContain(viaLink.id);
    expect(
      (await prospects.list(orgA, { kind: "lien", label: "hash-origine" })).map((row) => row.id),
    ).toEqual([viaLink.id]);
    expect(await prospects.listLinkLabels(orgA)).toEqual(["hash-origine"]);

    await prospects.delete(orgA, manual.id);
    await prospects.delete(orgA, viaLink.id);
    await links.delete(orgA, link.id);
    await links.delete(orgB, linkB.id);
  });
});

describe("isolation croisée SQL — liens et conversations", () => {
  it("liens scopés, token global porteur d'organisation", async () => {
    const repo = pgChatLinkRepository(pool);
    const a = await repo.create(orgA, linkInput("hash-a"));
    const b = await repo.create(orgB, linkInput("hash-b"));

    expect(await repo.findById(orgA, b.id)).toBeNull();
    expect((await repo.list(orgA)).map((row) => row.id)).toEqual([a.id]);
    expect((await repo.findByTokenHash("hash-b"))?.organizationId).toBe(orgB);
    expect(
      await repo.updateDetails(orgA, b.id, {
        label: "piraté",
        surface: "page" as const,
        identificationMode: "contact",
        expiresAt: null,
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
      }),
    ).toBeNull();
    expect(await repo.delete(orgA, b.id)).toBe(false);
  });

  it("messages : aucune lecture/écriture croisée", async () => {
    const links = pgChatLinkRepository(pool);
    const conversations = pgConversationRepository(pool);
    const linkA = await links.create(orgA, linkInput("hash-c"));
    const linkB = await links.create(orgB, linkInput("hash-d"));
    const convA = await conversations.create(orgA, {
      linkId: linkA.id,
      visitorNom: "",
      visitorEmail: "",
      visitorContacts: [],
      prospectId: null,
      consentementAt: null,
      confidentialiteId: null,
    });
    const convB = await conversations.create(orgB, {
      linkId: linkB.id,
      visitorNom: "",
      visitorEmail: "",
      visitorContacts: [],
      prospectId: null,
      consentementAt: null,
      confidentialiteId: null,
    });
    const msgB = await conversations.appendMessage(orgB, convB.id, "user", "secret B");

    expect(await conversations.findById(orgA, convB.id)).toBeNull();
    expect((await conversations.listWithDetails(orgA, "toutes")).map((row) => row.id)).toEqual([
      convA.id,
    ]);
    expect(await conversations.countByStatut(orgA)).toEqual({ enCours: 1, finalisees: 0 });
    expect(await conversations.countByStatut(orgB)).toEqual({ enCours: 1, finalisees: 0 });
    expect(
      (await conversations.listWithDetails(orgA, "toutes", "hash-c")).map((row) => row.id),
    ).toEqual([convA.id]);
    expect(await conversations.listWithDetails(orgA, "toutes", "hash-d")).toEqual([]);
    await conversations.markFinalisee(orgA, convA.id);
    expect(await conversations.countByStatut(orgA)).toEqual({ enCours: 0, finalisees: 1 });
    expect(await conversations.listMessages(orgA, convB.id)).toEqual([]);
    expect(await conversations.findMessage(orgA, msgB.id)).toBeNull();
    expect(await conversations.setMessageMedias(orgA, msgB.id, [])).toBeNull();
    await expect(
      conversations.appendMessage(orgA, convB.id, "user", "intrusion"),
    ).rejects.toThrow();
  });
});

describe("isolation croisée SQL — fiches, médias, connaissances, confidentialités, modèles", () => {
  it("fiches scopées", async () => {
    const links = pgChatLinkRepository(pool);
    const conversations = pgConversationRepository(pool);
    const fiches = pgFicheRepository(pool);
    const linkA = await links.create(orgA, linkInput("hash-e"));
    const linkB = await links.create(orgB, linkInput("hash-f"));
    const convA = await conversations.create(orgA, {
      linkId: linkA.id,
      visitorNom: "",
      visitorEmail: "",
      visitorContacts: [],
      prospectId: null,
      consentementAt: null,
      confidentialiteId: null,
    });
    const convB = await conversations.create(orgB, {
      linkId: linkB.id,
      visitorNom: "",
      visitorEmail: "",
      visitorContacts: [],
      prospectId: null,
      consentementAt: null,
      confidentialiteId: null,
    });
    const ficheA = await fiches.create(orgA, {
      conversationId: convA.id,
      prospectId: null,
      createdBy: null,
      templateKey: "fiche-projet",
      templateVersion: 1,
      data: {},
    });
    const ficheB = await fiches.create(orgB, {
      conversationId: convB.id,
      prospectId: null,
      createdBy: null,
      templateKey: "fiche-projet",
      templateVersion: 1,
      data: {},
    });

    expect(await fiches.findById(orgA, ficheB.id)).toBeNull();
    expect((await fiches.list(orgA, "toutes")).map((row) => row.id)).toEqual([ficheA.id]);
    expect((await fiches.list(orgA, "toutes", "hash-e")).map((row) => row.id)).toEqual([ficheA.id]);
    expect(await fiches.list(orgA, "toutes", "hash-f")).toEqual([]);
    expect(await fiches.setArchivee(orgA, ficheB.id, true)).toBeNull();
  });

  it("médias : unicités locales + accès croisé interdit", async () => {
    const repo = pgMediaRepository(pool);
    const a = await repo.create(orgA, {
      type: "lien",
      libelle: "Partagé",
      description: "",
      templateKeys: [],
      actif: true,
      fichier: null,
      mime: null,
      url: "https://a.example.com",
      createdBy: null,
    });
    const b = await repo.create(orgB, {
      type: "lien",
      libelle: "Partagé",
      description: "",
      templateKeys: [],
      actif: true,
      fichier: null,
      mime: null,
      url: "https://b.example.com",
      createdBy: null,
    });

    expect(await repo.findById(orgA, b.id)).toBeNull();
    expect((await repo.findByLibelle(orgA, "lien", "Partagé"))?.id).toBe(a.id);
    expect(await repo.update(orgA, b.id, { libelle: "piraté" })).toBeNull();
    expect(await repo.delete(orgA, b.id)).toBe(false);
    await expect(
      repo.create(orgA, {
        type: "lien",
        libelle: "Partagé",
        description: "",
        templateKeys: [],
        actif: true,
        fichier: null,
        mime: null,
        url: "https://doublon.example.com",
        createdBy: null,
      }),
    ).rejects.toThrow();
  });

  it("connaissances et confidentialités : unicités et accès locaux", async () => {
    const connaissances = pgConnaissanceRepository(pool);
    const confidentialites = pgConfidentialiteRepository(pool);

    const ca = await connaissances.create(orgA, {
      titre: "Tarifs",
      contenu: "A",
      templateKeys: [],
      createdBy: null,
    });
    const cb = await connaissances.create(orgB, {
      titre: "Tarifs",
      contenu: "B",
      templateKeys: [],
      createdBy: null,
    });
    expect((await connaissances.findByTitre(orgA, "Tarifs"))?.id).toBe(ca.id);
    expect(await connaissances.findById(orgA, cb.id)).toBeNull();
    await expect(
      connaissances.create(orgA, {
        titre: "Tarifs",
        contenu: "doublon",
        templateKeys: [],
        createdBy: null,
      }),
    ).rejects.toThrow();

    const pa = await confidentialites.create(orgA, {
      titre: "Politique",
      texte: "A",
      lien: "",
      actif: true,
      createdBy: null,
    });
    const pb = await confidentialites.create(orgB, {
      titre: "Politique",
      texte: "B",
      lien: "",
      actif: true,
      createdBy: null,
    });
    expect((await confidentialites.findByTitre(orgA, "Politique"))?.id).toBe(pa.id);
    expect(await confidentialites.findById(orgA, pb.id)).toBeNull();
    expect(await confidentialites.delete(orgA, pb.id)).toBe(false);
  });

  it("modèles de raisonnement : clé locale, gardes de suppression locales", async () => {
    const repo = pgChatTemplateRepository(pool);
    const va = await repo.createTemplate(orgA, definition("partage"), null);
    const vb = await repo.createTemplate(orgB, definition("partage"), null);
    expect(va.version).toBe(1);
    expect(vb.version).toBe(1);
    expect((await repo.findByKey(orgA, "partage"))?.organizationId).toBe(orgA);
    expect((await repo.currentVersion(orgA, "partage"))?.id).toBe(va.id);
    expect(await repo.deleteTemplate(orgA, "partage")).toBe(true);
    expect(await repo.findByKey(orgB, "partage")).not.toBeNull();
  });
});

describe("contraintes physiques", () => {
  it("FK composite : une conversation org A ne peut pas référencer un lien org B", async () => {
    const links = pgChatLinkRepository(pool);
    const linkB = await links.create(orgB, linkInput("hash-g"));
    await expect(
      pool.query(`INSERT INTO conversations (organization_id, link_id) VALUES ($1, $2)`, [
        orgA,
        linkB.id,
      ]),
    ).rejects.toThrow();
  });

  it("token de lien unique globalement", async () => {
    const links = pgChatLinkRepository(pool);
    await links.create(orgA, linkInput("hash-unique"));
    await expect(links.create(orgB, linkInput("hash-unique"))).rejects.toThrow();
  });
});
