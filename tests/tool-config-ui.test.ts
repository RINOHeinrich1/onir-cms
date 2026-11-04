import { describe, expect, it } from "vitest";
import {
  chatbotConfigPayload,
  defaultChatbotConfigDraft,
  publicSafeSearchToolDraft,
  searchToolDraftViolations,
} from "@/components/links/chatbot-config-draft";

/**
 * E015 — l'UI publique ne doit jamais émettre une politique backoffice
 * (ADR-0067 §2.5 / §10). La garde serveur reste la source de vérité, mais une
 * configuration héritée ne doit pas non plus quitter le navigateur.
 */
describe("payload public de l'outil de recherche", () => {
  it("force les valeurs publiques même si le brouillon porte une politique backoffice", () => {
    const draft = defaultChatbotConfigDraft();
    draft.searchTool = {
      ficheTypes: ["fournisseur"],
      statusMode: "internal_filter",
      fixedStatusKeys: ["publie"],
      sortMode: "created_at",
      scope: "organization",
    };

    const payload = chatbotConfigPayload(draft, { publicLink: true });
    expect(payload.searchTool).toEqual({
      ficheTypes: ["fournisseur"],
      statusMode: "hidden_fixed",
      fixedStatusKeys: ["publie"],
      sortMode: "created_at",
      scope: "chat_link",
    });

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("internal_filter");
    expect(serialized).not.toContain('"scope":"organization"');
  });

  it("signale les violations d'un lien public", () => {
    const internal = {
      ficheTypes: [],
      statusMode: "internal_filter" as const,
      fixedStatusKeys: [],
      sortMode: "fair_rotation" as const,
      scope: "chat_link" as const,
    };
    expect(searchToolDraftViolations(internal, true)).toContain(
      "Le mode de statut backoffice est interdit sur un lien public",
    );

    const all = { ...internal, statusMode: "all" as const };
    expect(searchToolDraftViolations(all, true)).toHaveLength(1);

    const organization = {
      ...internal,
      statusMode: "hidden_fixed" as const,
      scope: "organization" as const,
    };
    expect(searchToolDraftViolations(organization, true)).toContain(
      "La portée organisation est interdite sur un lien public",
    );
    expect(searchToolDraftViolations(organization, false)).toEqual([]);
  });

  it("ne modifie pas une politique backoffice sur un lien non public", () => {
    const draft = defaultChatbotConfigDraft();
    draft.searchTool = {
      ficheTypes: ["fournisseur"],
      statusMode: "internal_filter",
      fixedStatusKeys: ["publie"],
      sortMode: "fair_rotation",
      scope: "organization",
    };
    const payload = chatbotConfigPayload(draft, { publicLink: false });
    expect(payload.searchTool).toEqual(draft.searchTool);
    expect(publicSafeSearchToolDraft(draft.searchTool, false)).toEqual(draft.searchTool);
  });
});
