import { describe, expect, it } from "vitest";
import {
  toDashboardChatMessage,
  toPublicChatMessage,
} from "@/application/use-cases/attachments/attachment-dto";
import type { ChatMessage } from "@/domain/entities/chat";
import { parseMessageBlocks, type ToolSearchResultBlock } from "@/domain/tool-blocks";

const TOOL_BLOCK: ToolSearchResultBlock = {
  type: "tool_search_result",
  contractVersion: 1,
  tool: "search_fiches",
  layout: "list",
  items: [
    {
      fields: [
        { key: "titre", label: "Titre", type: "text", value: "Maison A" },
        { key: "loyer", label: "Loyer", type: "number", value: 1200, unit: "€" },
      ],
    },
  ],
  meta: { total: 1, hasMore: false },
};

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    conversationId: "c1",
    role: "assistant",
    content: "J'ai trouvé une maison.",
    medias: [],
    mediasComputed: false,
    blocks: [{ type: "text", text: "J'ai trouvé une maison." }, TOOL_BLOCK],
    attachments: [],
    authorUserId: null,
    authorName: null,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("DTO de message — blocs (ADR-0067 §5)", () => {
  it("expose les blocs ordonnés ET conserve content (public)", () => {
    const dto = toPublicChatMessage(message(), "org-1");
    expect(dto.content).toBe("J'ai trouvé une maison.");
    expect(dto.blocks).toHaveLength(2);
    expect(dto.blocks[1]).toMatchObject({ type: "tool_search_result", contractVersion: 1 });
  });

  it("expose les blocs ordonnés ET conserve content (dashboard)", () => {
    const dto = toDashboardChatMessage(message());
    expect(dto.content).toBe("J'ai trouvé une maison.");
    expect(dto.blocks[0]).toEqual({ type: "text", text: "J'ai trouvé une maison." });
  });

  it("un message sans bloc expose un tableau vide", () => {
    const dto = toPublicChatMessage(message({ blocks: [] }), "org-1");
    expect(dto.blocks).toEqual([]);
    expect(dto.content).not.toBe("");
  });
});

describe("parseMessageBlocks — validation à la lecture", () => {
  it("ignore les types inconnus et les versions inconnues", () => {
    const blocks = parseMessageBlocks([
      { type: "hologram", data: {} },
      { ...TOOL_BLOCK, contractVersion: 99 },
      { type: "text", text: "ok" },
    ]);
    expect(blocks).toEqual([{ type: "text", text: "ok" }]);
  });

  it("retire statuts, métadonnées et champs fichier d'un bloc persisté", () => {
    const blocks = parseMessageBlocks([
      {
        ...TOOL_BLOCK,
        items: [
          {
            fields: [
              { key: "titre", label: "Titre", type: "text", value: "Maison A" },
              { key: "cin", label: "CIN", type: "file", value: "secret.pdf" },
            ],
            statusKey: "publie",
            metadata: { owner: "x" },
          },
        ],
      },
    ]);
    const block = blocks[0] as ToolSearchResultBlock;
    expect(block.items[0]?.fields.map((field) => field.key)).toEqual(["titre"]);
    expect(JSON.stringify(block)).not.toContain("secret.pdf");
    expect(JSON.stringify(block)).not.toContain("statusKey");
    expect(JSON.stringify(block)).not.toContain("publie");
  });

  it("valide les images et rejette les URL absentes", () => {
    expect(parseMessageBlocks([{ type: "image", url: "https://x/y.png", alt: "y" }])).toEqual([
      { type: "image", url: "https://x/y.png", alt: "y" },
    ]);
    expect(parseMessageBlocks([{ type: "image" }])).toEqual([]);
  });
});
