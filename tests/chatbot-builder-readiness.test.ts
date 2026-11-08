import { describe, expect, it } from "vitest";
import { canGenerateChatbot } from "@/components/chatbot-builder/builder-readiness";

const ready = {
  missingRequirements: 0,
  documentCount: 0,
  attachedFileCount: 0,
  pending: false,
  sourcePending: false,
  generating: false,
  hasGeneration: false,
};

describe("chatbot builder — état du bouton de génération", () => {
  it("autorise la génération quand le brief est complet", () => {
    expect(canGenerateChatbot(ready)).toBe(true);
  });

  it("refuse la génération s’il manque une information obligatoire", () => {
    expect(canGenerateChatbot({ ...ready, missingRequirements: 1 })).toBe(false);
  });

  it("refuse la génération si les documents annoncés ne sont plus rattachés", () => {
    expect(canGenerateChatbot({ ...ready, documentCount: 2, attachedFileCount: 0 })).toBe(false);
  });

  it("autorise la génération quand les documents annoncés sont rattachés", () => {
    expect(canGenerateChatbot({ ...ready, documentCount: 2, attachedFileCount: 2 })).toBe(true);
  });

  it("bloque pendant une requête ou une génération déjà en cours", () => {
    expect(canGenerateChatbot({ ...ready, pending: true })).toBe(false);
    expect(canGenerateChatbot({ ...ready, sourcePending: true })).toBe(false);
    expect(canGenerateChatbot({ ...ready, generating: true })).toBe(false);
    expect(canGenerateChatbot({ ...ready, hasGeneration: true })).toBe(false);
  });
});
