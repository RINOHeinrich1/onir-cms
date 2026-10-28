import { describe, expect, it } from "vitest";
import type { Conversation } from "@/domain/entities/chat";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { Prospect } from "@/domain/entities/prospect";
import { buildRenderVariables, buildServerVariables } from "@/domain/template-variables";

const DEFINITION: TemplateDefinition = {
  key: "demo",
  label: "Démo",
  description: "",
  systemPrompt: "x",
  fields: [],
  renderTemplate: "x",
};

const PROSPECT: Prospect = {
  id: "p1",
  organizationId: "org-1",
  nom: "Rakoto",
  prenom: "Jean",
  nature: "morale",
  email: "contact@societe.mg",
  activite: "Commerce",
  fonction: "Gérant",
  detail: "Vu au salon.",
  origine: "saisie",
  lienId: null,
  lienLabel: null,
  contactMissing: false,
  createdBy: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const CONVERSATION: Conversation = {
  id: "c1",
  organizationId: "org-1",
  linkId: "l1",
  visitorNom: "Visiteur",
  visitorEmail: "visiteur@exemple.mg",
  visitorContacts: [],
  prospectId: null,
  statut: "en_cours",
  lastMessageAt: null,
  consentementAt: null,
  confidentialiteId: null,
  interventionMode: "ai",
  assignedUserId: null,
  assignedOperatorName: null,
  lastOperatorUserId: null,
  lastOperatorName: null,
  humanTakeoverAt: null,
  lastVisitorMessageAt: null,
  lastOperatorMessageAt: null,
  createdAt: new Date(0).toISOString(),
};

describe("buildServerVariables", () => {
  it("specifique + prospect : contexte complet, visiteur non connu", () => {
    const vars = buildServerVariables({
      mode: "specifique",
      prospect: PROSPECT,
      conversation: null,
    });
    expect(vars.prospect_nom).toBe("Rakoto");
    expect(vars.prospect_nature_label).toBe("personne morale");
    expect(vars.prospect_contexte).toContain("Nom : Rakoto Jean");
    expect(vars.prospect_connu).toBe("1");
    expect(vars.visiteur_connu).toBe("");
    expect(vars.visitor_identifie).toBe("");
    expect(vars.prospect_present).toBe("1");
  });

  it("standard sans prospect : visiteur connu, contexte vide", () => {
    const vars = buildServerVariables({
      mode: "standard",
      prospect: null,
      conversation: CONVERSATION,
    });
    expect(vars.visitor_nom).toBe("Visiteur");
    expect(vars.visitor_email).toBe("visiteur@exemple.mg");
    expect(vars.visitor_identifie).toBe("1");
    expect(vars.prospect_connu).toBe("");
    expect(vars.visiteur_connu).toBe("1");
    expect(vars.prospect_present).toBe("");
  });
});

describe("buildRenderVariables", () => {
  it("fusionne serveur + données + extra (extra prioritaire)", () => {
    const vars = buildRenderVariables(DEFINITION, {}, { date: "x", a: "1" }, { a: "2" });
    expect(vars.a).toBe("2");
    expect(vars.date).toBe("x");
    expect(vars.champs_guide).toBe("");
  });
});
