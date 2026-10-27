import { describe, expect, it } from "vitest";
import {
  type BuildTemplateContextInput,
  buildTemplateContext,
  parseTemplateAction,
  type TemplateMessage,
} from "@/domain/template-contract";

function input(overrides: Partial<BuildTemplateContextInput> = {}): BuildTemplateContextInput {
  return {
    surface: "page",
    link: { type: "standard", label: "Campagne" },
    locale: "fr",
    brand: { name: "ONIRTECH", logoUrl: null },
    theme: { primary: "#023777" },
    capabilities: ["messages", "media", "modelForm", "theme"],
    consent: { texte: "J'accepte…", lien: "/confidentialite" },
    phase: "chat",
    status: "en_cours",
    messages: [
      { id: "m1", role: "user", content: "Bonjour", medias: [], at: new Date(0).toISOString() },
    ],
    typing: false,
    media: { photos: [{ id: "p1", libelle: "Logo", url: "/api/medias/p1/file" }], liens: [] },
    modelForm: [{ name: "sujet", label: "Sujet", type: "text", required: true }],
    ...overrides,
  };
}

describe("buildTemplateContext — filtrage par capacités", () => {
  it("fournit tout quand toutes les capacités sont déclarées", () => {
    const ctx = buildTemplateContext(input());
    expect(ctx.host.protocol).toBe("onirtech.template-host.v1");
    expect(ctx.state.messages).toHaveLength(1);
    expect(ctx.resources.media.photos).toHaveLength(1);
    expect(ctx.resources.modelForm).not.toBeNull();
    expect(ctx.theme.primary).toBe("#023777");
  });

  it("ne fournit QUE les ressources déclarées (capability gating)", () => {
    const ctx = buildTemplateContext(input({ capabilities: ["messages"] }));
    expect(ctx.state.messages).toHaveLength(1);
    expect(ctx.resources.media.photos).toHaveLength(0);
    expect(ctx.resources.modelForm).toBeNull();
    expect(ctx.theme).toEqual({});
  });

  it("vide les messages si la capacité `messages` n'est pas déclarée", () => {
    const ctx = buildTemplateContext(input({ capabilities: ["theme"] }));
    expect(ctx.state.messages).toHaveLength(0);
  });

  it("expose le flag userState du lien (false par défaut)", () => {
    expect(buildTemplateContext(input()).link.userStateEnabled).toBe(false);
    expect(buildTemplateContext(input({ userStateEnabled: true })).link.userStateEnabled).toBe(
      true,
    );
  });
});

describe("buildTemplateContext — double garde userState / knowledge (ADR-0020)", () => {
  const messages: TemplateMessage[] = [
    {
      id: "u1",
      role: "user",
      content: "Merci !",
      medias: [],
      at: new Date(0).toISOString(),
      userState: { label: "content", confidence: 0.8 },
    },
    {
      id: "a1",
      role: "assistant",
      content: "Avec plaisir.",
      medias: [],
      at: new Date(0).toISOString(),
      knowledge: [{ ref: "k1", titre: "Offre commerciale" }],
    },
  ];

  it("fournit userState si capacité déclarée ET flag lien actif", () => {
    const ctx = buildTemplateContext(
      input({ capabilities: ["messages", "userState"], messages, userStateEnabled: true }),
    );
    expect(ctx.state.messages[0]?.userState).toEqual({ label: "content", confidence: 0.8 });
  });

  it("omet userState si le flag lien est inactif", () => {
    const ctx = buildTemplateContext(
      input({ capabilities: ["messages", "userState"], messages, userStateEnabled: false }),
    );
    expect(ctx.state.messages[0]?.userState).toBeUndefined();
  });

  it("omet userState si la capacité n'est pas déclarée", () => {
    const ctx = buildTemplateContext(
      input({ capabilities: ["messages"], messages, userStateEnabled: true }),
    );
    expect(ctx.state.messages[0]?.userState).toBeUndefined();
  });

  it("fournit knowledge si capacité déclarée ET source active", () => {
    const ctx = buildTemplateContext(
      input({ capabilities: ["messages", "knowledge"], messages, knowledgeEnabled: true }),
    );
    expect(ctx.state.messages[1]?.knowledge).toEqual([{ ref: "k1", titre: "Offre commerciale" }]);
  });

  it("omet knowledge si la source est inactive", () => {
    const ctx = buildTemplateContext(
      input({ capabilities: ["messages", "knowledge"], messages, knowledgeEnabled: false }),
    );
    expect(ctx.state.messages[1]?.knowledge).toBeUndefined();
  });

  it("omet knowledge si la capacité n'est pas déclarée", () => {
    const ctx = buildTemplateContext(
      input({ capabilities: ["messages"], messages, knowledgeEnabled: true }),
    );
    expect(ctx.state.messages[1]?.knowledge).toBeUndefined();
  });
});

describe("parseTemplateAction — validation côté hôte", () => {
  it("accepte les actions valides", () => {
    expect(parseTemplateAction({ action: "ready" }).ok).toBe(true);
    expect(parseTemplateAction({ action: "finish" }).ok).toBe(true);
    expect(parseTemplateAction({ action: "sendMessage", payload: { content: "Salut" } }).ok).toBe(
      true,
    );
    expect(parseTemplateAction({ action: "resize", payload: { height: 640 } }).ok).toBe(true);
    expect(
      parseTemplateAction({
        action: "attachFile",
        payload: {
          fieldName: "cin",
          name: "cin.png",
          mime: "image/png",
          data: new Uint8Array([1, 2, 3]).buffer,
        },
      }).ok,
    ).toBe(true);
  });

  it("accepte un message composé uniquement de pièces", () => {
    expect(
      parseTemplateAction({
        action: "sendMessage",
        payload: { content: "", attachmentIds: ["a1"] },
      }).ok,
    ).toBe(true);
  });

  it("normalise submitIdentity (email bas de casse, contacts optionnels)", () => {
    const result = parseTemplateAction({
      action: "submitIdentity",
      payload: { nom: " Jean ", email: "Jean@Exemple.MG", consentement: true },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.action === "submitIdentity") {
      expect(result.value.payload.email).toBe("jean@exemple.mg");
      expect(result.value.payload.nom).toBe("Jean");
      expect(result.value.payload.consentement).toBe(true);
    }
  });

  it("rejette les actions invalides", () => {
    expect(parseTemplateAction({ action: "sendMessage", payload: { content: "  " } }).ok).toBe(
      false,
    );
    expect(parseTemplateAction({ action: "submitIdentity", payload: { nom: "x" } }).ok).toBe(false);
    expect(parseTemplateAction({ action: "openMedia", payload: { url: "ftp://x" } }).ok).toBe(
      false,
    );
    expect(parseTemplateAction({ action: "resize", payload: { height: -1 } }).ok).toBe(false);
    expect(parseTemplateAction({ action: "sabotage" }).ok).toBe(false);
    expect(parseTemplateAction("nope").ok).toBe(false);
  });
});
