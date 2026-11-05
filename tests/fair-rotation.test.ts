import { describe, expect, it } from "vitest";
import { conversationRotationOffset, rotateFicheIds } from "@/domain/fiche-search-tool";

const IDS = Array.from({ length: 30 }, (_, index) => `fiche-${String(index + 1).padStart(2, "0")}`);

describe("rotation équitable déterministe (ADR-0067 §4.7)", () => {
  it("calcule le même offset pour une même conversation", () => {
    expect(conversationRotationOffset("conversation-a", 30)).toBe(
      conversationRotationOffset("conversation-a", 30),
    );
    expect(conversationRotationOffset("conversation-a", 0)).toBe(0);
  });

  it("produit des offsets différents pour des conversations différentes", () => {
    const offsets = new Set(
      ["conversation-a", "conversation-b", "conversation-c"].map((id) =>
        conversationRotationOffset(id, 30),
      ),
    );
    expect(offsets.size).toBeGreaterThan(1);
  });

  it("ne perd ni ne duplique aucune fiche", () => {
    const rotated = rotateFicheIds(IDS, "conversation-a");
    expect(rotated).toHaveLength(IDS.length);
    expect(new Set(rotated).size).toBe(IDS.length);
    expect([...rotated].sort()).toEqual([...IDS].sort());
  });

  it("conserve un ordre stable dans une conversation et varie entre conversations", () => {
    const first = rotateFicheIds(IDS, "conversation-a");
    const again = rotateFicheIds(IDS, "conversation-a");
    const other = rotateFicheIds(IDS, "conversation-b");
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it("est une simple rotation (pas de mélange imprévisible)", () => {
    const rotated = rotateFicheIds(IDS, "conversation-c");
    const offset = conversationRotationOffset("conversation-c", IDS.length);
    expect(rotated[0]).toBe(IDS[offset]);
    expect(rotated[1]).toBe(IDS[(offset + 1) % IDS.length]);
  });
});
