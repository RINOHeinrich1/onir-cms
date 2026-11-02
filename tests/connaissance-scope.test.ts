import { describe, expect, it } from "vitest";
import {
  GLOBAL_SCOPE,
  matchesScope,
  scopeFilterOptions,
} from "@/components/connaissances/connaissance-scope";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("filtre de portée des connaissances", () => {
  it("sans filtre, tout est visible", () => {
    expect(matchesScope({ chatLinkIds: [] }, [])).toBe(true);
    expect(matchesScope({ chatLinkIds: [A] }, [])).toBe(true);
  });

  it("Globale ne matche que les connaissances sans chatbot", () => {
    expect(matchesScope({ chatLinkIds: [] }, [GLOBAL_SCOPE])).toBe(true);
    expect(matchesScope({ chatLinkIds: [A] }, [GLOBAL_SCOPE])).toBe(false);
  });

  it("un chatbot matche une connaissance multi-chatbots", () => {
    expect(matchesScope({ chatLinkIds: [A, B] }, [A])).toBe(true);
    expect(matchesScope({ chatLinkIds: [A, B] }, [B])).toBe(true);
    expect(matchesScope({ chatLinkIds: [A] }, [B])).toBe(false);
  });

  it("plusieurs portées = union", () => {
    expect(matchesScope({ chatLinkIds: [] }, [GLOBAL_SCOPE, A])).toBe(true);
    expect(matchesScope({ chatLinkIds: [B] }, [GLOBAL_SCOPE, A])).toBe(false);
    expect(matchesScope({ chatLinkIds: [A, B] }, [A, B])).toBe(true);
  });

  it("ne propose que Globale et les chatbots réellement utilisés", () => {
    const options = scopeFilterOptions(
      [{ chatLinkIds: [] }, { chatLinkIds: [A, B] }, { chatLinkIds: [A] }],
      [
        { id: A, label: "Chatbot A" },
        { id: B, label: "Chatbot B" },
        { id: "33333333-3333-4333-8333-333333333333", label: "Chatbot inutilisé" },
      ],
    );
    expect(options.map((option) => option.label)).toEqual(["Globale", "Chatbot A", "Chatbot B"]);
  });

  it("signale un chatbot référencé mais introuvable", () => {
    const options = scopeFilterOptions([{ chatLinkIds: ["chatbot-supprime"] }], []);
    expect(options).toEqual([
      { value: GLOBAL_SCOPE, label: "Globale" },
      { value: "chatbot-supprime", label: "Chatbot indisponible" },
    ]);
  });
});
