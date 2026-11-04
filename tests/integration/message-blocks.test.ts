import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChatMessage } from "@/domain/entities/chat";
import type { MessageBlock } from "@/domain/tool-blocks";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { makeOrganization, setupDb } from "./helpers/db";

const BLOCKS: MessageBlock[] = [
  { type: "text", text: "Voici une maison." },
  {
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
  },
];

let pool: Pool;
let organizationId: string;
let linkId: string;
let conversationId: string;

beforeAll(async () => {
  pool = await setupDb();
  organizationId = await makeOrganization(pool, "Org blocs");
  const link = await pool.query<{ id: string }>(
    `INSERT INTO chat_links (organization_id, token_hash, type, label)
     VALUES ($1, $2, 'standard', 'Lien blocs') RETURNING id`,
    [organizationId, `hash-blocks-${organizationId}`],
  );
  linkId = link.rows[0]?.id ?? "";
  const conversation = await pool.query<{ id: string }>(
    `INSERT INTO conversations (organization_id, link_id, visitor_nom)
     VALUES ($1, $2, 'Visiteur') RETURNING id`,
    [organizationId, linkId],
  );
  conversationId = conversation.rows[0]?.id ?? "";
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("chat_messages.blocks (migration 0081)", () => {
  it("persiste et relit les blocs ordonnés d'un message assistant", async () => {
    const repository = pgConversationRepository(pool);
    const saved = await repository.appendMessage(
      organizationId,
      conversationId,
      "assistant",
      "Voici une maison.",
      [],
      null,
      BLOCKS,
    );
    expect(saved.content).toBe("Voici une maison.");
    expect(saved.blocks).toEqual(BLOCKS);

    const messages = await repository.listMessages(organizationId, conversationId);
    const reread = messages.find((message) => message.id === saved.id) as ChatMessage;
    expect(reread.blocks).toEqual(BLOCKS);
  });

  it("les messages existants sans blocs reçoivent un tableau vide", async () => {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO chat_messages (conversation_id, role, content)
       VALUES ($1, 'user', 'Ancien message') RETURNING id`,
      [conversationId],
    );
    const repository = pgConversationRepository(pool);
    const message = await repository.findMessage(organizationId, inserted.rows[0]?.id ?? "");
    expect(message?.blocks).toEqual([]);
  });

  it("refuse un valeur non-tableau au niveau base", async () => {
    await expect(
      pool.query(
        `INSERT INTO chat_messages (conversation_id, role, content, blocks)
         VALUES ($1, 'assistant', 'Test', '{"type":"text"}'::jsonb)`,
        [conversationId],
      ),
    ).rejects.toThrow();
  });
});
