import { expect, test } from "@playwright/test";
import {
  createChatbotFixture,
  type E2EFixture,
  fetchPublicMessages,
  sendPublicMessage,
  startMockAiServer,
} from "./helpers/adr0067-fixtures";

/**
 * E010 — parcours public réel : 30 fiches → 10/10/10 sans doublon via la
 * boucle d'outils et un fournisseur OpenAI-compatible factice (aucun modèle
 * externe, aucun coût). `total`/`hasMore` proviennent des blocs persistés.
 */
const enabled =
  process.env.E2E_DATABASE_URL !== undefined && process.env.AI_PROVIDER_KEY !== undefined;

test.skip(!enabled, "E2E_DATABASE_URL et AI_PROVIDER_KEY requis");
test.describe.configure({ mode: "serial" });

let fixture: E2EFixture;
let mock: Awaited<ReturnType<typeof startMockAiServer>>;

type ToolField = { key: string; label: string; type: string; value: unknown };
type ToolBlock = {
  type: string;
  items?: Array<{ fields: ToolField[] }>;
  meta?: { total?: number; hasMore?: boolean };
};

function toolBlocks(json: Record<string, unknown>): ToolBlock[] {
  const message = json.message as { blocks?: ToolBlock[] } | null;
  return (message?.blocks ?? []).filter((block) => block.type === "tool_search_result");
}

function names(block: ToolBlock): string[] {
  return (block.items ?? []).map((item) => {
    const field = item.fields.find((entry) => entry.key === "nom");
    return String(field?.value ?? "");
  });
}

test.beforeAll(async () => {
  mock = await startMockAiServer();
  process.env.E2E_AI_BASE_URL = mock.baseUrl;
  fixture = await createChatbotFixture({ withAi: true });
});

test.afterAll(async () => {
  await fixture?.cleanup();
  await mock?.close();
});

test("pagine 30 fiches en 10/10/10 sans doublon, avec total et hasMore", async () => {
  const conversationId = fixture.conversationId;
  expect(conversationId).toBeTruthy();
  if (conversationId === null) return;

  const first = await sendPublicMessage(conversationId, "Montre-moi les fournisseurs");
  const firstBlocks = toolBlocks(first);
  expect(firstBlocks).toHaveLength(1);
  const page1 = firstBlocks[0] as ToolBlock;
  expect(page1.items).toHaveLength(10);
  expect(page1.meta?.total).toBe(30);
  expect(page1.meta?.hasMore).toBe(true);

  const second = await sendPublicMessage(conversationId, "Montre-moi les autres");
  const secondBlocks = toolBlocks(second);
  expect(secondBlocks).toHaveLength(1);
  const page2 = secondBlocks[0] as ToolBlock;
  expect(page2.items).toHaveLength(10);
  expect(page2.meta?.total).toBe(30);
  expect(page2.meta?.hasMore).toBe(true);

  const third = await sendPublicMessage(conversationId, "Encore les autres");
  const thirdBlocks = toolBlocks(third);
  expect(thirdBlocks).toHaveLength(1);
  const page3 = thirdBlocks[0] as ToolBlock;
  expect(page3.items).toHaveLength(10);
  expect(page3.meta?.total).toBe(30);
  expect(page3.meta?.hasMore).toBe(false);

  const all = [...names(page1), ...names(page2), ...names(page3)];
  expect(all).toHaveLength(30);
  expect(new Set(all).size).toBe(30);

  // Le contenu textuel est toujours présent, même avec des blocs.
  const history = await fetchPublicMessages(conversationId);
  const assistant = history.messages.filter((message) => message.role === "assistant");
  expect(assistant.length).toBeGreaterThanOrEqual(3);
  for (const message of assistant) {
    expect(String(message.content ?? "").trim()).not.toBe("");
  }
});
