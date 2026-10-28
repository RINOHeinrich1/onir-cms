import { describe, expect, it } from "vitest";
import { chatLinkDisplayName, chatLinkScopeLabel } from "@/components/ui/chat-link-options";

describe("portée chatbot — affichage", () => {
  const options = [
    { id: "11111111-1111-4111-8111-111111111111", label: "Salon IT" },
    { id: "22222222-2222-4222-8222-222222222222", label: "Stand A" },
  ];

  it("scope vide = Global", () => {
    expect(chatLinkScopeLabel([], options)).toEqual({ global: true, labels: [] });
  });

  it("scope un chatbot = son nom", () => {
    expect(chatLinkScopeLabel(["11111111-1111-4111-8111-111111111111"], options)).toEqual({
      global: false,
      labels: ["Salon IT"],
    });
  });

  it("scope plusieurs chatbots = tous les noms, sans clé technique", () => {
    const scope = chatLinkScopeLabel(
      ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      options,
    );
    expect(scope).toEqual({ global: false, labels: ["Salon IT", "Stand A"] });
    expect(scope.labels.join(" ")).not.toContain("11111111");
  });

  it("chatbot inconnu = libellé neutre", () => {
    expect(chatLinkScopeLabel(["33333333-3333-4333-8333-333333333333"], options)).toEqual({
      global: false,
      labels: ["Chatbot indisponible"],
    });
  });

  it("nomme un chatbot sans libellé sans exposer son identifiant", () => {
    expect(chatLinkDisplayName({ id: "abc", label: "  " })).toBe("Chatbot sans nom");
    expect(chatLinkDisplayName({ id: "abc", label: "Salon" })).toBe("Salon");
  });
});
