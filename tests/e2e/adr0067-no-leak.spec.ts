import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import {
  createChatbotFixture,
  type E2EFixture,
  e2eDatabaseUrl,
  fetchPublicMessages,
  sendPublicMessage,
  startMockAiServer,
} from "./helpers/adr0067-fixtures";

/**
 * E011 — non-fuite publique (ADR-0067 §2.5 / §6 / §10) : aucun statut, aucune
 * métadonnée, aucun champ fichier dans les messages publics ni dans le DOM.
 * Un bloc de `contractVersion` inconnu ne casse pas le message : `content`
 * reste la source de repli.
 */
const enabled =
  process.env.E2E_DATABASE_URL !== undefined && process.env.AI_PROVIDER_KEY !== undefined;

test.skip(!enabled, "E2E_DATABASE_URL et AI_PROVIDER_KEY requis");
test.describe.configure({ mode: "serial" });

const FORBIDDEN = [
  "publie",
  "a_qualifier",
  "Publié",
  "À qualifier",
  "statusKey",
  "qualification_status",
  "document",
  "confidentiel-",
  ".pdf",
];

/** Le libellé du champ fichier reste un champ de collecte légitime ; sa valeur non. */
const FORBIDDEN_DOM = FORBIDDEN.filter((entry) => entry !== "document");

let fixture: E2EFixture;
let mock: Awaited<ReturnType<typeof startMockAiServer>>;
let pool: Pool;

test.beforeAll(async () => {
  mock = await startMockAiServer();
  process.env.E2E_AI_BASE_URL = mock.baseUrl;
  fixture = await createChatbotFixture({ withAi: true });
  pool = new Pool({ connectionString: e2eDatabaseUrl(), max: 2 });
});

test.afterAll(async () => {
  await pool?.end();
  await fixture?.cleanup();
  await mock?.close();
});

test("les messages publics ne contiennent ni statut, ni métadonnée, ni fichier", async () => {
  const conversationId = fixture.conversationId;
  expect(conversationId).toBeTruthy();
  if (conversationId === null) return;

  const response = await sendPublicMessage(conversationId, "Montre-moi les fournisseurs");
  const history = await fetchPublicMessages(conversationId);
  const serialized = JSON.stringify([response, history]);

  for (const forbidden of FORBIDDEN) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).toContain("tool_search_result");
});

test("un contractVersion inconnu retombe sur content sans casser le message", async () => {
  const conversationId = fixture.conversationId;
  expect(conversationId).toBeTruthy();
  if (conversationId === null) return;

  const content = "Réponse de secours lisible";
  await pool.query(
    `INSERT INTO chat_messages (conversation_id, role, content, blocks)
     VALUES ($1, 'assistant', $2, $3::jsonb)`,
    [
      conversationId,
      content,
      JSON.stringify([
        {
          type: "tool_search_result",
          contractVersion: 999,
          tool: "search_fiches",
          items: [{ fields: [{ key: "nom", label: "Nom", type: "text", value: "X" }] }],
        },
      ]),
    ],
  );

  const history = await fetchPublicMessages(conversationId);
  const message = history.messages.find((entry) => entry.content === content);
  expect(message).toBeTruthy();
  expect(message?.blocks).toEqual([]);
});

test("le DOM public n'expose aucun libellé de statut ni nom de fichier", async ({ page }) => {
  await page.goto(`/l/${fixture.linkToken}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const html = await page.content();
  for (const forbidden of FORBIDDEN_DOM) {
    expect(html).not.toContain(forbidden);
  }
});
