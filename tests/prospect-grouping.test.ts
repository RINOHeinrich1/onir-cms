import { describe, expect, it } from "vitest";
import { groupProspects } from "@/components/prospects/prospect-grouping";

function prospect(
  origine: "saisie" | "libre",
  lienLabel: string | null,
  email = "contact@example.com",
  createdAt = "2026-11-10T10:00:00.000Z",
) {
  return { origine, lienLabel, email, createdAt };
}

describe("groupement des prospects", () => {
  it("regroupe les ajouts manuels dans un groupe dédié en premier", () => {
    const groups = groupProspects([
      prospect("libre", "Assistant A"),
      prospect("saisie", null),
      prospect("saisie", null, ""),
    ]);

    expect(groups[0]).toMatchObject({
      id: "ajout-manuel",
      label: "Ajout manuel",
      manual: true,
      total: 2,
      withEmail: 1,
      withoutEmail: 1,
    });
  });

  it("regroupe par libellé de chatbot et conserve les contacts manquants", () => {
    const groups = groupProspects([
      prospect("libre", "Assistant A"),
      prospect("libre", "Assistant A", ""),
      prospect("libre", "", ""),
    ]);

    expect(groups.find((group) => group.id === "chatbot:Assistant A")).toMatchObject({
      total: 2,
      withEmail: 1,
      withoutEmail: 1,
    });
    expect(groups.find((group) => group.id === "chatbot:Chatbot sans nom")).toMatchObject({
      total: 1,
      withoutEmail: 1,
    });
  });

  it("trie les chatbots par nombre de prospects puis par libellé", () => {
    const groups = groupProspects([
      prospect("libre", "B"),
      prospect("libre", "B"),
      prospect("libre", "A"),
    ]);

    expect(groups.map((group) => group.label)).toEqual(["B", "A"]);
  });
});
