import { describe, expect, it, vi } from "vitest";
import type { CreatorNameRepository } from "@/application/ports/creator-name-repository";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import {
  creatorOptions,
  hasUnassignedCreator,
  matchesCreator,
  NO_CREATOR,
} from "@/components/ui/creator-options";
import { displayUserName } from "@/domain/entities/user";

type Item = {
  id: string;
  createdBy: string | null;
};

function repository(): CreatorNameRepository {
  return {
    listByIds: vi.fn(async () => [
      { id: "user-1", name: "Alice Martin", email: "alice@example.com" },
      { id: "user-2", name: null, email: "bob@example.com" },
    ]),
  };
}

describe("displayUserName", () => {
  it("privilégie le nom saisi", () => {
    expect(displayUserName({ name: "  Alice Martin ", email: "alice@example.com" })).toBe(
      "Alice Martin",
    );
  });

  it("retombe sur l'email si le nom est vide", () => {
    expect(displayUserName({ name: "   ", email: "bob@example.com" })).toBe("bob@example.com");
    expect(displayUserName({ name: null, email: "bob@example.com" })).toBe("bob@example.com");
  });
});

describe("attachCreatorLabels", () => {
  it("résout les libellés en une requête et déduplique les IDs", async () => {
    const creators = repository();
    const items = await attachCreatorLabels<Item>(
      [
        { id: "item-1", createdBy: "user-1" },
        { id: "item-2", createdBy: "user-1" },
        { id: "item-3", createdBy: "user-2" },
        { id: "item-4", createdBy: null },
      ],
      creators,
    );

    expect(creators.listByIds).toHaveBeenCalledTimes(1);
    expect(creators.listByIds).toHaveBeenCalledWith(["user-1", "user-2"]);
    expect(items.map((item) => item.createdByLabel)).toEqual([
      "Alice Martin",
      "Alice Martin",
      "bob@example.com",
      null,
    ]);
  });

  it("ne fait aucune requête sans créateur", async () => {
    const creators = repository();
    const items = await attachCreatorLabels<Item>([{ id: "item-1", createdBy: null }], creators);
    expect(creators.listByIds).not.toHaveBeenCalled();
    expect(items[0]?.createdByLabel).toBeNull();
  });

  it("laisse le libellé nul si l'utilisateur est introuvable", async () => {
    const creators = repository();
    const items = await attachCreatorLabels<Item>(
      [{ id: "item-1", createdBy: "inconnu" }],
      creators,
    );
    expect(items[0]?.createdByLabel).toBeNull();
  });
});

describe("creatorOptions", () => {
  const items = [
    { createdBy: "user-1", createdByLabel: "Alice Martin" },
    { createdBy: "user-1", createdByLabel: "Alice Martin" },
    { createdBy: "user-2", createdByLabel: "bob@example.com" },
    { createdBy: null, createdByLabel: null },
  ];

  it("déduplique et trie les créateurs", () => {
    expect(creatorOptions(items)).toEqual([
      { id: "user-1", label: "Alice Martin" },
      { id: "user-2", label: "bob@example.com" },
    ]);
  });

  it("détecte les éléments sans créateur", () => {
    expect(hasUnassignedCreator(items)).toBe(true);
    expect(hasUnassignedCreator([{ createdBy: "user-1", createdByLabel: "Alice" }])).toBe(false);
  });

  it("filtre par créateur ou par absence de créateur", () => {
    expect(items.filter((item) => matchesCreator(item, null))).toHaveLength(4);
    expect(items.filter((item) => matchesCreator(item, ["user-1"]))).toHaveLength(2);
    expect(items.filter((item) => matchesCreator(item, [NO_CREATOR]))).toHaveLength(1);
    expect(items.filter((item) => matchesCreator(item, ["user-1", "user-2"]))).toHaveLength(3);
  });
});
