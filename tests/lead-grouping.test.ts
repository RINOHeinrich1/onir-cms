import { describe, expect, it } from "vitest";
import { groupFichesByChatbot } from "@/components/fiches/lead-grouping";

const chatbots = [
  { id: "link-a", label: "Assistant A" },
  { id: "link-b", label: "Assistant B" },
  { id: "link-c", label: "" },
];

function fiche(
  _id: string,
  chatLinkIds: string[],
  archivee = false,
  qualificationStatusKey: string | null = null,
  createdAt = "2026-11-10T10:00:00.000Z",
) {
  return { chatLinkIds, archivee, qualificationStatusKey, createdAt };
}

describe("groupement des leads par chatbot", () => {
  it("conserve les chatbots sans fiche et compte les fiches actives", () => {
    const groups = groupFichesByChatbot(
      [
        fiche("f1", ["link-a"]),
        fiche("f2", ["link-a"], true, "gagne", "2026-11-11T10:00:00.000Z"),
        fiche("f3", ["link-b"]),
      ],
      chatbots,
    );

    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "link-a", total: 2, active: 1, archived: 1, qualified: 1 }),
        expect.objectContaining({ id: "link-b", total: 1, active: 1, archived: 0 }),
        expect.objectContaining({ id: "link-c", total: 0 }),
      ]),
    );
    expect(groups.find((group) => group.id === "link-a")?.lastCreatedAt).toBe(
      "2026-11-11T10:00:00.000Z",
    );
  });

  it("ajoute un groupe Sans chatbot et compte une fiche dans chaque chatbot lié", () => {
    const groups = groupFichesByChatbot(
      [fiche("f1", []), fiche("f2", ["link-a", "link-b", "link-a"])],
      chatbots,
    );

    expect(groups.find((group) => group.id === "sans-chatbot")).toMatchObject({
      label: "Sans chatbot",
      total: 1,
      sansChatbot: true,
    });
    expect(groups.find((group) => group.id === "link-a")?.total).toBe(1);
    expect(groups.find((group) => group.id === "link-b")?.total).toBe(1);
    expect(groups.find((group) => group.id === "link-c")?.label).toBe("Chatbot sans nom");
  });

  it("trie par nombre de fiches puis par libellé", () => {
    const groups = groupFichesByChatbot(
      [fiche("f1", ["link-b"]), fiche("f2", ["link-b"]), fiche("f3", ["link-a"])],
      chatbots,
    );
    const ranked = groups.filter((group) => group.total > 0).map((group) => group.id);
    expect(ranked).toEqual(["link-b", "link-a"]);
  });
});
